import React, { useState } from 'react';
import api from '../api';

const LABEL_BADGE = {
  'Strong Hire': 'clear',
  Hire: 'clear',
  Borderline: 'role',
  Reject: 'flagged',
};

const SIGNAL_LABELS = {
  integrity: 'Integrity (fraud + resume checks)',
  jobMatch: 'Job match',
  interview: 'Interview panel',
};

// Fetches and shows the deterministic (no LLM) hiring recommendation for
// one candidate - see backend/utils/hiringRecommendation.js for the
// actual formula. Fetched on demand rather than baked into the ranked
// list response, since it touches screening + interview data the ranking
// query doesn't otherwise need.
export default function HiringRecommendationBadge({ candidate }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleOpen() {
    setOpen(true);
    if (data) return; // already fetched once - reuse it
    setLoading(true);
    setError('');
    api
      .get(`/candidates/${candidate._id}/hiring-recommendation`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load recommendation'))
      .finally(() => setLoading(false));
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--blue)' }}
      >
        Recommendation
      </button>

      {open && (
        <div className="scanning-overlay" onClick={() => setOpen(false)}>
          <div
            className="scanning-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 480, maxWidth: '92vw', textAlign: 'left', padding: 28, position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}
            >
              ✕
            </button>

            <h3 style={{ marginTop: 0, paddingRight: 28 }}>
              Hiring recommendation — {candidate.name || 'Candidate'}
            </h3>

            {loading && <p>Loading…</p>}
            {error && <p className="error-text">{error}</p>}

            {data && data.score == null && (
              <p style={{ color: 'var(--muted)' }}>{data.label} — screen the resume, get panel feedback, or set required skills on the job to build this out.</p>
            )}

            {data && data.score != null && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '12px 0' }}>
                  <span className={`badge ${LABEL_BADGE[data.label] || 'role'}`} style={{ fontSize: '1rem' }}>
                    {data.label}
                  </span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{data.score}%</span>
                </div>

                {Object.keys(data.breakdown).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                    {Object.entries(data.breakdown).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--muted)' }}>{SIGNAL_LABELS[key] || key}</span>
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {data.reasons.length > 0 && (
                  <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: 'var(--success)', fontSize: '0.84rem' }}>
                    {data.reasons.map((r, i) => (
                      <li key={i}>✔ {r}</li>
                    ))}
                  </ul>
                )}
                {data.concerns.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--danger)', fontSize: '0.84rem' }}>
                    {data.concerns.map((c, i) => (
                      <li key={i}>✘ {c}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
