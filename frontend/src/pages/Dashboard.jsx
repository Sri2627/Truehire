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

  // GET /candidates includes each candidate's latestScreening (see
  // routes/candidateRoutes.js), so these are real counts from the fraud
  // watch-list scan - not placeholders.
  const total = candidates.length;
  const verified = candidates.filter((c) => c.latestScreening?.verdict === 'clear').length;
  const flagged = candidates.filter((c) => c.latestScreening?.verdict === 'flagged').length;
  const inProgress = total - verified - flagged; // added but not screened yet

  const segments = [
    { label: 'Verified', value: verified, color: '#7c5cff' },
    { label: 'In progress', value: inProgress, color: '#4f8cff' },
    { label: 'Flagged', value: flagged, color: '#f2596b' },
  ];

  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);

  // Recent activity: prefer candidates with a screening timestamp, most
  // recent first, falling back to "added" for anyone not screened yet.
  const recent = [...candidates]
    .sort((a, b) => {
      const at = new Date(a.latestScreening?.screenedAt || a.createdAt);
      const bt = new Date(b.latestScreening?.screenedAt || b.createdAt);
      return bt - at;
    })
    .slice(0, 5);

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
            recent.map((c) => {
              const verdict = c.latestScreening?.verdict;
              const detail = verdict
                ? verdict === 'flagged'
                  ? `Resume flagged - matched ${c.latestScreening.fraudMatches?.length || 0} fraud watch-list entr${(c.latestScreening.fraudMatches?.length || 0) === 1 ? 'y' : 'ies'}`
                  : 'Resume screened - no fraud watch-list match'
                : 'Added to candidates';
              const when = c.latestScreening?.screenedAt || c.createdAt;
              return (
                <div className="activity-item" key={c._id}>
                  <span className="name">
                    {c.name || 'Unnamed candidate'}
                    {verdict && <span className={`badge ${verdict}`} style={{ marginLeft: 8 }}>{verdict}</span>}
                  </span>
                  <span className="detail">{detail}</span>
                  <span className="time">{new Date(when).toLocaleString()}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
