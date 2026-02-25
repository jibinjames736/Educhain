import "../styles/HomePage.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { db, auth } from "../firebase";

const HomePage = () => {
  const navigate = useNavigate();

  const [wallet, setWallet] = useState("");
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const fileInputRef = useRef(null);

  /* ================= CONNECT WALLET ================= */
  const connectWalletAndRoute = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    if (isConnecting) return;
    setIsConnecting(true);

    try {
      localStorage.removeItem("userData");

      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const walletAddress = accounts[0];

      localStorage.setItem("wallet", walletAddress);
      setWallet(walletAddress);

      await signInAnonymously(auth);

      const snap = await getDoc(doc(db, "users", walletAddress));

      if (!snap.exists()) {
        navigate("/signup");
        return;
      }

      const userData = snap.data();
      localStorage.setItem("userData", JSON.stringify(userData));

      if (userData.role === "STUDENT")
        navigate("/studentdashboard");

      if (userData.role === "UNIVERSITY")
        navigate("/universitydashboard");

    } catch (err) {
      console.error(err);
      alert("Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  /* ================= RESTORE SESSION ================= */
  useEffect(() => {
    const savedWallet = localStorage.getItem("wallet");
    const userData = localStorage.getItem("userData");

    if (savedWallet && userData) {
      setWallet(savedWallet);
    }
  }, []);

  /* ================= ACCOUNT SWITCH ================= */
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        localStorage.clear();
        window.location.href = "/";
        return;
      }

      const newAddress = accounts[0];
      setWallet(newAddress);
      localStorage.setItem("wallet", newAddress);

      await signInAnonymously(auth);

      const snap = await getDoc(doc(db, "users", newAddress));

      if (snap.exists()) {
        const userData = snap.data();
        localStorage.setItem(
          "userData",
          JSON.stringify(userData)
        );

        if (userData.role === "STUDENT")
          navigate("/studentdashboard");

        if (userData.role === "UNIVERSITY")
          navigate("/universitydashboard");
      } else {
        navigate("/signup");
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () =>
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );
  }, [navigate]);

  const formatWalletAddress = (address) =>
    address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "";

  // Handle file selection and navigation
  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Navigate to verify page with the file
      navigate('/verify', { state: { file } });
      // Close the modal
      setShowVerifyModal(false);
    }
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
            {isConnecting
              ? "Connecting..."
              : wallet
              ? formatWalletAddress(wallet)
              : "Connect Wallet"}
          </button>

          <button
            className="signup-btn"
            onClick={() => navigate("/signup")}
          >
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
          Instantly verify certificate authenticity
          using blockchain technology.
        </p>

        <div className="verify-row">
          <button
            className="verify-btn"
            onClick={() => setShowVerifyModal(true)}
          >
            Verify Certificate
          </button>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features">
        <div className="feature-card">
          <div className="icon">🔍</div>
          <h3>Instant Verification</h3>
          <p>Verify certificates instantly.</p>
        </div>

        <div className="feature-card">
          <div className="icon">🔒</div>
          <h3>Tamper-Proof Storage</h3>
          <p>Secure decentralized storage.</p>
        </div>

        <div className="feature-card">
          <div className="icon">🔗</div>
          <h3>Easy Sharing</h3>
          <p>Share credentials securely.</p>
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

            <p>
              Upload your certificate to verify
              authenticity on blockchain.
            </p>

            <div className="modal-actions">
              <button
                className="upload-cert-btn"
                onClick={handleUploadClick}
              >
                Upload Certificate
              </button>
            </div>

            <button
              className="modal-close"
              onClick={() =>
                setShowVerifyModal(false)
              }
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept=".pdf,.png,.jpg,.jpeg"
      />
    </div>
  );
};

export default HomePage;