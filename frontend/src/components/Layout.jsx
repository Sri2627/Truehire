import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api';

export default function Layout({ children }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);

  // Pulls the current session's company + live fraud-list count, so it's
  // always visible which tenant you're screening against and whether that
  // tenant's fraud list is actually populated - the two facts that are
  // otherwise invisible when a scan silently comes back with 0 matches.
  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setMe(res.data))
      .catch(() => setMe(null));
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const fraudListEmpty = me && me.fraudListSize === 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          True <span className="accent">Hire</span>
        </div>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/candidates" className={({ isActive }) => (isActive ? 'active' : '')}>
          Candidates
        </NavLink>
        {hasRole('admin') && (
          <NavLink to="/team" className={({ isActive }) => (isActive ? 'active' : '')}>
            Team &amp; roles
          </NavLink>
        )}
        {hasRole('admin') && (
          <NavLink to="/fraud" className={({ isActive }) => (isActive ? 'active' : '')}>
            Fraud watch-list
          </NavLink>
        )}
        <div style={{ flex: 1 }} />

        {me && (
          <div style={{ fontSize: '0.74rem', opacity: 0.85, padding: '0 10px', marginBottom: 8 }}>
            <div>Company: {me.company?.name || '(none set)'}</div>
            <div style={{ color: fraudListEmpty ? 'var(--danger)' : 'var(--muted)' }}>
              Fraud list: {me.fraudListSize} {fraudListEmpty ? '⚠ empty' : 'entries'}
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.8rem', opacity: 0.8, padding: '0 10px' }}>
          {user?.name} · {user?.role}
        </div>
        <button onClick={handleLogout}>Log out</button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
