import { useState } from "react";
import "../../styles/IssueCertificate.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { QRCodeCanvas } from "qrcode.react";
import { BrowserProvider, Contract } from "ethers";
import contractABI from "/src/contractABI.json";
import { db } from "../../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const IssueCertificate = ({ university }) => {
  const [form, setForm] = useState({
    studentName: "",
    course: "",
    certId: "",
    studentId: "",
  });

  const [issued, setIssued] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [verificationUrl, setVerificationUrl] = useState(null);
  const [aesKey, setAesKey] = useState(null);
  const [ipfsCid, setIpfsCid] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Generate PDF as base64 string (optimized for size)
  const generatePDFBase64 = async () => {
    const element = document.getElementById("certificate");
    await new Promise(resolve => setTimeout(resolve, 300));
    // Use scale 2 (instead of 4) and JPEG compression
    const canvas = await html2canvas(element, { 
      scale: 2, 
      useCORS: true 
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.8); // JPEG with 80% quality
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
    const pdfBlob = pdf.output("blob");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]); // base64 without header
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });
  };

  // ========== MAIN ISSUE FUNCTION ==========
  const issueCertificate = async () => {
    if (!form.studentName || !form.course || !form.certId || !form.studentId) {
      alert("Please fill all fields including Student ID");
      return;
    }

    setLoading(true);
    setIssued(false);
    setTxHash(null);
    setVerificationUrl(null);
    setAesKey(null);
    setIpfsCid(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

      // ---- STEP 1: Generate PDF on frontend ----
      const pdfBase64 = await generatePDFBase64();

      // ---- STEP 2: PREPARE (send PDF and form data to backend) ----
      const prepareRes = await fetch(`${backendUrl}/api/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          universityName: university?.universityName || "CertVerify University",
          pdfBase64,
        }),
      });
      if (!prepareRes.ok) throw new Error(`Prepare failed (${prepareRes.status})`);
      const { pdfHash, tempId } = await prepareRes.json();

      // ---- STEP 3: CONNECT TO METAMASK AND ENSURE CORRECT NETWORK ----
      if (!window.ethereum) throw new Error("MetaMask not installed");
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      let signer = await provider.getSigner();

      // Network check (Arbitrum Sepolia) – same as before
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

      // ---- STEP 4: FINALIZE (backend encrypts, uploads to IPFS) ----
      const finalizeRes = await fetch(`${backendUrl}/api/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempId, signature, issuer }),
      });
      if (!finalizeRes.ok) throw new Error(`Finalize failed (${finalizeRes.status})`);
      const finalData = await finalizeRes.json();

      setIpfsCid(finalData.cid);

      // ---- STEP 5: DOWNLOAD ENCRYPTED PDF (optional) ----
      const pdfBytes = Uint8Array.from(atob(finalData.encryptedPdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.certId}.encrypted.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);

      // ---- STEP 6: SUBMIT TO BLOCKCHAIN WITH GAS RETRY ----
      const contract = new Contract(contractAddress, contractABI, signer);
      let tx;
      let receipt;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const feeData = await signer.provider.getFeeData();
          let maxFeePerGas = feeData.maxFeePerGas;
          if (maxFeePerGas) {
            maxFeePerGas = (maxFeePerGas * 120n) / 100n;
          }
          const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

          console.log(`Attempt ${retries + 1}: maxFeePerGas = ${maxFeePerGas}`);

          tx = await contract.issueCertificate(
            finalData.certId,
            finalData.cid,
            finalData.pdfHashHex,
            finalData.signature,
            finalData.issuer,
            { maxFeePerGas, maxPriorityFeePerGas }
          );

          receipt = await tx.wait();
          break;
        } catch (error) {
          if (error?.code === -32603 && error?.message?.includes("max fee per gas less than block base fee")) {
            retries++;
            if (retries === maxRetries) {
              throw new Error("Transaction failed after multiple retries due to gas fee issues.");
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw error;
          }
        }
      }

      // ---- STEP 7: STORE CERTIFICATE DATA IN FIRESTORE ----
      const certDocRef = doc(db, "certificates", form.certId);
      await setDoc(certDocRef, {
        studentId: form.studentId,
        studentName: form.studentName,
        course: form.course,
        certId: form.certId,
        issuer: issuer,
        transactionHash: receipt.hash,
        ipfsCid: finalData.cid,
        aesKey: finalData.aesKeyWithIv,
        verificationUrl: finalData.verificationUrl,
        issuedAt: serverTimestamp(),
        universityName: university?.universityName || "CertVerify University",
      });

      // ---- STEP 8: UPDATE UI ----
      setIssued(true);
      setTxHash(receipt.hash);
      setVerificationUrl(finalData.verificationUrl);
      setAesKey(finalData.aesKeyWithIv);
      alert("✅ Certificate issued, stored in Firestore, and recorded on blockchain!");
    } catch (error) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ========== PREVIEW PDF DOWNLOAD (optimized as well) ==========
  const generatePDF = async () => {
    const element = document.getElementById("certificate");
    await new Promise(resolve => setTimeout(resolve, 300));
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/jpeg", 0.8);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${form.certId || "certificate"}.pdf`);
  };

  const verificationURL = form.certId
    ? `https://certverify.app/verify/${form.certId}`
    : "https://certverify.app/pending";

  return (
    <div className="issue-container">
      <h2>Issue Certificate</h2>

      <div className="form-section">
        <input name="studentName" placeholder="Student Name" value={form.studentName} onChange={handleChange} />
        <input name="course" placeholder="Course / Degree" value={form.course} onChange={handleChange} />
        <input name="certId" placeholder="Certificate ID (unique)" value={form.certId} onChange={handleChange} />
        <input name="studentId" placeholder="Student ID (e.g., email or UID)" value={form.studentId} onChange={handleChange} />
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
          <p>✅ Certificate issued on blockchain and saved to Firestore!</p>
          <p><strong>Student ID:</strong> {form.studentId}</p>
          {ipfsCid && (
            <p>
              📦 <strong>IPFS CID:</strong> <code>{ipfsCid}</code><br />
              <a href={`https://ipfs.io/ipfs/${ipfsCid}`} target="_blank" rel="noopener noreferrer">View Encrypted PDF on IPFS Gateway</a>
            </p>
          )}
          {txHash && (
            <p>
              <strong>Transaction Hash:</strong>{" "}
              <a href={`https://sepolia.arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </p>
          )}
          {verificationUrl && (
            <p>
              <strong>Verification URL:</strong>{" "}
              <a href={verificationUrl} target="_blank" rel="noopener noreferrer">{verificationUrl}</a>
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