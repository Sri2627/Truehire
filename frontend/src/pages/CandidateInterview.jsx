import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import InterviewActions from '../components/InterviewActions.jsx';
import HiringRecommendationBadge from '../components/HiringRecommendationBadge.jsx';
import ResumePreviewButton from '../components/ResumePreviewButton.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

// Dedicated page for one candidate's interview + recommendation, reached
// from the "Interview" column on JobMatches.jsx. That table used to have
// the full schedule/email/feedback UI and the recommendation button
// crammed into two of its columns - fine for one row, unreadable once a
// job has more than a couple of matches. This reuses the same
// /jobs/:jobId/matches response JobMatches.jsx already fetches (rather
// than adding a new backend endpoint) and just picks out the one
// candidate's row.
export default function CandidateInterview() {
  const { jobId, candidateId } = useParams();
  const { hasRole } = useAuth();
  const canScreen = hasRole('admin', 'recruiter');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get(`/jobs/${jobId}/matches`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load this candidate'))
      .finally(() => setLoading(false));
  }, [jobId]);

  const row = data?.ranked?.find((r) => r.candidate._id === candidateId);

  return (
    <Layout>
      <div className="topbar">
        <div>
          <Link to={`/jobs/${jobId}/matches`} style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            ← Matches for "{data?.job?.title || '…'}"
          </Link>
          <h2 style={{ margin: '4px 0 0' }}>{row ? row.candidate.name : 'Interview'}</h2>
        </div>
      </div>

      {loading ? (
        <div className="card"><p>Loading…</p></div>
      ) : error ? (
        <div className="card"><p className="error-text" style={{ margin: 0 }}>{error}</p></div>
      ) : !row ? (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>
            This candidate isn't in this job's ranked matches (maybe their resume was flagged, or they've since
            been removed). <Link to={`/jobs/${jobId}/matches`}>Back to matches</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.84rem' }}>{row.candidate.email || 'No email on file'}</div>
                <div style={{ marginTop: 6, fontWeight: 600, fontSize: '1.1rem' }}>
                  Score: {row.score}
                  <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.82rem', marginLeft: 8 }}>
                    (skill {row.skillScore} · experience {row.experienceScore})
                  </span>
                </div>
              </div>
              {row.candidate.hasResume && (
                <ResumePreviewButton candidateId={row.candidate._id} candidateName={row.candidate.name} label="View resume" />
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 16 }}>
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginBottom: 4 }}>Matched</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
                  {row.matched.length === 0 ? (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  ) : (
                    row.matched.map((m, i) => (
                      <span key={i} style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 999, background: 'rgba(31,156,115,0.1)', color: 'var(--success)' }}>
                        {m.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginBottom: 4 }}>Missing</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
                  {row.missing.length === 0 ? (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  ) : (
                    row.missing.map((m, i) => (
                      <span key={i} style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 999, background: 'rgba(214,58,81,0.1)', color: 'var(--danger)' }}>
                        {m.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {canScreen && (
            <div className="card">
              <h3>Hiring recommendation</h3>
              <HiringRecommendationBadge candidate={row.candidate} />
            </div>
          )}

          <div className="card">
            <h3>Interview</h3>
            {row.candidate.screeningVerdict === 'clear' ? (
              canScreen ? (
                <InterviewActions candidate={row.candidate} interviewPanel={data.job.interviewPanel || []} layout="block" />
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>
                  Only admins and recruiters can schedule interviews.
                </p>
              )
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>
                {row.candidate.screeningVerdict
                  ? 'This candidate is not verified (clear) — only verified candidates can be scheduled for interview.'
                  : 'This candidate has not been screened yet.'}
              </p>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
