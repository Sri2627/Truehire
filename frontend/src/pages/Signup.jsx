import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PjxLogo from '../assets/pjx-logo.png';
import api from '../api';

// Fallback shown while /auth/plans is loading (or if it fails) so the
// pricing step never renders empty - overwritten the moment the real
// response comes back, since that's the source of truth POST /signup
// actually validates against.
const FALLBACK_PLANS = [
  { value: 'free', label: 'Free', monthlyPrice: 0 },
  { value: 'pro', label: 'Pro', monthlyPrice: 4999 },
  { value: 'enterprise', label: 'Enterprise', monthlyPrice: 19999 },
];

function formatINR(amount) {
  return amount === 0 ? 'Free' : `₹${Number(amount).toLocaleString('en-IN')}/month`;
}

// Digits-only, grouped in 4s as the person types — cosmetic formatting
// only, this is a demo card field (see the notice in PaymentDetails
// below), not a real payment form, so there's no Luhn check or card-
// network detection here.
function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

const EMPTY_PAYMENT = { cardName: '', cardNumber: '', expiry: '', cvv: '' };

// Shown only for paid plans (Pro/Enterprise) — there is no payment
// gateway wired into True Hire (no Razorpay/Stripe integration, see
// backend/config/plans.js), so this collects nothing that's actually
// transmitted anywhere: on submit only the chosen `plan` value goes to
// POST /auth/signup, exactly like the Free path. This exists to complete
// the sign-up flow the pricing page promises, not to process a real
// charge — the disclaimer below is deliberately not fine print.
function PaymentDetails({ payment, setPayment, planLabel, monthlyPrice }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Payment details</h3>
        <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          {planLabel} — {formatINR(monthlyPrice)}
        </span>
      </div>

      <p
        style={{
          background: 'rgba(184, 121, 10, 0.1)',
          color: 'var(--warning)',
          fontSize: '0.78rem',
          padding: '8px 10px',
          borderRadius: 6,
          margin: '0 0 12px',
        }}
      >
        Demo only — no real payment is processed and no card details are stored. A real gateway isn't wired up yet.
      </p>

      <label>Name on card</label>
      <input
        value={payment.cardName}
        onChange={(e) => setPayment({ ...payment, cardName: e.target.value })}
        required
      />

      <label style={{ marginTop: 10 }}>Card number</label>
      <input
        value={payment.cardNumber}
        onChange={(e) => setPayment({ ...payment, cardNumber: formatCardNumber(e.target.value) })}
        placeholder="1234 5678 9012 3456"
        inputMode="numeric"
        required
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <label>Expiry</label>
          <input
            value={payment.expiry}
            onChange={(e) => setPayment({ ...payment, expiry: formatExpiry(e.target.value) })}
            placeholder="MM/YY"
            inputMode="numeric"
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>CVV</label>
          <input
            value={payment.cvv}
            onChange={(e) => setPayment({ ...payment, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            placeholder="123"
            inputMode="numeric"
            required
          />
        </div>
      </div>
    </div>
  );
}

// Plan picker shown before the rest of the signup form - three cards,
// click to select, price pulled live from the backend so it can never
// show different numbers than what POST /auth/signup actually charges
// the account's plan field to.
function PlanPicker({ plans, selected, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
      {plans.map((p) => {
        const isSelected = selected === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onSelect(p.value)}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 10,
              cursor: 'pointer',
              border: isSelected ? '2px solid var(--purple, #7c5cff)' : '1px solid var(--line)',
              background: isSelected ? 'rgba(124, 92, 255, 0.08)' : 'none',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{p.label}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 2 }}>{formatINR(p.monthlyPrice)}</div>
          </button>
        );
      })}
    </div>
  );
}

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [plan, setPlan] = useState(() => {
    const fromQuery = searchParams.get('plan');
    return ['free', 'pro', 'enterprise'].includes(fromQuery) ? fromQuery : 'free';
  });
  const [payment, setPayment] = useState(EMPTY_PAYMENT);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get('/auth/plans')
      .then((res) => {
        if (Array.isArray(res.data.plans) && res.data.plans.length) {
          setPlans(res.data.plans);
        }
      })
      .catch(() => {
        // Fine to ignore - FALLBACK_PLANS already covers this, and the
        // backend re-validates whatever plan is submitted anyway.
      });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.trim() && !mobile.trim()) {
      setError('Enter an email or a mobile number');
      return;
    }

    if (plan !== 'free') {
      const { cardName, cardNumber, expiry, cvv } = payment;
      if (!cardName.trim() || cardNumber.replace(/\s/g, '').length < 12 || !expiry || cvv.length < 3) {
        setError('Fill in the payment details to continue with a paid plan');
        return;
      }
    }

    setLoading(true);
    try {
      await signup(companyName, name, email, mobile, password, plan);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create your institution');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-split-brand">
        <img src={PjxLogo} alt="PJX Labs — True Hire" />
        <div className="auth-split-tagline">
          <h2>Set up your institution</h2>
          <p>
            One account gets your whole team — admins, recruiters, and viewers — screening resumes
            against your fraud watch-list and ranking candidates against real job requirements from
            day one.
          </p>
        </div>
      </div>

      <div className="auth-split-form">
        <form className="auth-card auth-card--wide" onSubmit={handleSubmit}>
          <h1>
            True <span style={{
              background: 'linear-gradient(90deg, #7c5cff, #4f8cff)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}>Hire</span>
          </h1>
          <p className="sub">Set up your institution — you'll be its first admin</p>

          <label>Choose a plan</label>
          <PlanPicker plans={plans} selected={plan} onSelect={setPlan} />
          <p style={{ marginTop: -10, marginBottom: 18 }}>
            <Link to="/pricing" style={{ fontSize: '0.78rem' }}>← Compare plans in detail</Link>
          </p>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="companyName">Institution / company name</label>
              <input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Talent Solutions"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="username"
              />
            </div>

            <div className="field">
              <label htmlFor="mobile">Mobile (optional if email is set)</label>
              <input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" />
            </div>

            <div className="field full">
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>

            {plan !== 'free' && (
              <div className="field full">
                <PaymentDetails
                  payment={payment}
                  setPayment={setPayment}
                  planLabel={plans.find((p) => p.value === plan)?.label || plan}
                  monthlyPrice={plans.find((p) => p.value === plan)?.monthlyPrice ?? 0}
                />
              </div>
            )}

            <div className="field full">
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Creating your institution…' : 'Create institution'}
              </button>
            </div>

            {error && (
              <div className="field full">
                <p className="error-text" style={{ margin: 0 }}>{error}</p>
              </div>
            )}
          </div>

          <p className="sub" style={{ marginTop: 16 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
