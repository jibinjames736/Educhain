import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

const VerifyQRPage = () => {
  const navigate = useNavigate();
  const { certId: urlCertId } = useParams(); // extract from URL if present

  const [certId, setCertId] = useState(urlCertId || "");
  const [universityId, setUniversityId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-fill certId from URL
  useEffect(() => {
    if (urlCertId) {
      setCertId(urlCertId);
    }
  }, [urlCertId]);

  const handleVerify = async () => {
    if (!certId.trim()) {
      alert("Please enter a certificate ID");
      return;
    }
    if (!universityId.trim()) {
      alert("Please enter the university ID");
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
          body: JSON.stringify({ certId, universityId }),
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

  // Helper to determine status class
  const getStatus = (r) => {
    if (!r.success) return "invalid";
    if (r.onChain?.revoked) return "revoked";
    if (r.verification?.hashMatch && r.verification?.signatureValid)
      return "valid";
    return "invalid";
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Verify Certificate by ID</h2>
      <button onClick={() => navigate(-1)} style={{ marginBottom: "20px" }}>
        ← Back
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input
          type="text"
          placeholder="Certificate ID"
          value={certId}
          onChange={(e) => setCertId(e.target.value)}
          style={{ padding: "8px", width: "100%" }}
        />
        <input
          type="text"
          placeholder="University ID (e.g., UNI-1)"
          value={universityId}
          onChange={(e) => setUniversityId(e.target.value)}
          style={{ padding: "8px", width: "100%" }}
        />
        <button onClick={handleVerify} disabled={loading} style={{ padding: "10px" }}>
          {loading ? "Verifying..." : "Verify"}
        </button>
      </div>

      {error && (
        <div style={{ color: "red", marginTop: "20px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: "20px",
            background: "#f5f5f5",
            padding: "15px",
            borderRadius: "8px",
            borderLeft: `5px solid ${
              getStatus(result) === "valid"
                ? "green"
                : getStatus(result) === "revoked"
                ? "orange"
                : "red"
            }`,
          }}
        >
          <h3>Verification Result</h3>
          <p>
            <strong>Status:</strong>{" "}
            <span
              style={{
                color:
                  getStatus(result) === "valid"
                    ? "green"
                    : getStatus(result) === "revoked"
                    ? "orange"
                    : "red",
                fontWeight: "bold",
              }}
            >
              {getStatus(result).toUpperCase()}
            </span>
          </p>
          {result.success ? (
            <>
              <p>
                <strong>Certificate ID:</strong> {result.certId}
              </p>
              <p>
                <strong>File Name:</strong> {result.fileName}
              </p>
              <p>
                <strong>Hash Match:</strong>{" "}
                {result.verification?.hashMatch ? "✅" : "❌"}
              </p>
              <p>
                <strong>Signature Valid:</strong>{" "}
                {result.verification?.signatureValid ? "✅" : "❌"}
              </p>
              <p>
                <strong>Revoked:</strong> {result.onChain?.revoked ? "Yes" : "No"}
              </p>
              {result.university && (
                <>
                  <p>
                    <strong>University:</strong> {result.university.name}
                  </p>
                  <p>
                    <strong>Email:</strong> {result.university.email}
                  </p>
                </>
              )}
              <p>
                <strong>IPFS CID:</strong> {result.onChain?.ipfsCID}
              </p>
            </>
          ) : (
            <p style={{ color: "red" }}>{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default VerifyQRPage;