import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  // Arrives here from ForgotPassword with the identifier + a status message
  // in location.state; also allow landing here directly (e.g. a bookmarked
  // link) by just leaving the identifier field editable/blank.
  const [identifier, setIdentifier] = useState(location.state?.identifier || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { identifier, code, newPassword });
      setSuccess('Password updated. Redirecting to sign in…');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset password');
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
        <p className="sub">
          {location.state?.message || 'Enter the code we emailed you along with a new password'}
        </p>

        <label htmlFor="identifier">Email or mobile</label>
        <input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          required
        />

        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          required
        />

        <label htmlFor="newPassword">New password</label>
        <PasswordInput
          id="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
        />

        <label htmlFor="confirmPassword">Confirm new password</label>
        <PasswordInput
          id="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
        />

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Updating…' : 'Reset password'}
        </button>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="sub" style={{ color: 'var(--success)', marginTop: 12 }}>{success}</p>}

        <p className="sub" style={{ marginTop: 16 }}>
          <Link to="/forgot-password">Request a new code</Link> · <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
