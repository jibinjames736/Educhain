import { useState } from "react";
import "../styles/SignupPage.css";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";

const SignupPage = () => {
  const [role, setRole] = useState("STUDENT");
  const [walletAddress, setWalletAddress] = useState("");
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    universityName: "",
    registrationId: "",
    email: "",
  });

  // 🔹 Connect MetaMask
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not found");
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    setWalletAddress(accounts[0]);
  };

  // 🔹 Handle form input
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 🔹 Submit signup data to Firestore
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!walletAddress) {
      alert("Please connect wallet first");
      return;
    }

    const userRef = doc(db, "users", walletAddress);
    const existingUser = await getDoc(userRef);

    if (existingUser.exists()) {
      alert("Wallet already registered. Please login.");
      navigate("/login");
      return;
    }

    const payload = {
      wallet: walletAddress,
      role,
      email: formData.email || "",
      approved: role === "STUDENT", // universities need approval
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

    // Redirect after signup
    if (role === "STUDENT") navigate("/student/dashboard");
    else navigate("/login");
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
        >
          {walletAddress ? "Wallet Connected" : "Connect Wallet"}
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
              />
              <input
                type="text"
                name="studentId"
                placeholder="Student ID / Roll No"
                onChange={handleChange}
                required
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
              />
              <input
                type="text"
                name="registrationId"
                placeholder="Registration / Accreditation ID"
                onChange={handleChange}
                required
              />
            </>
          )}

          <input
            type="email"
            name="email"
            placeholder="Email (optional)"
            onChange={handleChange}
          />

          <button type="submit" className="primary-btn">
            Submit
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignupPage;
