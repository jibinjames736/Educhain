import "../styles/HomePage.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const HomePage = () => {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState("");
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // ✅ WORKING: Force MetaMask to show popup EVERY TIME
  const connectWalletAndRoute = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    if (isConnecting) return;
    setIsConnecting(true);

    try {
      // Clear our app data
      localStorage.removeItem("userData");
      
      // ✅ TRICK: Request permissions first to force popup
      try {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (permError) {
        // User cancelled permissions - that's okay
        console.log("Permission request cancelled or not supported");
      }
      
      // Now request accounts - THIS SHOULD SHOW POPUP
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const walletAddress = accounts[0];
      
      localStorage.setItem("wallet", walletAddress);
      setWallet(walletAddress);

      const snap = await getDoc(doc(db, "users", walletAddress));

      if (!snap.exists()) {
        navigate("/signup");
        return;
      }

      const userData = snap.data();
      localStorage.setItem("userData", JSON.stringify(userData));

      if (userData.role === "STUDENT") navigate("/studentdashboard");
      if (userData.role === "UNIVERSITY") navigate("/universitydashboard");
      
    } catch (err) {
      console.error(err);
      if (err.code === 4001) {
        alert("Wallet connection cancelled");
      } else {
        alert("Failed to connect wallet");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // ✅ Restore wallet if exists
  useEffect(() => {
    const savedWallet = localStorage.getItem("wallet");
    const userData = localStorage.getItem("userData");

    if (savedWallet && userData) {
      setWallet(savedWallet);
    }
  }, []);

  // ✅ Handle account switching
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        localStorage.removeItem("userData");
        localStorage.removeItem("wallet");
        setWallet("");
        window.location.href = "/";
      } else {
        const newAddress = accounts[0];
        const currentWallet = localStorage.getItem("wallet");
        
        if (newAddress !== currentWallet) {
          localStorage.removeItem("userData");
          localStorage.setItem("wallet", newAddress);
          setWallet(newAddress);
          
          try {
            const snap = await getDoc(doc(db, "users", newAddress));
            if (snap.exists()) {
              const userData = snap.data();
              localStorage.setItem("userData", JSON.stringify(userData));
              
              if (userData.role === "STUDENT") navigate("/studentdashboard");
              if (userData.role === "UNIVERSITY") navigate("/universitydashboard");
            } else {
              navigate("/signup");
            }
          } catch (error) {
            console.error("Error:", error);
          }
        }
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [navigate]);

  // Format wallet for display
  const formatWalletAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="page">
      {/* NAVBAR */}
      <header className="topbar">
        <div className="brand">CertVerify</div>
        <div className="top-actions">
          <button 
            className="connect-btn" 
            onClick={connectWalletAndRoute}
            disabled={isConnecting}
          >
            {isConnecting ? "Connecting..." : 
              wallet ? formatWalletAddress(wallet) : "Connect Wallet"}
          </button>
          <button className="signup-btn" onClick={() => navigate("/signup")}>
            Sign Up
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <h1>
          Immutable Trust for <br />
          Academic & Professional Credentials
        </h1>

        <p>
          Instantly verify the authenticity of certificates using decentralized
          ledger technology.
        </p>

        <div className="verify-row">
          <button
            className="verify-btn"
            onClick={() => setShowVerifyModal(true)}
          >
            Verify Certificate
          </button>
          <span className="upload-icon">↑</span>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features">
        <div className="feature-card">
          <div className="icon">🔍</div>
          <h3>Instant Verification</h3>
          <p>
            A simple drag-and-drop zone or QR code scanner verifies any
            certificate against the blockchain.
          </p>
        </div>

        <div className="feature-card">
          <div className="icon">🔒</div>
          <h3>Tamper-Proof Storage</h3>
          <p>
            Certificates are hashed and stored on a decentralized network,
            making forgery impossible.
          </p>
        </div>

        <div className="feature-card">
          <div className="icon">🔗</div>
          <h3>Easy Sharing</h3>
          <p>
            Issuers can send digital credentials directly to the user wallet for
            one-click sharing with employers.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <p>Supported Blockchains:</p>
        <div className="chains">
          <span>Ethereum</span>
        </div>
      </footer>

      {/* VERIFY MODAL */}
      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Verify Certificate</h2>
            <p>Select a verification method</p>

            <div className="modal-actions">
              <button
                className="modal-btn primary"
                onClick={() => navigate("/verify?mode=upload")}
              >
                Upload Certificate File
              </button>

              <button
                className="modal-btn secondary"
                onClick={() => navigate("/verify?mode=qr")}
              >
                Scan QR Code
              </button>
            </div>

            <button
              className="modal-close"
              onClick={() => setShowVerifyModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;