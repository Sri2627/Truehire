import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

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
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: '0.8rem', opacity: 0.8, padding: '0 10px' }}>
          {user?.name} · {user?.role}
        </div>
        <button onClick={handleLogout}>Log out</button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
