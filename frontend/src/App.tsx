import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Placeholder pages — will be replaced in subsequent groups
const LoginPage = React.lazy(() =>
  Promise.resolve({
    default: () => (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-card">
          <h1 className="mb-2 text-2xl font-semibold text-gray-900">LinkedIn Platform</h1>
          <p className="text-sm text-gray-500">Login page — coming in G13</p>
        </div>
      </div>
    ),
  }),
);

const DashboardPage = React.lazy(() =>
  Promise.resolve({
    default: () => (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Dashboard — coming in G14</p>
      </div>
    ),
  }),
);

/** Wrapper that redirects unauthenticated users to /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <React.Suspense fallback={null}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/agents/*"
          element={
            <RequireAuth>
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Agents — coming soon</h1>
              </div>
            </RequireAuth>
          }
        />
        <Route
          path="/prospects/*"
          element={
            <RequireAuth>
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Prospects — coming soon</h1>
              </div>
            </RequireAuth>
          }
        />
        <Route
          path="/identities/*"
          element={
            <RequireAuth>
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Identities — coming soon</h1>
              </div>
            </RequireAuth>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireAuth>
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Analytics — coming soon</h1>
              </div>
            </RequireAuth>
          }
        />
        <Route
          path="/logs"
          element={
            <RequireAuth>
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Logs — coming soon</h1>
              </div>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <div className="p-8">
                <h1 className="text-2xl font-semibold">Settings — coming soon</h1>
              </div>
            </RequireAuth>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}
