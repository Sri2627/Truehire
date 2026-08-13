import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PjxLogo from '../assets/pjx-logo.png';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If api.js redirected us here because a token refresh failed, it left
  // this flag behind so we can tell the user *why* they're back at the
  // login screen instead of just showing an empty form.
  const [sessionExpired] = useState(() => {
    const expired = sessionStorage.getItem('th_session_expired') === '1';
    if (expired) sessionStorage.removeItem('th_session_expired');
    return expired;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(identifier, password);
      // Send them back to the page they were on when the session died,
      // falling back to the dashboard for a fresh/normal login - except a
      // superadmin, which has no institution's dashboard of its own until
      // it picks one from /institutions.
      const dest = location.state?.from;
      const fallback = loggedInUser?.role === 'superadmin' ? '/institutions' : '/dashboard';
      const path = dest ? `${dest.pathname}${dest.search || ''}` : fallback;
      navigate(path, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-split-brand">
        <img src={PjxLogo} alt="PJX Labs — True Hire" />
        <div className="auth-split-tagline">
          <h2>Verify. Validate. Trust.</h2>
          <p>
            True Hire screens every resume against your fraud watch-list, ranks candidates against
            each job's real requirements, and keeps every institution's data cleanly separated —
            so hiring decisions are backed by evidence, not guesswork.
          </p>
        </div>
      </div>

      <div className="auth-split-form">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>
            True <span style={{
              background: 'linear-gradient(90deg, #7c5cff, #4f8cff)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}>Hire</span>
          </h1>
          <p className="sub">Sign in with your work email or mobile</p>

          {sessionExpired && (
            <p className="error-text" role="alert">
              Your session expired. Please sign in again.
            </p>
          )}

          <label htmlFor="identifier">Email or mobile</label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@company.com"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <p className="sub" style={{ margin: '8px 0 0', textAlign: 'right' }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {error && <p className="error-text">{error}</p>}

          <p className="sub" style={{ marginTop: 16 }}>
            New institution? <Link to="/signup">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
