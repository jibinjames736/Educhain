import { useState, useEffect } from "react";
import "../styles/SignupPage.css";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";

const SignupPage = () => {
  const [role, setRole] = useState("STUDENT");
  const [walletAddress, setWalletAddress] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    universityName: "",
    registrationId: "",
    email: "",
  });

  // ✅ WORKING: Connect wallet with guaranteed popup
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not found");
      return;
    }

    if (isConnecting) return;
    setIsConnecting(true);

    try {
      // Clear any stored wallet
      localStorage.removeItem("wallet");
      
      // ✅ TRICK: Request permissions first
      try {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (permError) {
        // User cancelled - that's okay
      }
      
      // Now request accounts - will show popup
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const newAddress = accounts[0];
      setWalletAddress(newAddress);
      localStorage.setItem("wallet", newAddress);
      
    } catch (err) {
      console.error("Wallet connection error:", err);
      
      if (err.code === 4001) {
        alert("Wallet connection cancelled");
      } else {
        alert("Failed to connect wallet. Please try again.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Check for existing wallet
  useEffect(() => {
    const savedWallet = localStorage.getItem("wallet");
    if (savedWallet) {
      setWalletAddress(savedWallet);
    }
  }, []);

  // Handle form input
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Submit signup
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!walletAddress) {
      alert("Please connect wallet first");
      return;
    }

    const userRef = doc(db, "users", walletAddress);
    const existingUser = await getDoc(userRef);

    if (existingUser.exists()) {
      alert("Wallet already registered. Redirecting...");
      
      const userData = existingUser.data();
      localStorage.setItem("userData", JSON.stringify(userData));
      
      if (userData.role === "STUDENT") navigate("/studentdashboard");
      if (userData.role === "UNIVERSITY") navigate("/universitydashboard");
      return;
    }

    const payload = {
      wallet: walletAddress,
      role,
      email: formData.email || "",
      approved: role === "STUDENT",
      createdAt: new Date(),
    };

    if (role === "STUDENT") {
      payload.name = formData.name;
      payload.studentId = formData.studentId;
    }

    if (role === "UNIVERSITY") {
      payload.universityName = formData.universityName;
      payload.registrationId = formData.registrationId;
    }

    await setDoc(userRef, payload);

    alert("Signup successful!");

    // Store user data
    localStorage.setItem("userData", JSON.stringify(payload));

    if (role === "STUDENT") navigate("/studentdashboard");
    else navigate("/");
  };

  // Format wallet address
  const formatWalletAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <h2>Sign Up</h2>

        {/* Role Selection */}
        <div className="role-toggle">
          <button
            className={role === "STUDENT" ? "active" : ""}
            type="button"
            onClick={() => setRole("STUDENT")}
          >
            Student
          </button>
          <button
            className={role === "UNIVERSITY" ? "active" : ""}
            type="button"
            onClick={() => setRole("UNIVERSITY")}
          >
            University
          </button>
        </div>

        {/* Wallet */}
        <input
          type="text"
          placeholder="Wallet address"
          value={walletAddress}
          readOnly
        />

        <button
          type="button"
          className="primary-btn"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : 
            walletAddress ? formatWalletAddress(walletAddress) : "Connect Wallet"}
        </button>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {role === "STUDENT" && (
            <>
              <input
                type="text"
                name="name"
                placeholder="Student Name"
                onChange={handleChange}
                required
                disabled={!walletAddress}
              />
              <input
                type="text"
                name="studentId"
                placeholder="Student ID / Roll No"
                onChange={handleChange}
                required
                disabled={!walletAddress}
              />
            </>
          )}

          {role === "UNIVERSITY" && (
            <>
              <input
                type="text"
                name="universityName"
                placeholder="University Name"
                onChange={handleChange}
                required
                disabled={!walletAddress}
              />
              <input
                type="text"
                name="registrationId"
                placeholder="Registration / Accreditation ID"
                onChange={handleChange}
                required
                disabled={!walletAddress}
              />
            </>
          )}

          <input
            type="email"
            name="email"
            placeholder="Email (optional)"
            onChange={handleChange}
            disabled={!walletAddress}
          />

          <button 
            type="submit" 
            className="primary-btn"
            disabled={!walletAddress || isConnecting}
          >
            Submit
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignupPage;