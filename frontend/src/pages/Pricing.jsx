import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import Logo from '../assets/Logoth.png';

// Same fallback numbers as Signup.jsx's tiny inline picker - shown while
// GET /auth/plans is loading (or if it fails) so this page never renders
// empty. Overwritten the moment the real response comes back, since
// config/plans.js on the backend is the actual source of truth that
// POST /auth/signup and the job/candidate limit checks enforce against.
const FALLBACK_PLANS = [
  { value: 'free', label: 'Free', monthlyPrice: 0, jobLimit: 10, candidateLimit: 100 },
  { value: 'pro', label: 'Pro', monthlyPrice: 4999, jobLimit: 100, candidateLimit: 1000 },
  { value: 'enterprise', label: 'Enterprise', monthlyPrice: 19999, jobLimit: null, candidateLimit: null },
];

// Features every plan gets (the app doesn't gate any actual capability
// behind a plan tier today, only job/candidate volume) plus a couple of
// tier-appropriate extras for Pro/Enterprise. Kept honest: everything
// listed here is something the app actually does, not aspirational.
const CORE_FEATURES = [
  'Resume upload — single & bulk',
  'Fraud watch-list screening',
  'AI job matching & ranking',
  'Interview scheduling & email',
  'Team roles — admin, recruiter, viewer',
];

const TIER_EXTRAS = {
  free: [],
  pro: ['Priority email support'],
  enterprise: ['Priority email support', 'Dedicated onboarding', 'Custom contract terms'],
};

function formatPrice(amount) {
  return amount === 0 ? '₹0' : `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatLimit(n) {
  return n === null || n === undefined ? 'Unlimited' : n.toLocaleString('en-IN');
}

export default function Pricing() {
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get('/auth/plans')
      .then((res) => {
        if (Array.isArray(res.data.plans) && res.data.plans.length) {
          setPlans(res.data.plans);
        }
      })
      .catch(() => {
        // FALLBACK_PLANS already covers this — the real numbers are
        // re-validated server-side on signup regardless.
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', padding: '48px 24px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src={Logo} alt="True Hire" style={{ width: 160, height: 'auto', marginBottom: 20 }} />
          <h1 style={{ margin: '0 0 8px', fontSize: '1.7rem' }}>Plans built for how you hire</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Every plan includes fraud screening, job matching, and interview scheduling — pick the room you need to
            grow into.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {plans.map((p) => {
            const isPro = p.value === 'pro';
            return (
              <div
                key={p.value}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  border: isPro ? '2px solid var(--purple)' : undefined,
                  position: 'relative',
                }}
              >
                {isPro && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -12,
                      left: 20,
                      background: 'var(--grad)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    MOST POPULAR
                  </span>
                )}

                <h3 style={{ marginTop: isPro ? 8 : 0 }}>{p.label}</h3>
                <div style={{ marginBottom: 18 }}>
                  <span style={{ fontSize: '1.9rem', fontWeight: 800 }}>{formatPrice(p.monthlyPrice)}</span>
                  {p.monthlyPrice > 0 && <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}> /month</span>}
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>Job postings</span>
                    <strong>{formatLimit(p.jobLimit)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Candidates</span>
                    <strong>{formatLimit(p.candidateLimit)}</strong>
                  </div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', flex: 1 }}>
                  {[...CORE_FEATURES, ...(TIER_EXTRAS[p.value] || [])].map((f) => (
                    <li
                      key={f}
                      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.85rem', marginBottom: 8 }}
                    >
                      <span style={{ color: 'var(--success)', flexShrink: 0 }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className="btn-primary"
                  onClick={() => navigate(`/signup?plan=${p.value}`)}
                  style={{ width: '100%' }}
                >
                  Choose {p.label}
                </button>
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 32, fontSize: '0.86rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
