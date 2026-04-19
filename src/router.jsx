import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ExecutiveOverviewPage } from './pages/ExecutiveOverviewPage';
import { ErrorBudgetPage } from './pages/ErrorBudgetPage';
import { GoldenSignalsPage } from './pages/GoldenSignalsPage';
import { DependencyMapPage } from './pages/DependencyMapPage';
import { EmbeddedToolsPage } from './pages/EmbeddedToolsPage';
import { IncidentAnalyticsPage } from './pages/IncidentAnalyticsPage';
import { CompliancePage } from './pages/CompliancePage';
import { AdminPage } from './pages/AdminPage';
import { ROLES, PERMISSIONS } from './constants/roles';

/**
 * Application router configuration using React Router v6.
 *
 * Route structure:
 * - /login — Public login page (unauthenticated)
 * - / — Protected DashboardLayout wrapper with nested routes:
 *   - / (index) — Executive Overview (default landing page)
 *   - /metrics — Redirects to /golden-signals
 *   - /alerts — Redirects to /incidents
 *   - /golden-signals — Golden Signals analytics page
 *   - /error-budget — Error Budget health page
 *   - /incidents — Incident analytics page
 *   - /dependencies — Service dependency map page (alias for /metrics deep-dive)
 *   - /embedded-tools — Embedded Dynatrace/Elastic dashboards
 *   - /compliance — Compliance reporting and SOP links
 *   - /upload — Admin data upload (requires UPLOAD_DATA permission)
 *   - /configuration — Admin threshold configuration (requires CONFIGURE_THRESHOLDS permission)
 *   - /users — User management (requires MANAGE_USERS permission)
 *   - /audit-logs — Audit log viewer (requires VIEW_AUDIT_LOGS permission)
 * - * — 404 Not Found catch-all
 *
 * User Stories: SCRUM-7084 (Route Configuration), SCRUM-7085 (Protected Routes)
 */
const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <ExecutiveOverviewPage />,
      },
      {
        path: 'metrics',
        element: <Navigate to="/golden-signals" replace />,
      },
      {
        path: 'alerts',
        element: <Navigate to="/incidents" replace />,
      },
      {
        path: 'golden-signals',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_METRICS}>
            <GoldenSignalsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'error-budget',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_METRICS}>
            <ErrorBudgetPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'incidents',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_ALERTS}>
            <IncidentAnalyticsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dependencies',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_METRICS}>
            <DependencyMapPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'embedded-tools',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_METRICS}>
            <EmbeddedToolsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'compliance',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DASHBOARD}>
            <CompliancePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'upload',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.UPLOAD_DATA}>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'configuration',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.CONFIGURE_THRESHOLDS}>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.MANAGE_USERS}>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit-logs',
        element: (
          <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_AUDIT_LOGS}>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

export { router };
export default router;