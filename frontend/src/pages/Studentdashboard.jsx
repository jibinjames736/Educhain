const Studentdashboard = () => {
  const wallet = localStorage.getItem("wallet");
  const userData = JSON.parse(localStorage.getItem("userData"));

  if (!userData) {
    return <p style={{ color: "white" }}>No student data found</p>;
  }

  return (
    <div style={{ padding: "30px", color: "white" }}>
      <h1>🎓 Student Dashboard</h1>

      <p><strong>Name:</strong> {userData.name}</p>
      <p><strong>Student ID:</strong> {userData.studentId}</p>
      <p><strong>Email:</strong> {userData.email}</p>
      <p><strong>Wallet:</strong> {wallet}</p>

      <hr />

      <h3>My Certificates</h3>
      <p>No certificates issued yet.</p>
    </div>
  );
};

export default Studentdashboard;
