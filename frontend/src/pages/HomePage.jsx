import "../styles/HomePage.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { db, auth } from "../firebase";

const HomePage = () => {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState("");
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  /* ===============================
     CONNECT WALLET + FIREBASE LOGIN
  =============================== */
  const connectWalletAndRoute = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    if (isConnecting) return;
    setIsConnecting(true);

    try {
      localStorage.removeItem("userData");

      // ✅ Force MetaMask popup
      try {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        console.log("Permission cancelled");
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const walletAddress = accounts[0];

      localStorage.setItem("wallet", walletAddress);
      setWallet(walletAddress);

      /* ✅ Firebase Anonymous Login */
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

      if (err.code === 4001)
        alert("Wallet connection cancelled");
      else
        alert("Failed to connect wallet");

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

  return (
    <div className="page">

      {/* ================= NAVBAR ================= */}
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

      {/* ================= HERO ================= */}
      <section className="hero">
        <h1>
          Immutable Trust for <br />
          Academic & Professional Credentials
        </h1>

        <p>
          Instantly verify the authenticity of certificates
          using decentralized ledger technology.
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

      {/* ================= FEATURES RESTORED ================= */}
      <section className="features">
        <div className="feature-card">
          <div className="icon">🔍</div>
          <h3>Instant Verification</h3>
          <p>
            Verify certificates instantly against blockchain.
          </p>
        </div>

        <div className="feature-card">
          <div className="icon">🔒</div>
          <h3>Tamper-Proof Storage</h3>
          <p>
            Certificates stored securely on decentralized networks.
          </p>
        </div>

        <div className="feature-card">
          <div className="icon">🔗</div>
          <h3>Easy Sharing</h3>
          <p>
            Share credentials directly with employers.
          </p>
        </div>
      </section>

      {/* ================= FOOTER RESTORED ================= */}
      <footer className="footer">
        <p>Supported Blockchains:</p>
        <div className="chains">
          <span>Ethereum</span>
        </div>
      </footer>

      {/* ================= VERIFY MODAL ================= */}
      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Verify Certificate</h2>

            <div className="modal-actions">
              <button
                onClick={() =>
                  navigate("/verify?mode=upload")
                }
              >
                Upload Certificate File
              </button>

              <button
                onClick={() =>
                  navigate("/verify?mode=qr")
                }
              >
                Scan QR Code
              </button>
            </div>

            <button
              onClick={() =>
                setShowVerifyModal(false)
              }
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