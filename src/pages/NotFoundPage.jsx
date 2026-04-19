import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/shared/StatusBadge';

/**
 * NotFoundPage - 404 Not Found error page with Horizon branding, descriptive
 * message, and navigation link back to the dashboard home.
 *
 * Features:
 * - Horizon logo and branding consistent with LoginPage
 * - 404 status code display with descriptive message
 * - "Return to Dashboard" primary action button
 * - "Go to Login" secondary action when not authenticated
 * - Status badge indicating the error state
 * - Accessible with appropriate ARIA attributes
 * - Responsive layout centered on the page
 *
 * @returns {React.ReactNode}
 */
const NotFoundPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  /**
   * Navigate back to the dashboard home page.
   */
  const handleGoHome = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  /**
   * Navigate to the login page.
   */
  const handleGoLogin = useCallback(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  /**
   * Navigate back in browser history.
   */
  const handleGoBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-dashboard-bg px-4 py-8">
      <div className="w-full max-w-md">
        {/* Branding Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4 shadow-panel">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-dashboard-text-primary tracking-tight">
            Horizon
          </h1>
          <p className="text-sm text-dashboard-text-muted mt-1">
            ARE Observability Dashboard
          </p>
        </div>

        {/* 404 Card */}
        <div className="dashboard-panel text-center">
          {/* Status Badge */}
          <div className="flex items-center justify-center mb-4">
            <StatusBadge status="critical" size="sm" label="Page Not Found" />
          </div>

          {/* 404 Icon */}
          <div className="flex items-center justify-center w-20 h-20 mx-auto mb-5 rounded-full bg-red-50">
            <svg
              className="w-10 h-10 text-severity-critical"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Error Code */}
          <h2 className="text-5xl font-bold text-dashboard-text-primary tracking-tight mb-2">
            404
          </h2>

          {/* Title */}
          <h3 className="text-lg font-semibold text-dashboard-text-primary mb-2">
            Page Not Found
          </h3>

          {/* Description */}
          <p className="text-sm text-dashboard-text-secondary mb-6 max-w-sm mx-auto">
            The page you are looking for does not exist or has been moved. Please check the URL
            or navigate back to the dashboard.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {/* Primary: Return to Dashboard */}
            <button
              onClick={handleGoHome}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors duration-150"
              aria-label="Return to Dashboard"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
              Return to Dashboard
            </button>

            {/* Secondary: Go Back */}
            <button
              onClick={handleGoBack}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 hover:text-dashboard-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors duration-150"
              aria-label="Go back to previous page"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                />
              </svg>
              Go Back
            </button>

            {/* Tertiary: Go to Login (only when not authenticated) */}
            {!isAuthenticated && (
              <button
                onClick={handleGoLogin}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors duration-150"
                aria-label="Go to login page"
              >
                Sign in to your account
              </button>
            )}
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-xs text-dashboard-text-muted">
            If you believe this is an error, please contact your administrator or check the URL
            for typos.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 mt-8 text-xs text-dashboard-text-muted">
          <span>© {new Date().getFullYear()} Horizon</span>
          <span>·</span>
          <span>ARE Observability Platform</span>
        </div>
      </div>
    </div>
  );
};

export { NotFoundPage };
export default NotFoundPage;