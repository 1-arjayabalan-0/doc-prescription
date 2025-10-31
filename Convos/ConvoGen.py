from gtts import gTTS
from pydub import AudioSegment
import os

# ----------- Step 1: Conversation Script -----------
conversation = [
    {"role": "doctor", "text": "Good morning. Please come in and have a seat."},
    {"role": "patient", "text": "Good morning, Doctor."},
    {"role": "doctor", "text": "Can I have your full name and age, please?"},
    {"role": "patient", "text": "Yes, I’m Rahul Mehta, 32 years old."},
    {"role": "doctor", "text": "Alright, Mr. Mehta. What brings you in today?"},
    {"role": "patient", "text": "I’ve been having fever, sore throat, and fatigue for the last three days."},
    {"role": "doctor", "text": "Have you experienced any cough, body ache, or shortness of breath?"},
    {"role": "patient", "text": "Yes, mild body pain, but no cough or breathing trouble."},
    {"role": "doctor", "text": "Understood. Have you checked your temperature at home?"},
    {"role": "patient", "text": "Yes, it was around one hundred and one degrees Fahrenheit last night."},
    {"role": "doctor", "text": "Thank you. Based on your symptoms, this looks like a mild viral fever with throat infection."},
    {"role": "patient", "text": "Is it something serious, Doctor?"},
    {"role": "doctor", "text": "No, it’s not serious. It’s a common viral infection that should resolve in two to three days with proper rest and medication."},
    {"role": "doctor", "text": "I’m prescribing Paracetamol six hundred and fifty milligrams, one tablet every six hours after food, for fever and pain."},
    {"role": "doctor", "text": "Also, take Cetrizine ten milligrams at night if you feel throat irritation or runny nose."},
    {"role": "doctor", "text": "Drink plenty of fluids, eat light meals, and avoid cold drinks or ice cream."},
    {"role": "patient", "text": "Okay, Doctor. Should I take any antibiotics?"},
    {"role": "doctor", "text": "No antibiotics are required right now. If your fever continues beyond three days or your throat pain worsens, we’ll do a blood test and start antibiotics if needed."},
    {"role": "patient", "text": "Alright, Doctor. I’ll follow your advice."},
    {"role": "doctor", "text": "Great. I’ll note your diagnosis as 'Acute Viral Pharyngitis' and your treatment as Paracetamol and Cetrizine as advised."},
    {"role": "patient", "text": "Thank you, Doctor."},
    {"role": "doctor", "text": "You’re welcome, Mr. Mehta. Take rest and get well soon."}
]

# ----------- Step 2: Voice Style Configuration -----------
voices = {
    "doctor": "co.uk",  # British tone (professional)
    "patient": "com"    # American tone (normal)
}

# ----------- Step 3: Generate Audio Clips -----------
audio_segments = []
os.makedirs("temp_audio", exist_ok=True)

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
output_path = "doctor_patient_conversation_full.mp3"
final_audio.export(output_path, format="mp3")

print(f"\n✅ Full conversation audio generated successfully → {output_path}")

# Optional Cleanup
for file in os.listdir("temp_audio"):
    os.remove(os.path.join("temp_audio", file))
os.rmdir("temp_audio")
