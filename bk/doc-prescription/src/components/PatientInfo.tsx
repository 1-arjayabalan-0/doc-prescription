
const PatientInfo = ({ prescription, privacyMode = false }) => {
  const mask = (value) => {
    if (!privacyMode || !value) return value || 'Not specified';
    const str = String(value);
    if (str.length <= 2) return '*'.repeat(str.length);
    return str[0] + '*'.repeat(Math.max(0, str.length - 2)) + str[str.length - 1];
  };
  return (
    <div className="card patient-info">
      <div className="card-header">
        <i className="fas fa-user-injured"></i>
        <h2>Patient Information</h2>
      </div>
      
      <div className="patient-details">
        <div className="patient-detail">
          <span className="detail-label">Name:</span>
          <span className="detail-value">{mask(prescription?.patientName)}</span>
        </div>
        
        <div className="patient-detail">
          <span className="detail-label">Age:</span>
          <span className="detail-value">
            {prescription?.age || 'Not specified'}
          </span>
        </div>
        
        <div className="patient-detail">
          <span className="detail-label">Gender:</span>
          <span className="detail-value">
            {prescription?.patientName?.includes('Maria') ? 'Female' : 
             prescription?.patientName ? 'Male' : 'Not specified'}
          </span>
        </div>
        
        <div className="patient-detail">
          <span className="detail-label">Last Visit:</span>
          <span className="detail-value">15 Jun 2023</span>
        </div>
        
        <div className="patient-detail">
          <span className="detail-label">Allergies:</span>
          <span className="detail-value">Penicillin</span>
        </div>
        
        <div className="patient-detail">
          <span className="detail-label">Blood Group:</span>
          <span className="detail-value">O+</span>
        </div>
      </div>
    </div>
  );
};

export default PatientInfo;