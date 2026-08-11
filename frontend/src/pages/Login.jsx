import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

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
      await login(identifier, password);
      // Send them back to the page they were on when the session died,
      // falling back to the dashboard for a fresh/normal login.
      const dest = location.state?.from;
      const path = dest ? `${dest.pathname}${dest.search || ''}` : '/dashboard';
      navigate(path, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
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
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
