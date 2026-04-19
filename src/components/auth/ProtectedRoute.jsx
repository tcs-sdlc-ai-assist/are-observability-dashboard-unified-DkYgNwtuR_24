import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { hasMinimumRole } from '../../constants/roles';

/**
 * ProtectedRoute - Route guard component that enforces authentication and
 * optional role-based access control.
 *
 * Behavior:
 * - If the user is not authenticated, redirects to /login with the current
 *   location stored in state for post-login redirect.
 * - If a minimumRole is specified and the user's role is insufficient,
 *   renders a forbidden message.
 * - If a requiredPermission is specified and the user lacks it, renders
 *   a forbidden message.
 * - Otherwise, renders the children.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The protected content to render.
 * @param {string} [props.minimumRole] - The minimum role required (from ROLES constants).
 * @param {string} [props.requiredPermission] - A specific permission required (from PERMISSIONS constants).
 * @param {React.ReactNode} [props.fallback] - Optional custom fallback UI while loading.
 * @param {React.ReactNode} [props.forbiddenFallback] - Optional custom UI for forbidden state.
 * @returns {React.ReactNode}
 */
const ProtectedRoute = ({
  children,
  minimumRole,
  requiredPermission,
  fallback,
  forbiddenFallback,
}) => {
  const { isAuthenticated, isLoading, currentUser, role, hasPermission } = useAuth();
  const location = useLocation();

  const accessCheck = useMemo(() => {
    if (isLoading) {
      return { allowed: false, reason: 'loading' };
    }

    if (!isAuthenticated || !currentUser) {
      return { allowed: false, reason: 'unauthenticated' };
    }

    if (minimumRole && role) {
      const meetsMinimum = hasMinimumRole(role, minimumRole);
      if (!meetsMinimum) {
        return { allowed: false, reason: 'forbidden' };
      }
    }

    if (requiredPermission) {
      const hasRequiredPermission = hasPermission(requiredPermission);
      if (!hasRequiredPermission) {
        return { allowed: false, reason: 'forbidden' };
      }
    }

    return { allowed: true, reason: null };
  }, [isLoading, isAuthenticated, currentUser, role, minimumRole, requiredPermission, hasPermission]);

  // Loading state
  if (accessCheck.reason === 'loading') {
    if (fallback) {
      return fallback;
    }

    return (
      <div className="flex items-center justify-center min-h-screen-content bg-dashboard-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-dashboard-text-secondary">Verifying access…</p>
        </div>
      </div>
    );
  }

  // Unauthenticated — redirect to login
  if (accessCheck.reason === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Forbidden — insufficient role or permission
  if (accessCheck.reason === 'forbidden') {
    if (forbiddenFallback) {
      return forbiddenFallback;
    }

    return (
      <div className="flex items-center justify-center min-h-screen-content bg-dashboard-bg">
        <div className="dashboard-panel max-w-md w-full text-center">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-red-50">
            <svg
              className="w-8 h-8 text-severity-critical"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-dashboard-text-primary mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-dashboard-text-secondary mb-6">
            You do not have sufficient permissions to access this page. Please contact your
            administrator if you believe this is an error.
          </p>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors duration-150"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Access granted
  return children;
};

export { ProtectedRoute };
export default ProtectedRoute;