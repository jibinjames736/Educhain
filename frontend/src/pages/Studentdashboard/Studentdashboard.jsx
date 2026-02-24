import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/Studentdashboard.css";

// Import tab components from the same folder
import ViewCertificates from "./ViewCertificates";
import SharedCertificates from "./SharedCertificates";
import VerificationActivity from "./VerificationActivity";
import WalletSecurity from "./WalletSecurity";
import Profile from "./Profile";

const Studentdashboard = () => {
  const navigate = useNavigate();
  const [studentProfile, setStudentProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("certificates");

  // Session check
  useEffect(() => {
    const storedUser = localStorage.getItem("userData");
    const wallet = localStorage.getItem("wallet");

    if (!storedUser || !wallet) {
      navigate("/", { replace: true });
      return;
    }

    setStudentProfile(JSON.parse(storedUser));
  }, [navigate]);

  // Handle account switching
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0 || accounts[0] !== localStorage.getItem("wallet")) {
        localStorage.clear();
        navigate("/", { replace: true });
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [navigate]);

  const initials =
    studentProfile?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("") || "U";

  const handleLogout = () => {
    localStorage.removeItem("userData");
    localStorage.removeItem("wallet");
    navigate("/", { replace: true });
    setTimeout(() => window.location.reload(), 50);
  };

  // Render the active tab component with studentProfile as prop
  const renderTab = () => {
    if (!studentProfile) {
      return <div className="placeholder">Loading profile...</div>;
    }

    switch (activeTab) {
      case "certificates":
        return <ViewCertificates studentProfile={studentProfile} />;
      case "shared":
        return <SharedCertificates studentProfile={studentProfile} />;
      case "activity":
        return <VerificationActivity studentProfile={studentProfile} />;
      case "security":
        return <WalletSecurity studentProfile={studentProfile} />;
      case "profile":
        return <Profile studentProfile={studentProfile} />;
      default:
        return <ViewCertificates studentProfile={studentProfile} />;
    }
  };

  return (
    <div className="dashboard">
      {/* SIDEBAR */}
      <aside className="sidebar">
        {/* PROFILE */}
        <div style={{ marginBottom: "28px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "#22c55e",
              color: "#022c22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "700",
              marginBottom: "10px",
            }}
          >
            {initials}
          </div>

          <div style={{ fontWeight: "600" }}>
            {studentProfile?.name || "Student"}
          </div>
          <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            Student • {studentProfile?.universityName}
          </div>
        </div>

        {/* NAVIGATION */}
        <nav>
          <button
            className={activeTab === "certificates" ? "active" : ""}
            onClick={() => setActiveTab("certificates")}
          >
            My Certificates
          </button>

          <button
            className={activeTab === "shared" ? "active" : ""}
            onClick={() => setActiveTab("shared")}
          >
            Shared Certificates
          </button>

          <button
            className={activeTab === "activity" ? "active" : ""}
            onClick={() => setActiveTab("activity")}
          >
            Verification Activity
          </button>

          <button
            className={activeTab === "security" ? "active" : ""}
            onClick={() => setActiveTab("security")}
          >
            Wallet & Security
          </button>

          <button
            className={activeTab === "profile" ? "active" : ""}
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          Log Out
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="content">{renderTab()}</main>
    </div>
  );
};

export default Studentdashboard;