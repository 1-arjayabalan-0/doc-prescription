import React, { useState } from 'react';
import type { PrescriptionDocument, Medication } from '../types/prescription';

interface Props {
  document: PrescriptionDocument;
  privacyMode?: boolean;
  onSave: (
    updated: PrescriptionDocument,
    change?: { fieldPath?: string; previousValue?: any; newValue?: any; notes?: string }
  ) => void;
  onCancel: () => void;
}

const PrescriptionEditor: React.FC<Props> = ({ document, privacyMode = false, onSave, onCancel }) => {
  const [draft, setDraft] = useState<PrescriptionDocument>(document);

  const updateField = (updater: (doc: PrescriptionDocument) => PrescriptionDocument) => {
    const next = updater(draft);
    setDraft(next);
    // We do not emit change immediately; only on Save we pass the latest diff context
  };

  const onAddMedication = () => {
    const newMed: Medication = { name: '', dose: '', frequency: '', route: '', duration: '', instructions: '' };
    updateField((d) => ({ ...d, medications: [...(d.medications || []), newMed] }));
  };

  const onRemoveMedication = (index: number) => {
    updateField((d) => ({ ...d, medications: (d.medications || []).filter((_, i) => i !== index) }));
  };

  const mask = (value?: string) => {
    if (!privacyMode || !value) return value;
    if (value.length <= 2) return '*'.repeat(value.length);
    return value[0] + '*'.repeat(Math.max(0, value.length - 2)) + value[value.length - 1];
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <i className="fas fa-edit"></i>
          <h2>Edit Prescription</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="action-btn" onClick={() => onSave(draft, { notes: 'Manual edit in editor' })}>
            <i className="fas fa-save"></i>
            Save Changes
          </button>
          <button className="action-btn" onClick={onCancel}>
            <i className="fas fa-times"></i>
            Cancel
          </button>
        </div>
      </div>

      <div className="prescription-content">
        <div className="prescription-field">
          <label>Patient Name</label>
          <input
            type="text"
            value={privacyMode ? mask(draft.patient.name) || '' : draft.patient.name || ''}
            onChange={(e) => updateField((d) => ({ ...d, patient: { ...d.patient, name: e.target.value } }))}
            placeholder="Enter patient full name"
          />
        </div>

        <div className="prescription-field">
          <label>Age</label>
          <input
            type="number"
            value={draft.patient.age ?? ''}
            onChange={(e) => updateField((d) => ({ ...d, patient: { ...d.patient, age: Number(e.target.value) } }))}
            placeholder="Age"
          />
        </div>

        <div className="prescription-field">
          <label>Gender</label>
          <select
            value={draft.patient.gender || 'unspecified'}
            onChange={(e) => updateField((d) => ({ ...d, patient: { ...d.patient, gender: e.target.value as any } }))}
          >
            <option value="unspecified">Unspecified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="prescription-field">
          <label>Diagnosis</label>
          <input
            type="text"
            value={draft.diagnosis?.primary || ''}
            onChange={(e) => updateField((d) => ({ ...d, diagnosis: { ...(d.diagnosis || {}), primary: e.target.value } }))}
            placeholder="Primary diagnosis"
          />
        </div>

        <div className="prescription-field">
          <label>Medications</label>
          <div>
            {(draft.medications || []).map((m, idx) => (
              <div key={idx} className="medicine-item" style={{ marginBottom: 8 }}>
                <div className="medicine-header">
                  <input
                    type="text"
                    value={m.name}
                    onChange={(e) => updateField((d) => {
                      const meds = [...(d.medications || [])];
                      meds[idx] = { ...meds[idx], name: e.target.value };
                      return { ...d, medications: meds };
                    })}
                    placeholder="Name"
                  />
                  <input
                    type="text"
                    value={m.dose || ''}
                    onChange={(e) => updateField((d) => {
                      const meds = [...(d.medications || [])];
                      meds[idx] = { ...meds[idx], dose: e.target.value };
                      return { ...d, medications: meds };
                    })}
                    placeholder="Dose (e.g., 500 mg)"
                  />
                </div>
                <div className="medicine-details">
                  <input
                    type="text"
                    value={m.frequency || ''}
                    onChange={(e) => updateField((d) => {
                      const meds = [...(d.medications || [])];
                      meds[idx] = { ...meds[idx], frequency: e.target.value };
                      return { ...d, medications: meds };
                    })}
                    placeholder="Frequency (e.g., twice daily)"
                  />
                  <input
                    type="text"
                    value={m.route || ''}
                    onChange={(e) => updateField((d) => {
                      const meds = [...(d.medications || [])];
                      meds[idx] = { ...meds[idx], route: e.target.value };
                      return { ...d, medications: meds };
                    })}
                    placeholder="Route (e.g., PO)"
                  />
                  <input
                    type="text"
                    value={m.duration || ''}
                    onChange={(e) => updateField((d) => {
                      const meds = [...(d.medications || [])];
                      meds[idx] = { ...meds[idx], duration: e.target.value };
                      return { ...d, medications: meds };
                    })}
                    placeholder="Duration (e.g., 7 days)"
                  />
                </div>
                <div className="medicine-detail">
                  <textarea
                    value={m.instructions || ''}
                    onChange={(e) => updateField((d) => {
                      const meds = [...(d.medications || [])];
                      meds[idx] = { ...meds[idx], instructions: e.target.value };
                      return { ...d, medications: meds };
                    })}
                    placeholder="Instructions"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="action-btn" onClick={() => onRemoveMedication(idx)}>
                    <i className="fas fa-trash"></i>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button className="action-btn" onClick={onAddMedication}>
              <i className="fas fa-plus"></i>
              Add Medication
            </button>
          </div>
        </div>

        <div className="prescription-field">
          <label>General Instructions</label>
          <textarea
            value={(draft.instructions?.general || []).join('\n')}
            onChange={(e) => updateField((d) => ({
              ...d,
              instructions: { ...(d.instructions || { general: [], precautions: [] }), general: e.target.value.split('\n').filter(Boolean) },
            }))}
            placeholder="One per line"
          />
        </div>

        <div className="prescription-field">
          <label>Precautions</label>
          <textarea
            value={(draft.instructions?.precautions || []).join('\n')}
            onChange={(e) => updateField((d) => ({
              ...d,
              instructions: { ...(d.instructions || { general: [], precautions: [] }), precautions: e.target.value.split('\n').filter(Boolean) },
            }))}
            placeholder="One per line"
          />
        </div>

        <div className="prescription-field">
          <label>Notes</label>
          <textarea
            value={draft.notes || ''}
            onChange={(e) => updateField((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Additional notes or recommendations"
          />
        </div>
      </div>
    </div>
  );
};

export default PrescriptionEditor;