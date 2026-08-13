import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('th_user');
    return stored ? JSON.parse(stored) : null;
  });

  // Which institution a superadmin currently has "open" - id + name, kept
  // in localStorage (read by api.js on every request as the x-company-id
  // header) and mirrored into state so the sidebar/pages can react to it.
  // Meaningless for a regular tenant user, who only ever has their own
  // companyId anyway.
  const [selectedInstitution, setSelectedInstitutionState] = useState(() => {
    const id = localStorage.getItem('th_selected_institution_id');
    const name = localStorage.getItem('th_selected_institution_name');
    return id ? { id, name } : null;
  });

  function selectInstitution(institution) {
    if (institution) {
      localStorage.setItem('th_selected_institution_id', institution.id);
      localStorage.setItem('th_selected_institution_name', institution.name || '');
    } else {
      localStorage.removeItem('th_selected_institution_id');
      localStorage.removeItem('th_selected_institution_name');
    }
    setSelectedInstitutionState(institution || null);
  }

  async function login(identifier, password) {
    const { data } = await api.post('/auth/login', { identifier, password });
    localStorage.setItem('th_access_token', data.accessToken);
    localStorage.setItem('th_refresh_token', data.refreshToken);
    localStorage.setItem('th_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  // Creates a brand new institution (Company) plus its first admin user,
  // and logs straight in - same token/localStorage handling as login()
  // above, just against a different endpoint.
  async function signup(companyName, name, email, mobile, password) {
    const { data } = await api.post('/auth/signup', { companyName, name, email, mobile, password });
    localStorage.setItem('th_access_token', data.accessToken);
    localStorage.setItem('th_refresh_token', data.refreshToken);
    localStorage.setItem('th_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('th_access_token');
    localStorage.removeItem('th_refresh_token');
    localStorage.removeItem('th_user');
    selectInstitution(null);
    setUser(null);
  }

  // api.js clears localStorage itself when a token refresh fails (it's a
  // plain module, not a component - it can't call setUser directly), then
  // fires this event so this state actually catches up. Without it, the
  // UI keeps thinking you're logged in and every request keeps failing
  // with "Missing or malformed Authorization header".
  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
    }
    window.addEventListener('th:session-expired', handleSessionExpired);
    return () => window.removeEventListener('th:session-expired', handleSessionExpired);
  }, []);

  // role helper - e.g. hasRole('admin') or hasRole('admin', 'recruiter')
  function hasRole(...roles) {
    return !!user && roles.includes(user.role);
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, hasRole, selectedInstitution, selectInstitution }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
