import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { identifier });
      // The API always returns the same generic message whether or not an
      // account exists, so just carry the identifier forward to the code
      // entry screen along with that message.
      navigate('/reset-password', {
        state: {
          identifier,
          message: 'If an account exists for that email or mobile, a reset code has been sent.',
        },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send reset code');
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
        <p className="sub">Enter your work email and we'll send you a reset code</p>

        <label htmlFor="identifier">Email or mobile</label>
        <input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          required
        />

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset code'}
        </button>

        {error && <p className="error-text">{error}</p>}

        <p className="sub" style={{ marginTop: 16 }}>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
