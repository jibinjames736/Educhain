import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import '../../styles/Overview.css';

const Overview = () => {
  const [certificateCount, setCertificateCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCertificateCount = async () => {
      try {
        const userDataString = localStorage.getItem('userData');
        if (!userDataString) {
          setError('User not logged in');
          setLoading(false);
          return;
        }

        const userData = JSON.parse(userDataString);
        console.log('User data:', userData);

        if (userData.role !== 'UNIVERSITY') {
          setError('Access denied: Not a university account');
          setLoading(false);
          return;
        }

        const registrationId = userData.registrationId;
        if (!registrationId) {
          setError('University registration ID not found');
          setLoading(false);
          return;
        }

        console.log('Using registrationId:', registrationId);

        const certificatesRef = collection(db, 'certificates');
        // Query by registrationId (field name must match exactly)
        const q = query(certificatesRef, where('registrationId', '==', registrationId));
        const querySnapshot = await getDocs(q);

        console.log(`Found ${querySnapshot.size} certificates with registrationId = ${registrationId}`);
        setCertificateCount(querySnapshot.size);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching certificate count:', err);
        setError('Failed to load certificate count');
        setLoading(false);
      }
    };

    fetchCertificateCount();
  }, []);

  if (loading) {
    return (
      <div className="placeholder">
        <h2>Dashboard Overview</h2>
        <p>Loading certificate count...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="placeholder">
        <h2>Dashboard Overview</h2>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="placeholder">
      <h2>Dashboard Overview</h2>
      <p>
        Total Certificates Issued:{' '}
        {certificateCount !== null ? certificateCount : 'N/A'}
      </p>
    </div>
  );
};

export default Overview;