export type Gender = "male" | "female" | "other" | "unspecified";

export interface ContactDetails {
  phone?: string;
  email?: string;
  address?: string;
}

export interface PatientDemographics {
  name?: string;
  age?: number;
  gender?: Gender;
  contact?: ContactDetails;
}

export interface VitalSigns {
  bloodPressure?: string; // e.g., "120/80 mmHg"
  heartRate?: string; // e.g., "72 bpm"
  respiratoryRate?: string; // e.g., "14 breaths/min"
  temperature?: string; // e.g., "98.6 F" or "37 C"
  spo2?: string; // e.g., "98%"
}

export interface ExaminationFinding {
  system?: string; // e.g., "Cardiovascular", "Respiratory"
  description: string;
}

export interface MedicalHistory {
  pastConditions: string[];
  allergies: string[];
  medicationsCurrently?: string[];
}

export interface Diagnosis {
  primary?: string;
  differentials?: string[];
}

export interface Medication {
  name: string;
  dose?: string; // e.g., "500 mg"
  frequency?: string; // e.g., "twice daily"
  route?: string; // e.g., "PO", "IM"
  duration?: string; // e.g., "7 days"
  instructions?: string;
  warnings?: string[];
}

export interface PrescriptionInstructions {
  general: string[]; // patient-friendly instructions
  precautions: string[]; // warnings and precautions
}

export interface ConsultationSummary {
  overview?: string; // concise overview of consultation
  keyFindings: string[];
  decisions: string[];
  followUp?: string; // recommendations or follow-up plan
  specialInstructions?: string; // any special instructions for patient
}

export interface PrescriptionDocument {
  patient: PatientDemographics;
  history?: MedicalHistory;
  currentConditions?: string[];
  vitals?: VitalSigns;
  examination?: ExaminationFinding[];
  diagnosis?: Diagnosis;
  medications: Medication[];
  instructions?: PrescriptionInstructions;
  notes?: string; // additional notes or recommendations
  summary?: ConsultationSummary;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  version: number;
}

export interface AuditTrailEntry {
  id: string;
  timestamp: string; // ISO timestamp
  actor: string; // e.g., provider name or id
  changeType: "create" | "update" | "delete" | "revert";
  fieldPath?: string; // e.g., "medications[0].dose"
  previousValue?: any;
  newValue?: any;
  notes?: string;
}

export interface PrescriptionVersion {
  version: number;
  timestamp: string; // ISO
  document: PrescriptionDocument;
}

export interface GenerationOptions {
  privacyMode?: boolean; // mask certain PII fields in UI
}