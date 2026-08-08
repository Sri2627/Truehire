import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Wrap any page in <ProtectedRoute roles={['admin']}> to require both a
// valid session and (optionally) a specific role. The server enforces the
// real access control - this just keeps the UI honest about what a user
// can see.
export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
