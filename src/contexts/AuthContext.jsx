import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AUTH_STATUS,
  login as authLogin,
  logout as authLogout,
  validateSession,
  getCurrentUser,
  isAuthenticated as checkIsAuthenticated,
  currentUserHasPermission,
  getAuthStatus,
  handleSSOLogin,
  clearAuthState,
} from '../services/authService';
import { logAction, AUDIT_ACTIONS, AUDIT_RESULTS } from '../services/auditLogger';
import { getPermissionsForRoles } from '../constants/roles';

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(AUTH_STATUS.PENDING);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [expiresIn, setExpiresIn] = useState(null);

  const isAuthenticated = authStatus === AUTH_STATUS.AUTHENTICATED && currentUser !== null;

  const role = currentUser?.role ?? null;

  const permissions = useMemo(() => {
    if (!role) {
      return [];
    }
    return getPermissionsForRoles(role);
  }, [role]);

  /**
   * Validate the existing session on mount.
   */
  const initializeAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await validateSession();

      if (result.status === AUTH_STATUS.AUTHENTICATED && result.user) {
        setCurrentUser(result.user);
        setAuthStatus(AUTH_STATUS.AUTHENTICATED);
        setToken(result.token);
        setExpiresIn(result.expiresIn);

        logAction(result.user.id, AUDIT_ACTIONS.SESSION_VALIDATED, 'session', {
          user_name: result.user.name,
          user_email: result.user.email,
          status: AUDIT_RESULTS.SUCCESS,
          description: 'Session validated on application load',
        });
      } else {
        setCurrentUser(null);
        setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
        setToken(null);
        setExpiresIn(null);
      }
    } catch (_e) {
      setCurrentUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
      setToken(null);
      setExpiresIn(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  /**
   * Log in with email and password.
   * @param {string} email - The user's email address.
   * @param {string} password - The user's password.
   * @returns {Promise<{ success: boolean, error: string|null, ssoLoginUrl: string|null }>}
   */
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authLogin(email, password);

      if (result.status === AUTH_STATUS.AUTHENTICATED && result.user) {
        setCurrentUser(result.user);
        setAuthStatus(AUTH_STATUS.AUTHENTICATED);
        setToken(result.token);
        setExpiresIn(result.expiresIn);

        logAction(result.user.id, AUDIT_ACTIONS.LOGIN, 'auth', {
          user_name: result.user.name,
          user_email: result.user.email,
          status: AUDIT_RESULTS.SUCCESS,
          description: `User ${result.user.email} logged in successfully`,
        });

        return { success: true, error: null, ssoLoginUrl: null };
      }

      if (result.status === AUTH_STATUS.PENDING && result.ssoLoginUrl) {
        setAuthStatus(AUTH_STATUS.PENDING);
        return { success: false, error: null, ssoLoginUrl: result.ssoLoginUrl };
      }

      const errorMessage = result.error || 'Login failed. Please try again.';
      setError(errorMessage);
      setAuthStatus(AUTH_STATUS.ERROR);

      logAction('unknown', AUDIT_ACTIONS.LOGIN, 'auth', {
        user_email: email,
        status: AUDIT_RESULTS.FAILURE,
        description: `Login failed for ${email}: ${errorMessage}`,
      });

      return { success: false, error: errorMessage, ssoLoginUrl: null };
    } catch (e) {
      const errorMessage = 'An unexpected error occurred during login.';
      setError(errorMessage);
      setAuthStatus(AUTH_STATUS.ERROR);
      console.error('[AuthContext] Login error:', e);
      return { success: false, error: errorMessage, ssoLoginUrl: null };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Handle SSO callback after identity provider redirect.
   * @param {Object} callbackParams - The callback parameters from the IdP.
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  const handleSSOCallback = useCallback(async (callbackParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await handleSSOLogin(callbackParams);

      if (result.status === AUTH_STATUS.AUTHENTICATED && result.user) {
        setCurrentUser(result.user);
        setAuthStatus(AUTH_STATUS.AUTHENTICATED);
        setToken(result.token);
        setExpiresIn(result.expiresIn);

        logAction(result.user.id, AUDIT_ACTIONS.LOGIN, 'sso', {
          user_name: result.user.name,
          user_email: result.user.email,
          status: AUDIT_RESULTS.SUCCESS,
          description: `SSO login successful for ${result.user.email}`,
        });

        return { success: true, error: null };
      }

      const errorMessage = result.error || 'SSO login failed.';
      setError(errorMessage);
      setAuthStatus(AUTH_STATUS.ERROR);
      return { success: false, error: errorMessage };
    } catch (e) {
      const errorMessage = 'An unexpected error occurred during SSO login.';
      setError(errorMessage);
      setAuthStatus(AUTH_STATUS.ERROR);
      console.error('[AuthContext] SSO callback error:', e);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Log out the current user.
   * @returns {Promise<{ success: boolean, logoutUrl: string|null }>}
   */
  const logout = useCallback(async () => {
    const userId = currentUser?.id || 'unknown';
    const userName = currentUser?.name || '';
    const userEmail = currentUser?.email || '';

    setIsLoading(true);
    setError(null);

    try {
      logAction(userId, AUDIT_ACTIONS.LOGOUT, 'auth', {
        user_name: userName,
        user_email: userEmail,
        status: AUDIT_RESULTS.SUCCESS,
        description: `User ${userEmail || userId} logged out`,
      });

      const result = await authLogout();

      setCurrentUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
      setToken(null);
      setExpiresIn(null);

      return { success: true, logoutUrl: result.logoutUrl || null };
    } catch (e) {
      console.error('[AuthContext] Logout error:', e);

      setCurrentUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
      setToken(null);
      setExpiresIn(null);

      return { success: true, logoutUrl: null };
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  /**
   * Check if the current user has a specific permission.
   * @param {string} permission - The permission to check.
   * @returns {boolean} True if the user has the permission.
   */
  const hasPermission = useCallback(
    (permission) => {
      if (!isAuthenticated || !currentUser) {
        return false;
      }

      return currentUserHasPermission(permission);
    },
    [isAuthenticated, currentUser],
  );

  /**
   * Clear any authentication error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Force re-validate the current session.
   * @returns {Promise<boolean>} True if session is still valid.
   */
  const refreshSession = useCallback(async () => {
    try {
      const result = await validateSession();

      if (result.status === AUTH_STATUS.AUTHENTICATED && result.user) {
        setCurrentUser(result.user);
        setAuthStatus(AUTH_STATUS.AUTHENTICATED);
        setToken(result.token);
        setExpiresIn(result.expiresIn);
        return true;
      }

      setCurrentUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
      setToken(null);
      setExpiresIn(null);
      return false;
    } catch (_e) {
      setCurrentUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
      setToken(null);
      setExpiresIn(null);
      return false;
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      currentUser,
      isAuthenticated,
      isLoading,
      authStatus,
      error,
      role,
      permissions,
      token,
      expiresIn,
      login,
      logout,
      handleSSOCallback,
      hasPermission,
      clearError,
      refreshSession,
    }),
    [
      currentUser,
      isAuthenticated,
      isLoading,
      authStatus,
      error,
      role,
      permissions,
      token,
      expiresIn,
      login,
      logout,
      handleSSOCallback,
      hasPermission,
      clearError,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

/**
 * Custom hook to access the authentication context.
 * Must be used within an AuthProvider.
 * @returns {Object} The authentication context value.
 */
const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider. Wrap your component tree with <AuthProvider>.');
  }

  return context;
};

export { AuthContext, AuthProvider, useAuth };