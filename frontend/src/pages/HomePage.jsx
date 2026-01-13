import "../styles/HomePage.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const HomePage = () => {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState("");
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // ✅ CONNECT / RECONNECT WALLET
  const connectWalletAndRoute = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    try {
      // Always triggers MetaMask popup
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const walletAddress = accounts[0];

      // Reset app session before reconnect
      localStorage.removeItem("userData");
      localStorage.setItem("wallet", walletAddress);
      setWallet(walletAddress);

      // Fetch user from Firestore
      const snap = await getDoc(doc(db, "users", walletAddress));

      if (!snap.exists()) {
        navigate("/signup");
        return;
      }

      const userData = snap.data();
      localStorage.setItem("userData", JSON.stringify(userData));

      // Role-based routing
      if (userData.role === "STUDENT") navigate("/studentdashboard");
      if (userData.role === "UNIVERSITY") navigate("/universitydashboard");
    } catch (err) {
      console.error(err);
      alert("Wallet connection cancelled");
    }
  };

  // ✅ Restore wallet ONLY if app session exists
  useEffect(() => {
    const savedWallet = localStorage.getItem("wallet");
    const userData = localStorage.getItem("userData");

    if (savedWallet && userData) {
      setWallet(savedWallet);
    }
  }, []);

  // ✅ Detect MetaMask account change (CRITICAL)
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = () => {
      // Clear app session
      localStorage.clear();
      setWallet("");

      alert("Wallet account changed. Please reconnect.");
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );
    };
  }, []);

  return (
    <div className="page">
      {/* NAVBAR */}
      <header className="topbar">
        <div className="brand">CertVerify</div>
        <div className="top-actions">
          <button className="connect-btn" onClick={connectWalletAndRoute}>
            {wallet
              ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
              : "Connect Wallet"}
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

      {/* ✅ FEATURES — UNCHANGED */}
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
