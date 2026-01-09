import "../styles/HomePage.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const HomePage = () => {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState("");

  const connectWalletAndRoute = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const walletAddress = accounts[0];
    setWallet(walletAddress);
    localStorage.setItem("wallet", walletAddress);

    const snap = await getDoc(doc(db, "users", walletAddress));

    if (!snap.exists()) {
      navigate("/signup");
      return;
    }

    const userData = snap.data();
    localStorage.setItem("userData", JSON.stringify(userData));

    if (userData.role === "STUDENT") navigate("/studentdashboard");
    if (userData.role === "UNIVERSITY") navigate("/universitydashboard");
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((acc) => {
        if (acc.length) setWallet(acc[0]);
      });
    }
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
          <button className="verify-btn" onClick={() => navigate("/verify")}>
            Verify Certificate
          </button>
          <span className="upload-icon">↑</span>
        </div>

        <p className="hint">
          Drag & Drop or Upload your certificate file
        </p>
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
          <span>Polygon</span>
          <span>Solana</span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
