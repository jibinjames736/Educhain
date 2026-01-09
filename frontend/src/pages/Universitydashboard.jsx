import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Universitydashboard = () => {
  const navigate = useNavigate();
  const [university, setUniversity] = useState(null);

  useEffect(() => {
    const wallet = localStorage.getItem("wallet");
    const userDataRaw = localStorage.getItem("userData");

    if (!wallet || !userDataRaw) {
      // Not logged in or data missing
      navigate("/login");
      return;
    }

    const userData = JSON.parse(userDataRaw);

    // Safety check: role must be UNIVERSITY
    if (userData.role !== "UNIVERSITY") {
      navigate("/");
      return;
    }

    setUniversity({ ...userData, wallet });
  }, [navigate]);

  if (!university) {
    return (
      <p style={{ color: "white", padding: "30px" }}>
        Loading university dashboard...
      </p>
    );
  }

  return (
    <div style={styles.container}>
      <h1>🏫 University Dashboard</h1>

      <div style={styles.card}>
        <p><strong>University Name:</strong> {university.universityName}</p>
        <p><strong>Registration ID:</strong> {university.registrationId}</p>
        <p><strong>Email:</strong> {university.email || "—"}</p>
        <p><strong>Wallet:</strong> {university.wallet}</p>
        <p>
          <strong>Status:</strong>{" "}
          {university.approved ? (
            <span style={{ color: "#22c55e" }}>Approved</span>
          ) : (
            <span style={{ color: "#f59e0b" }}>Pending Approval</span>
          )}
        </p>
      </div>

      <hr style={{ margin: "30px 0", opacity: 0.2 }} />

      {university.approved ? (
        <div style={styles.actions}>
          <button style={styles.primaryBtn}>
            Issue Certificate
          </button>
          <button style={styles.secondaryBtn}>
            View Issued Certificates
          </button>
        </div>
      ) : (
        <p style={{ color: "#f59e0b" }}>
          You cannot issue certificates until your account is approved by the
          admin.
        </p>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: "30px",
    color: "white",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "20px",
    maxWidth: "520px",
  },
  actions: {
    display: "flex",
    gap: "12px",
  },
  primaryBtn: {
    padding: "10px 18px",
    borderRadius: "8px",
    border: "none",
    background: "#3b82f6",
    color: "white",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 18px",
    borderRadius: "8px",
    border: "1px solid #3b82f6",
    background: "transparent",
    color: "#3b82f6",
    cursor: "pointer",
  },
};

export default Universitydashboard;
