from gtts import gTTS
from pydub import AudioSegment

doctor_text = "Good morning. Please have a seat. What brings you in today?"
patient_text = "Good morning, Doctor. I've been having fever and body pain for the past three days."

# Generate audio
tts_doctor = gTTS(doctor_text, lang='en', tld='co.uk')  # British tone for doctor
tts_patient = gTTS(patient_text, lang='en', tld='com')  # Normal tone for patient

tts_doctor.save("doctor.mp3")
tts_patient.save("patient.mp3")

# Combine them
doctor = AudioSegment.from_file("doctor.mp3")
patient = AudioSegment.from_file("patient.mp3")

conversation = doctor + AudioSegment.silent(duration=500) + patient
conversation.export("conversation.mp3", format="mp3")
