import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.trim() && !mobile.trim()) {
      setError('Enter an email or a mobile number');
      return;
    }

    setLoading(true);
    try {
      await signup(companyName, name, email, mobile, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create your institution');
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
        <p className="sub">Set up your institution — you'll be its first admin</p>

        <label htmlFor="companyName">Institution / company name</label>
        <input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Talent Solutions"
          required
        />

        <label htmlFor="name">Your name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="email">Work email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
        />

        <label htmlFor="mobile">Mobile (optional if email is set)</label>
        <input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" />

        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
        />

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating your institution…' : 'Create institution'}
        </button>

        {error && <p className="error-text">{error}</p>}

        <p className="sub" style={{ marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
