import { useState } from "react";
import "../../styles/IssueCertificate.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { QRCodeCanvas } from "qrcode.react";
import { BrowserProvider } from "ethers"; // ethers v6

const IssueCertificate = ({ university }) => {
  const [form, setForm] = useState({
    studentName: "",
    course: "",
    certId: "",
  });

  const [issued, setIssued] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [verificationUrl, setVerificationUrl] = useState(null);
  const [aesKey, setAesKey] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const verificationURL = form.certId
    ? `https://certverify.app/verify/${form.certId}`
    : "https://certverify.app/pending";

  // ========== MAIN ISSUE FUNCTION ==========
  const issueCertificate = async () => {
    if (!form.studentName || !form.course || !form.certId) {
      alert("Fill all fields before issuing certificate");
      return;
    }

    setLoading(true);
    setIssued(false);
    setTxHash(null);
    setVerificationUrl(null);
    setAesKey(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;

      // ---- STEP 1: PREPARE ----
      const prepareRes = await fetch(`${backendUrl}/api/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!prepareRes.ok) {
        const errorText = await prepareRes.text();
        throw new Error(`Prepare failed (${prepareRes.status}): ${errorText}`);
      }
      const { pdfHash, tempId } = await prepareRes.json();

      // ---- STEP 2: CONNECT TO METAMASK AND SIGN ----
      if (!window.ethereum) {
        throw new Error("MetaMask is not installed.");
      }
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []); // triggers connection if needed
      const signer = await provider.getSigner();
      const issuer = await signer.getAddress(); // address that will sign
      console.log("Signer address:", issuer);

      const signature = await signer.signMessage(pdfHash); // user signs the hash
      console.log("Signature obtained");

      // ---- STEP 3: FINALIZE ----
      const finalizeRes = await fetch(`${backendUrl}/api/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempId, signature, issuer }),
      });
      if (!finalizeRes.ok) {
        const errorText = await finalizeRes.text();
        throw new Error(`Finalize failed (${finalizeRes.status}): ${errorText}`);
      }
      const { pdfData, aesKey, verificationUrl, txHash } = await finalizeRes.json();

      // ---- STEP 4: DOWNLOAD ENCRYPTED PDF ----
      const byteCharacters = atob(pdfData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${form.certId}.encrypted.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // ---- STEP 5: UPDATE UI ----
      setIssued(true);
      setTxHash(txHash);
      setVerificationUrl(verificationUrl);
      setAesKey(aesKey);
      alert("✅ Certificate issued successfully! Encrypted PDF downloaded.");
    } catch (error) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ========== PREVIEW PDF DOWNLOAD ==========
  const generatePDF = async () => {
    const element = document.getElementById("certificate");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = await html2canvas(element, { scale: 4, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${form.certId || "certificate"}.pdf`);
  };

  return (
    <div className="issue-container">
      <h2>Issue Certificate</h2>

      <div className="form-section">
        <input name="studentName" placeholder="Student Name" onChange={handleChange} />
        <input name="course" placeholder="Course / Degree" onChange={handleChange} />
        <input name="certId" placeholder="Certificate ID" onChange={handleChange} />
      </div>

      <div className="action-buttons">
        <button className="issue-btn primary" onClick={issueCertificate} disabled={loading}>
          {loading ? "Processing..." : "Issue Certificate"}
        </button>
        <button className="issue-btn secondary" onClick={generatePDF}>
          Download PDF (Preview)
        </button>
      </div>

      {issued && (
        <div className="success-info">
          <p>✅ Certificate issued on blockchain!</p>
          {txHash && (
            <p>
              Transaction Hash:{" "}
              <a
                href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </p>
          )}
          {verificationUrl && (
            <p>
              Verification URL:{" "}
              <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
                {verificationUrl}
              </a>
            </p>
          )}
          {aesKey && (
            <p>
              🔑 Decryption Key (share with student): <code>{aesKey}</code>
            </p>
          )}
        </div>
      )}

      <div className="certificate-wrapper">
        <div id="certificate" className="certificate">
          <div className="cert-inner">
            {/* HEADER */}
            <div className="cert-header">
              <h4 className="cert-org">{university?.universityName || "CertVerify University"}</h4>
              <h1 className="cert-title">Certificate of Completion</h1>
              <p className="cert-text">This is to certify that</p>
              <h2 className="cert-name">{form.studentName || "Student Name"}</h2>
              <p className="cert-text">has successfully completed the course</p>
              <h3 className="cert-course">{form.course || "Course Name"}</h3>
            </div>

            {/* FOOTER */}
            <div className="cert-bottom">
              <div className="cert-meta">
                <p>Date Issued</p>
                <strong>{issued ? new Date().toLocaleDateString() : "--"}</strong>
              </div>
              <div className="cert-meta">
                <p>Certificate ID</p>
                <strong>{form.certId || "CERT-XXXX"}</strong>
              </div>
              <div className="cert-qr">
                <QRCodeCanvas value={verificationURL} size={110} />
                <span>Scan to Verify</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueCertificate;