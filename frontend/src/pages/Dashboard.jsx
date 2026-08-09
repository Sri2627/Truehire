import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Donut from '../components/Donut.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, verified: 0, flagged: 0, inProgress: 0 });
  const [jobsCount, setJobsCount] = useState(0);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/candidates/stats'),
      api.get('/jobs', { params: { limit: 1 } }),
      // Most recent 5 candidates, most recently created first - the same
      // order the list page uses by default, so this doubles as an
      // accurate "what just happened" feed without pulling every record.
      api.get('/candidates', { params: { limit: 5 } }),
    ])
      .then(([statsRes, jobsRes, candidatesRes]) => {
        setStats(statsRes.data);
        setJobsCount(jobsRes.data.total || 0);
        setRecent(Array.isArray(candidatesRes.data.items) ? candidatesRes.data.items : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { total, verified, flagged } = stats;

  const segments = [
    { label: 'Verified', value: verified, color: '#7c5cff' },
    { label: 'In progress', value: stats.inProgress, color: '#4f8cff' },
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
          <div className="n">{loading ? '—' : jobsCount}</div>
          <div className="label">Jobs posted</div>
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
          ) : recent.length === 0 ? (
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
