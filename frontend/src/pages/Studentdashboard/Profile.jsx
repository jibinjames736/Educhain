const Profile = ({ studentProfile }) => {
  if (!studentProfile) {
    return <div className="placeholder">Loading profile...</div>;
  }

  return (
    <div className="placeholder">
      <h2>Profile</h2>
      <p>
        <strong>Name:</strong> {studentProfile.name}
      </p>
      <p>
        <strong>Student ID:</strong> {studentProfile.studentId}
      </p>
      <p>
        <strong>Email:</strong> {studentProfile.email || "—"}
      </p>
      <p>
        <strong>Wallet:</strong> {studentProfile.wallet}
      </p>
    </div>
  );
};

export default Profile;