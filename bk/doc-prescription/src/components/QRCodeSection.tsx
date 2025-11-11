
const QRCodeSection = ({ prescription }) => {
  return (
    <div className="card qr-code">
      <div className="card-header">
        <i className="fas fa-qrcode"></i>
        <h2>Prescription QR Code</h2>
      </div>
      
      <div className="qr-placeholder">
        {prescription ? (
          <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: '4rem' }}></i>
        ) : (
          <i className="fas fa-qrcode fa-3x"></i>
        )}
      </div>
      
      <p className="qr-text">
        {prescription 
          ? 'Scan this QR code to verify the prescription authenticity'
          : 'QR code will be generated after prescription creation'
        }
      </p>
      
      {prescription && (
        <div style={{ marginTop: '15px', fontSize: '0.9rem', color: '#64748b' }}>
          <strong>Prescription ID:</strong> RX{Date.now().toString().slice(-6)}
        </div>
      )}
    </div>
  );
};

export default QRCodeSection;