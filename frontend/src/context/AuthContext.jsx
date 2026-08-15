import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('th_user');
    return stored ? JSON.parse(stored) : null;
  });

  // Which institution a superadmin currently has "open" - id + name, kept
  // in sessionStorage (not localStorage - that's shared across every tab
  // of this origin, so two tabs viewing different institutions would
  // collide and both end up sending whichever institution was selected
  // *last*, in whichever tab). sessionStorage is scoped to this one tab,
  // matching how Institutions.jsx now opens each institution in its own
  // tab (see handleView there). Read by api.js on every request as the
  // x-company-id header. Meaningless for a regular tenant user, who only
  // ever has their own companyId anyway.
  const [selectedInstitution, setSelectedInstitutionState] = useState(() => {
    const id = sessionStorage.getItem('th_selected_institution_id');
    const name = sessionStorage.getItem('th_selected_institution_name');
    return id ? { id, name } : null;
  });

  function selectInstitution(institution) {
    if (institution) {
      sessionStorage.setItem('th_selected_institution_id', institution.id);
      sessionStorage.setItem('th_selected_institution_name', institution.name || '');
    } else {
      sessionStorage.removeItem('th_selected_institution_id');
      sessionStorage.removeItem('th_selected_institution_name');
    }
    setSelectedInstitutionState(institution || null);
  }

  // A freshly-opened tab (see Institutions.jsx's handleView, which opens
  // each institution with ?institution=<id>&institutionName=<name> in the
  // URL) picks up its institution from there rather than from
  // sessionStorage - a brand-new same-origin tab opened via window.open
  // starts with a *clone* of the opener's sessionStorage, which would
  // otherwise make the new tab briefly show whichever institution the
  // opener had selected before correcting itself. Reading from the URL
  // avoids that flash entirely, and doubles as making these links
  // shareable/bookmarkable. Runs once; strips the params afterward so
  // they don't linger in the address bar or get reprocessed on refresh
  // in a confusing way.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('institution');
    if (id) {
      selectInstitution({ id, name: params.get('institutionName') || '' });
      params.delete('institution');
      params.delete('institutionName');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  async function signup(companyName, name, email, mobile, password, plan) {
    const { data } = await api.post('/auth/signup', { companyName, name, email, mobile, password, plan });
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
