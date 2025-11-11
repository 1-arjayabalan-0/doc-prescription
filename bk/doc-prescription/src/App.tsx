import { useState } from "react";
import "./App.css";
import AuditTrail from "./components/AuditTrail";
import PrescriptionEditor from "./components/PrescriptionEditor";
import PrescriptionView from "./components/PrescriptionView";
import QRCodeSection from "./components/QRCodeSection";
import RecorderContainer from "./components/RecordContainer";
import VersionHistory from "./components/VersionHistory";
import type {
  AuditTrailEntry,
  PrescriptionDocument,
  PrescriptionVersion,
} from "./types/prescription";

function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [jsonOutput, setJsonOutput] = useState<any>();
  const [prescription, setPrescription] = useState<any>(null);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [doc, setDoc] = useState<PrescriptionDocument | null>(null);
  const [versions, setVersions] = useState<PrescriptionVersion[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 3000);
  };

  const toLegacyPrescription = (d: PrescriptionDocument) => {
    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return {
      patientName: d.patient.name || "Unknown",
      age:
        typeof d.patient.age === "number"
          ? `${d.patient.age} years`
          : "Not specified",
      diagnosis: d.diagnosis?.primary || "Medical Consultation",
      medications: (d.medications || []).map((m) => ({
        name: m.name,
        dosage: m.dose,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        remarks:
          m.warnings && m.warnings.length
            ? `Warnings: ${m.warnings.join("; ")}`
            : undefined,
      })),
      remarks: d.notes || d.instructions?.general?.join("; ") || "",
      date: dateStr,
      doctor: "Dr. Sarah Wilson, MD",
      license: "MED123456",
    };
  };

  const handleSaveEditedDocument = (
    updated: PrescriptionDocument,
    change?: {
      fieldPath?: string;
      previousValue?: any;
      newValue?: any;
      notes?: string;
    }
  ) => {
    const ts = new Date().toISOString();
    const nextVersion = (versions[versions.length - 1]?.version || 1) + 1;
    const updatedDoc: PrescriptionDocument = {
      ...updated,
      updatedAt: ts,
      version: nextVersion,
    };
    setDoc(updatedDoc);
    setVersions((prev) => [
      ...prev,
      { version: nextVersion, timestamp: ts, document: updatedDoc },
    ]);
    setAuditTrail((prev) => [
      ...prev,
      {
        id: `audit_${Date.now()}`,
        timestamp: ts,
        actor: "Provider",
        changeType: "update",
        fieldPath: change?.fieldPath,
        previousValue: change?.previousValue,
        newValue: change?.newValue,
        notes: change?.notes,
      },
    ]);
    setPrescription(toLegacyPrescription(updatedDoc));
    setIsEditing(false);
    showToast("Prescription updated and version saved");
  };

  const handleRevertVersion = (versionNumber: number) => {
    const target = versions.find((v) => v.version === versionNumber);
    if (!target) return;
    const ts = new Date().toISOString();
    const nextVersion =
      (versions[versions.length - 1]?.version || target.version) + 1;
    const reverted: PrescriptionDocument = {
      ...target.document,
      updatedAt: ts,
      version: nextVersion,
    };
    setDoc(reverted);
    setVersions((prev) => [
      ...prev,
      { version: nextVersion, timestamp: ts, document: reverted },
    ]);
    setAuditTrail((prev) => [
      ...prev,
      {
        id: `audit_${Date.now()}`,
        timestamp: ts,
        actor: "Provider",
        changeType: "revert",
        notes: `Reverted to version ${versionNumber}`,
      },
    ]);
    setPrescription(toLegacyPrescription(reverted));
    showToast(`Reverted to version ${versionNumber}`);
  };

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="header-content">
          <i className="fas fa-stethoscope header-icon"></i>
          <h1 className="header-title">Voice to Prescription System</h1>
        </div>
        <p className="header-subtitle">
          AI-Powered Medical Transcription & Prescription Generation
        </p>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={privacyMode}
              onChange={(e) => setPrivacyMode(e.target.checked)}
            />
            Privacy Mode (mask PII in some views)
          </label>
        </div>
      </header>

      <div className="app-layout">
        {/* Left Side - Recording & Transcription */}
        <div className="left-panel no-print">
          <RecorderContainer />

          {/* <TranscriptionEditor
            transcription={transcription}
            setTranscription={setTranscription}
            onAnalyze={handleAnalyzeTranscription}
            isAnalyzing={isAnalyzing}
            hasTranscription={!!transcription.trim()}
          /> */}
        </div>

        {/* Right Side - Prescription & Patient Info */}
        <div className="right-panel">
          {/* <PatientInfo prescription={prescription} privacyMode={privacyMode} /> */}

          <PrescriptionView
            prescription={prescription}
            isAnalyzing={isAnalyzing}
            onEdit={() => setIsEditing(true)}
            privacyMode={privacyMode}
          />
          {isEditing && doc && (
            <PrescriptionEditor
              document={doc}
              privacyMode={privacyMode}
              onSave={handleSaveEditedDocument}
              onCancel={() => setIsEditing(false)}
            />
          )}

          {doc && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <i className="fas fa-clipboard-list"></i>
                <h2>Consultation Summary</h2>
              </div>
              <div className="prescription-content">
                {doc.summary?.overview && (
                  <div className="prescription-field">
                    <label>Overview</label>
                    <div className="value">{doc.summary.overview}</div>
                  </div>
                )}
                {!!doc.summary?.keyFindings?.length && (
                  <div className="prescription-field">
                    <label>Key Findings</label>
                    <div className="value">
                      {doc.summary.keyFindings.join("; ")}
                    </div>
                  </div>
                )}
                {!!doc.summary?.decisions?.length && (
                  <div className="prescription-field">
                    <label>Decisions</label>
                    <div className="value">
                      {doc.summary.decisions.join("; ")}
                    </div>
                  </div>
                )}
                {doc.summary?.followUp && (
                  <div className="prescription-field">
                    <label>Follow-Up</label>
                    <div className="value">{doc.summary.followUp}</div>
                  </div>
                )}
                {doc.summary?.specialInstructions && (
                  <div className="prescription-field">
                    <label>Special Instructions</label>
                    <div className="value">
                      {doc.summary.specialInstructions}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!!versions.length && (
            <div className="no-print">
              <VersionHistory
                versions={versions}
                onRevert={handleRevertVersion}
              />
            </div>
          )}

          {!!auditTrail.length && (
            <div className="no-print">
              <AuditTrail entries={auditTrail} />
            </div>
          )}

          <QRCodeSection prescription={prescription} />
        </div>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className="toast show no-print">
          <i className="fas fa-check-circle"></i>
          <span>{toast.message}</span>
        </div>
      )}
      {jsonOutput && (
        <div
          className="card no-print"
          style={{ overflowX: "auto", marginTop: 20 }}
        >
          <div
            className="card-header"
            style={{ justifyContent: "space-between", width: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <i className="fas fa-code"></i>
              <h2>Structured JSON Output</h2>
            </div>
            <button
              className="action-btn download-btn"
              onClick={() => {
                const blob = new Blob([JSON.stringify(jsonOutput, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${jsonOutput.session.id}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <i className="fas fa-download"></i>
              Download JSON
            </button>
          </div>
          <pre
            style={{
              maxHeight: 300,
              overflow: "auto",
              background: "#0f172a",
              color: "#e2e8f0",
              padding: 12,
              borderRadius: 12,
            }}
          >
            {JSON.stringify(jsonOutput, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;
