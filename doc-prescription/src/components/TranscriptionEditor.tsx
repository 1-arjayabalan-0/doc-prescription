import React, { useState, useEffect } from 'react';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface TranscriptionEditorProps {
  transcription: string;
  setTranscription: (text: string) => void;
  onAnalyze: (validationResult?: ValidationResult) => void;
  isAnalyzing: boolean;
  hasTranscription: boolean;
}

const TranscriptionEditor: React.FC<TranscriptionEditorProps> = ({
  transcription,
  setTranscription,
  onAnalyze,
  isAnalyzing,
  hasTranscription,
}) => {
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
    warnings: []
  });
  const [showValidation, setShowValidation] = useState(false);
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);

  // Validate transcription whenever it changes, with debounce
  useEffect(() => {
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    if (transcription.trim()) {
      const timeout = setTimeout(() => {
        const result = validateTranscription(transcription);
        setValidationResult(result);
      }, 500); // 500ms debounce
      
      setValidationTimeout(timeout);
    } else {
      setValidationResult({ isValid: true, errors: [], warnings: [] });
    }

    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [transcription]);

  const validateTranscription = (text: string): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for required patient information
    if (!text.match(/patient|name/i)) {
      errors.push("Patient identification information missing");
    } else {
      // Check for complete patient information
      if (!text.match(/\b(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?)\s+[A-Z][a-z]+/i) && 
          !text.match(/patient\s+(?:is|named|:)\s+[A-Z][a-z]+/i) &&
          !text.match(/name\s*(?:is|:)\s*[A-Z][a-z]+/i)) {
        warnings.push("Patient name may be incomplete or unclear");
      }
      
      if (!text.match(/\b\d{1,3}\s*(?:year|y)(?:\s|-)*old\b/i) && 
          !text.match(/\bage\s*(?:is|:)\s*\d{1,3}\b/i)) {
        warnings.push("Patient age information may be missing");
      }
    }
    
    // Check for diagnosis information
    if (!text.match(/diagnos(?:is|ed with)|assessment|impression/i)) {
      errors.push("Diagnosis information missing - required for prescription");
    } else if (!text.match(/diagnos(?:is|ed with)\s*(?:is|:|\s+of|\s+with)\s+[A-Z][a-z]+/i) && 
               !text.match(/assessment\s*(?::|reveals|shows)\s+[A-Z][a-z]+/i)) {
      warnings.push("Diagnosis may be incomplete or unclear");
    }
    
    // Check for medication information
    const hasMedication = text.match(/prescribe|medication|take|dose|mg|tablet|capsule/i);
    if (!hasMedication) {
      errors.push("No medication details detected - required for prescription");
    } else {
      // Check for complete medication information
      const hasMedicationName = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b\s+\d+\s*(?:mg|mcg|g|ml|%)/i) || 
                               text.match(/prescribe\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/i);
      
      const hasDosage = text.match(/\d+\s*(?:mg|mcg|g|ml|%|units)/i);
      const hasFrequency = text.match(/daily|twice|once|every\s+\d+\s*(?:hours|days)|bid|tid|qid|as\s+needed|prn/i);
      const hasRoute = text.match(/\b(?:oral|by\s+mouth|PO|IV|IM|SC|topical|inhaled|sublingual|nasal)\b/i);
      
      if (!hasMedicationName) {
        errors.push("Medication name not clearly specified");
      }
      
      if (!hasDosage) {
        errors.push("Medication dosage information missing");
      }
      
      if (!hasFrequency) {
        warnings.push("Medication frequency information may be incomplete");
      }
      
      if (!hasRoute) {
        warnings.push("Medication route of administration may be missing");
      }
    }
    
    // Check for follow-up instructions
    if (!text.match(/follow(?:\s|-)*up|return|next\s+visit|check\s+back|schedule|appointment/i)) {
      warnings.push("Follow-up instructions may be missing");
    }
    
    // Check for potential medical terminology issues
    const ambiguousTerms = text.match(/\b(it|this|that|they|them)\b/gi);
    if (ambiguousTerms && ambiguousTerms.length > 3) {
      warnings.push("Ambiguous references detected - consider clarifying medical terms");
    }
    
    // Check for potential contradictions
    if ((text.match(/allergic/i) && text.match(/prescribe|take/i)) || 
        (text.match(/contraindicated/i) && text.match(/start|begin|initiate/i))) {
      errors.push("Potential contradiction detected - check for medication allergies or contraindications");
    }
    
    // Check for date information
    if (!text.match(/today|tomorrow|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}-\d{1,2}(?:-\d{2,4})?|January|February|March|April|May|June|July|August|September|October|November|December/i)) {
      warnings.push("Date information may be missing");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  const handleAnalyzeClick = () => {
    setShowValidation(true);
    
    // If there are critical errors, don't proceed with analysis
    if (validationResult.errors.length > 0) {
      // Display error toast or notification
      return;
    }
    
    try {
      // Pass validation results to parent component
      onAnalyze(validationResult);
    } catch (error) {
      console.error("Error during prescription generation:", error);
      // Add error to validation results
      setValidationResult(prev => ({
        ...prev,
        errors: [...prev.errors, "Error during prescription generation. Please check your transcription."]
      }));
    }
  };

  return (
    <div className="card transcription-editor">
      <div className="card-header">
        <i className="fas fa-edit"></i>
        <h2>Transcription Editor</h2>
        {showValidation && (
          <div className="validation-status">
            {validationResult.isValid ? (
              <span className="validation-success"><i className="fas fa-check-circle"></i> Valid</span>
            ) : (
              <span className="validation-failed"><i className="fas fa-exclamation-circle"></i> Issues Found</span>
            )}
          </div>
        )}
      </div>

      <textarea
        value={transcription}
        onChange={(e) => setTranscription(e.target.value)}
        placeholder="Your voice transcription will appear here automatically after recording. You can also type or edit the text directly..."
        disabled={isAnalyzing}
        className={showValidation && validationResult.errors.length > 0 ? "validation-error" : ""}
      />

      {showValidation && (validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
        <div className="validation-feedback">
          {validationResult.errors.length > 0 && (
            <div className="validation-errors">
              <h4><i className="fas fa-exclamation-circle"></i> Critical Issues</h4>
              <ul>
                {validationResult.errors.map((error, index) => (
                  <li key={`error-${index}`}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          {validationResult.warnings.length > 0 && (
            <div className="validation-warnings">
              <h4><i className="fas fa-exclamation-triangle"></i> Potential Issues</h4>
              <ul>
                {validationResult.warnings.map((warning, index) => (
                  <li key={`warning-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          
          {validationResult.errors.length === 0 && (
            <div className="validation-help">
              <p>You can proceed with generation, but consider addressing the warnings for a more complete prescription.</p>
            </div>
          )}
        </div>
      )}

      <div className="transcription-actions">
        <button
          className="analyze-button"
          onClick={handleAnalyzeClick}
          disabled={isAnalyzing || !hasTranscription}
        >
          {isAnalyzing ? (
            <>
              <i className="fas fa-spinner fa-spin"></i>
              Analyzing...
            </>
          ) : (
            <>
              <i className="fas fa-magic"></i>
              Generate Prescription
            </>
          )}
        </button>
        
        {showValidation && validationResult.errors.length > 0 && (
          <div className="analyze-error">
            <i className="fas fa-exclamation-circle"></i>
            Please fix critical issues before generating prescription
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionEditor;
