import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Donut from '../components/Donut.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/candidates')
      .then((res) => setCandidates(res.data))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, []);

  // Screening isn't wired up yet, so every candidate on file counts as
  // "in progress" until POST /candidates/:id/screen is built. Real counts
  // once that lands - not placeholders dressed up as data.
  const total = candidates.length;
  const verified = 0;
  const flagged = 0;
  const inProgress = total;

  const segments = [
    { label: 'Verified', value: verified, color: '#7c5cff' },
    { label: 'In progress', value: inProgress || (total === 0 ? 1 : 0), color: '#4f8cff' },
    { label: 'Flagged', value: flagged, color: '#f2596b' },
  ];

  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <Layout>
      <div className="topbar">
        <h2>Dashboard</h2>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Hi, {user?.name}</span>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="n">{loading ? '—' : total}</div>
          <div className="label">Total candidates</div>
        </div>
        <div className="stat">
          <div className="n success">{verified}</div>
          <div className="label">Verified</div>
        </div>
        <div className="stat">
          <div className="n danger">{flagged}</div>
          <div className="label">Fraud detected</div>
        </div>
        <div className="stat">
          <div className="n warning">{inProgress}</div>
          <div className="label">In progress</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3>Verification summary</h3>
          {total === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
              No candidates yet - add one from the Candidates page to see this fill in.
            </p>
          ) : (
            <div className="donut-wrap">
              <Donut segments={segments} />
              <div className="donut-legend">
                {segments.map((s) => (
                  <div className="row" key={s.label}>
                    <span className="dot" style={{ background: s.color }} />
                    <span>
                      {s.label} {pct(s.value)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Recent activity</h3>
          {loading ? (
            <p style={{ color: 'var(--muted)' }}>Loading…</p>
          ) : candidates.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
              Nothing yet. New candidates will show up here as they're added.
            </p>
          ) : (
            candidates.slice(0, 5).map((c) => (
              <div className="activity-item" key={c._id}>
                <span className="name">{c.name || 'Unnamed candidate'}</span>
                <span className="detail">Added to candidates</span>
                <span className="time">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
