import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import api from '../api';

const STATUS_LABELS = {
  applied: 'Applied',
  reviewing: 'Under review',
  shortlisted: 'Shortlisted',
  rejected: 'Not selected',
  hired: 'Hired',
};

export default function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/applications')
      .then(({ data }) => setApplications(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load applications'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="topbar">
        <h2>My applications</h2>
        <Link to="/careers">Browse jobs</Link>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p>Loading applications…</p> : applications.length === 0 ? (
          <p>You haven’t applied to any jobs yet. <Link to="/careers">Explore open jobs</Link>.</p>
        ) : (
          <table>
            <thead><tr><th>Position</th><th>Employer</th><th>Status</th><th>Applied</th></tr></thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application._id}>
                  <td>{application.jobId?.title || 'Job no longer available'}</td>
                  <td>{application.jobId?.companyId?.name || '—'}</td>
                  <td>{STATUS_LABELS[application.status] || application.status}</td>
                  <td>{new Date(application.appliedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
