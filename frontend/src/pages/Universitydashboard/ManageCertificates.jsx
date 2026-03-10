import { useState, useEffect } from "react";
import "../../styles/ManageCertificates.css";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";
import { BrowserProvider, Contract, JsonRpcProvider, isAddress } from "ethers";
import contractABI from "/src/contractABI.json";

const ManageCertificates = ({ university }) => {
  const [certificates, setCertificates] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [onChainStatus, setOnChainStatus] = useState({});
  const [statusLoading, setStatusLoading] = useState({});

  const rpcUrl = import.meta.env.VITE_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  const universityName = university?.universityName;

  // Fetch all certificates from Firestore and filter by universityName
  useEffect(() => {
    const fetchAllCertificates = async () => {
      if (!universityName) {
        console.warn("⚠️ No university name available");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, "certificates"));
        const allCerts = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Filter by universityName (case‑insensitive)
        const filteredCerts = allCerts.filter(
          (cert) =>
            cert.universityName?.toLowerCase() === universityName.toLowerCase()
        );

        setCertificates(filteredCerts);
        setFiltered(filteredCerts);
      } catch (error) {
        console.error("❌ Error fetching certificates:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllCertificates();
  }, [universityName]);

  // Fetch on‑chain status only for individual certificates
  useEffect(() => {
    const individualCerts = certificates.filter(cert => !(cert.proof && cert.batchId));
    if (individualCerts.length === 0) return;

    individualCerts.forEach(cert => {
      fetchSingleStatus(cert.certId);
    });
  }, [certificates]);

  const fetchSingleStatus = async (certId) => {
    setStatusLoading(prev => ({ ...prev, [certId]: true }));
    try {
      if (!isAddress(contractAddress)) {
        throw new Error(`Invalid contract address: ${contractAddress}`);
      }

      const provider = new JsonRpcProvider(rpcUrl);
      const contract = new Contract(contractAddress, contractABI, provider);

      const certData = await contract.getCertificate(certId);
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const exists = certData.issuer.toLowerCase() !== zeroAddress;

      if (!exists) {
        setOnChainStatus(prev => ({ ...prev, [certId]: "NOT_FOUND" }));
      } else {
        setOnChainStatus(prev => ({ ...prev, [certId]: certData.revoked }));
      }
    } catch (err) {
      console.error(`❌ Failed to fetch status for ${certId}:`, err.message);
      setOnChainStatus(prev => ({ ...prev, [certId]: null }));
    } finally {
      setStatusLoading(prev => ({ ...prev, [certId]: false }));
    }
  };

  // Filter by search term (certificate ID)
  useEffect(() => {
    const lower = searchTerm.toLowerCase();
    setFiltered(
      certificates.filter((cert) =>
        cert.certId.toLowerCase().includes(lower)
      )
    );
  }, [searchTerm, certificates]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const revokeCertificate = async (certId) => {
    if (!window.ethereum) {
      alert("MetaMask not installed");
      return;
    }

    setRevokingId(certId);
    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      let signer = await provider.getSigner();

      const network = await signer.provider.getNetwork();
      const targetChainId = 421614n; // Arbitrum Sepolia
      if (network.chainId !== targetChainId) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + targetChainId.toString(16) }],
        });
        const newProvider = new BrowserProvider(window.ethereum);
        signer = await newProvider.getSigner();
      }

      const contract = new Contract(contractAddress, contractABI, signer);
      const tx = await contract.revokeCertificate(certId);
      await tx.wait();

      setOnChainStatus(prev => ({ ...prev, [certId]: true }));
      alert("Certificate revoked successfully!");
    } catch (error) {
      console.error("Revoke error:", error);
      alert(`Revoke failed: ${error.message}`);
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) return <div className="manage-container">Loading certificates...</div>;

  return (
    <div className="manage-container">
      <h2>Issued Certificates</h2>

      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search Certificate ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="clear-btn" onClick={() => setSearchTerm("")}>
            ✕
          </button>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Cert ID</th>
            <th>Student</th>
            <th>Course</th>
            <th>Issued</th>
            <th>Tx Hash</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((cert) => {
            const isBatch = cert.proof && cert.batchId;
            const statusValue = onChainStatus[cert.certId];
            const isLoadingStatus = statusLoading[cert.certId];

            let statusText = "UNKNOWN";
            if (isBatch) {
              statusText = "BATCH";
            } else {
              if (statusValue === true) statusText = "REVOKED";
              else if (statusValue === false) statusText = "ACTIVE";
              else if (statusValue === "NOT_FOUND") statusText = "NOT ON CHAIN";
            }

            return (
              <tr key={cert.certId}>
                <td>{cert.certId}</td>
                <td>{cert.studentName || cert.studentId}</td>
                <td>{cert.course}</td>
                <td>{formatDate(cert.issuedAt)}</td>
                <td>
                  {cert.transactionHash ? (
                    <a
                      href={`https://sepolia.arbiscan.io/tx/${cert.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {cert.transactionHash.slice(0, 6)}...
                    </a>
                  ) : "—"}
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className={`status ${statusText.toLowerCase().replace(/ /g, '-')}`}>
                      {isLoadingStatus && !isBatch ? "Loading..." : statusText}
                    </span>
                    {!isBatch && !isLoadingStatus && (statusText === "UNKNOWN" || statusText === "NOT ON CHAIN") && (
                      <button
                        className="refresh-status-btn"
                        onClick={() => fetchSingleStatus(cert.certId)}
                        title="Refresh status"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "1.2rem"
                        }}
                      >
                        🔄
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {!isBatch && statusText === "ACTIVE" && (
                    <button
                      className="revoke-btn"
                      onClick={() => revokeCertificate(cert.certId)}
                      disabled={revokingId === cert.certId}
                    >
                      {revokingId === cert.certId ? "Revoking..." : "Revoke"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan="7" style={{ textAlign: "center", padding: "2rem" }}>
                No certificates found for this university.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ManageCertificates;