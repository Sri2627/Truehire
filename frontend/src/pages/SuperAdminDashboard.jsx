import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import api from '../api';

function formatINR(amount) {
  if (amount == null) return '—';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/institutions/overview')
      .then((res) => setOverview(res.data))
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="topbar">
        <h2>Platform dashboard</h2>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Superadmin</span>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="n">{loading ? '—' : overview?.totalInstitutions ?? 0}</div>
          <div className="label">Institutions</div>
        </div>
        <div className="stat">
          <div className="n">{loading ? '—' : overview?.totalUsers ?? 0}</div>
          <div className="label">Total users</div>
        </div>
        <div className="stat">
          <div className="n">{loading ? '—' : overview?.totalJobs ?? 0}</div>
          <div className="label">Jobs posted</div>
        </div>
        <div className="stat">
          <div className="n">{loading ? '—' : overview?.totalCandidates ?? 0}</div>
          <div className="label">Candidates</div>
        </div>
        <div className="stat">
          <div className="n danger">{loading ? '—' : overview?.totalFraudCount ?? 0}</div>
          <div className="label">Fraud watch-list entries</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Recently added institutions</h3>
            <button
              type="button"
              onClick={() => navigate('/institutions')}
              style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              View all →
            </button>
          </div>
          {loading ? (
            <p>Loading…</p>
          ) : overview?.recentInstitutions?.length ? (
            <table>
              <thead>
                <tr>
                  <th>Institution</th>
                  <th>Plan</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentInstitutions.map((inst) => (
                  <tr key={inst._id}>
                    <td style={{ fontWeight: 600 }}>{inst.name}</td>
                    <td style={{ textTransform: 'capitalize' }}>{inst.plan || 'free'}</td>
                    <td>{new Date(inst.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
              No institutions yet — add one from the Institutions page.
            </p>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Fraud list breakdown</h3>
            <button
              type="button"
              onClick={() => navigate('/superadmin/fraud')}
              style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              View full list →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem', marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Original platform list</span>
              <strong>{loading ? '—' : overview?.globalFraudCount ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Added by institutions</span>
              <strong>{loading ? '—' : overview?.institutionFraudCount ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Revenue</h3>
            <button
              type="button"
              onClick={() => navigate('/superadmin/revenue')}
              style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              View breakdown →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem', marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Current MRR</span>
              <strong>{loading ? '—' : formatINR(overview?.currentMRR)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Paying institutions</span>
              <strong>{loading ? '—' : overview?.payingInstitutions ?? 0}</strong>
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.76rem', marginTop: 10, marginBottom: 0 }}>
            Estimated from plan pricing — no payment gateway is connected yet.
          </p>
        </div>
      </div>
    </Layout>
  );
}
