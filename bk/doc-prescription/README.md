# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

---

## Voice Transcription System (Doctor/Patient)

This app includes a comprehensive voice transcription system with:

- Start, Pause, Continue, and Stop controls
- Real-time audio level meter and basic audio-quality hints
- Live transcript view with speaker labels and confidence scores
- Structured JSON export containing speaker-separated utterances with timestamps and session metadata

### How it works

- Uses the browser's Web Speech API for real-time transcription (Chrome/Edge). Interim results are displayed, and final utterances are appended with confidence.
- Speaker labeling supports two modes:
  - Auto: alternates speakers between Doctor and Patient for each final utterance
  - Manual: you choose the current speaker from a dropdown

### JSON output format

```json
{
  "session": {
    "id": "sess_...",
    "provider": "WebSpeech",
    "startTimeIso": "...",
    "endTimeIso": "...",
    "durationMs": 12345,
    "status": "stopped"
  },
  "utterances": [
    {
      "id": "utt_...",
      "speaker": "Doctor",
      "text": "...",
      "startMs": 0,
      "endMs": 2000,
      "confidence": 0.93
    }
  ],
  "overallConfidence": 0.91,
  "diarization": {
    "mode": "auto",
    "speakers": ["Doctor", "Patient"]
  }
}
```

### Meeting medical-grade accuracy and diarization

The Web Speech API is suitable for demos but does not guarantee >90% accuracy on medical terminology nor robust speaker diarization. To meet clinical-quality requirements (<500ms latency, medical vocab accuracy, speaker identification), integrate a production ASR provider with real-time streaming and medical models:

- AWS Transcribe Medical (Streaming, diarization)
- Azure Speech Service (Conversation transcription + diarization)
- Google Cloud Speech-to-Text (Medical dictation, diarization)
- Deepgram Nova Medical (Real-time, diarization)

Recommended integration approach:

1. Create a backend endpoint that issues ephemeral tokens (never expose permanent API keys in the browser).
2. Replace the WebSpeechTranscriber with a WebSocket streaming client to the chosen provider.
3. Map provider events to the `TranscriptUtterance` type and fill timestamps/confidence from provider metadata.
4. Optionally add custom vocabulary/boosting for local medical terminology and drug names.

Error handling to implement with a provider:

- Detect high background noise or clipped audio and prompt the user.
- Handle network interruptions gracefully with automatic reconnection.
- Report provider-side errors and retry strategies.

### Development

1. `npm install`
2. `npm run dev` (if port 5173 is in use, Vite will select another port)
3. Open the app, allow microphone access when prompted.
# Voice to Prescription System

An AI-assisted application that records a clinical consultation, transcribes it, and generates a professionally structured prescription document. It includes an editing interface, version history, audit trail, and privacy controls.

## Key Features

- Live Web Speech transcription with interim and final utterances
- Structured transcript JSON export with session metadata and diarization
- Heuristic Prescription Parser that extracts:
  - Patient demographics and contact details
  - Medical history, current conditions, vital signs, and examination findings
  - Diagnosis, medications (dose, frequency, duration, route, instructions, warnings)
  - General instructions, precautions, notes
  - Consultation summary: overview, key findings, decisions, follow-up, special instructions
- Prescription Editor: full document editing (patient info, diagnosis, meds, instructions, notes)
- Version History: each save appends a new version with timestamp and allows revert
- Audit Trail: records create/update/revert actions with timestamps and actor
- Privacy Mode: masks direct identifiers in some views (e.g., patient name)
- QR Code section and legacy prescription view for continuity

## Privacy & Compliance

This project includes a Privacy Mode to help protect personally identifiable information (PII) during demonstrations.

- When Privacy Mode is enabled (toggle in header), certain views mask direct identifiers such as patient name.
- The underlying structured JSON may still contain full data; avoid sharing raw JSON in public contexts.
- No data is sent to external services by default; transcription uses the browser’s Web Speech API.
- If integrating third-party ASR/NLP, ensure HIPAA/GDPR compliance, appropriate BAAs, and encrypted transport/storage.

Recommended practices:
- Do not store patient identifiers without consent. If storage is needed, encrypt at rest and in transit.
- Use role-based access controls and maintain audit logs for all access and edits.
- Redact PII when exporting or presenting outside the clinical environment.

## Versioning & Audit Trail

- Each time you save the edited prescription, a new immutable version is appended.
- The audit trail records actions with timestamp, actor, and optional notes.
- You can revert to a previous version from the Version History panel; revert creates a new version entry.

## Developer Guide

### Tech Stack

- React + Vite
- TypeScript
- Web Speech API wrapper

### TypeScript Notes

- The Web Speech API types (SpeechRecognition, SpeechRecognitionEvent) are minimally defined in `src/types/webspeech.d.ts` for compilation.
- When `verbatimModuleSyntax` is enabled, import types with `import type { ... }`.

### Prescription Types & Parser

- Domain types are defined in `src/types/prescription.ts`.
- The heuristic parser lives in `src/services/PrescriptionParser.ts` and converts `TranscriptUtterance[]` into a `PrescriptionDocument`.
- The parser is rule-based and can be replaced with ML/NLP models.

### UI Components

- `PrescriptionEditor` allows editing of all major fields.
- `VersionHistory` displays versions and allows revert.
- `AuditTrail` displays a chronological list of changes.
- `PatientInfo` and `PrescriptionView` support Privacy Mode masking.

### Running Locally

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Open the provided localhost URL (shown in terminal)
4. Build production: `npm run build`

### Workflow

1. Click “Start Recording” and speak your consultation.
2. Stop recording; review the transcription.
3. Click “Generate Prescription” to parse into a structured document.
4. Click “Edit Prescription” to refine fields; Save to create a new version.
5. Use Version History to review and revert; Audit Trail shows changes.
6. Toggle Privacy Mode for masked display when needed.

### Future Improvements

- PDF generation and print-ready professional formatting
- Stronger type guards and schema validation (e.g., Zod)
- Authentication, authorization, and secure storage
- Integration with third-party EHRs and e-prescription APIs

## License

MIT
