import { useState } from "react";
import "../styles/Studentdashboard.css";

const sampleCertificates = [
  {
    certName: "B.Sc Graduation",
    course: "Computer Science",
    university: "Stanford University",
    issueDate: "Oct 12, 2025",
    certId: "CERT-9982",
    ipfsCid: "QmExample1",
    status: "VALID",
  },
  {
    certName: "Python Expert",
    course: "Data Science",
    university: "MIT OpenCourse",
    issueDate: "Jan 05, 2026",
    certId: "CERT-4410",
    ipfsCid: "QmExample2",
    status: "VALID",
  },
  {
    certName: "AWS Cloud",
    course: "Amazon Web Services",
    university: "AWS Academy",
    issueDate: "Nov 20, 2025",
    certId: "CERT-1123",
    ipfsCid: "QmExample3",
    status: "REVOKED",
  },
];

// sample logged-in student (normally from Firebase)
const studentProfile = {
  name: "John Doe",
  university: "Stanford University",
  role: "Student",
};

const Studentdashboard = () => {
  const [activeTab, setActiveTab] = useState("MY_CERTIFICATES");
  const [search, setSearch] = useState("");

  const initials = studentProfile.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  const filteredCertificates = sampleCertificates.filter((c) =>
    c.certName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard">
      {/* SIDEBAR */}
      <aside className="sidebar">
        {/* PROFILE HEADER */}
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
              fontSize: "1rem",
              marginBottom: "10px",
            }}
          >
            {initials}
          </div>

          <div style={{ fontWeight: "600" }}>{studentProfile.name}</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            {studentProfile.role} • {studentProfile.university}
          </div>
        </div>

        {/* NAVIGATION */}
        <nav>
          <button
            className={activeTab === "MY_CERTIFICATES" ? "active" : ""}
            onClick={() => setActiveTab("MY_CERTIFICATES")}
          >
            My Certificates
          </button>

          <button onClick={() => setActiveTab("SHARED")}>
            Shared Certificates
          </button>

          <button onClick={() => setActiveTab("ACTIVITY")}>
            Verification Activity
          </button>

          <button onClick={() => setActiveTab("SECURITY")}>
            Wallet & Security
          </button>

          <button onClick={() => setActiveTab("PROFILE")}>
            Profile
          </button>
        </nav>

        <button className="logout-btn">Log Out</button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="content">
        {activeTab === "MY_CERTIFICATES" && (
          <>
            <input
              className="search"
              placeholder="Search certificates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <table>
              <thead>
                <tr>
                  <th>Certificate</th>
                  <th>Course</th>
                  <th>University</th>
                  <th>Issued</th>
                  <th>Cert ID</th>
                  <th>View</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredCertificates.map((cert, i) => (
                  <tr key={i}>
                    <td>{cert.certName}</td>
                    <td>{cert.course}</td>
                    <td>{cert.university}</td>
                    <td>{cert.issueDate}</td>
                    <td>{cert.certId}</td>
                    <td>
                      <button
                        className="view-btn"
                        onClick={() =>
                          window.open(
                            `https://ipfs.io/ipfs/${cert.ipfsCid}`,
                            "_blank"
                          )
                        }
                      >
                        ⬇
                      </button>
                    </td>
                    <td>
                      <span className={`status ${cert.status.toLowerCase()}`}>
                        {cert.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {activeTab !== "MY_CERTIFICATES" && (
          <div className="placeholder">
            <h2>{activeTab.replace("_", " ")}</h2>
            <p>Content will appear here.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Studentdashboard;
