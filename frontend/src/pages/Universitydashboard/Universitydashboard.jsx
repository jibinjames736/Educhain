import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/Universitydashboard.css";

import Overview from "./Overview";
import BatchIssuance from "./BatchIssuance";
import IssueCertificate from "./IssueCertificate";
import ManageCertificates from "./ManageCertificates";
import Profile from "./Profile";

const Universitydashboard = () => {

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("OVERVIEW");
  const [profile, setProfile] = useState(null);

  /* SESSION CHECK  */
  useEffect(() => {

    const storedUser = localStorage.getItem("userData");
    const wallet = localStorage.getItem("wallet");

    if (!storedUser || !wallet) {
      navigate("/", { replace: true });
      return;
    }

    setProfile(JSON.parse(storedUser));

  }, [navigate]);

  /* LOGOUT */
  const handleLogout = () => {
    localStorage.clear();
    navigate("/", { replace: true });
  };

  /*  TAB BUTTON STYLE */
  const isActive = (tab) =>
    activeTab === tab ? "active" : "";

  return (
    <div className="dashboard">

      {/* SIDEBAR */}
      <aside className="sidebar">

        {/* UNIVERSITY NAME */}
        <div style={{ marginBottom: "25px" }}>
          <div className="avatar">
            {profile?.universityName?.[0] || "U"}
          </div>

          <div style={{ fontWeight: 600 }}>
            {profile?.universityName || "University"}
          </div>
        </div>

        <nav>

          <button
            className={isActive("OVERVIEW")}
            onClick={() => setActiveTab("OVERVIEW")}
          >
            Overview
          </button>

          <button
            className={isActive("ISSUE")}
            onClick={() => setActiveTab("ISSUE")}
          >
            Issue Certificate
          </button>
          
          <button
            className={isActive("BATCHISSUANCE")}
            onClick={() => setActiveTab("BATCHISSUANCE")}
          >
            Batch Issuance
          </button>

          <button
            className={isActive("MANAGE")}
            onClick={() => setActiveTab("MANAGE")}
          >
            Manage Certificates
          </button>

          <button
            className={isActive("PROFILE")}
            onClick={() => setActiveTab("PROFILE")}
          >
            Profile
          </button>

        </nav>

        <button
          className="logout-btn"
          onClick={handleLogout}
        >
          Logout
        </button>

      </aside>

      {/* MAIN CONTENT  */}
      <main className="content">

        {activeTab === "OVERVIEW" && <Overview />}

        {activeTab === "ISSUE" && profile && (
          <IssueCertificate university={profile} />
        )}

        

       {activeTab === "BATCHISSUANCE" && profile && (
         <BatchIssuance university={profile} />
        )}

        {activeTab === "PROFILE" && profile && (
          <Profile university={profile} />
        )}

      </main>

    </div>
  );
};

export default Universitydashboard;