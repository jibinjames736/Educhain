import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase'; // Adjust import path as needed
import '../../styles/Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const [university, setUniversity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUniversityData = async () => {
      try {
        setLoading(true);
        
        // Get wallet from localStorage (set during login in HomePage)
        const wallet = localStorage.getItem('wallet');
        if (!wallet) {
          setError('No wallet connected. Please login again.');
          setLoading(false);
          return;
        }

        // Fetch user document from "users" collection using wallet address as document ID
        const userDocRef = doc(db, 'users', wallet);
        const userSnap = await getDoc(userDocRef);

        if (!userSnap.exists()) {
          setError('University profile not found');
          setLoading(false);
          return;
        }

        const data = userSnap.data();

        // Ensure the user has the UNIVERSITY role
        if (data.role !== 'UNIVERSITY') {
          setError('Access denied: Not a university account');
          setLoading(false);
          return;
        }

        // Format Firestore timestamp
        const formattedData = {
          ...data,
          createdAt: data.createdAt?.toDate().toLocaleString() || 'N/A',
        };

        setUniversity(formattedData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching university data:', err);
        setError('Failed to load profile');
        setLoading(false);
      }
    };

    fetchUniversityData();
  }, []);

  // Optional: redirect if not authenticated
  if (error && error.includes('login')) {
    // Could redirect to home after a delay
    setTimeout(() => navigate('/'), 3000);
  }

  if (loading) {
    return (
      <div className="placeholder">
        <h2>University Profile</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="placeholder">
        <h2>University Profile</h2>
        <p className="error">{error}</p>
        {error.includes('login') && <p>Redirecting to home...</p>}
      </div>
    );
  }

  if (!university) {
    return (
      <div className="placeholder">
        <h2>University Profile</h2>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="placeholder">
      <h2>University Profile</h2>
      <div className="profile-details">
        <p><strong>University Name:</strong> {university.universityName}</p>
        <p><strong>Registration ID:</strong> {university.registrationId}</p>
        <p><strong>Email:</strong> {university.email}</p>
        <p><strong>Wallet Address:</strong> {university.wallet}</p>
      </div>
    </div>
  );
};

export default Profile;