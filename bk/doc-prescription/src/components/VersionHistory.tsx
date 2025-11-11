import React from 'react';
import type { PrescriptionVersion } from '../types/prescription';

interface Props {
  versions: PrescriptionVersion[];
  onRevert: (version: number) => void;
}

const VersionHistory: React.FC<Props> = ({ versions, onRevert }) => {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <i className="fas fa-history"></i>
        <h2>Version History</h2>
      </div>
      <div className="prescription-content">
        {versions.map(v => (
          <div key={v.version} className="prescription-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label>Version {v.version}</label>
              <div className="value">{new Date(v.timestamp).toLocaleString()}</div>
            </div>
            <button className="action-btn" onClick={() => onRevert(v.version)}>
              <i className="fas fa-undo"></i>
              Revert
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VersionHistory;