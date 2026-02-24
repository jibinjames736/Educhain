import { useState } from "react";
import "../../styles/IssueCertificate.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { QRCodeCanvas } from "qrcode.react";
import { BrowserProvider, Contract } from "ethers"; // ethers v6
import contractABI from "/src/contractABI.json";

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
  const [ipfsCid, setIpfsCid] = useState(null); // <-- NEW STATE

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

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
    setIpfsCid(null); // reset

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

      // ---- STEP 1: PREPARE ----
      const prepareRes = await fetch(`${backendUrl}/api/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!prepareRes.ok) throw new Error(`Prepare failed (${prepareRes.status})`);
      const { pdfHash, tempId } = await prepareRes.json();

      // ---- STEP 2: CONNECT TO METAMASK AND ENSURE CORRECT NETWORK ----
      if (!window.ethereum) throw new Error("MetaMask not installed");
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      let signer = await provider.getSigner();

      // ---- NETWORK CHECK (Arbitrum Sepolia = chainId 421614) ----
      const network = await signer.provider.getNetwork();
      const targetChainId = 421614n;

      if (network.chainId !== targetChainId) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + targetChainId.toString(16) }],
          });
          const newProvider = new BrowserProvider(window.ethereum);
          signer = await newProvider.getSigner();
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x' + targetChainId.toString(16),
                chainName: 'Arbitrum Sepolia',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
                blockExplorerUrls: ['https://sepolia.arbiscan.io/'],
              }],
            });
            const newProvider = new BrowserProvider(window.ethereum);
            signer = await newProvider.getSigner();
          } else {
            throw new Error('Please switch to Arbitrum Sepolia manually');
          }
        }
      }

      const issuer = await signer.getAddress();
      const signature = await signer.signMessage(pdfHash);
      console.log("Hash signed by", issuer);

      // ---- STEP 3: FINALIZE (backend encrypts, uploads to IPFS) ----
      const finalizeRes = await fetch(`${backendUrl}/api/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempId, signature, issuer }),
      });
      if (!finalizeRes.ok) throw new Error(`Finalize failed (${finalizeRes.status})`);
      const finalData = await finalizeRes.json();
      // finalData contains: cid, pdfHashHex, signature, issuer, certId, encryptedPdfBase64, aesKeyWithIv, verificationUrl

      // Save IPFS CID
      setIpfsCid(finalData.cid);

      // ---- STEP 4: DOWNLOAD ENCRYPTED PDF ----
      const pdfBytes = Uint8Array.from(atob(finalData.encryptedPdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.certId}.encrypted.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);

      // ---- STEP 5: SUBMIT TO BLOCKCHAIN (using the same signer) ----
      const contract = new Contract(contractAddress, contractABI, signer);
      const tx = await contract.issueCertificate(
        finalData.certId,
        finalData.cid,
        finalData.pdfHashHex,
        finalData.signature,
        finalData.issuer
      );
      const receipt = await tx.wait();

      // ---- STEP 6: UPDATE UI ----
      setIssued(true);
      setTxHash(receipt.hash);
      setVerificationUrl(finalData.verificationUrl);
      setAesKey(finalData.aesKeyWithIv);
      alert("✅ Certificate issued and recorded on blockchain!");
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
    await new Promise(resolve => setTimeout(resolve, 300));
    const canvas = await html2canvas(element, { scale: 4, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${form.certId || "certificate"}.pdf`);
  };

  // ========== VERIFICATION URL PREVIEW ==========
  const verificationURL = form.certId
    ? `https://certverify.app/verify/${form.certId}`
    : "https://certverify.app/pending";

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
          {ipfsCid && (
            <p>
              📦 <strong>IPFS CID:</strong> <code>{ipfsCid}</code><br />
              <a
                href={`https://ipfs.io/ipfs/${ipfsCid}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Encrypted PDF on IPFS Gateway
              </a>
            </p>
          )}
          {txHash && (
            <p>
              <strong>Transaction Hash:</strong>{" "}
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
              <strong>Verification URL:</strong>{" "}
              <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
                {verificationUrl}
              </a>
            </p>
          )}
          {aesKey && (
            <p>
              🔑 <strong>Decryption Key</strong> (share with student): <code>{aesKey}</code>
            </p>
          )}
        </div>
      )}

      <div className="certificate-wrapper">
        <div id="certificate" className="certificate">
          <div className="cert-inner">
            <div className="cert-header">
              <h4 className="cert-org">{university?.universityName || "CertVerify University"}</h4>
              <h1 className="cert-title">Certificate of Completion</h1>
              <p className="cert-text">This is to certify that</p>
              <h2 className="cert-name">{form.studentName || "Student Name"}</h2>
              <p className="cert-text">has successfully completed the course</p>
              <h3 className="cert-course">{form.course || "Course Name"}</h3>
            </div>

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