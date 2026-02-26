import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { ethers } from "ethers";
import contractABI from "/src/contractABI.json";

const ViewCertificates = ({ studentProfile }) => {
  const [certificates, setCertificates] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [revokedStatus, setRevokedStatus] = useState({});
  const [downloading, setDownloading] = useState({});

  // Fetch certificates from Firestore
  useEffect(() => {
    const fetchCertificates = async () => {
      if (!studentProfile?.studentId) return;
      try {
        const q = query(
          collection(db, "certificates"),
          where("studentId", "==", studentProfile.studentId)
        );
        const querySnapshot = await getDocs(q);
        const certs = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCertificates(certs);
        setFiltered(certs);
      } catch (error) {
        console.error("Error fetching certificates:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCertificates();
  }, [studentProfile]);

  // Fetch revocation status from blockchain
  useEffect(() => {
    const fetchRevocationStatuses = async () => {
      const provider = new ethers.JsonRpcProvider(
        "https://sepolia-rollup.arbitrum.io/rpc"
      );
      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
      const contract = new ethers.Contract(contractAddress, contractABI, provider);

      const statusMap = {};
      for (const cert of certificates) {
        try {
          const certData = await contract.getCertificate(cert.certId);
          statusMap[cert.certId] = certData.revoked;
        } catch (err) {
          console.error(`Failed to fetch status for ${cert.certId}:`, err);
          statusMap[cert.certId] = null;
        }
      }
      setRevokedStatus(statusMap);
    };

    if (certificates.length > 0) {
      fetchRevocationStatuses();
    }
  }, [certificates]);

  // Filter by search
  useEffect(() => {
    const lower = search.toLowerCase();
    setFiltered(
      certificates.filter((cert) =>
        cert.course.toLowerCase().includes(lower) ||
        cert.certId.toLowerCase().includes(lower)
      )
    );
  }, [search, certificates]);

  // Helper: compute SHA-256 hash of ArrayBuffer
  const computeHash = async (buffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hashBuffer);
  };

  // ----- Decryption function for AES-256-CBC -----
  const downloadAndDecrypt = async (cert) => {
    setDownloading((prev) => ({ ...prev, [cert.certId]: true }));
    try {
      // List of gateways (local first, then public)
      const gateways = [
        import.meta.env.VITE_IPFS_GATEWAY || 'http://localhost:8080',
        'https://ipfs.io',
        'https://cloudflare-ipfs.com',
        'https://dweb.link',
      ].filter(Boolean);

      let encryptedBlob = null;
      let lastError = null;

      for (const gateway of gateways) {
        try {
          const url = `${gateway}/ipfs/${cert.ipfsCid}`;
          console.log(`Attempting to fetch from: ${url}`);
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10000),
          });
          if (response.ok) {
            encryptedBlob = await response.blob();
            console.log(`Successfully fetched from ${gateway}`);
            break;
          } else {
            lastError = new Error(`HTTP ${response.status} from ${gateway}`);
          }
        } catch (e) {
          lastError = e;
          console.warn(`Gateway ${gateway} failed:`, e.message);
        }
      }

      if (!encryptedBlob) {
        throw new Error(`Failed to fetch from any gateway. Last error: ${lastError?.message}`);
      }

      console.log('Encrypted blob size:', encryptedBlob.size);

      // Decode base64 key+IV (32-byte key + 16-byte IV = 48 bytes)
      const keyIvBuffer = Uint8Array.from(atob(cert.aesKey), (c) => c.charCodeAt(0));
      console.log('Decoded key+IV length:', keyIvBuffer.length);

      if (keyIvBuffer.length !== 48) {
        throw new Error(`Invalid key/IV length – expected 48 bytes (32+16), got ${keyIvBuffer.length}`);
      }

      const keyBytes = keyIvBuffer.slice(0, 32);
      const ivBytes = keyIvBuffer.slice(32, 48);

      // Import key for AES-CBC
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-CBC", length: 256 },
        false,
        ["decrypt"]
      );

      const encryptedArrayBuffer = await encryptedBlob.arrayBuffer();
      console.log('Encrypted ArrayBuffer length:', encryptedArrayBuffer.byteLength);

      // Decrypt using AES-CBC
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-CBC", iv: ivBytes },
        cryptoKey,
        encryptedArrayBuffer
      );

      // VERIFICATION: compute hash and compare with stored pdfHashHex if available 
      const decryptedHash = await computeHash(decrypted);
      const decryptedHashHex = '0x' + Array.from(decryptedHash).map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('Decrypted hash:', decryptedHashHex);

      if (cert.pdfHashHex) {
        console.log('Stored hash:   ', cert.pdfHashHex);
        const hashMatch = decryptedHashHex.toLowerCase() === cert.pdfHashHex.toLowerCase();
        if (!hashMatch) {
          console.warn('⚠️ Hash mismatch! The decrypted file may be corrupted or wrong key/IV.');
        } else {
          console.log('✅ Hash matches – decryption successful!');
        }
      } else {
        console.warn('No stored hash found for this certificate; skipping hash verification.');
      }

      // PDF HEADER CHECK 
      const decryptedBytes = new Uint8Array(decrypted);
      const header = new TextDecoder().decode(decryptedBytes.slice(0, 4));
      console.log('File header (first 4 bytes):', header);

      if (header !== '%PDF') {
        console.error('❌ Decrypted file does not start with %PDF – not a valid PDF.');
        throw new Error('Decrypted file is not a valid PDF (header mismatch).');
      } else {
        console.log('✅ PDF header detected – file appears to be a valid PDF.');
      }

      //  Create and trigger download 
      const decryptedBlob = new Blob([decrypted], { type: "application/pdf" });
      const url = URL.createObjectURL(decryptedBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cert.certId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Download/decryption failed:", error);
      alert(`Failed to download certificate: ${error.message}`);
    } finally {
      setDownloading((prev) => ({ ...prev, [cert.certId]: false }));
    }
  };

  if (loading) return <div className="placeholder">Loading certificates...</div>;

  return (
    <>
      <input
        className="search"
        placeholder="Search certificates..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="placeholder">No certificates found.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cert ID</th>
              <th>Course</th>
              <th>University</th>
              <th>View Transaction</th>
              <th>Download</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cert) => (
              <tr key={cert.certId}>
                <td>{cert.certId}</td>
                <td>{cert.course}</td>
                <td>{cert.universityName || "—"}</td>
                <td>
                  {cert.transactionHash && (
                    <a
                      href={`https://sepolia.arbiscan.io/tx/${cert.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  )}
                </td>
                <td>
                  <button
                    className="view-btn"
                    onClick={() => downloadAndDecrypt(cert)}
                    disabled={downloading[cert.certId]}
                  >
                    {downloading[cert.certId] ? "..." : "⬇"}
                  </button>
                </td>
                <td>
                  {revokedStatus[cert.certId] === true ? (
                    <span className="status revoked">REVOKED</span>
                  ) : revokedStatus[cert.certId] === false ? (
                    <span className="status valid">VALID</span>
                  ) : (
                    <span className="status unknown">UNKNOWN</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
};

export default ViewCertificates;