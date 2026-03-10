import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "../styles/VerifyPage.css";

export default function VerifyPage() {
  const location = useLocation();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [certId, setCertId] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load uploaded file from previous page
  useEffect(() => {
    if (location.state?.file) {
      const passedFile = location.state.file;
      setFile(passedFile);
      setFileName(passedFile.name);
    }
  }, [location.state]);

  // Replace selected file
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setFileName(selected.name);
    setResults(null);
  };

  const handleVerify = async () => {
    if (!file || !certId || !universityId)
      return alert("Fill all fields");

    setLoading(true);

    const formData = new FormData();
    formData.append("certificates", file);
    formData.append("certId", certId);
    formData.append("universityId", universityId);

    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/verify-multiple`,
      { method: "POST", body: formData }
    );

    const data = await res.json();
    setResults(data.results);
    setLoading(false);
  };

  // Determine status based on verification method
  const getStatus = (r) => {
    if (!r.success) return "invalid";
    // If onChain.revoked exists and is true, certificate is revoked
    if (r.onChain?.revoked) return "revoked";

    if (r.method === 'individual') {
      return (r.verification.hashMatch && r.verification.signatureValid) ? "valid" : "invalid";
    } else if (r.method === 'batch') {
      return (r.verification.hashMatch && r.verification.merkleProofValid) ? "valid" : "invalid";
    }
    return "invalid";
  };

  return (
    <div className="verify-page">
      {/* HERO */}
      <div className="verify-hero">
        <h1>Verify Certificate</h1>
        <p>Instant blockchain certificate authentication.</p>

        {/* FILE BAR */}
        <div className="file-bar">
          <span className="file-name">
            {fileName || "No file selected"}
          </span>
          <button
            className="change-btn"
            onClick={() => fileInputRef.current.click()}
          >
            Change
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".pdf"
            onChange={handleFileChange}
          />
        </div>

        {/* INPUTS */}
        <div className="input-row">
          <input
            placeholder="Certificate ID"
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
          />
          <input
            placeholder="University ID"
            value={universityId}
            onChange={(e) => setUniversityId(e.target.value)}
          />
        </div>

        {/* VERIFY BUTTON */}
        <button
          className="verify-main-btn"
          onClick={handleVerify}
        >
          {loading ? "Verifying..." : "Verify Certificate"}
        </button>
      </div>

      {/* RESULTS */}
      {results && results.map((r, i) => (
        <div key={i} className="result-card">
          <div className={`status ${getStatus(r)}`}>
            {getStatus(r).toUpperCase()}
          </div>

          <h3>{r.fileName}</h3>

          {r.success && (
            <div className="result-details">
              <p>Hash Match: {r.verification.hashMatch ? "✅" : "❌"}</p>

              {/* Individual certificate details */}
              {r.method === 'individual' && (
                <p>Signature Valid: {r.verification.signatureValid ? "✅" : "❌"}</p>
              )}

              {/* Batch certificate details */}
              {r.method === 'batch' && (
                <p>Merkle Proof Valid: {r.verification.merkleProofValid ? "✅" : "❌"}</p>
              )}

              {/* Revoked status – only show if present */}
              {r.onChain?.revoked !== undefined && (
                <p>Revoked: {r.onChain.revoked ? "Yes" : "No"}</p>
              )}

              {r.university && (
                <>
                  <hr />
                  <b>{r.university.name}</b>
                  <p>{r.university.email}</p>
                  <p>{r.university.address}</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}