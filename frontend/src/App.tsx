import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout/Layout';

const LoginPage = React.lazy(() => import('@/pages/Login'));
const DashboardPage = React.lazy(() => import('@/pages/Dashboard'));
const AgentsListPage = React.lazy(() => import('@/pages/Agents/AgentsList'));
const AgentDetailPage = React.lazy(() => import('@/pages/Agents/AgentDetail'));
const AgentCreatePage = React.lazy(() => import('@/pages/Agents/AgentCreate'));
const ProspectsListPage = React.lazy(() => import('@/pages/Prospects/ProspectsList'));
const AnalyticsPage = React.lazy(() => import('@/pages/Analytics'));
const LogsPage = React.lazy(() => import('@/pages/Logs'));
const SettingsPage = React.lazy(() => import('@/pages/Settings'));

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

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <React.Suspense fallback={null}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — wrapped in Layout via RequireAuth */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/agents"
          element={
            <RequireAuth>
              <AgentsListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/agents/new"
          element={
            <RequireAuth>
              <AgentCreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="/agents/:id"
          element={
            <RequireAuth>
              <AgentDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/prospects"
          element={
            <RequireAuth>
              <ProspectsListPage />
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
              <AnalyticsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/logs"
          element={
            <RequireAuth>
              <LogsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </React.Suspense>
  );
}
