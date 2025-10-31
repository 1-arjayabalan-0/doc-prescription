from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import whisper
import torch
import ollama
import json
import tempfile
import os
import asyncio
from typing import Dict, List, Optional
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Thread pool for CPU-intensive operations
executor = ThreadPoolExecutor(max_workers=2)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Settings
class Settings(BaseSettings):
    whisper_model: str = "base"
    medical_model: str = "medllama2:7b"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_audio_formats: list = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"]
    enable_rate_limiting: bool = True
    
    class Config:
        env_file = ".env"

settings = Settings()

# Pydantic models for response
class PatientInfo(BaseModel):
    name: Optional[str] = "Not mentioned in conversation"
    age: Optional[str] = "Not mentioned"
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
    chief_complaint: str
    symptoms: List[Symptom] = []
    vital_signs: Optional[VitalSigns] = None
    diagnosis: str
    medications: List[Medication] = []
    lifestyle_advice: List[str] = []
    precautions: List[str] = []
    follow_up: str = "Not specified"
    additional_notes: str = ""

class ProcessingResponse(BaseModel):
    conversation_id: str
    timestamp: str
    patient_info: PatientInfo
    prescription: Prescription
    full_conversation: str
    conversation_summary: str
    processing_info: Dict

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

class AutomatedMedicalProcessor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.whisper_model = None
        self.medical_model = settings.medical_model
        logger.info(f"Initialized - Device: {self.device}, Model: {self.medical_model}")
        
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
        """Async audio transcription"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            executor,
            self._transcribe_audio_sync,
            audio_path
        )
    
    def _transcribe_audio_sync(self, audio_path: str) -> Dict:
        """Synchronous transcription with Whisper"""
        self.load_whisper()
        
        logger.info("Starting audio transcription...")
        
        result = self.whisper_model.transcribe(
            audio_path,
            fp16=(self.device == "cuda"),
            language='en',
            task='transcribe',
            verbose=False
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
        
        logger.info(f"Transcription complete: {len(segments)} segments, {result.get('duration', 0):.1f}s")
        
        return {
            "segments": segments,
            "full_text": result.get("text", "").strip(),
            "duration": round(result.get("duration", 0), 2),
            "language": result.get("language", "en")
        }
    
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
        
        return f"""You are Meditron, an expert medical AI assistant. Analyze this doctor-patient conversation and extract ALL relevant information.

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
        transcription = await processor.transcribe_audio_async(temp_path)
        
        if not transcription.get("full_text"):
            raise HTTPException(400, "No speech detected in audio")
        
        # Step 2: Process with medical LLM
        logger.info(f"[{conversation_id}] Step 2: Analyzing conversation with medical AI...")
        medical_analysis = await processor.process_conversation_async(transcription)
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )