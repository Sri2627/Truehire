import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('th_user');
    return stored ? JSON.parse(stored) : null;
  });

  async function login(identifier, password) {
    const { data } = await api.post('/auth/login', { identifier, password });
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
    <AuthContext.Provider value={{ user, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
