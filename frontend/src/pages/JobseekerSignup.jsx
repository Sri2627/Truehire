import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PjxLogo from '../assets/pjx-logo.png';

export default function JobseekerSignup() {
  const { signupJobseeker } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signupJobseeker(form);
      const jobId = searchParams.get('job');
      navigate(jobId ? `/careers?apply=${encodeURIComponent(jobId)}` : '/jobseeker-dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create your account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-split-brand">
        <img src={PjxLogo} alt="PJX Labs — True Hire" />
        <div className="auth-split-tagline">
          <h2>Your next opportunity starts here</h2>
          <p>Create a jobseeker account to apply to open positions and follow your application status.</p>
        </div>
      </div>
      <div className="auth-split-form">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Jobseeker sign up</h1>
          <label htmlFor="name">Full name</label>
          <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          <label htmlFor="mobile">Mobile (optional if email is set)</label>
          <input id="mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} autoComplete="tel" />
          <label htmlFor="password">Password (at least 8 characters)</label>
          <PasswordInput id="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" minLength={8} required />
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create jobseeker account'}
          </button>
          <p className="sub" style={{ marginTop: 16 }}>Already registered? <Link to="/login">Sign in</Link></p>
          <p className="sub"><Link to="/careers">Browse open jobs</Link></p>
        </form>
      </div>
    </div>
  );
}
