import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api';
import Logo from "../assets/Logoth.png";
export default function Layout({ children }) {
  const { user, logout, hasRole, selectedInstitution, selectInstitution } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const isSuperAdmin = hasRole('superadmin');

  // Pulls the current session's company + live fraud-list count, so it's
  // always visible which tenant you're screening against and whether that
  // tenant's fraud list is actually populated - the two facts that are
  // otherwise invisible when a scan silently comes back with 0 matches.
  useEffect(() => {
    if (user?.role === 'jobseeker') return;
    api
      .get('/auth/me')
      .then((res) => setMe(res.data))
      .catch(() => setMe(null));
  }, [user?.role]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // Drops the currently-selected institution and sends the superadmin
  // back to the full list to pick another one (or add a new one).
  function handleSwitchInstitution() {
    selectInstitution(null);
    navigate('/institutions');
  }

  const fraudListEmpty = me && me.fraudListSize === 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
 
<img src={Logo} alt="True Hire Logo" className="logo" style={{ width: "180px", height: "auto" }}/>        </div>
        {isSuperAdmin && !selectedInstitution && (
          <>
            <NavLink to="/superadmin" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/institutions" className={({ isActive }) => (isActive ? 'active' : '')}>
              Institutions
            </NavLink>
            <NavLink to="/superadmin/fraud" className={({ isActive }) => (isActive ? 'active' : '')}>
              Fraud watch-list
            </NavLink>
            <NavLink to="/superadmin/revenue" className={({ isActive }) => (isActive ? 'active' : '')}>
              Revenue
            </NavLink>
          </>
        )}

        {user?.role === 'jobseeker' && (
          <>
            <NavLink to="/jobseeker-dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/careers" className={({ isActive }) => (isActive ? 'active' : '')}>
              Browse jobs
            </NavLink>
            <NavLink to="/my-applications" className={({ isActive }) => (isActive ? 'active' : '')}>
              My applications
            </NavLink>
            <NavLink to="/resume-builder" className={({ isActive }) => (isActive ? 'active' : '')}>
              Resume builder
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
              Profile
            </NavLink>
          </>
        )}

        {/* A superadmin only sees these once it has picked an institution
            to look at (see pages/Institutions.jsx "View") - otherwise
            there's nothing scoped to show yet. Every other role always
            sees these, scoped to their own company. */}
        {user?.role !== 'jobseeker' && (!isSuperAdmin || selectedInstitution) && (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/jobs" className={({ isActive }) => (isActive ? 'active' : '')}>
              Jobs
            </NavLink>
            <NavLink to="/candidates" className={({ isActive }) => (isActive ? 'active' : '')}>
              Candidates
            </NavLink>
            {hasRole('admin', 'superadmin') && (
              <NavLink to="/team" className={({ isActive }) => (isActive ? 'active' : '')}>
                Team &amp; roles
              </NavLink>
            )}
            {hasRole('admin', 'superadmin') && (
              <NavLink to="/fraud" className={({ isActive }) => (isActive ? 'active' : '')}>
                Fraud watch-list
              </NavLink>
            )}
          </>
        )}
        <div style={{ flex: 1 }} />

        {isSuperAdmin ? (
          selectedInstitution && (
            <div style={{ fontSize: '0.74rem', opacity: 0.85, padding: '0 10px', marginBottom: 8 }}>
              <div>Viewing: {selectedInstitution.name}</div>
              <button
                type="button"
                onClick={handleSwitchInstitution}
                style={{ padding: 0, height: 'auto', color: 'var(--purple)', fontWeight: 600, fontSize: '0.74rem' }}
              >
                Switch institution
              </button>
            </div>
          )
        ) : (
          me && (
            <div style={{ fontSize: '0.74rem', opacity: 0.85, padding: '0 10px', marginBottom: 8 }}>
              <div>Company: {me.company?.name || '(none set)'}</div>
              <div style={{ color: fraudListEmpty ? 'var(--danger)' : 'var(--muted)' }}>
                Fraud list: {me.fraudListSize} {fraudListEmpty ? '⚠ empty' : 'entries'}
              </div>
            </div>
          )
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
