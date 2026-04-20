import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_USERS } from '../constants/mockUsers';
import { ROLE_LABELS } from '../constants/roles';
import { isSSOEnabled } from '../services/ssoProvider';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import logoUrl from '../assets/logo.png';

/**
 * LoginPage - User authentication login screen with email/password form,
 * role selection hints, Horizon branding, and SSO button placeholder.
 * Redirects to the dashboard (or the originally requested page) on success.
 *
 * Features:
 * - Email and password input fields with validation
 * - Mock user role selection hints for quick login
 * - Horizon branding with logo and tagline
 * - SSO login button placeholder (enabled via env var)
 * - Error message display for failed login attempts
 * - Loading state during authentication
 * - Redirects to the originally requested route after login
 * - Redirects away if already authenticated
 * - Accessible with appropriate ARIA attributes
 * - Responsive layout centered on the page
 *
 * @returns {React.ReactNode}
 */
const LoginPage = () => {
  const { login, isAuthenticated, isLoading: authLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Determine the redirect path after successful login.
   * Uses the `from` location state if available, otherwise defaults to '/'.
   */
  const redirectPath = useMemo(() => {
    return location.state?.from?.pathname || '/';
  }, [location.state]);

  /**
   * Whether SSO is enabled via environment configuration.
   */
  const ssoEnabled = useMemo(() => {
    return isSSOEnabled();
  }, []);

  /**
   * Redirect to dashboard if already authenticated.
   */
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, redirectPath]);

  /**
   * Clear errors when the user starts typing.
   */
  useEffect(() => {
    if (localError) {
      setLocalError(null);
    }
    if (authError) {
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  /**
   * Validate the login form inputs.
   * @returns {{ valid: boolean, error: string|null }}
   */
  const validateForm = useCallback(() => {
    if (!email || email.trim().length === 0) {
      return { valid: false, error: 'Email is required.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return { valid: false, error: 'Please enter a valid email address.' };
    }

    if (!password || password.trim().length === 0) {
      return { valid: false, error: 'Password is required.' };
    }

    return { valid: true, error: null };
  }, [email, password]);

  /**
   * Handle form submission for email/password login.
   */
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      const validation = validateForm();
      if (!validation.valid) {
        setLocalError(validation.error);
        return;
      }

      setIsSubmitting(true);
      setLocalError(null);

      try {
        const result = await login(email.trim(), password);

        if (result.success) {
          navigate(redirectPath, { replace: true });
        } else if (result.ssoLoginUrl) {
          // SSO redirect
          window.location.href = result.ssoLoginUrl;
        } else {
          setLocalError(result.error || 'Login failed. Please try again.');
        }
      } catch (_e) {
        setLocalError('An unexpected error occurred. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, login, navigate, redirectPath, validateForm],
  );

  /**
   * Handle SSO login button click.
   */
  const handleSSOLogin = useCallback(async () => {
    setIsSubmitting(true);
    setLocalError(null);

    try {
      // Attempt login with empty password to trigger SSO flow
      const result = await login(email.trim() || 'sso@horizon.com', 'sso');

      if (result.ssoLoginUrl) {
        window.location.href = result.ssoLoginUrl;
      } else if (result.success) {
        navigate(redirectPath, { replace: true });
      } else {
        setLocalError(result.error || 'SSO login is not available.');
      }
    } catch (_e) {
      setLocalError('SSO login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, login, navigate, redirectPath]);

  /**
   * Handle quick login with a mock user.
   * @param {Object} user - The mock user object.
   */
  const handleQuickLogin = useCallback(
    (user) => {
      setEmail(user.email);
      setPassword('password');
      setLocalError(null);
    },
    [],
  );

  /**
   * Toggle password visibility.
   */
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  /**
   * Handle email input change.
   */
  const handleEmailChange = useCallback((e) => {
    setEmail(e.target.value);
  }, []);

  /**
   * Handle password input change.
   */
  const handlePasswordChange = useCallback((e) => {
    setPassword(e.target.value);
  }, []);

  /**
   * Get the role badge color class for a mock user.
   */
  const getRoleBadgeClass = useCallback((role) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'ARE_LEAD':
        return 'bg-brand-100 text-brand-800';
      case 'VIEW_ONLY':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }, []);

  const displayError = localError || authError;
  const isFormDisabled = isSubmitting || authLoading;

  // Show loading spinner while checking initial auth state
  if (authLoading && !isSubmitting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg">
        <LoadingSpinner message="Checking authentication…" size="md" />
      </div>
    );
  }

  // Don't render login form if already authenticated (redirect will happen via useEffect)
  if (isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg">
        <LoadingSpinner message="Redirecting…" size="md" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-dashboard-bg px-4 py-8">
      <div className="w-full max-w-md">
        {/* Branding Header */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={logoUrl}
            alt="Horizon Logo"
            className="object-contain bg-white rounded-md p-2 shadow-sm mb-3"
            style={{ width: '204px', height: '72px' }}
          />
          <p className="text-sm text-dashboard-text-muted">
            ARE Observability Dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="dashboard-panel">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-dashboard-text-primary">
              Sign in to your account
            </h2>
            <p className="text-sm text-dashboard-text-muted mt-1">
              Enter your credentials to access the dashboard
            </p>
          </div>

          {/* Error Display */}
          {displayError && (
            <div className="flex items-start gap-3 px-4 py-3 mb-4 rounded-lg bg-red-50 border border-red-200 animate-fade-in">
              <svg
                className="w-5 h-5 text-severity-critical flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-800">Authentication Failed</p>
                <p className="text-sm text-red-700 mt-0.5">{displayError}</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Email Field */}
            <div className="mb-4">
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-dashboard-text-primary mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-dashboard-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                    />
                  </svg>
                </div>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="you@horizon.com"
                  autoComplete="email"
                  autoFocus
                  disabled={isFormDisabled}
                  className={`w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:border-brand-500 transition-colors duration-150 ${
                    displayError
                      ? 'border-severity-critical focus:ring-red-500/20'
                      : 'border-dashboard-border focus:ring-brand-500/20'
                  } ${isFormDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                  aria-label="Email address"
                  aria-invalid={Boolean(displayError)}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="mb-6">
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-dashboard-text-primary mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-dashboard-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isFormDisabled}
                  className={`w-full pl-10 pr-10 py-2.5 text-sm bg-gray-50 border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:border-brand-500 transition-colors duration-150 ${
                    displayError
                      ? 'border-severity-critical focus:ring-red-500/20'
                      : 'border-dashboard-border focus:ring-brand-500/20'
                  } ${isFormDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                  aria-label="Password"
                  aria-invalid={Boolean(displayError)}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-dashboard-text-muted hover:text-dashboard-text-secondary transition-colors duration-150"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
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
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isFormDisabled}
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors duration-150 ${
                isFormDisabled
                  ? 'bg-brand-400 cursor-not-allowed opacity-70'
                  : 'bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2'
              }`}
              aria-label="Sign in"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
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
                      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                    />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* SSO Divider & Button */}
          {ssoEnabled && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-dashboard-border" />
                <span className="text-xs text-dashboard-text-muted font-medium uppercase tracking-wider">
                  or
                </span>
                <div className="flex-1 h-px bg-dashboard-border" />
              </div>

              <button
                onClick={handleSSOLogin}
                disabled={isFormDisabled}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors duration-150 ${
                  isFormDisabled
                    ? 'bg-gray-50 text-dashboard-text-muted border-dashboard-border cursor-not-allowed opacity-70'
                    : 'bg-white text-dashboard-text-primary border-dashboard-border hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2'
                }`}
                aria-label="Sign in with SSO"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
                Sign in with SSO
              </button>
            </>
          )}

          {/* SSO Placeholder (when not enabled) */}
          {!ssoEnabled && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-dashboard-border" />
                <span className="text-xs text-dashboard-text-muted font-medium uppercase tracking-wider">
                  or
                </span>
                <div className="flex-1 h-px bg-dashboard-border" />
              </div>

              <button
                disabled
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium rounded-lg border bg-gray-50 text-dashboard-text-muted border-dashboard-border cursor-not-allowed opacity-60"
                aria-label="SSO not configured"
                title="SSO is not configured. Set VITE_SSO_ENABLED=true in your .env file."
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
                SSO Not Configured
              </button>
            </>
          )}
        </div>

        {/* Quick Login Hints */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-4 h-4 text-dashboard-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
              Demo Accounts
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {MOCK_USERS.map((user) => (
              <button
                key={user.id}
                onClick={() => handleQuickLogin(user)}
                disabled={isFormDisabled}
                className={`flex items-center justify-between gap-3 w-full px-4 py-3 rounded-lg border bg-white text-left transition-all duration-150 ${
                  isFormDisabled
                    ? 'opacity-50 cursor-not-allowed border-dashboard-border'
                    : email === user.email
                      ? 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/30'
                      : 'border-dashboard-border hover:border-gray-300 hover:bg-gray-50 hover:shadow-card'
                }`}
                aria-label={`Quick login as ${user.name} (${ROLE_LABELS[user.role] || user.role})`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 text-white text-xs font-semibold flex-shrink-0">
                    {user.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-dashboard-text-primary truncate">
                      {user.name}
                    </p>
                    <p className="text-xs text-dashboard-text-muted truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 flex-shrink-0 ${getRoleBadgeClass(user.role)}`}
                >
                  {ROLE_LABELS[user.role] || user.role}
                </span>
              </button>
            ))}
          </div>

          <p className="text-[10px] text-dashboard-text-muted text-center mt-3">
            Click a demo account to pre-fill credentials, then click{' '}
            <span className="font-medium">Sign In</span>. Any password is accepted.
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

export { LoginPage };
export default LoginPage;