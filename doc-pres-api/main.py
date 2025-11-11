from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
import whisper
import torch
import ollama
import json
import tempfile
import os
import asyncio
from typing import Dict, List, Optional, Union
import logging
from pydantic import BaseModel
import re
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from concurrent.futures import ThreadPoolExecutor
from pydantic_settings import BaseSettings
from datetime import datetime
import uuid
import subprocess
import shutil
from dotenv import load_dotenv
from gtts import gTTS
from pydub import AudioSegment
from pathlib import Path
import io
import cv2
import pytesseract
import numpy as np
import pandas as pd
from pdf2image import convert_from_bytes
import easyocr

load_dotenv() 

os.makedirs("logs", exist_ok=True)
log_filename = f"logs/medical_processor_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log"

whisper_model_env = os.getenv("WHISPER_MODEL")
medical_model_env = os.getenv("MEDICAL_MODEL")
max_file_size_env = os.getenv("MAX_FILE_SIZE")
api_key_env = os.getenv("API_KEY")
cross_orgins_env = os.getenv("CORS_ORIGINS")
enable_rate_limit_env = os.getenv("ENABLE_RATE_LIMITING")

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_filename, encoding="utf-8"),
        logging.StreamHandler()  # keep console output too
    ]
)
logger = logging.getLogger(__name__)

# Thread pool for CPU-intensive operations
executor = ThreadPoolExecutor(max_workers=2)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Settings
class Settings(BaseSettings):
    whisper_model: str = whisper_model_env
    medical_model: str = medical_model_env
    max_file_size: int = max_file_size_env
    allowed_audio_formats: list = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"]
    enable_rate_limiting: bool = enable_rate_limit_env
    
    class Config:
        env_file = ".env"

settings = Settings()

# Pydantic models for response
class PatientInfo(BaseModel):
    name: Optional[str] = "Not mentioned in conversation"
    age: Optional[Union[int, str]] = "Not mentioned"
    gender: Optional[str] = "Not mentioned"
    contact: Optional[str] = "Not mentioned"
    medical_history: List[str] = []
    allergies: List[str] = []
    current_medications: List[str] = []

class VitalSigns(BaseModel):
    temperature: Optional[str] = "Not recorded"
    blood_pressure: Optional[str] = "Not recorded"
    heart_rate: Optional[str] = "Not recorded"
    respiratory_rate: Optional[str] = "Not recorded"
    weight: Optional[str] = "Not recorded"

class Symptom(BaseModel):
    symptom: str
    duration: Optional[str] = "Not specified"
    severity: Optional[str] = "Not specified"

class Medication(BaseModel):
    name: str
    dosage: str = "Not specified"
    frequency: str = "Not specified"
    duration: str = "Not specified"
    instructions: str = "Not specified"

class Prescription(BaseModel):
    chief_complaint: Optional[str]
    symptoms: Optional[List[Symptom]] = []
    vital_signs: Optional[VitalSigns] = None
    diagnosis: Optional[str]
    medications: Optional[List[Medication]] = []
    lifestyle_advice: Optional[List[str]] = []
    precautions: Optional[List[str]] = []
    follow_up: Optional[str] = "Not specified"
    additional_notes: Optional[str] = None

class ProcessingResponse(BaseModel):
    conversation_id: str
    timestamp: str
    patient_info: PatientInfo
    prescription: Prescription
    full_conversation: str
    conversation_summary: str
    processing_info: Dict
    
class ProcessedLabReportResponse(BaseModel):
    gpu_used: int
    tests_extracted: str
    data: Dict
    summary: str

# FastAPI app
app = FastAPI(
    title="Automated Medical Conversation Processor",
    description="Automatically extracts patient info and generates prescriptions from doctor-patient audio",
    version="3.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded, 
    lambda r, e: JSONResponse(
        status_code=429, 
        content={"error": "Rate limit exceeded. Please try again later."}
    )
)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize EasyOCR with auto GPU fallback
try:
    reader = easyocr.Reader(['en'], gpu=True)
    GPU_MODE = True
except Exception:
    reader = easyocr.Reader(['en'], gpu=False)
    GPU_MODE = False

class AutomatedMedicalProcessor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.whisper_model = None
        self.medical_model = settings.medical_model
        self.ffmpeg_available = shutil.which("ffmpeg") is not None
        logger.info(f"Initialized - Device: {self.device}, Model: {self.medical_model}")
        logger.info(f"FFmpeg available: {self.ffmpeg_available}")
    
    def preprocess_audio(self, input_path: str) -> str:
        """Preprocess audio to fix common issues"""
        if not self.ffmpeg_available:
            logger.warning("FFmpeg not available, skipping preprocessing")
            return input_path
        
        try:
            output_path = input_path.replace(os.path.splitext(input_path)[1], '_processed.wav')
            
            # Convert to 16kHz mono WAV with normalization
            cmd = [
                'ffmpeg', '-i', input_path,
                '-ar', '16000',  # 16kHz sample rate (Whisper's native rate)
                '-ac', '1',      # Mono
                '-c:a', 'pcm_s16le',  # 16-bit PCM
                '-af', 'loudnorm,highpass=f=200,lowpass=f=3000',  # Normalize and filter
                '-y',  # Overwrite
                output_path
            ]
            
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30
            )
            
            if result.returncode == 0 and os.path.exists(output_path):
                logger.info("Audio preprocessing successful")
                return output_path
            else:
                logger.warning("Audio preprocessing failed, using original")
                return input_path
                
        except Exception as e:
            logger.warning(f"Audio preprocessing error: {e}, using original file")
            return input_path
        
    def load_whisper(self):
        """Load Whisper model lazily"""
        if not self.whisper_model:
            logger.info(f"Loading Whisper model: {settings.whisper_model}")
            self.whisper_model = whisper.load_model(
                settings.whisper_model, 
                device=self.device
            )
            logger.info("Whisper model loaded")
    
    async def transcribe_audio_async(self, audio_path: str) -> Dict:
        """Async audio transcription with preprocessing"""
        loop = asyncio.get_event_loop()
        
        # Preprocess audio first
        processed_path = await loop.run_in_executor(
            executor,
            self.preprocess_audio,
            audio_path
        )
        
        # Transcribe the (possibly preprocessed) audio
        result = await loop.run_in_executor(
            executor,
            self._transcribe_audio_sync,
            processed_path
        )
        
        # Cleanup processed file if different from original
        if processed_path != audio_path and os.path.exists(processed_path):
            try:
                os.unlink(processed_path)
            except:
                pass
        
        return result
    
    def _transcribe_audio_sync(self, audio_path: str) -> Dict:
        """Synchronous transcription with Whisper"""
        self.load_whisper()
        
        logger.info("Starting audio transcription...")
        
        try:
            # Disable fp16 to avoid NaN issues, add additional parameters
            result = self.whisper_model.transcribe(
                audio_path,
                fp16=False,  # Disable fp16 to prevent NaN errors
                language='en',
                task='transcribe',
                verbose=False,
                temperature=0.0,  # Deterministic decoding
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.6,
                condition_on_previous_text=True
            )
            
            segments = []
            for i, segment in enumerate(result.get("segments", [])):
                text = segment.get("text", "").strip()
                if text and len(text) > 2:
                    segments.append({
                        "text": text,
                        "start": round(segment.get("start", 0), 2),
                        "end": round(segment.get("end", 0), 2)
                    })
            
            if not segments:
                logger.warning("No valid segments found in transcription")
                raise ValueError("No speech detected in audio file")
            
            logger.info(f"Transcription complete: {len(segments)} segments, {result.get('duration', 0):.1f}s")
            
            return {
                "segments": segments,
                "full_text": result.get("text", "").strip(),
                "duration": round(result.get("duration", 0), 2),
                "language": result.get("language", "en")
            }
            
        except Exception as e:
            logger.error(f"Transcription error: {str(e)}")
            # Try with even safer parameters
            logger.info("Retrying with safer parameters...")
            try:
                result = self.whisper_model.transcribe(
                    audio_path,
                    fp16=False,
                    language='en',
                    task='transcribe',
                    verbose=False,
                    temperature=0.0,
                    best_of=1,
                    beam_size=1
                )
                
                full_text = result.get("text", "").strip()
                if not full_text:
                    raise ValueError("No speech detected in audio")
                
                return {
                    "segments": [{"text": full_text, "start": 0, "end": result.get("duration", 0)}],
                    "full_text": full_text,
                    "duration": round(result.get("duration", 0), 2),
                    "language": result.get("language", "en")
                }
            except Exception as retry_error:
                logger.error(f"Retry also failed: {str(retry_error)}")
                raise HTTPException(
                    400, 
                    "Failed to transcribe audio. The audio may be corrupted, too quiet, or in an unsupported format. Please ensure the audio is clear and contains speech."
                )
    
    async def process_conversation_async(self, transcription: Dict) -> Dict:
        """Async medical analysis"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            executor,
            self._process_conversation_sync,
            transcription
        )
    
    def _process_conversation_sync(self, transcription: Dict) -> Dict:
        """Synchronous medical analysis with LLM"""
        
        conversation = transcription.get("full_text", "")
        
        if not conversation or len(conversation.strip()) < 20:
            raise HTTPException(400, "Conversation too short or empty")
        
        logger.info(f"Processing conversation: {len(conversation)} characters")
        
        # Create comprehensive prompt
        prompt = self._create_analysis_prompt(conversation)
        
        logger.info("Generating medical analysis with LLM...")
        
        try:
            response = ollama.generate(
                model=self.medical_model,
                prompt=prompt,
                options={
                    'temperature': 0.1,
                    'top_k': 40,
                    'top_p': 0.9,
                    'num_predict': 3000
                }
            )
            
            # Parse the LLM response
            result = self._parse_medical_response(response['response'])
            
            logger.info("Medical analysis complete")
            return result
            
        except Exception as e:
            logger.error(f"LLM processing failed: {e}")
            raise HTTPException(500, f"Medical analysis failed: {str(e)}")
    
    def _create_analysis_prompt(self, conversation: str) -> str:
        """Create comprehensive prompt for automatic extraction"""
        
        return f"""You are Medllama, an expert medical AI assistant. Analyze this doctor-patient conversation and extract ALL relevant information.

CONVERSATION TRANSCRIPT:
{conversation}

YOUR TASK:
Automatically identify and extract:
1. Patient information (name, age, gender, medical history, allergies)
2. Chief complaint and symptoms
3. Vital signs (if mentioned)
4. Doctor's diagnosis
5. Prescribed medications with complete details
6. Lifestyle advice and precautions
7. Follow-up instructions

OUTPUT FORMAT (JSON ONLY):
{{
    "patient_info": {{
        "name": "patient name if mentioned, else 'Not mentioned'",
        "age": "age if mentioned, else 'Not mentioned'",
        "gender": "gender if mentioned, else 'Not mentioned'",
        "contact": "phone/email if mentioned",
        "medical_history": ["previous conditions mentioned"],
        "allergies": ["allergies mentioned"],
        "current_medications": ["medications patient is already taking"]
    }},
    "conversation_summary": "Brief 2-3 sentence summary of the consultation",
    "prescription": {{
        "chief_complaint": "main reason for visit",
        "symptoms": [
            {{
                "symptom": "symptom name",
                "duration": "how long",
                "severity": "mild/moderate/severe"
            }}
        ],
        "vital_signs": {{
            "temperature": "temp if measured",
            "blood_pressure": "BP if measured",
            "heart_rate": "HR if measured",
            "respiratory_rate": "RR if measured",
            "weight": "weight if measured"
        }},
        "diagnosis": "doctor's diagnosis",
        "medications": [
            {{
                "name": "medication name",
                "dosage": "dosage amount (e.g., 500mg)",
                "frequency": "how often (e.g., twice daily)",
                "duration": "treatment length (e.g., 7 days)",
                "instructions": "special instructions (e.g., take with food)"
            }}
        ],
        "lifestyle_advice": ["lifestyle recommendations"],
        "precautions": ["warnings and things to watch for"],
        "follow_up": "when to return or follow up",
        "additional_notes": "any other important information"
    }}
}}

CRITICAL RULES:
1. Extract ONLY information explicitly stated in the conversation
2. Use "Not mentioned" or "Not specified" for missing information
3. Do NOT invent or assume information
4. Return ONLY valid JSON with no additional text
5. Be thorough - extract ALL details mentioned in the conversation
6. Pay attention to exact dosages, frequencies, and durations
7. Capture all symptoms with their characteristics
8. Note any examination findings mentioned by the doctor

Return the JSON now:"""
    
    def _parse_medical_response(self, response: str) -> Dict:
        """Parse LLM JSON response"""
        
        try:
            # Clean markdown code blocks
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned)
                cleaned = re.sub(r'\n?\s*```$', '', cleaned)
            
            # Find JSON object
            json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group(0))
                return result
            
            # Try parsing entire response
            result = json.loads(cleaned)
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed: {e}")
            logger.error(f"Response preview: {response[:500]}")
            
            # Return error with partial info
            return {
                "error": "Failed to parse complete medical analysis",
                "raw_response": response[:1000],
                "patient_info": {"name": "Not mentioned"},
                "conversation_summary": "Unable to parse conversation",
                "prescription": {
                    "chief_complaint": "Unable to extract",
                    "diagnosis": "Unable to extract",
                    "medications": []
                }
            }

# Initialize processor
processor = AutomatedMedicalProcessor()

# Process Audio (Patient-Doc Conversation)
@app.post("/api/process", response_model=ProcessingResponse)
@limiter.limit("10/minute" if settings.enable_rate_limiting else "1000/minute")
async def process_audio(
    request: Request,
    audio: UploadFile = File(..., description="Audio file of doctor-patient conversation")
):
    """
    **Fully Automated Processing**: Upload audio, get complete prescription
    
    - Transcribes the conversation automatically
    - Identifies speakers (doctor vs patient)
    - Extracts patient information from conversation
    - Generates complete prescription with all details
    - Returns structured medical data
    
    **Input**: Just the audio file
    **Output**: Complete medical analysis with patient info and prescription
    """
    
    conversation_id = str(uuid.uuid4())
    logger.info(f"[{conversation_id}] New request: {audio.filename}")
    
    # Validate file
    file_ext = os.path.splitext(audio.filename)[1].lower()
    if file_ext not in settings.allowed_audio_formats:
        raise HTTPException(
            400, 
            f"Unsupported format '{file_ext}'. Supported: {', '.join(settings.allowed_audio_formats)}"
        )
    
    # Read file
    content = await audio.read()
    file_size = len(content)
    
    if file_size > settings.max_file_size:
        raise HTTPException(
            413, 
            f"File too large ({file_size / (1024*1024):.1f}MB). Max: {settings.max_file_size / (1024*1024)}MB"
        )
    
    if file_size < 1000:
        raise HTTPException(400, "Audio file too small or corrupted")
    
    logger.info(f"[{conversation_id}] File validated: {file_size / 1024:.1f}KB")
    
    temp_path = None
    try:
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Step 1: Transcribe audio
        logger.info(f"[{conversation_id}] Step 1: Transcribing audio...")
        try:
            transcription = await processor.transcribe_audio_async(temp_path)
        except ValueError as ve:
            # Audio quality issue
            raise HTTPException(
                400, 
                f"Audio transcription failed: {str(ve)}. Please ensure:\n"
                "1. Audio contains clear speech\n"
                "2. Audio is not corrupted\n"
                "3. Volume is adequate\n"
                "4. Format is supported (mp3, wav, m4a, etc.)"
            )
        
        if not transcription.get("full_text"):
            raise HTTPException(
                400, 
                "No speech detected in audio. Please check:\n"
                "1. Audio volume is sufficient\n"
                "2. There is actual conversation in the recording\n"
                "3. Audio quality is adequate"
            )
        
        # Step 2: Process with medical LLM
        logger.info(f"[{conversation_id}] Step 2: Analyzing conversation with medical AI...")
        medical_analysis = await processor.process_conversation_async(transcription)
        logger.info(f"medical_analysis : {medical_analysis}")
        # Build response
        response = ProcessingResponse(
            conversation_id=conversation_id,
            timestamp=datetime.utcnow().isoformat() + "Z",
            patient_info=PatientInfo(**medical_analysis.get("patient_info", {})),
            prescription=Prescription(**medical_analysis.get("prescription", {})),
            full_conversation=transcription["full_text"],
            conversation_summary=medical_analysis.get("conversation_summary", ""),
            processing_info={
                "audio_filename": audio.filename,
                "audio_duration_seconds": transcription["duration"],
                "audio_size_kb": round(file_size / 1024, 2),
                "segments_transcribed": len(transcription["segments"]),
                "language_detected": transcription["language"],
                "model_used": processor.medical_model,
                "processing_timestamp": datetime.utcnow().isoformat()
            }
        )
        
        logger.info(f"[{conversation_id}] ✓ Processing complete")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{conversation_id}] Processing failed: {e}", exc_info=True)
        raise HTTPException(500, f"Processing failed: {str(e)}")
    finally:
        # Cleanup
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass

# Process Documents (Lab Reports)
def preprocess_image(image_bytes: bytes):
    """Basic preprocessing for OCR clarity"""
    image = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(image, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return gray

def ocr_extract_text(img: np.ndarray):
    """Use Tesseract OCR as baseline text extraction"""
    text = pytesseract.image_to_string(img)
    return text

def easyocr_extract_text(img: np.ndarray):
    """Use EasyOCR (GPU if available)"""
    result = reader.readtext(img)
    lines = [r[1] for r in result]
    return "\n".join(lines)

def parse_lab_values(text: str):
    """
    Very simple rule-based parser for lab tests.
    """
    data = []
    print(f"Output-text: {text}")
    for line in text.splitlines():
        parts = line.strip().split()
        print(f"Output-parts: {parts}")
        if len(parts) >= 3:
            test = parts[0]
            print(f"Output-test: {test}")
            try:
                value = float(parts[1].replace(",", "."))
                print(f"Output-value: {value}")
                unit = parts[2]
                data.append({"test": test, "value": value, "unit": unit})
            except ValueError:
                continue
        print(f"Output-data: {data}")
    return pd.DataFrame(data)

def summarize_report(df: pd.DataFrame):
    """Simple human summary (placeholder for LLM)"""
    summary = []
    for _, row in df.iterrows():
        status = "Normal"
        if row["value"] > 100: 
            status = "High"
        elif row["value"] < 10:
            status = "Low"
        summary.append(f"{row['test']} = {row['value']} {row['unit']} ({status})")
    return "\n".join(summary)

@app.post("/api/lab-report-analyze", response_model=ProcessedLabReportResponse)
@limiter.limit("10/minute" if settings.enable_rate_limiting else "1000/minute")
async def analyze_lab_report(request: Request, 
                             file: UploadFile = File(...)):
    """Accepts PDF/JPG/PNG and returns structured analysis"""
    file_bytes = await file.read()
    results = []

    # Handle PDF (multi-page)
    if file.filename.lower().endswith(".pdf"):
        images = convert_from_bytes(file_bytes)
        texts = []
        for img in images:
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            proc = preprocess_image(buf.getvalue())
            text = easyocr_extract_text(proc) if GPU_MODE else ocr_extract_text(proc)
            texts.append(text)
        full_text = "\n".join(texts)
    else:
        # Image file (JPG/PNG)
        proc = preprocess_image(file_bytes)
        full_text = easyocr_extract_text(proc) if GPU_MODE else ocr_extract_text(proc)

    df = parse_lab_values(full_text)
    summary = summarize_report(df)
    print(f"Output-DF-SUMM: {df} {summary}")
    return ProcessedLabReportResponse(
        gpu_used = GPU_MODE,
        tests_extracted = len(df),
        data = df.to_dict(orient="records"),
        summary = summary
    )
    
@app.get("/api/health")
async def health_check():
    """Check API health and model status"""
    
    try:
        models = ollama.list()
        available = [m['name'] for m in models.get('models', [])]
        model_available = processor.medical_model in available
    except:
        available = []
        model_available = False
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "models": {
            "whisper": {
                "name": settings.whisper_model,
                "loaded": processor.whisper_model is not None,
                "device": processor.device
            },
            "medical": {
                "name": processor.medical_model,
                "available": model_available,
                "all_available": available
            }
        }
    }

@app.post("/api/test")
async def test_with_sample():
    """Test the system with a sample conversation"""
    
    sample = """
Doctor: Good morning! Please have a seat. What brings you here today?
Patient: Hi doctor. I'm Sarah Martinez, I'm 28 years old. I've been having really bad headaches for the past week.
Doctor: I see. Can you describe the headaches for me? Where do you feel them?
Patient: They're mostly on the right side of my head, like a throbbing pain. Sometimes it gets so bad I feel nauseous.
Doctor: How often are they occurring?
Patient: Almost every day, usually in the afternoon. They last for a few hours.
Doctor: On a scale of 1 to 10, how severe is the pain?
Patient: I'd say around 7 or 8 when it's at its worst.
Doctor: Are you currently taking any medications?
Patient: Just birth control pills. Oh, and I'm allergic to penicillin.
Doctor: Good to know. Any recent stress or changes in your routine?
Patient: Well, I started a new job about two weeks ago. It's been pretty stressful.
Doctor: That could certainly be a factor. Let me check your blood pressure. *checking* Your BP is 135 over 85, slightly elevated. Temperature is normal at 98.6. Based on your symptoms, this appears to be tension headaches, possibly triggered by stress.
Patient: Is there anything I can take for it?
Doctor: Yes, I'm going to prescribe you Sumatriptan 50 milligrams. Take one tablet when you feel a headache coming on. You can take up to two per day if needed, but not more than that. I'm also prescribing Naproxen 500 milligrams for the pain - take one tablet twice daily with food for the next 7 days.
Patient: Okay, got it.
Doctor: I'd also recommend stress management techniques - try to take regular breaks at work, practice some relaxation exercises, and maintain a regular sleep schedule. Avoid excessive screen time. Drink plenty of water throughout the day, and try to identify and avoid any trigger foods like caffeine or chocolate.
Patient: Should I be worried about anything?
Doctor: If the headaches become more severe, if you experience vision changes, confusion, or weakness, or if they don't improve in two weeks, call me immediately. Otherwise, let's schedule a follow-up appointment in three weeks to see how you're doing.
Patient: Thank you, doctor.
Doctor: You're welcome, Sarah. Take care and don't hesitate to reach out if you have concerns.
    """
    
    test_transcription = {
        "segments": [{"text": sample, "start": 0, "end": 180}],
        "full_text": sample,
        "duration": 180.0,
        "language": "en"
    }
    
    try:
        result = await processor.process_conversation_async(test_transcription)
        return {
            "test_status": "success",
            "result": result
        }
    except Exception as e:
        return {
            "test_status": "failed",
            "error": str(e)
        }

@app.post("/api/text-2-audio")
async def txt2audio(request: Request):
        body = await request.json()
        # ----------- Step 1: Conversation Script -----------
        logger.info(body)
        conversation = body.get("conversation")
        
        # ----------- Step 2: Voice Style Configuration -----------
        voices = {
            "doctor": "co.uk",  # British tone (professional)
            "patient": "com"    # American tone (normal)
        }

        # ----------- Step 3: Generate Audio Clips -----------
        audio_segments = []
        base_dir = os.path.dirname(os.path.abspath(__file__))
        print(base_dir)
        temp_dir = os.path.join(base_dir, "temp_audio")
        print(temp_dir)
        os.makedirs(temp_dir, exist_ok=True)

        for i, turn in enumerate(conversation):
            print(f"Generating {turn['role']} speech: {turn['text']}")
            tts = gTTS(text=turn["text"], lang="en", tld=voices[turn["role"]])
            file_path = f"temp_audio/{i}_{turn['role']}.mp3"
            tts.save(file_path)

            segment = AudioSegment.from_file(file_path)
            # Add pause between speakers
            segment += AudioSegment.silent(duration=800)
            audio_segments.append(segment)

        # ----------- Step 4: Combine All Into One File -----------
        final_audio = sum(audio_segments)
        timestamp = datetime.utcnow().isoformat().replace(":", "-")
        output_path = os.path.join(f"{timestamp}_doctor_patient_conversation.mp3")
        full_output_path = os.path.join(temp_dir, output_path)
        final_audio.export(full_output_path, format="mp3")

        print(f"\n✅ Full conversation audio generated successfully → {output_path}")
        return (f"✅ Full conversation audio generated successfully →", {output_path})

        # Optional Cleanup
        # for file in os.listdir("temp_audio"):
        #     os.remove(os.path.join("temp_audio", file))
        # os.rmdir("temp_audio")
 
# Root Page 
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the Home page"""
    base_dir = Path(__file__).resolve().parent
    html_path = base_dir / "home.html"
    html_content = html_path.read_text(encoding="utf-8")
    return html_content   

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )

"""
REQUIREMENTS:
pip install fastapi uvicorn whisper torch ollama python-multipart slowapi pydantic-settings

OPTIONAL (for better audio preprocessing):
- Install FFmpeg: 
  - Ubuntu/Debian: sudo apt-get install ffmpeg
  - macOS: brew install ffmpeg
  - Windows: Download from https://ffmpeg.org/

SETUP:
1. Install dependencies
2. Pull medical model: ollama pull medllama2
3. Run: python main_dynamic.py

COMMON ISSUES:
- NaN error: Fixed by disabling fp16 and audio preprocessing
- No speech detected: Check audio quality and volume
- Model not found: Run 'ollama pull medllama2'
"""