# main_medical.py
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
import subprocess

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

class MedicalProcessor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.available_models = self._get_available_models()
        logger.info(f"Using device: {self.device}")
        logger.info(f"Available models: {self.available_models}")
        
    def _get_available_models(self) -> List[str]:
        """Get list of available Ollama models"""
        try:
            models_response = ollama.list()
            available_models = [model['name'] for model in models_response.get('models', [])]
            logger.info(f"Found Ollama models: {available_models}")
            return available_models
        except Exception as e:
            logger.error(f"Failed to get available models: {e}")
            return []
        
    def load_model(self):
        """Load the Whisper model only when needed"""
        if not self.model:
            logger.info("Loading Whisper model...")
            self.model = whisper.load_model("base", device=self.device)
            logger.info("Whisper model loaded successfully")
    
    def get_best_medical_model(self) -> str:
        """Select the best available medical model"""
        medical_models_priority = [
            'meditron', 'medical', 'medalpaca', 'clinical', 
            'biogpt', 'biobert', 'llama2', 'mistral', 'codellama'
        ]
        
        for model in medical_models_priority:
            if model in self.available_models:
                logger.info(f"Selected medical model: {model}")
                return model
        
        # If no medical models found, try any available model
        if self.available_models:
            fallback = self.available_models[0]
            logger.warning(f"No medical models found, using fallback: {fallback}")
            return fallback
        else:
            raise Exception("No Ollama models available. Please install models first.")
            
    def transcribe_audio(self, audio_path: str) -> Dict:
        """Transcribe audio with speaker diarization"""
        self.load_model()
        
        logger.info(f"Transcribing: {audio_path}")
        
        try:
            result = self.model.transcribe(
                audio_path,
                fp16=False,
                language='en'
            )
            
            segments = self._perform_speaker_diarization(result["segments"])
            
            return {
                "segments": segments,
                "language": result.get("language", "en"),
                "duration": result.get("duration", 0)
            }
            
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise
    
    def _perform_speaker_diarization(self, segments: List[Dict]) -> List[Dict]:
        """Identify different speakers in the conversation"""
        diarized_segments = []
        
        for i, segment in enumerate(segments):
            text = segment.get("text", "").strip()
            
            if not text:
                continue
                
            speaker = self._identify_speaker(text, i, segment)
            
            diarized_segments.append({
                "speaker": speaker,
                "text": text,
                "start": segment.get("start", 0),
                "end": segment.get("end", 0),
                "segment_id": i
            })
        
        speakers = list(set(seg['speaker'] for seg in diarized_segments))
        logger.info(f"Speakers identified: {speakers}")
        return diarized_segments
    
    def _identify_speaker(self, text: str, segment_index: int, segment: Dict) -> str:
        """Identify speaker based on content"""
        text_lower = text.lower()
        
        doctor_indicators = [
            'how can i help', 'what brings you', 'symptoms', 'diagnosis',
            'prescribe', 'medication', 'treatment', 'examine', 'clinical',
            'follow up', 'recommend', 'advise', 'suggest', 'take this',
            'doctor', 'dr.', 'physician', 'let me check', 'examination',
            'test results', 'blood pressure', 'heart rate', 'temperature',
            'i recommend', 'you should', 'your condition', 'medical history'
        ]
        
        patient_indicators = [
            'i have', 'i feel', 'my', 'pain', 'hurt', 'sick', 'unwell',
            'problem', 'issue', 'concern', 'appointment', 'thank you',
            'patient', 'suffering', 'experience', 'headache', 'fever',
            'cough', 'pain', 'ache', 'nausea', 'dizzy', 'my doctor',
            "i've been", "i'm feeling", "i need"
        ]
        
        doctor_score = sum(1 for indicator in doctor_indicators if indicator in text_lower)
        patient_score = sum(1 for indicator in patient_indicators if indicator in text_lower)
        
        if doctor_score > patient_score:
            return "Doctor"
        elif patient_score > doctor_score:
            return "Patient"
        else:
            return "Doctor" if segment_index % 2 == 0 else "Patient"
    
    def generate_prescription(self, transcription: Dict) -> Dict:
        """Generate medical prescription using appropriate medical model"""
        try:
            conversation_text = self._format_conversation(transcription)
            
            if len(conversation_text.strip()) == 0:
                return {
                    "error": "No conversation content found",
                    "message": "The audio file may be empty or too quiet"
                }
            
            # Select the best medical model
            medical_model = self.get_best_medical_model()
            prompt = self._create_medical_prompt(conversation_text, medical_model)
            
            logger.info(f"Generating prescription using model: {medical_model}")
            
            response = ollama.generate(
                model=medical_model,
                prompt=prompt,
                options={
                    'temperature': 0.1,
                    'top_k': 40,
                    'top_p': 0.9
                }
            )
            
            prescription = self._parse_prescription(response['response'])
            prescription['model_used'] = medical_model
            logger.info("Prescription generated successfully")
            
            return prescription
            
        except Exception as e:
            logger.error(f"Prescription generation failed: {str(e)}")
            return self._create_fallback_prescription(transcription)
    
    def _create_medical_prompt(self, conversation: str, model_name: str) -> str:
        """Create specialized prompt based on the model"""
        
        base_prompt = f"""
        You are a medical professional analyzing a doctor-patient conversation. 
        Create a structured medical prescription based on the clinical discussion.
        
        CONVERSATION:
        {conversation}
        
        Generate a JSON prescription with this exact structure:
        """
        
        json_structure = """
        {
            "clinical_assessment": {
                "primary_diagnosis": "main condition diagnosed",
                "differential_diagnosis": ["alternative possibilities"],
                "symptoms_discussed": ["list of symptoms mentioned"],
                "severity": "mild/moderate/severe"
            },
            "pharmaceutical_treatment": [
                {
                    "medication": "drug name",
                    "dosage": "specific dosage",
                    "frequency": "times per day/week",
                    "route": "oral/topical/injection",
                    "duration": "treatment period",
                    "indication": "what it treats"
                }
            ],
            "non_pharmaceutical_treatment": [
                {
                    "recommendation": "lifestyle or other advice",
                    "frequency": "how often",
                    "duration": "how long"
                }
            ],
            "patient_instructions": {
                "medication_instructions": "how to take medications",
                "activity_restrictions": "any limitations",
                "dietary_advice": "nutrition recommendations",
                "warning_signs": "when to seek immediate care"
            },
            "follow_up_plan": {
                "next_appointment": "timing for follow-up",
                "monitoring_parameters": "what to watch for",
                "additional_tests": ["any recommended tests"]
            }
        }
        """
        
        # Model-specific instructions
        model_instructions = {
            'meditron': "You are Meditron, a medical AI assistant. Provide evidence-based medical recommendations.",
            'medical': "You are a medical expert. Focus on clinically accurate prescriptions.",
            'medalpaca': "You are a medical AI trained on clinical data. Provide structured medical advice.",
            'clinical': "You are a clinical decision support system. Generate safe medical prescriptions.",
            'default': "You are a healthcare professional. Create a medically appropriate prescription."
        }
        
        instruction = model_instructions.get(model_name, model_instructions['default'])
        
        return f"{instruction}\n{base_prompt}\n{json_structure}\n\nReturn only valid JSON. No additional text."
    
    def _create_fallback_prescription(self, transcription: Dict) -> Dict:
        """Create a basic prescription when model generation fails"""
        conversation = self._format_conversation(transcription)
        
        # Simple rule-based extraction
        symptoms = self._extract_symptoms(conversation)
        medications_mentioned = self._extract_medications(conversation)
        
        return {
            "clinical_assessment": {
                "primary_diagnosis": "Condition discussed in consultation",
                "symptoms_discussed": symptoms,
                "severity": "To be determined by physician"
            },
            "pharmaceutical_treatment": medications_mentioned,
            "non_pharmaceutical_treatment": [
                {
                    "recommendation": "Follow up with healthcare provider",
                    "frequency": "As needed",
                    "duration": "Until symptoms resolve"
                }
            ],
            "patient_instructions": {
                "medication_instructions": "Take as directed by your doctor",
                "warning_signs": "Seek immediate care for worsening symptoms"
            },
            "follow_up_plan": {
                "next_appointment": "1-2 weeks or as needed",
                "monitoring_parameters": "Symptom progression, side effects"
            },
            "note": "This is a preliminary assessment based on conversation analysis"
        }
    
    def _extract_symptoms(self, conversation: str) -> List[str]:
        """Extract symptoms from conversation"""
        symptoms_keywords = [
            'pain', 'headache', 'fever', 'cough', 'nausea', 'dizzy', 'fatigue',
            'ache', 'sore', 'swelling', 'rash', 'bleeding', 'infection',
            'inflammatory', 'congestion', 'shortness of breath', 'chest pain'
        ]
        
        found_symptoms = []
        for symptom in symptoms_keywords:
            if symptom in conversation.lower():
                found_symptoms.append(symptom)
        
        return found_symptoms if found_symptoms else ["Symptoms discussed in consultation"]
    
    def _extract_medications(self, conversation: str) -> List[Dict]:
        """Extract mentioned medications"""
        medication_keywords = {
            'antibiotic': {'dosage': 'As prescribed', 'frequency': 'Varies'},
            'painkiller': {'dosage': 'As needed', 'frequency': 'Every 4-6 hours'},
            'anti-inflammatory': {'dosage': 'As directed', 'frequency': 'Daily'},
            'antihistamine': {'dosage': 'Standard dose', 'frequency': 'As needed'}
        }
        
        medications = []
        for med, details in medication_keywords.items():
            if med in conversation.lower():
                medications.append({
                    "medication": med,
                    "dosage": details['dosage'],
                    "frequency": details['frequency'],
                    "route": "oral",
                    "duration": "As prescribed",
                    "indication": "Based on condition discussed"
                })
        
        return medications if medications else [
            {
                "medication": "Medication to be determined",
                "dosage": "As prescribed",
                "frequency": "As directed",
                "route": "oral",
                "duration": "As needed",
                "indication": "Condition-specific treatment"
            }
        ]
    
    def _format_conversation(self, transcription: Dict) -> str:
        """Format conversation for the LLM"""
        segments = transcription.get("segments", [])
        
        conversation_lines = []
        for segment in segments:
            speaker = segment.get("speaker", "Unknown")
            text = segment.get("text", "").strip()
            if text and len(text) > 2:
                conversation_lines.append(f"{speaker}: {text}")
        
        return "\n".join(conversation_lines)
    
    def _parse_prescription(self, response: str) -> Dict:
        """Parse the LLM response"""
        try:
            start_idx = response.find('{')
            end_idx = response.rfind('}') + 1
            
            if start_idx != -1 and end_idx != 0:
                json_str = response[start_idx:end_idx]
                return json.loads(json_str)
            else:
                return {"raw_response": response}
                
        except json.JSONDecodeError:
            return {"raw_response": response}

# Initialize the processor
processor = MedicalProcessor()

@app.post("/api/process-conversation")
async def process_conversation(
    audio: UploadFile = File(...),
    patient_id: str = Form("unknown"),
    doctor_id: str = Form("unknown")
):
    """Process audio and generate medical prescription"""
    
    logger.info(f"Received audio: {audio.filename}")
    
    if not audio.content_type.startswith('audio/'):
        raise HTTPException(400, "File must be an audio file")
    
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Process the conversation
        transcription = processor.transcribe_audio(temp_path)
        prescription = processor.generate_prescription(transcription)
        
        response_data = {
            "success": True,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "prescription": prescription,
            "conversation": processor._format_conversation(transcription),
            "processing_info": {
                "audio_file": audio.filename,
                "segments_processed": len(transcription.get("segments", [])),
                "model_used": prescription.get('model_used', 'fallback'),
                "speakers_identified": list(set(seg['speaker'] for seg in transcription.get("segments", [])))
            }
        }
        
        return response_data
        
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        raise HTTPException(500, f"Processing failed: {str(e)}")
        
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass

@app.get("/api/available-models")
async def get_available_models():
    """Get list of available Ollama models"""
    return {
        "available_models": processor.available_models,
        "recommended_medical_models": [
            "meditron", "medical", "medalpaca", "clinical", "biogpt"
        ]
    }

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "device": processor.device,
        "whisper_loaded": processor.model is not None,
        "available_models": processor.available_models
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)