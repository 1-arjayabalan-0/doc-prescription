from gtts import gTTS
from pydub import AudioSegment
import os

# ----------- Step 1: Conversation Script -----------
conversation = [
    {"role": "doctor", "text": "Good morning. Please have a seat. What brings you in today?"},
    {"role": "patient", "text": "Good morning, Doctor. I've been feeling feverish and weak for the past three days."},
    {"role": "doctor", "text": "I see. Do you have any other symptoms, like cough, sore throat, or body pain?"},
    {"role": "patient", "text": "Yes, I do have a mild sore throat and some body pain, but no cough."},
    {"role": "doctor", "text": "Alright. Have you taken any medication so far?"},
    {"role": "patient", "text": "Just a paracetamol tablet last night, Doctor."},
    {"role": "doctor", "text": "Okay, that’s good. I think this is most likely a viral infection. I’ll prescribe Paracetamol 650 milligrams, one tablet every six hours after food."},
    {"role": "patient", "text": "Okay, Doctor. Should I take any antibiotics?"},
    {"role": "doctor", "text": "No, antibiotics are not needed for viral fever. Just take plenty of fluids, rest well, and eat light meals."},
    {"role": "patient", "text": "Alright, Doctor. How long will it take to recover?"},
    {"role": "doctor", "text": "Usually, you should feel better in two to three days. If the fever doesn’t subside by then, come back for a blood test."},
    {"role": "patient", "text": "Got it, Doctor. Thank you for your advice."},
    {"role": "doctor", "text": "You’re welcome. Take care and get well soon."}
]

# ----------- Step 2: Voice Style Configuration -----------
# TLD helps slightly vary tone/accent between doctor and patient
voices = {
    "doctor": "co.uk",  # British tone
    "patient": "com"    # American tone
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
    # Add small pause after each speaker
    segment += AudioSegment.silent(duration=800)
    audio_segments.append(segment)

# ----------- Step 4: Combine into One Audio -----------
final_audio = sum(audio_segments)
output_path = "doctor_patient_conversation.mp3"
final_audio.export(output_path, format="mp3")

print(f"\n✅ Conversation audio generated successfully → {output_path}")

# Optional: Clean up temporary files
for file in os.listdir("temp_audio"):
    os.remove(os.path.join("temp_audio", file))
os.rmdir("temp_audio")
