import type { TranscriptUtterance } from "../types/transcription";
import type {
  PrescriptionDocument,
  PatientDemographics,
  MedicalHistory,
  VitalSigns,
  ExaminationFinding,
  Diagnosis,
  Medication,
} from "../types/prescription";

// Basic, heuristic parser to extract structured data from transcript text.
// This is rule-based and can be replaced with a medical NLP model later.
export class PrescriptionParser {
  static parse(utterances: TranscriptUtterance[], providerName?: string): PrescriptionDocument {
    const text = utterances
      .map(u => (u.text ?? "").trim())
      .filter(Boolean)
      .join(" \n");

    const now = new Date().toISOString();

    const patient: PatientDemographics = {
      name: this.extractName(text),
      age: this.extractAge(text),
      gender: this.extractGender(text),
      contact: this.extractContact(text),
    };

    const history: MedicalHistory | undefined = this.extractHistory(text);
    const currentConditions = this.extractCurrentConditions(text);
    const vitals: VitalSigns | undefined = this.extractVitals(text);
    const examination: ExaminationFinding[] | undefined = this.extractExamination(text);
    const diagnosis: Diagnosis | undefined = this.extractDiagnosis(text);
    const medications: Medication[] = this.extractMedications(text);
    const instructions = this.extractInstructions(text);

    const notesVal = this.extractNotes(text);
    return {
      patient,
      history,
      currentConditions,
      vitals,
      examination,
      diagnosis,
      medications,
      instructions,
      notes: providerName ? `${notesVal ? notesVal + ' ' : ''}Prescriber: ${providerName}` : notesVal,
      summary: {
        overview: this.extractOverview(text),
        keyFindings: this.extractKeyFindings(text),
        decisions: this.extractDecisions(text),
        followUp: this.extractFollowUp(text),
        specialInstructions: this.extractSpecialInstructions(text),
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
  }

  private static extractName(text: string): string | undefined {
    // Look for patterns: "Patient [Name]" or "This is [Name]" or "Name: [Name]"
    const patterns = [
      /Patient\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /Name:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /Mr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /Mrs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /Ms\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1];
    }
    return undefined;
  }

  private static extractAge(text: string): number | undefined {
    const re = /(\d{1,3})\s*-?\s*(?:year\s*old|y\/o|years\s*old)/i;
    const m = text.match(re);
    if (m) {
      const age = parseInt(m[1], 10);
      if (!isNaN(age)) return age;
    }
    return undefined;
  }

  private static extractGender(text: string): PatientDemographics["gender"] | undefined {
    if (/\bmale\b/i.test(text)) return "male";
    if (/\bfemale\b/i.test(text)) return "female";
    return undefined;
  }

  private static extractContact(text: string) {
    const phoneMatch = text.match(/(?:phone|contact)\s*[:\-]?\s*(\+?\d[\d\s\-]{7,}\d)/i);
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const addressMatch = text.match(/address\s*[:\-]?\s*(.+)/i);
    return {
      phone: phoneMatch?.[1],
      email: emailMatch?.[0],
      address: addressMatch?.[1]?.split("\n")[0],
    };
  }

  private static extractHistory(text: string): MedicalHistory | undefined {
    const pastConditions = this.extractListAfter(text, /(past\s*medical\s*history|history)\s*[:\-]/i);
    const allergies = this.extractListAfter(text, /allergies\s*[:\-]/i);
    const medsCurrent = this.extractListAfter(text, /(current\s*medications|medications\s*currently)\s*[:\-]/i);
    if (pastConditions.length || allergies.length || medsCurrent.length) {
      return {
        pastConditions,
        allergies,
        medicationsCurrently: medsCurrent.length ? medsCurrent : undefined,
      };
    }
    return undefined;
  }

  private static extractCurrentConditions(text: string): string[] | undefined {
    const conds = this.extractListAfter(text, /(assessment|conditions|presents\s*with|diagnosed\s*with)\s*[:\-]/i);
    return conds.length ? conds : undefined;
  }

  private static extractVitals(text: string): VitalSigns | undefined {
    const bp = text.match(/\b(\d{2,3}\/\d{2,3})\b\s*(?:mmHg)?/);
    const hr = text.match(/\b(\d{2,3})\s*bpm\b/i);
    const rr = text.match(/\b(\d{2})\s*(?:breaths\/?min|min)\b/i);
    const temp = text.match(/\b(\d{2,3}(?:\.\d)?)\s*(?:F|C)\b/);
    const spo2 = text.match(/\b(\d{2,3})%\b/);
    if (bp || hr || rr || temp || spo2) {
      return {
        bloodPressure: bp?.[1] ? `${bp[1]} mmHg` : undefined,
        heartRate: hr?.[1] ? `${hr[1]} bpm` : undefined,
        respiratoryRate: rr?.[1] ? `${rr[1]} breaths/min` : undefined,
        temperature: temp?.[1] ? `${temp[1]} ${text.includes(" C") ? "C" : "F"}` : undefined,
        spo2: spo2?.[1] ? `${spo2[1]}%` : undefined,
      };
    }
    return undefined;
  }

  private static extractExamination(text: string): ExaminationFinding[] | undefined {
    const examBlock = this.extractBlock(text, /(exam(?:ination)?\s*(?:findings)?|physical\s*exam)\s*[:\-]/i);
    if (!examBlock) return undefined;
    const lines = examBlock.split(/\n|;|\./).map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const parts = line.split(/:\s*/);
      return { system: parts.length > 1 ? parts[0] : undefined, description: parts.length > 1 ? parts[1] : parts[0] } as ExaminationFinding;
    });
  }

  private static extractDiagnosis(text: string): Diagnosis | undefined {
    const primary = this.extractAfter(text, /diagnosis\s*[:\-]/i);
    const diffs = this.extractListAfter(text, /(differentials|ddx)\s*[:\-]/i);
    if (primary || diffs.length) return { primary: primary || undefined, differentials: diffs.length ? diffs : undefined };
    return undefined;
  }

  private static extractMedications(text: string): Medication[] {
    const meds: Medication[] = [];
    
    // Enhanced patterns for medication extraction
    const regexes = [
      // Standard pattern: "Amoxicillin 500 mg twice daily for 7 days"
      /(Take\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|IU|%|units))\s*(.+?)(?:for\s+([\w\s]+?))?(?:\.|\n|$)/g,
      
      // Prescribe pattern: "Prescribe Lisinopril 10 mg once daily"
      /prescribe\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|IU|%|units))?\s*(.+?)(?:for\s+([\w\s]+?))?(?:\.|\n|$)/gi,
      
      // Start pattern: "Start Metformin 500 mg with meals"
      /start\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|IU|%|units))?\s*(.+?)(?:for\s+([\w\s]+?))?(?:\.|\n|$)/gi,
      
      // Continue pattern: "Continue Atorvastatin 20 mg at bedtime"
      /continue\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|IU|%|units))?\s*(.+?)(?:for\s+([\w\s]+?))?(?:\.|\n|$)/gi,
      
      // Medication with number of tablets: "Aspirin 81 mg, 1 tablet daily"
      /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|IU|%|units)),?\s+(\d+(?:\.\d+)?)\s+(?:tablet|capsule|pill|dose)s?\s+(.+?)(?:for\s+([\w\s]+?))?(?:\.|\n|$)/gi,
      
      // Medication with form: "Fluticasone propionate nasal spray, 2 sprays in each nostril daily"
      /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:nasal\s+spray|cream|ointment|solution|inhaler|drops),?\s+(.+?)(?:\.|\n|$)/gi,
      
      // Medication with just name and instructions: "Tylenol as needed for pain"
      /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)\s+as\s+needed\s+for\s+(.+?)(?:\.|\n|$)/gi
    ];
    
    // Process each regex pattern
    for (const re of regexes) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        // Extract medication components based on regex pattern
        let name, dose, rest, duration;
        
        if (m[0].match(/tablet|capsule|pill|dose/i)) {
          // Handle tablet/capsule format
          name = m[1]?.trim();
          dose = m[2]?.trim();
          const quantity = m[3]?.trim();
          rest = `${quantity} ${m[0].match(/tablet|capsule|pill|dose/i)?.[0] || "unit(s)"} ${m[4]?.trim() || ""}`;
          duration = m[5]?.trim();
        } else if (m[0].match(/nasal\s+spray|cream|ointment|solution|inhaler|drops/i)) {
          // Handle special formulations
          name = m[1]?.trim();
          const formType = m[0].match(/nasal\s+spray|cream|ointment|solution|inhaler|drops/i)?.[0];
          dose = formType;
          rest = m[2]?.trim() || "";
          duration = m[0].match(/for\s+([\w\s]+?)(?:\.|\n|$)/i)?.[1];
        } else if (m[0].match(/as\s+needed\s+for/i)) {
          // Handle PRN medications
          name = m[1]?.trim();
          dose = undefined;
          rest = `as needed for ${m[2]?.trim() || ""}`;
          duration = undefined;
        } else {
          // Standard format
          name = m[1]?.trim();
          dose = m[2]?.trim();
          rest = m[3]?.trim() || "";
          duration = m[4]?.trim();
        }
        
        // Extract frequency, route, and instructions
        const freqMatch = rest.match(/(once|twice|thrice|every\s+\d+\s*(?:hours|hour|days|day)|daily|bid|tid|qid|q\d+h|with\s+meals|at\s+bedtime|in\s+the\s+morning|in\s+the\s+evening|as\s+needed|prn)/i);
        const routeMatch = rest.match(/\b(PO|oral|by\s+mouth|IM|intramuscular|IV|intravenous|SC|subcutaneous|topical|inhaled|sublingual|nasal|ophthalmic|otic)\b/i);
        
        // Clean up instructions by removing frequency and route terms
        let instructions = rest;
        if (freqMatch) {
          instructions = instructions.replace(freqMatch[0], "");
        }
        if (routeMatch) {
          instructions = instructions.replace(routeMatch[0], "");
        }
        
        // Clean up any remaining punctuation and whitespace
        instructions = instructions.replace(/\s+/g, " ").trim();
        instructions = instructions.replace(/^[,\s]+|[,\s]+$/g, "");
        
        // Standardize route terminology
        let route = routeMatch?.[0];
        if (route) {
          if (route.match(/oral|by\s+mouth/i)) route = "PO";
          else if (route.match(/intramuscular/i)) route = "IM";
          else if (route.match(/intravenous/i)) route = "IV";
          else if (route.match(/subcutaneous/i)) route = "SC";
          else if (route.match(/topical/i)) route = "Topical";
          else if (route.match(/inhaled/i)) route = "Inhaled";
          else if (route.match(/sublingual/i)) route = "SL";
          else if (route.match(/nasal/i)) route = "Nasal";
          else if (route.match(/ophthalmic/i)) route = "Ophthalmic";
          else if (route.match(/otic/i)) route = "Otic";
        }
        
        // Standardize frequency terminology
        let frequency = freqMatch?.[0];
        if (frequency) {
          if (frequency.match(/once\s+daily|daily/i)) frequency = "Once daily";
          else if (frequency.match(/twice\s+daily|bid/i)) frequency = "Twice daily";
          else if (frequency.match(/three\s+times\s+daily|thrice\s+daily|tid/i)) frequency = "Three times daily";
          else if (frequency.match(/four\s+times\s+daily|qid/i)) frequency = "Four times daily";
          else if (frequency.match(/as\s+needed|prn/i)) frequency = "As needed (PRN)";
        }
        
        // Add medication if name is present
        if (name) {
          meds.push({ 
            name, 
            dose, 
            frequency, 
            route, 
            duration, 
            instructions: instructions || undefined 
          });
        }
      }
    }
    
    // Extract warnings from text
    const warningLines = text.split(/\n/).filter(l => /avoid|do\s+not|warning|caution|alert|contraindication/i.test(l));
    if (warningLines.length) {
      const warnings = warningLines.map(w => w.trim());
      meds.forEach(med => {
        med.warnings = med.warnings ? med.warnings.concat(warnings) : warnings;
      });
    }
    
    // Look for special instructions that might apply to all medications
    const specialInstructions = text.match(/(?:take\s+all\s+medications|all\s+medications\s+should\s+be\s+taken)\s+(.+?)(?:\.|\n|$)/i);
    if (specialInstructions && meds.length > 0) {
      const instruction = specialInstructions[1].trim();
      meds.forEach(med => {
        if (!med.instructions) {
          med.instructions = instruction;
        }
      });
    }
    
    return meds;
  }

  private static extractInstructions(text: string) {
    const general = this.extractListAfter(text, /(instructions|patient\s*education)\s*[:\-]/i);
    const precautions = this.extractListAfter(text, /(precautions|warnings)\s*[:\-]/i);
    if (general.length || precautions.length) return { general, precautions };
    return undefined;
  }

  private static extractNotes(text: string): string | undefined {
    return this.extractBlock(text, /notes\s*[:\-]/i) || undefined;
  }

  private static extractOverview(text: string): string | undefined {
    return this.extractAfter(text, /(overview|summary)\s*[:\-]/i) || undefined;
  }

  private static extractKeyFindings(text: string): string[] {
    return this.extractListAfter(text, /(key\s*findings)\s*[:\-]/i);
  }

  private static extractDecisions(text: string): string[] {
    return this.extractListAfter(text, /(decisions|plan)\s*[:\-]/i);
  }

  private static extractFollowUp(text: string): string | undefined {
    return this.extractAfter(text, /(follow\s*up|follow-up\s*recommendations)\s*[:\-]/i) || undefined;
  }

  private static extractSpecialInstructions(text: string): string | undefined {
    return this.extractAfter(text, /(special\s*instructions)\s*[:\-]/i) || undefined;
  }

  // Utilities
  private static extractAfter(text: string, re: RegExp): string | null {
    const m = text.match(re);
    if (!m) return null;
    const idx = (m.index || 0) + m[0].length;
    const remainder = text.slice(idx).split(/\n/)[0].trim();
    return remainder || null;
  }

  private static extractListAfter(text: string, re: RegExp): string[] {
    const block = this.extractBlock(text, re);
    if (!block) return [];
    return block
      .split(/\n|;|\.|,/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  private static extractBlock(text: string, re: RegExp): string | null {
    const m = text.match(re);
    if (!m) return null;
    const start = (m.index || 0) + m[0].length;
    // Block ends at next section header or end of text
    const rest = text.slice(start);
    const endIdx = rest.search(/\n\s*[A-Z][A-Za-z\s]*\s*[:\-]/); // next header-like pattern
    const block = endIdx >= 0 ? rest.slice(0, endIdx) : rest;
    return block.trim();
  }
}