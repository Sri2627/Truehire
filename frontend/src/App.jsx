import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Pricing from './pages/Pricing.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetails from './pages/JobDetails.jsx';
import JobMatches from './pages/JobMatches.jsx';
import CandidateInterview from './pages/CandidateInterview.jsx';
import Candidates from './pages/Candidates.jsx';
import Team from './pages/Team.jsx';
import FraudList from './pages/FraudList.jsx';
import Institutions from './pages/Institutions.jsx';
import SuperAdminDashboard from './pages/SuperAdminDashboard.jsx';
import PlatformFraudList from './pages/PlatformFraudList.jsx';
import Revenue from './pages/Revenue.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// A superadmin has no institution's dashboard of its own to land on - it
// gets its own platform-wide dashboard instead of /dashboard (which is
// entirely institution-scoped: candidate stats, jobs, etc.). Everyone
// else keeps the normal default of /dashboard.
function DefaultRedirect() {
  const { user } = useAuth();
  const target = user?.role === 'superadmin' ? '/superadmin' : '/dashboard';
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pricing" element={<Pricing />} />
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
        path="/jobs/:jobId/candidates/:candidateId/interview"
        element={
          <ProtectedRoute>
            <CandidateInterview />
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
        path="/superadmin"
        element={
          <ProtectedRoute roles={['superadmin']}>
            <SuperAdminDashboard />
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

      <Route
        path="/superadmin/fraud"
        element={
          <ProtectedRoute roles={['superadmin']}>
            <PlatformFraudList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superadmin/revenue"
        element={
          <ProtectedRoute roles={['superadmin']}>
            <Revenue />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
}
