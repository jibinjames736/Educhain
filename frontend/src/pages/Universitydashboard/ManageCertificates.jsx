import { useState, useEffect } from "react";
import "../../styles/ManageCertificates.css";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore"; // no where clause
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
  const [issuerAddress, setIssuerAddress] = useState(null);

  // RPC URL from environment or fallback
  const rpcUrl = import.meta.env.VITE_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

  // Determine the issuer address (keep original case – used for filtering)
  useEffect(() => {
    const getIssuer = async () => {
      let address = null;
      if (university?.wallet) {
        address = university.wallet;
      } else {
        const storedWallet = localStorage.getItem("universityWallet");
        if (storedWallet) address = storedWallet;
      }
      if (address) {
        setIssuerAddress(address);
        return;
      }
      // Fallback: get from MetaMask
      if (window.ethereum) {
        try {
          const provider = new BrowserProvider(window.ethereum);
          await provider.send("eth_requestAccounts", []);
          const signer = await provider.getSigner();
          const addr = await signer.getAddress();
          setIssuerAddress(addr);
        } catch (error) {
          console.error("Failed to get address from MetaMask:", error);
        }
      }
    };
    getIssuer();
  }, [university]);

  console.log("🔍 Issuer address (original case):", issuerAddress);

  // Fetch ALL certificates from Firestore (no issuer filter)
  useEffect(() => {
    const fetchAllCertificates = async () => {
      setLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, "certificates"));
        const allCerts = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log(`📄 Total certificates in Firestore: ${allCerts.length}`);

        // Filter client‑side by issuer (case‑insensitive)
        const issuerLower = issuerAddress?.toLowerCase();
        const certs = issuerLower
          ? allCerts.filter(cert => cert.issuer?.toLowerCase() === issuerLower)
          : [];
        console.log(`📄 After filtering by issuer: ${certs.length} certificates`);

        setCertificates(certs);
        setFiltered(certs);
      } catch (error) {
        console.error("❌ Error fetching certificates:", error);
      } finally {
        setLoading(false);
      }
    };

    if (issuerAddress) {
      fetchAllCertificates();
    } else {
      setLoading(false);
    }
  }, [issuerAddress]);

  // Function to fetch on‑chain revocation status for a single certificate
  const fetchSingleStatus = async (certId) => {
    setStatusLoading(prev => ({ ...prev, [certId]: true }));
    try {
      console.log(`🔍 Fetching on‑chain status for certId: "${certId}"`);

      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
      console.log("Contract address:", contractAddress);

      if (!isAddress(contractAddress)) {
        throw new Error(`Invalid contract address: ${contractAddress}`);
      }

      const provider = new JsonRpcProvider(rpcUrl);
      const contract = new Contract(contractAddress, contractABI, provider);

      const certData = await contract.getCertificate(certId);
      console.log(`✅ Raw data for ${certId}:`, certData);

      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const exists = certData.issuer.toLowerCase() !== zeroAddress;

      if (!exists) {
        console.warn(`⚠️ Certificate ${certId} does not exist on‑chain.`);
        setOnChainStatus(prev => ({ ...prev, [certId]: "NOT_FOUND" }));
      } else {
        console.log(`✅ Status for ${certId}: revoked = ${certData.revoked}`);
        setOnChainStatus(prev => ({ ...prev, [certId]: certData.revoked }));
      }
    } catch (err) {
      console.error(`❌ Failed to fetch status for ${certId}:`, {
        message: err.message,
        code: err.code,
        reason: err.reason,
        data: err.data,
      });
      setOnChainStatus(prev => ({ ...prev, [certId]: null }));
    } finally {
      setStatusLoading(prev => ({ ...prev, [certId]: false }));
    }
  };

  // Fetch status for all certificates when certificates are loaded
  useEffect(() => {
    if (certificates.length === 0) return;
    console.log("📌 Fetching on‑chain status for all certificates...");
    certificates.forEach(cert => {
      fetchSingleStatus(cert.certId);
    });
  }, [certificates]);

  // Filter by search term
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

      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
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
            const statusValue = onChainStatus[cert.certId];
            const isLoadingStatus = statusLoading[cert.certId];
            let statusText = "UNKNOWN";
            if (statusValue === true) statusText = "REVOKED";
            else if (statusValue === false) statusText = "ACTIVE";
            else if (statusValue === "NOT_FOUND") statusText = "NOT ON CHAIN";

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
                      {isLoadingStatus ? "Loading..." : statusText}
                    </span>
                    {!isLoadingStatus && (statusText === "UNKNOWN" || statusText === "NOT ON CHAIN") && (
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
                  {statusText === "ACTIVE" && (
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
                No certificates found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ManageCertificates;