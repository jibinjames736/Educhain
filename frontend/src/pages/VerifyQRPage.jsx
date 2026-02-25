import { useState } from "react";
import { useNavigate } from "react-router-dom";

const VerifyQRPage = () => {
  const navigate = useNavigate();
  const [certId, setCertId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async () => {
    if (!certId.trim()) {
      alert("Please enter a certificate ID");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/verify-qr`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certId }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Verify by Certificate ID</h2>
      <button onClick={() => navigate(-1)} style={{ marginBottom: "20px" }}>
        ← Back
      </button>

      <div>
        <input
          type="text"
          placeholder="Enter certificate ID"
          value={certId}
          onChange={(e) => setCertId(e.target.value)}
          style={{ padding: "8px", width: "300px", marginRight: "10px" }}
        />
        <button onClick={handleVerify} disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </button>
      </div>

      {error && (
        <div style={{ color: "red", marginTop: "20px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "20px", background: "#f5f5f5", padding: "15px", borderRadius: "8px" }}>
          <h3>Result</h3>
          <p><strong>Certificate ID:</strong> {result.certId}</p>
          <p><strong>Status:</strong> {result.revoked ? "REVOKED" : "ACTIVE"}</p>
          <p><strong>Issuer:</strong> {result.issuer}</p>
          {result.university && (
            <p><strong>University:</strong> {result.university.name}</p>
          )}
          <p><strong>IPFS CID:</strong> {result.ipfsCID}</p>
        </div>
      )}
    </div>
  );
};

export default VerifyQRPage;