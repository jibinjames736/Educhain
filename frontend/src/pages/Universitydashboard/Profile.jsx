import "../../styles/Profile.css";

const Profile = ({ university }) => (
  <div className="placeholder">
    <h2>University Profile</h2>
    <p>{university?.universityName}</p>
  </div>
);

export default Profile;