import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Wrap any page in <ProtectedRoute roles={['admin']}> to require both a
// valid session and (optionally) a specific role. The server enforces the
// real access control - this just keeps the UI honest about what a user
// can see.
export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Carry the page they were on so Login can send them right back after
    // they sign in again, instead of always dumping them on /dashboard.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
