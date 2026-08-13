import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetails from './pages/JobDetails.jsx';
import JobMatches from './pages/JobMatches.jsx';
import Candidates from './pages/Candidates.jsx';
import Team from './pages/Team.jsx';
import FraudList from './pages/FraudList.jsx';
import Institutions from './pages/Institutions.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// A superadmin has no institution's dashboard of its own to land on - it
// only makes sense to send them to /dashboard once they've picked an
// institution to look at (see pages/Institutions.jsx "View"). Everyone
// else keeps the normal default of /dashboard.
function DefaultRedirect() {
  const { user } = useAuth();
  const target = user?.role === 'superadmin' ? '/institutions' : '/dashboard';
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <Jobs />
          </ProtectedRoute>
        }
      />

      <Route
        path="/jobs/:id"
        element={
          <ProtectedRoute>
            <JobDetails />
          </ProtectedRoute>
        }
      />

      <Route
        path="/jobs/:id/matches"
        element={
          <ProtectedRoute>
            <JobMatches />
          </ProtectedRoute>
        }
      />

      <Route
        path="/candidates"
        element={
          <ProtectedRoute>
            <Candidates />
          </ProtectedRoute>
        }
      />

      <Route
        path="/team"
        element={
          <ProtectedRoute roles={['admin', 'superadmin']}>
            <Team />
          </ProtectedRoute>
        }
      />

      <Route
        path="/fraud"
        element={
          <ProtectedRoute roles={['admin', 'superadmin']}>
            <FraudList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/institutions"
        element={
          <ProtectedRoute roles={['superadmin']}>
            <Institutions />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
}
