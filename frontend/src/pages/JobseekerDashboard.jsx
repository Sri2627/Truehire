import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Layout from '../components/Layout.jsx';
import api from '../api';

const STATUS_LABELS = {
  applied: 'Applied',
  reviewing: 'Under review',
  shortlisted: 'Shortlisted',
  rejected: 'Not selected',
  hired: 'Hired',
};

export default function JobseekerDashboard() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/applications')
      .then(({ data }) => setApplications(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.response?.data?.error || 'Could not load your dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const countStatus = (status) => applications.filter((application) => application.status === status).length;
  const recentApplications = applications.slice(0, 5);

  return (
    <Layout>
      <div className="topbar">
        <h2>Dashboard</h2>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Hi, {user?.name}</span>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="stat-row jobseeker-stat-row">
        <div className="stat">
          <div className="n">{loading ? '—' : applications.length}</div>
          <div className="label">Applications</div>
        </div>
        <div className="stat">
          <div className="n warning">{loading ? '—' : countStatus('reviewing')}</div>
          <div className="label">Under review</div>
        </div>
        <div className="stat">
          <div className="n success">{loading ? '—' : countStatus('shortlisted')}</div>
          <div className="label">Shortlisted</div>
        </div>
        <div className="stat">
          <div className="n">{loading ? '—' : countStatus('hired')}</div>
          <div className="label">Offers</div>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card jobseeker-summary-card">
          <h3>Application summary</h3>
          {loading ? (
            <p className="sub">Loading your applications…</p>
          ) : applications.length === 0 ? (
            <>
              <p className="sub">You haven’t applied to any jobs yet. Explore opportunities that match your experience.</p>
              <Link className="btn-primary jobseeker-action" to="/careers">Browse open jobs</Link>
              <Link className="jobseeker-secondary-action" to="/resume-builder">Build your resume</Link>
            </>
          ) : (
            <>
              <p className="sub">
                You have submitted {applications.length} application{applications.length === 1 ? '' : 's'}.
                Check each one for the latest status from the employer.
              </p>
              <Link className="btn-primary jobseeker-action" to="/careers">Find more jobs</Link>
              <Link className="jobseeker-secondary-action" to="/resume-builder">Create or improve your resume</Link>
            </>
          )}
        </section>

        <section className="card">
          <div className="jobseeker-card-heading">
            <h3>Recent applications</h3>
            <Link to="/my-applications">View all</Link>
          </div>
          {loading ? (
            <p className="sub">Loading…</p>
          ) : recentApplications.length === 0 ? (
            <p className="sub">Your submitted applications will appear here.</p>
          ) : (
            recentApplications.map((application) => (
              <div className="activity-item" key={application._id}>
                <span className="name">{application.jobId?.title || 'Job no longer available'}</span>
                <span className="detail">
                  {application.jobId?.companyId?.name || 'Employer'} · {STATUS_LABELS[application.status] || application.status}
                </span>
                <span className="time">
                  Applied {application.appliedAt ? new Date(application.appliedAt).toLocaleDateString() : 'recently'}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </Layout>
  );
}
