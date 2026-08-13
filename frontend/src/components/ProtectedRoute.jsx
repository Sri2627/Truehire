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
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // A superadmin hitting a route it doesn't have access to (e.g. /team)
    // should land on the institution list, not a tenant's dashboard.
    const fallback = user.role === 'superadmin' ? '/institutions' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return children;
}
