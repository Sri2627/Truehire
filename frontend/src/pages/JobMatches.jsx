import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ResumePreviewButton from '../components/ResumePreviewButton.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

// Standard competition ranking ("1224"): candidates tied on score share
// the same rank number, and the rank after a tie skips ahead by the tie
// size - e.g. two candidates tied at #1 are both "1", the next distinct
// score is "3", not "2". The list is already sorted by score descending
// (the backend does that), so this only needs one pass.
function withRanks(ranked) {
  let rank = 0;
  let lastScore = null;
  return ranked.map((r, i) => {
    if (r.score !== lastScore) {
      rank = i + 1;
      lastScore = r.score;
    }
    return { ...r, rank };
  });
}

// Score -> color, reusing the same success/warning/danger vocabulary as
// the rest of the app (see .stat .n.success etc in index.css) instead of
// inventing a new palette just for this page.
function scoreColor(score) {
  if (score >= 75) return 'var(--success)';
  if (score >= 50) return 'var(--warning)';
  return 'var(--danger)';
}

// Compact horizontal bar + number, used for the overall score and the
// two sub-scores that make it up. Keeping it inline (not a separate
// component file) since nothing else in the app needs it yet.
function ScoreBar({ score, width = 90 }) {
  if (score == null) {
    return <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>—</span>;
  }
  const color = scoreColor(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width, height: 6, borderRadius: 999, background: 'var(--panel-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontWeight: 600, color, fontSize: '0.84rem', minWidth: 30 }}>{score}</span>
    </div>
  );
}

// Overall score, plus its two sub-scores, stacked into one compact
// column instead of three separate table columns - keeps the table from
// running wider than the window on anything but a very large screen.
function ScoreBreakdown({ score, skillScore, experienceScore }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110 }}>
      <ScoreBar score={score} width={80} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
        <span style={{ width: 30 }}>Skill</span>
        <ScoreBar score={skillScore} width={44} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
        <span style={{ width: 30 }}>Exp.</span>
        <ScoreBar score={experienceScore} width={44} />
      </div>
    </div>
  );
}

function SkillChips({ items, render, color }) {
  if (!items || items.length === 0) return <span style={{ color: 'var(--muted)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {items.map((it, i) => (
        <span
          key={i}
          title={render(it)}
          style={{
            fontSize: '0.72rem',
            padding: '2px 7px',
            borderRadius: 999,
            background: color === 'danger' ? 'rgba(214,58,81,0.1)' : color === 'warning' ? 'rgba(184,121,10,0.1)' : 'rgba(31,156,115,0.1)',
            color: color === 'danger' ? 'var(--danger)' : color === 'warning' ? 'var(--warning)' : 'var(--success)',
            whiteSpace: 'nowrap',
          }}
        >
          {it.name}
        </span>
      ))}
    </div>
  );
}

export default function JobMatches() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const canScreen = hasRole('admin', 'recruiter');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get(`/jobs/${id}/matches`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load candidate matches'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Layout>
      <div className="topbar">
        <div>
          <Link to="/jobs" style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            ← Jobs
          </Link>
          <h2 style={{ margin: '4px 0 0' }}>{data?.job?.title ? `Matches for "${data.job.title}"` : 'Candidate matches'}</h2>
        </div>
      </div>

      {data?.job && (
        <div className="card">
          <h3>Ranking against</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: data.job.minExperienceYears ? 10 : 0 }}>
            {data.job.requiredSkills.map((s, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.78rem',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'var(--panel-2)',
                  color: 'var(--ink)',
                }}
              >
                {s.name} · weight {s.weight}
                {s.minYears ? ` · ${s.minYears}+ yrs` : ''}
              </span>
            ))}
          </div>
          {data.job.minExperienceYears ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.84rem' }}>
              Minimum overall experience: {data.job.minExperienceYears} years
            </p>
          ) : null}
        </div>
      )}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <div>
            <p className="error-text" style={{ marginTop: 0 }}>{error}</p>
            {error.toLowerCase().includes('required skills') && (
              <p style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>
                Required skills are set when a job is created. Create a new job posting with required skills
                configured to use this page.
              </p>
            )}
          </div>
        ) : data.ranked.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No candidates to rank yet — registered candidates whose resume came back flagged are left off this list.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Candidate</th>
                <th>Score</th>
                <th>Matched</th>
                <th>Missing</th>
                <th>Exceeding</th>
                <th>Resume</th>
                {canScreen && <th>Interview</th>}
              </tr>
            </thead>
            <tbody>
              {withRanks(data.ranked).map((r) => (
                <tr key={r.candidate._id}>
                  <td style={{ color: 'var(--muted)' }}>{r.rank}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.candidate.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{r.candidate.email || '—'}</div>
                  </td>
                  <td>
                    <ScoreBreakdown score={r.score} skillScore={r.skillScore} experienceScore={r.experienceScore} />
                  </td>
                  <td>
                    <SkillChips
                      items={r.matched}
                      color="success"
                      render={(m) => `${m.name}${m.candidateYears != null ? ` — ${m.candidateYears}y (${m.yearsSource})` : ''}`}
                    />
                  </td>
                  <td>
                    <SkillChips items={r.missing} color="danger" render={(m) => `${m.name} (weight ${m.weight})`} />
                  </td>
                  <td>
                    <SkillChips
                      items={r.exceeding}
                      color="warning"
                      render={(m) => `${m.name} — ${m.candidateYears}y vs ${m.minYears}y required`}
                    />
                  </td>
                  <td>
                    {r.candidate.hasResume ? (
                      <ResumePreviewButton candidateId={r.candidate._id} candidateName={r.candidate.name} label="View resume" />
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  {canScreen && (
                    <td>
                      {r.candidate.screeningVerdict === 'clear' ? (
                        <Link to={`/jobs/${id}/candidates/${r.candidate._id}/interview`} style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          Manage interview →
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                          {r.candidate.screeningVerdict ? '—' : 'Not screened yet'}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
