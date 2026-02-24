import { useState } from "react";
import "../../styles/ManageCertificates.css";

const issuedCertificates = [
  {
    certId: "CERT-9982",
    student: "John Carter",
    course: "B.Sc Computer Science",
    issueDate: "Oct 12, 2025",
    txHash: "0x83hd82hd82",
    status: "ACTIVE",
  },
  {
    certId: "CERT-1123",
    student: "Alice Brown",
    course: "AI Engineering",
    issueDate: "Jan 10, 2026",
    txHash: "0x73jd92jd21",
    status: "REVOKED",
  },
];

const ManageCertificates = () => {

  const [searchTerm, setSearchTerm] = useState("");

  const filteredCertificates = issuedCertificates.filter((cert) =>
    cert.certId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="manage-container">

      <h2>Issued Certificates</h2>

      {/* ===== SEARCH BAR ===== */}
      <div className="search-wrapper">
        <span className="search-icon">🔍</span>

        <input
          type="text"
          placeholder="Search Certificate ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {searchTerm && (
          <button
            className="clear-btn"
            onClick={() => setSearchTerm("")}
          >
            ✕
          </button>
        )}
      </div>

      {/* ===== TABLE ===== */}
      <table>
        <thead>
          <tr>
            <th>Cert ID</th>
            <th>Student</th>
            <th>Course</th>
            <th>Issued</th>
            <th>Tx Hash</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {filteredCertificates.map((cert, index) => (
            <tr key={index}>
              <td>{cert.certId}</td>
              <td>{cert.student}</td>
              <td>{cert.course}</td>
              <td>{cert.issueDate}</td>
              <td>{cert.txHash}</td>

              <td>
                <span className={`status ${cert.status.toLowerCase()}`}>
                  {cert.status}
                </span>
              </td>

              <td>
                {cert.status === "ACTIVE" && (
                  <button className="revoke-btn">
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>

      </table>

    </div>
  );
};

export default ManageCertificates;