import React from 'react';
import type { AuditTrailEntry } from '../types/prescription';

interface Props {
  entries: AuditTrailEntry[];
}

const AuditTrail: React.FC<Props> = ({ entries }) => {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <i className="fas fa-clipboard-check"></i>
        <h2>Audit Trail</h2>
      </div>
      <div className="prescription-content">
        {entries.map(e => (
          <div key={e.id} className="prescription-field">
            <label>
              {new Date(e.timestamp).toLocaleString()} — {e.actor} — {e.changeType.toUpperCase()}
            </label>
            <div className="value">
              {e.fieldPath ? `Field: ${e.fieldPath}. ` : ''}
              {e.notes ? e.notes : ''}
            </div>
          </div>
        ))}
        {!entries.length && (
          <div className="empty-state">
            <i className="fas fa-info-circle"></i>
            <p>No audit entries yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditTrail;