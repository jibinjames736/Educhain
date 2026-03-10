import { useState } from "react";
import "../../styles/BatchIssuance.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { QRCodeCanvas } from "qrcode.react";
import { BrowserProvider, Contract, getBytes, solidityPackedKeccak256, keccak256 as ethersKeccak256 } from "ethers";
import { MerkleTree } from "merkletreejs";
import { v4 as uuidv4 } from "uuid";
import contractABI from "/src/contractABI.json";
import { db } from "../../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const BatchIssuance = ({ university }) => {
  // Batch metadata
  const [batchId, setBatchId] = useState(uuidv4());
  const [batchName, setBatchName] = useState("");

  // List of added certificates
  const [certificates, setCertificates] = useState([]);

  // Current certificate form
  const [form, setForm] = useState({
    studentName: "",
    course: "",
    certId: "",
    studentId: "",
  });

  // UI states
  const [adding, setAdding] = useState(false);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [batchSubmitted, setBatchSubmitted] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Generate PDF as base64 (same as IssueCertificate)
  const generatePDFBase64 = async () => {
    const element = document.getElementById("certificate-preview");
    if (!element) throw new Error("Preview element not found");

    await new Promise((resolve) => setTimeout(resolve, 300));

    const canvas = await html2canvas(element, { scale: 2, useCORS: true });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("Canvas has zero dimensions – preview element may be hidden or not rendered.");
    }

    const imgData = canvas.toDataURL("image/jpeg", 0.8);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: "a4",
    });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
    const pdfBlob = pdf.output("blob");

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });
  };

  // Add a single certificate to the batch
  const addCertificate = async () => {
    if (
      !form.studentName ||
      !form.course ||
      !form.certId ||
      !form.studentId
    ) {
      alert("Please fill all fields");
      return;
    }

    if (certificates.some((c) => c.certId === form.certId)) {
      alert("Certificate ID already used in this batch");
      return;
    }

    setAdding(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;

      const pdfBase64 = await generatePDFBase64();

      const prepareRes = await fetch(`${backendUrl}/api/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          universityName: university?.universityName || "CertVerify University",
          pdfBase64,
        }),
      });
      if (!prepareRes.ok) throw new Error("Prepare failed");
      const { pdfHash, tempId } = await prepareRes.json();

      if (!window.ethereum) throw new Error("MetaMask not installed");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const issuer = await signer.getAddress(); // mixed case
      const issuerLower = issuer.toLowerCase(); // ✅ store lowercase

      const signature = await signer.signMessage(getBytes(pdfHash));

      const finalizeRes = await fetch(`${backendUrl}/api/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempId, signature, issuer: issuerLower }),
      });
      if (!finalizeRes.ok) throw new Error("Finalize failed");
      const finalData = await finalizeRes.json();

      const pdfBytes = Uint8Array.from(
        atob(finalData.encryptedPdfBase64),
        (c) => c.charCodeAt(0)
      );
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.certId}.encrypted.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);

      // ✅ Store aesKey along with other certificate data
      const newCert = {
        ...form,
        ipfsCid: finalData.cid,
        pdfHash: finalData.pdfHashHex,
        issuer: issuerLower,               // ✅ stored lowercase
        signature,
        encryptedPdfBase64: finalData.encryptedPdfBase64,
        aesKey: finalData.aesKeyWithIv,
        timestamp: Date.now(),
      };
      setCertificates((prev) => [...prev, newCert]);

      setForm({ studentName: "", course: "", certId: "", studentId: "" });

      alert(`Certificate ${form.certId} added to batch`);
    } catch (error) {
      console.error(error);
      alert(`Error adding certificate: ${error.message}`);
    } finally {
      setAdding(false);
    }
  };

  const removeCertificate = (certId) => {
    setCertificates((prev) => prev.filter((c) => c.certId !== certId));
  };

  const computeLeaf = (cert) => {
    return solidityPackedKeccak256(
      ["string", "string", "bytes32", "address"],
      [cert.certId, cert.ipfsCid, cert.pdfHash, cert.issuer]
    );
  };

  const hashFn = (data) => {
    const hex = ethersKeccak256(data);
    return getBytes(hex);
  };

  const submitBatch = async () => {
    if (certificates.length === 0) {
      alert("No certificates in batch");
      return;
    }

    setSubmittingBatch(true);
    try {
      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const leavesHex = certificates.map(computeLeaf);
      const leavesBuffer = leavesHex.map((hex) => getBytes(hex));

      const tree = new MerkleTree(leavesBuffer, hashFn, { sortPairs: true, hashLeaves: false });
      const root = tree.getRoot().toString("hex");

      const batchIdClean = batchId.replace(/-/g, "");
      const batchIdPadded = batchIdClean.padEnd(64, "0");
      const batchIdBytes32 = "0x" + batchIdPadded;

      const contract = new Contract(contractAddress, contractABI, signer);
      const tx = await contract.setBatchRoot(batchIdBytes32, "0x" + root);
      const receipt = await tx.wait();
      const transactionHash = receipt.hash;
      setTxHash(transactionHash);

      const certificatesWithProofs = certificates.map((cert, index) => {
        const leafHex = leavesHex[index];
        const proof = tree.getProof(leavesBuffer[index]).map((p) => "0x" + p.data.toString("hex"));
        return { ...cert, leaf: leafHex, proof };
      });

      // Store batch data
      const batchRef = doc(db, "batches", batchId);
      await setDoc(batchRef, {
        batchId,
        batchName: batchName || `Batch ${new Date().toLocaleString()}`,
        root: "0x" + root,
        issuer: (await signer.getAddress()).toLowerCase(), // ✅ store lowercase
        transactionHash,
        certificates: certificatesWithProofs,
        createdAt: serverTimestamp(),
        universityName: university?.universityName || "CertVerify University",
        universityId: university?.id || university?.universityId || "", // ✅ ensure string, not null
      });

      // Store each certificate with transaction hash, university name, and university ID
      for (const cert of certificatesWithProofs) {
        const certRef = doc(db, "certificates", cert.certId);
        await setDoc(certRef, {
          ...cert,                    // includes aesKey, issuer already lowercase
          batchId,
          transactionHash,
          universityName: university?.universityName || "CertVerify University",
          universityId: university?.id || university?.universityId || "", // ✅ ensure string
          issuedAt: serverTimestamp(),
        });
      }

      setBatchSubmitted(true);
      alert("✅ Batch successfully submitted on‑chain and stored in Firestore!");
    } catch (error) {
      console.error(error);
      alert(`Error submitting batch: ${error.message}`);
    } finally {
      setSubmittingBatch(false);
    }
  };

  const resetBatch = () => {
    setBatchId(uuidv4());
    setBatchName("");
    setCertificates([]);
    setForm({ studentName: "", course: "", certId: "", studentId: "" });
    setBatchSubmitted(false);
    setTxHash(null);
  };

  const previewPDF = async () => {
    if (!form.studentName || !form.course || !form.certId) {
      alert("Fill at least name, course and certificate ID to preview");
      return;
    }
    const element = document.getElementById("certificate-preview");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/jpeg", 0.8);
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${form.certId}.pdf`);
  };

  return (
    <div className="batch-issuance-container">
      <h2>Batch Issuance</h2>

      {/* Batch Header */}
      <div className="batch-header">
        <div className="batch-info">
          <label>
            Batch ID (auto):
            <input type="text" value={batchId} readOnly disabled />
          </label>
          <label>
            Batch Name (optional):
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g., Summer 2025 Graduates"
            />
          </label>
        </div>
        <div className="batch-stats">
          <strong>Certificates in batch:</strong> {certificates.length}
        </div>
      </div>

      {/* Form to add a new certificate */}
      <div className="form-section">
        <h3>Add Certificate</h3>
        <div className="form-row">
          <input
            name="studentName"
            placeholder="Student Name"
            value={form.studentName}
            onChange={handleChange}
          />
          <input
            name="course"
            placeholder="Course / Degree"
            value={form.course}
            onChange={handleChange}
          />
          <input
            name="certId"
            placeholder="Certificate ID (unique)"
            value={form.certId}
            onChange={handleChange}
          />
          <input
            name="studentId"
            placeholder="Student ID (e.g., email)"
            value={form.studentId}
            onChange={handleChange}
          />
        </div>
        <div className="action-buttons">
          <button
            className="btn-primary"
            onClick={addCertificate}
            disabled={adding || submittingBatch || batchSubmitted}
          >
            {adding ? "Processing..." : "Add Certificate"}
          </button>
          <button
            className="btn-secondary"
            onClick={previewPDF}
            disabled={!form.studentName || !form.course || !form.certId}
          >
            Preview PDF
          </button>
        </div>
      </div>

      {/* List of added certificates */}
      {certificates.length > 0 && (
        <div className="certificates-list">
          <h3>Certificates in this Batch</h3>
          <table className="cert-table">
            <thead>
              <tr>
                <th>Cert ID</th>
                <th>Student Name</th>
                <th>Course</th>
                <th>Student ID</th>
                <th>IPFS CID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((cert) => (
                <tr key={cert.certId}>
                  <td>{cert.certId}</td>
                  <td>{cert.studentName}</td>
                  <td>{cert.course}</td>
                  <td>{cert.studentId}</td>
                  <td>
                    <a
                      href={`https://ipfs.io/ipfs/${cert.ipfsCid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {cert.ipfsCid.slice(0, 10)}...
                    </a>
                  </td>
                  <td>
                    <button
                      className="btn-remove"
                      onClick={() => removeCertificate(cert.certId)}
                      disabled={submittingBatch || batchSubmitted}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Batch submission actions */}
      {certificates.length > 0 && !batchSubmitted && (
        <div className="batch-actions">
          <button
            className="btn-primary btn-large"
            onClick={submitBatch}
            disabled={submittingBatch || certificates.length === 0}
          >
            {submittingBatch ? "Submitting Batch..." : "Batch Done – Submit to Blockchain"}
          </button>
          <button
            className="btn-secondary btn-large"
            onClick={resetBatch}
            disabled={submittingBatch}
          >
            Cancel Batch
          </button>
        </div>
      )}

      {/* Success info after batch submission */}
      {batchSubmitted && (
        <div className="success-info">
          <p>✅ Batch successfully submitted!</p>
          <p>
            <strong>Batch ID:</strong> {batchId}
          </p>
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
          <p>
            <strong>Total certificates:</strong> {certificates.length}
          </p>
          <button className="btn-primary" onClick={resetBatch}>
            Start New Batch
          </button>
        </div>
      )}

      {/* Hidden certificate preview element – off-screen */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, visibility: 'visible' }}>
        <div id="certificate-preview" className="certificate">
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
                <strong>{new Date().toLocaleDateString()}</strong>
              </div>
              <div className="cert-meta">
                <p>Certificate ID</p>
                <strong>{form.certId || "CERT-XXXX"}</strong>
              </div>
              <div className="cert-qr">
                <QRCodeCanvas
                  value={`https://certverify.app/verify/${form.certId}`}
                  size={110}
                />
                <span>Scan to Verify</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchIssuance;