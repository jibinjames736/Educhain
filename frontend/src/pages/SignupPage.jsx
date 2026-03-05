import { useState, useEffect } from "react";
import "../styles/SignupPage.css";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const SignupPage = () => {
  const navigate = useNavigate();

  const [role, setRole] = useState("STUDENT");
  const [walletAddress, setWalletAddress] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    universityId: "",
    universityName: "",
    registrationId: "",
    email: "",
  });

  /* SHORTEN WALLET */

  const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /* EMAIL VALIDATION */

  const isValidEmail = (email) => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  /* CONNECT WALLET */

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not found");
      return;
    }

    if (isConnecting) return;

    setIsConnecting(true);

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const address = accounts[0];

      setWalletAddress(address);
      localStorage.setItem("wallet", address);

    } catch (err) {
      console.error(err);
      alert("Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  /* WALLET LISTENER */

  useEffect(() => {
    const savedWallet = localStorage.getItem("wallet");
    if (savedWallet) setWalletAddress(savedWallet);

    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setWalletAddress("");
        localStorage.removeItem("wallet");
        return;
      }

      const addr = accounts[0];
      setWalletAddress(addr);
      localStorage.setItem("wallet", addr);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );
    };
  }, []);

  /* FORM CHANGE */

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  /* SIGNUP */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!walletAddress) {
      alert("Connect wallet first");
      return;
    }

    if (!isValidEmail(formData.email)) {
      alert("Invalid email format");
      return;
    }

    try {
      await signInAnonymously(auth);

      const usersRef = collection(db, "users");

      const walletRef = doc(db, "users", walletAddress);
      const walletSnap = await getDoc(walletRef);

      if (walletSnap.exists()) {
        const existingUser = walletSnap.data();

        alert(`Wallet already registered as ${existingUser.role}`);

        localStorage.setItem(
          "userData",
          JSON.stringify(existingUser)
        );

        if (existingUser.role === "STUDENT")
          navigate("/studentdashboard");
        else
          navigate("/universitydashboard");

        return;
      }

      /* EMAIL UNIQUE */

      if (formData.email) {
        const emailQuery = query(
          usersRef,
          where("email", "==", formData.email)
        );

        const emailSnap = await getDocs(emailQuery);

        if (!emailSnap.empty) {
          alert("Email already registered");
          return;
        }
      }

      /* STUDENT ID UNIQUE */

      if (role === "STUDENT") {
        const studentQuery = query(
          usersRef,
          where("studentId", "==", formData.studentId)
        );

        const studentSnap = await getDocs(studentQuery);

        if (!studentSnap.empty) {
          alert("Student ID already exists");
          return;
        }
      }

      /* UNIVERSITY REGISTRATION UNIQUE */

      if (role === "UNIVERSITY") {
        const regQuery = query(
          usersRef,
          where("registrationId", "==", formData.registrationId)
        );

        const regSnap = await getDocs(regQuery);

        if (!regSnap.empty) {
          alert("Accreditation ID already registered");
          return;
        }
      }

      /* CREATE USER PAYLOAD */

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
        payload.universityId = formData.universityId;
      }

      if (role === "UNIVERSITY") {
        payload.universityName = formData.universityName;
        payload.registrationId = formData.registrationId;
      }

      await setDoc(walletRef, payload);

      localStorage.setItem(
        "userData",
        JSON.stringify(payload)
      );

      alert("Signup successful!");

      if (role === "STUDENT")
        navigate("/studentdashboard");
      else
        navigate("/universitydashboard");

    } catch (err) {
      console.error("Signup Error:", err);
      alert(err.message);
    }
  };

  return (
    <div className="signup-page">

      <div className="signup-container">

        <h2 className="signup-title">
          Welcome to CertVerify
        </h2>

        <p className="signup-subtitle">
          Register to issue and verify blockchain credentials
        </p>

        {/* ROLE SWITCH */}

        <div className="role-toggle">

          <button
            type="button"
            className={role === "STUDENT" ? "active" : ""}
            onClick={() => setRole("STUDENT")}
          >
            Student
          </button>

          <button
            type="button"
            className={role === "UNIVERSITY" ? "active" : ""}
            onClick={() => setRole("UNIVERSITY")}
          >
            University
          </button>

        </div>

        {/* WALLET */}

        <div className="wallet-section">

          <input
            value={walletAddress ? shortenAddress(walletAddress) : ""}
            readOnly
            placeholder="Wallet Address"
            className="wallet-input"
          />

          <button
            type="button"
            className="wallet-btn"
            onClick={connectWallet}
          >
            Connect Wallet
          </button>

        </div>

        {/* FORM */}

        <form className="signup-form" onSubmit={handleSubmit}>

          {role === "STUDENT" && (
            <>
              <input
                name="name"
                placeholder="Student Name"
                required
                onChange={handleChange}
              />

              <input
                name="studentId"
                placeholder="Student ID"
                required
                onChange={handleChange}
              />

              <input
                name="universityId"
                placeholder="University ID"
                required
                onChange={handleChange}
              />
            </>
          )}

          {role === "UNIVERSITY" && (
            <>
              <input
                name="universityName"
                placeholder="University Name"
                required
                onChange={handleChange}
              />

              <input
                name="registrationId"
                placeholder="Accreditation ID"
                required
                onChange={handleChange}
              />
            </>
          )}

          <input
            name="email"
            type="email"
            placeholder="Email Address"
            onChange={handleChange}
          />

          <button type="submit" className="signup-submit-btn">
            Sign Up
          </button>

        </form>

      </div>

    </div>
  );
};

export default SignupPage;