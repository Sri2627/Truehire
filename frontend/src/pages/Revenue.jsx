import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';

function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

const PLAN_LABELS = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };

export default function Revenue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/institutions/revenue')
      .then((res) => setData(res.data))
      .catch(() => setError('Could not load revenue data'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="topbar">
        <h2>Revenue</h2>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Superadmin</span>
      </div>

      <div className="card" style={{ background: 'var(--panel-2, #f6f6fb)', border: '1px solid var(--line)' }}>
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
          These figures are <strong>estimated from each institution's plan price</strong> — True Hire doesn't have a
          payment gateway wired in yet, so nothing here reflects an actual transaction. Update the prices in{' '}
          <code>backend/config/plans.js</code> if they change.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="stat-row">
        <div className="stat">
          <div className="n">{loading ? '—' : formatINR(data?.currentMRR)}</div>
          <div className="label">Current MRR (estimated)</div>
        </div>
        <div className="stat">
          <div className="n">{loading ? '—' : formatINR(data?.totalEstimatedRevenue)}</div>
          <div className="label">Total estimated revenue to date</div>
        </div>
        <div className="stat">
          <div className="n">{loading ? '—' : data?.items?.length ?? 0}</div>
          <div className="label">Institutions</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>By plan</h3>
          {loading ? (
            <p>Loading…</p>
          ) : data?.byPlan?.length ? (
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Institutions</th>
                  <th>MRR</th>
                </tr>
              </thead>
              <tbody>
                {data.byPlan.map((p) => (
                  <tr key={p.plan}>
                    <td>
                      <span className="badge role">{PLAN_LABELS[p.plan] || p.plan}</span>
                    </td>
                    <td>{p.count}</td>
                    <td>{formatINR(p.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--muted)' }}>No institutions yet.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Revenue by institution</h3>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Institution</th>
                <th>Plan</th>
                <th>Monthly price</th>
                <th>Months active</th>
                <th>Estimated total revenue</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data?.items?.map((inst) => (
                <tr key={inst.id}>
                  <td style={{ fontWeight: 600 }}>{inst.name}</td>
                  <td>
                    <span className="badge role">{PLAN_LABELS[inst.plan] || inst.plan}</span>
                  </td>
                  <td>{formatINR(inst.monthlyPrice)}</td>
                  <td>{inst.monthsActive}</td>
                  <td style={{ fontWeight: 600 }}>{formatINR(inst.estimatedTotalRevenue)}</td>
                  <td>{new Date(inst.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && data?.items?.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No institutions yet.</p>
        )}
      </div>
    </Layout>
  );
}
