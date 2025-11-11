const PrescriptionView = ({ prescription, isAnalyzing, onEdit, privacyMode = false }) => {
  const mask = (value) => {
    if (!privacyMode || !value) return value;
    const str = String(value);
    if (str.length <= 2) return '*'.repeat(str.length);
    return str[0] + '*'.repeat(Math.max(0, str.length - 2)) + str[str.length - 1];
  };
  if (isAnalyzing) {
    return (
      <div className="card prescription-view">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">AI is analyzing your transcription and generating prescription...</div>
        </div>
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="card prescription-view">
        <div className="empty-state">
          <i className="fas fa-file-medical"></i>
          <h3>No Prescription Generated</h3>
          <p>Record your consultation and click "Generate Prescription" to create a medical prescription</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card prescription-view">
      <div className="prescription-header">
        <div className="prescription-title">Medical Prescription</div>
        <div className="prescription-date">{prescription.date}</div>
      </div>
      
      <div className="prescription-content">
        <div className="prescription-field">
          <label>Patient Name</label>
          <div className="value">{mask(prescription.patientName)}</div>
        </div>
        
        <div className="prescription-field">
          <label>Diagnosis</label>
          <div className="value">{prescription.diagnosis}</div>
        </div>
        
        <div className="prescription-field">
          <label>Medications Prescribed</label>
          <div id="prescription-medications">
            {prescription.medications.length > 0 ? (
              prescription.medications.map((med, index) => (
                <div key={index} className="medicine-item">
                  <div className="medicine-header">
                    <div className="medicine-name">{med.name}</div>
                    <div className="medicine-dosage">{med.dosage}</div>
                  </div>
                  
                  <div className="medicine-details">
                    <div className="medicine-detail">
                      <span className="detail-label">Frequency:</span>
                      <span className="detail-value">{med.frequency}</span>
                    </div>
                    <div className="medicine-detail">
                      <span className="detail-label">Duration:</span>
                      <span className="detail-value">{med.duration}</span>
                    </div>
                  </div>
                  
                  <div className="medicine-detail">
                    <span className="detail-label">Instructions:</span>
                    <span className="detail-value">{med.instructions}</span>
                  </div>
                  
                  {med.remarks && (
                    <div className="medicine-remarks">
                      <strong>Remarks:</strong> {med.remarks}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <i className="fas fa-pills"></i>
                <p>No medications detected in transcription</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="remarks-section">
          <label>Additional Instructions & Remarks</label>
          <div className="value">{prescription.remarks}</div>
        </div>
        
        <div className="prescription-field">
          <div className="value" style={{ textAlign: 'center', background: 'transparent', border: 'none' }}>
            <strong>Prescribing Physician:</strong> {prescription.doctor}<br />
            <strong>License No:</strong> {prescription.license}
          </div>
        </div>
      </div>
      
      <div className="prescription-actions no-print">
        <button className="action-btn edit-btn" onClick={onEdit}>
          <i className="fas fa-edit"></i>
          Edit Prescription
        </button>
        <button className="action-btn print-btn" onClick={() => window.print()}>
          <i className="fas fa-print"></i>
          Print
        </button>
        <button className="action-btn download-btn" onClick={() => window.print()}>
          <i className="fas fa-download"></i>
          Download PDF
        </button>
      </div>
    </div>
  );
};

export default PrescriptionView;