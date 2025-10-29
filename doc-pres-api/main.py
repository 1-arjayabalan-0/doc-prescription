# main_dynamic.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import whisper
import torch
import ollama
import json
import tempfile
import os
import uuid
import asyncio
from typing import Dict, List
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Medical Conversation Processor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class DynamicMedicalProcessor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.whisper_model = None
        self.medical_model = "meditron"  # Single best model
        logger.info(f"Using device: {self.device}")
        logger.info(f"Medical model: {self.medical_model}")
        
    def load_models(self):
        """Load Whisper model"""
        if not self.whisper_model:
            logger.info("Loading Whisper model...")
            self.whisper_model = whisper.load_model("base", device=self.device)
            logger.info("Whisper model loaded successfully")
    
    def transcribe_audio(self, audio_path: str) -> Dict:
        """Transcribe audio - NO STATIC SPEAKER DETECTION"""
        self.load_models()
        
        logger.info(f"Transcribing audio: {audio_path}")
        
        try:
            result = self.whisper_model.transcribe(
                audio_path,
                fp16=False,
                language='en'
            )
            
            # Return raw segments - let the medical model handle everything
            segments = []
            for i, segment in enumerate(result["segments"]):
                text = segment.get("text", "").strip()
                if text and len(text) > 2:
                    segments.append({
                        "text": text,
                        "start": segment.get("start", 0),
                        "end": segment.get("end", 0),
                        "segment_id": i
                    })
            
            logger.info(f"Transcription completed. Segments: {len(segments)}")
            return {
                "segments": segments,
                "language": result.get("language", "en"),
                "duration": result.get("duration", 0)
            }
            
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise
    
    def generate_prescription(self, transcription: Dict) -> Dict:
        """Let the medical model analyze everything dynamically"""
        try:
            # Combine all segments into one conversation
            full_conversation = self._combine_conversation(transcription)
            
            if len(full_conversation.strip()) == 0:
                return {
                    "error": "No conversation content found",
                    "message": "The audio file may be empty or too quiet"
                }
            
            logger.info(f"Conversation length: {len(full_conversation)} characters")
            
            # Single prompt that makes the model do ALL the analysis
            prompt = self._create_comprehensive_prompt(full_conversation)
            
            logger.info(f"Generating prescription using {self.medical_model}...")
            
            response = ollama.generate(
                model=self.medical_model,
                prompt=prompt,
                options={
                    'temperature': 0.1,  # Low temperature for consistent medical output
                    'top_k': 40,
                    'top_p': 0.9
                }
            )
            
            prescription = self._parse_prescription(response['response'])
            logger.info("Prescription generated successfully")
            
            return prescription
            
        except Exception as e:
            logger.error(f"Prescription generation failed: {str(e)}")
            return {
                "error": "Failed to generate prescription",
                "conversation_preview": self._combine_conversation(transcription)[:500]
            }
    
    def _combine_conversation(self, transcription: Dict) -> str:
        """Simply combine all text without speaker assumptions"""
        segments = transcription.get("segments", [])
        conversation_lines = []
        
        for segment in segments:
            text = segment.get("text", "").strip()
            if text:
                conversation_lines.append(text)
        
        return " ".join(conversation_lines)
    
    def _create_comprehensive_prompt(self, conversation: str) -> str:
        """Single prompt that makes the model do ALL the analysis"""
        
        return f"""
TASK: You are Meditron, a medical AI assistant. Analyze the following doctor-patient conversation and generate a complete medical prescription.

CONVERSATION TRANSCRIPT:
{conversation}

ANALYSIS REQUIREMENTS:
1. First, analyze who is speaking (doctor vs patient) based on conversation content
2. Identify all symptoms mentioned by the patient
3. Identify the diagnosis discussed by the doctor  
4. Extract all medications and treatments mentioned
5. Generate a structured prescription based on the clinical discussion

OUTPUT FORMAT (JSON ONLY):
{{
    "conversation_analysis": {{
        "speakers_identified": ["list of speakers and their roles"],
        "patient_symptoms": ["extracted symptoms from conversation"],
        "clinical_discussion": "summary of what was discussed"
    }},
    "medical_prescription": {{
        "diagnosis": "primary diagnosis based on conversation",
        "medications": [
            {{
                "name": "medication name extracted from conversation",
                "dosage": "dosage discussed", 
                "frequency": "frequency mentioned",
                "duration": "treatment duration discussed",
                "purpose": "what condition it treats"
            }}
        ],
        "treatment_plan": {{
            "instructions": "patient care instructions discussed",
            "lifestyle_recommendations": "any lifestyle advice given",
            "follow_up": "follow-up plan mentioned"
        }},
        "precautions": "any warnings or precautions discussed"
    }},
    "additional_notes": "any other important medical information from conversation"
}}

IMPORTANT: 
- Extract ALL information directly from the conversation
- Do NOT add information not mentioned in the conversation
- If something isn't clear from the conversation, state "Not specified in conversation"
- Return ONLY valid JSON, no additional text
"""
    
    def _parse_prescription(self, response: str) -> Dict:
        """Parse the model response"""
        try:
            # Extract JSON from response
            start_idx = response.find('{')
            end_idx = response.rfind('}') + 1
            
            if start_idx != -1 and end_idx != 0:
                json_str = response[start_idx:end_idx]
                prescription = json.loads(json_str)
                logger.info("Successfully parsed prescription JSON")
                return prescription
            else:
                logger.warning("No JSON found in response, using raw response")
                return {"raw_analysis": response}
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed: {e}")
            return {
                "error": "Failed to parse medical analysis",
                "raw_response": response[:1000]
            }

# Initialize processor
processor = DynamicMedicalProcessor()

@app.post("/api/process-conversation")
async def process_conversation(
    audio: UploadFile = File(...),
    patient_id: str = Form("unknown"),
    doctor_id: str = Form("unknown")
):
    """Complete audio to prescription pipeline"""
    
    logger.info(f"Processing audio: {audio.filename}")
    
    if not audio.content_type.startswith('audio/'):
        raise HTTPException(400, "File must be an audio file")
    
    temp_path = None
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        logger.info(f"Audio saved, size: {len(content)} bytes")
        
        # Process pipeline
        transcription = processor.transcribe_audio(temp_path)
        prescription = processor.generate_prescription(transcription)
        
        response_data = {
            "success": True,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "medical_analysis": prescription,
            "conversation_text": processor._combine_conversation(transcription),
            "processing_info": {
                "audio_file": audio.filename,
                "model_used": processor.medical_model,
                "segments_processed": len(transcription.get("segments", [])),
                "conversation_duration": f"{transcription.get('duration', 0):.2f} seconds"
            }
        }
        
        logger.info("Request completed successfully")
        return response_data
        
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
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
    return {
        "status": "healthy",
        "medical_model": processor.medical_model,
        "whisper_loaded": processor.whisper_model is not None
    }

@app.post("/api/test-model")
async def test_model():
    """Test the medical model with a sample conversation"""
    test_conversation = """
    Doctor: Good morning, what brings you in today?
    Patient: I've been having a persistent cough and fever for about three days now.
    Doctor: Any chest pain or difficulty breathing?
    Patient: Some chest discomfort when I cough deeply.
    Doctor: Let me check your temperature and listen to your lungs. 
    Patient: I also have some body aches and fatigue.
    Doctor: Based on your symptoms, this appears to be a respiratory infection. 
    I'm going to prescribe an antibiotic and recommend rest and plenty of fluids.
    Patient: What about the fever and body aches?
    Doctor: You can take ibuprofen for the fever and pain. Make sure to complete the full course of antibiotics.
    """
    
    test_transcription = {"segments": [{"text": test_conversation}]}
    
    try:
        prescription = processor.generate_prescription(test_transcription)
        return {
            "test_result": "success",
            "medical_analysis": prescription,
            "conversation_used": test_conversation
        }
    except Exception as e:
        return {"test_result": "failed", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)