import React, { createContext, useContext, useState } from 'react';
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
