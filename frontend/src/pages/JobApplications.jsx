import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ResumePreviewButton from '../components/ResumePreviewButton.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

const STATUSES = ['applied', 'reviewing', 'shortlisted', 'rejected', 'hired'];

export default function JobApplications() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function loadApplications() {
    setLoading(true);
    api.get(`/jobs/${id}/applications`)
      .then(({ data }) => {
        setJob(data.job);
        setApplications(data.applications || []);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load job applications'))
      .finally(() => setLoading(false));
  }

  useEffect(loadApplications, [id]);

  async function updateStatus(applicationId, status) {
    setError('');
    try {
      const { data } = await api.patch(`/jobs/${id}/applications/${applicationId}/status`, { status });
      setApplications((current) => current.map((application) => application._id === data._id
        ? { ...application, ...data, candidateId: application.candidateId }
        : application));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update application status');
    }
  }

  const canManage = hasRole('admin', 'recruiter');

  return (
    <Layout>
      <div className="topbar">
        <div>
          <h2>Applications{job ? ` · ${job.title}` : ''}</h2>
          <Link to={`/jobs/${id}`}>← Back to job</Link>
        </div>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="card">
        {loading ? <p>Loading applications…</p> : applications.length === 0 ? (
          <p>No applications have been submitted for this job yet.</p>
        ) : (
          <table>
            <thead><tr><th>Applicant</th><th>Email</th><th>Applied</th><th>Status</th><th>Resume</th></tr></thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application._id}>
                  <td>{application.applicantId?.name || application.candidateId?.name || 'Applicant'}</td>
                  <td>{application.applicantId?.email || application.candidateId?.email || '—'}</td>
                  <td>{new Date(application.appliedAt).toLocaleDateString()}</td>
                  <td>
                    {canManage ? (
                      <select value={application.status} onChange={(event) => updateStatus(application._id, event.target.value)}>
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : application.status}
                  </td>
                  <td>
                    {application.candidateId?.resumeFileKey
                      ? <ResumePreviewButton candidateId={application.candidateId._id} candidateName={application.candidateId.name} />
                      : 'Unavailable'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
