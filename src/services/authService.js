import { v4 as uuidv4 } from 'uuid';
import {
  generateToken,
  validateToken,
  storeToken,
  getStoredToken,
  removeStoredToken,
  hasStoredToken,
  getValidatedStoredToken,
  getUserFromToken,
  getTokenTTL,
} from './tokenManager';
import {
  isSSOEnabled,
  initSSO,
  handleSSOCallback,
  initSSOLogout,
} from './ssoProvider';
import { MOCK_USERS, findMockUserByEmail } from '../constants/mockUsers';
import { ROLES, hasPermission, getPermissionsForRoles } from '../constants/roles';
import { getItem, setItem, removeItem } from '../utils/storage';

const AUTH_USER_STORAGE_KEY = 'auth_user';
const AUTH_STATUS_STORAGE_KEY = 'auth_status';

/**
 * Authentication status constants.
 */
const AUTH_STATUS = Object.freeze({
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  PENDING: 'pending',
  ERROR: 'error',
});

/**
 * Store the authenticated user object in localStorage.
 * @param {Object} user - The user object to persist.
 * @returns {boolean} True if stored successfully.
 */
const storeAuthUser = (user) => {
  if (!user || typeof user !== 'object') {
    return false;
  }

  return setItem(AUTH_USER_STORAGE_KEY, user);
};

/**
 * Retrieve the stored authenticated user object from localStorage.
 * @returns {Object|null} The stored user object or null.
 */
const getStoredAuthUser = () => {
  return getItem(AUTH_USER_STORAGE_KEY, null);
};

/**
 * Remove the stored authenticated user from localStorage.
 * @returns {boolean} True if removed successfully.
 */
const removeStoredAuthUser = () => {
  return removeItem(AUTH_USER_STORAGE_KEY);
};

/**
 * Store the current authentication status in localStorage.
 * @param {string} status - The auth status string.
 * @returns {boolean} True if stored successfully.
 */
const storeAuthStatus = (status) => {
  if (!status || typeof status !== 'string') {
    return false;
  }

  return setItem(AUTH_STATUS_STORAGE_KEY, status);
};

/**
 * Retrieve the stored authentication status from localStorage.
 * @returns {string} The stored auth status or 'unauthenticated'.
 */
const getStoredAuthStatus = () => {
  return getItem(AUTH_STATUS_STORAGE_KEY, AUTH_STATUS.UNAUTHENTICATED);
};

/**
 * Remove the stored authentication status from localStorage.
 * @returns {boolean} True if removed successfully.
 */
const removeStoredAuthStatus = () => {
  return removeItem(AUTH_STATUS_STORAGE_KEY);
};

/**
 * Clear all authentication-related data from localStorage.
 */
const clearAuthState = () => {
  removeStoredToken();
  removeStoredAuthUser();
  removeStoredAuthStatus();
};

/**
 * Authenticate a user with email and password.
 * For MVP, validates against mock users. In production, this would call a backend API
 * or delegate to the SSO provider.
 *
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password (any non-empty string accepted in MVP).
 * @returns {Promise<{ status: string, user: Object|null, token: string|null, expiresIn: number|null, error: string|null }>}
 *   Authentication result with user info, token, and expiry.
 */
const login = async (email, password) => {
  try {
    // Validate inputs
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Email is required.',
      };
    }

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Password is required.',
      };
    }

    // Validate email format (basic check)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Invalid email format.',
      };
    }

    // Check if SSO is enabled — if so, redirect to SSO flow
    if (isSSOEnabled()) {
      const ssoResult = await initSSO();

      if (ssoResult.error) {
        return {
          status: AUTH_STATUS.ERROR,
          user: null,
          token: null,
          expiresIn: null,
          error: ssoResult.error,
        };
      }

      return {
        status: AUTH_STATUS.PENDING,
        user: null,
        token: null,
        expiresIn: null,
        error: null,
        ssoLoginUrl: ssoResult.loginUrl,
      };
    }

    // ─── MVP Mock Authentication ─────────────────────────────────────
    // In production, this would POST to /api/auth/login with credentials.
    // For MVP, we look up the user in mock data and accept any non-empty password.
    const mockUser = findMockUserByEmail(email.trim());

    if (!mockUser) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Invalid email or password.',
      };
    }

    // Generate a token for the authenticated user
    const token = generateToken(mockUser);

    if (!token) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Failed to generate authentication token.',
      };
    }

    // Build the user object for storage
    const authenticatedUser = {
      id: mockUser.id,
      name: mockUser.name,
      email: mockUser.email,
      role: mockUser.role,
      avatar: mockUser.avatar,
      permissions: getPermissionsForRoles(mockUser.role),
    };

    // Persist auth state
    storeToken(token);
    storeAuthUser(authenticatedUser);
    storeAuthStatus(AUTH_STATUS.AUTHENTICATED);

    const expiresIn = getTokenTTL(token);

    return {
      status: AUTH_STATUS.AUTHENTICATED,
      user: authenticatedUser,
      token,
      expiresIn,
      error: null,
    };
  } catch (e) {
    console.error('[authService] Login failed:', e);
    clearAuthState();
    return {
      status: AUTH_STATUS.ERROR,
      user: null,
      token: null,
      expiresIn: null,
      error: 'An unexpected error occurred during login. Please try again.',
    };
  }
};

/**
 * Handle SSO callback after the identity provider redirects back.
 * Exchanges the authorization code for user info and establishes a session.
 *
 * @param {Object} callbackParams - The callback parameters from the identity provider.
 * @param {string} [callbackParams.code] - The authorization code.
 * @param {string} [callbackParams.state] - The state parameter for CSRF validation.
 * @param {string} [callbackParams.error] - Error code from the IdP.
 * @param {string} [callbackParams.error_description] - Error description from the IdP.
 * @returns {Promise<{ status: string, user: Object|null, token: string|null, expiresIn: number|null, error: string|null }>}
 */
const handleSSOLogin = async (callbackParams = {}) => {
  try {
    const ssoResult = await handleSSOCallback(callbackParams);

    if (ssoResult.error || !ssoResult.user) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: ssoResult.error || 'SSO authentication failed.',
      };
    }

    const ssoUser = ssoResult.user;

    // Generate a token for the SSO user
    const token = generateToken(ssoUser);

    if (!token) {
      return {
        status: AUTH_STATUS.ERROR,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Failed to generate authentication token after SSO login.',
      };
    }

    // Build the user object for storage
    const authenticatedUser = {
      id: ssoUser.id,
      name: ssoUser.name,
      email: ssoUser.email,
      role: ssoUser.role,
      avatar: ssoUser.avatar || (ssoUser.name ? ssoUser.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'),
      permissions: getPermissionsForRoles(ssoUser.role),
    };

    // Persist auth state
    storeToken(token);
    storeAuthUser(authenticatedUser);
    storeAuthStatus(AUTH_STATUS.AUTHENTICATED);

    const expiresIn = getTokenTTL(token);

    return {
      status: AUTH_STATUS.AUTHENTICATED,
      user: authenticatedUser,
      token,
      expiresIn,
      error: null,
    };
  } catch (e) {
    console.error('[authService] SSO login failed:', e);
    clearAuthState();
    return {
      status: AUTH_STATUS.ERROR,
      user: null,
      token: null,
      expiresIn: null,
      error: 'An unexpected error occurred during SSO login. Please try again.',
    };
  }
};

/**
 * Log out the current user. Clears all auth state from localStorage.
 * If SSO is enabled, also initiates SSO logout.
 *
 * @returns {Promise<{ status: string, logoutUrl: string|null, error: string|null }>}
 *   Logout result. If SSO is enabled, includes the IdP logout URL for redirect.
 */
const logout = async () => {
  try {
    let logoutUrl = null;

    // If SSO is enabled, initiate SSO logout
    if (isSSOEnabled()) {
      const token = getStoredToken();
      const ssoLogoutResult = await initSSOLogout({ idToken: token });

      if (ssoLogoutResult.logoutUrl) {
        logoutUrl = ssoLogoutResult.logoutUrl;
      }
    }

    // Clear all local auth state
    clearAuthState();

    return {
      status: AUTH_STATUS.UNAUTHENTICATED,
      logoutUrl,
      error: null,
    };
  } catch (e) {
    console.error('[authService] Logout failed:', e);

    // Always clear local state even if SSO logout fails
    clearAuthState();

    return {
      status: AUTH_STATUS.UNAUTHENTICATED,
      logoutUrl: null,
      error: 'Logout completed with warnings. SSO session may still be active.',
    };
  }
};

/**
 * Validate the current session by checking the stored token.
 * Returns the current user if the session is valid, or an error if expired/invalid.
 *
 * @returns {Promise<{ status: string, user: Object|null, token: string|null, expiresIn: number|null, error: string|null }>}
 *   Session validation result.
 */
const validateSession = async () => {
  try {
    // Check if a token exists
    if (!hasStoredToken()) {
      return {
        status: AUTH_STATUS.UNAUTHENTICATED,
        user: null,
        token: null,
        expiresIn: null,
        error: 'No active session found.',
      };
    }

    // Validate the stored token
    const tokenResult = getValidatedStoredToken();

    if (!tokenResult.valid || !tokenResult.token) {
      // Token is invalid or expired — clear auth state
      clearAuthState();

      return {
        status: AUTH_STATUS.UNAUTHENTICATED,
        user: null,
        token: null,
        expiresIn: null,
        error: tokenResult.error || 'Session is invalid or expired.',
      };
    }

    // Extract user from token
    const tokenUser = getUserFromToken(tokenResult.token);

    if (!tokenUser) {
      clearAuthState();

      return {
        status: AUTH_STATUS.UNAUTHENTICATED,
        user: null,
        token: null,
        expiresIn: null,
        error: 'Unable to extract user information from session token.',
      };
    }

    // Retrieve the stored user object for additional fields (avatar, etc.)
    const storedUser = getStoredAuthUser();

    // Build the validated user object, preferring stored user data but
    // using token claims as the authoritative source for role/permissions
    const validatedUser = {
      id: tokenUser.id,
      name: tokenUser.name || (storedUser ? storedUser.name : ''),
      email: tokenUser.email || (storedUser ? storedUser.email : ''),
      role: tokenUser.role,
      avatar: storedUser ? storedUser.avatar : (tokenUser.name ? tokenUser.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'),
      permissions: tokenUser.permissions || getPermissionsForRoles(tokenUser.role),
    };

    // Update stored user in case token has newer role/permission data
    storeAuthUser(validatedUser);
    storeAuthStatus(AUTH_STATUS.AUTHENTICATED);

    const expiresIn = getTokenTTL(tokenResult.token);

    return {
      status: AUTH_STATUS.AUTHENTICATED,
      user: validatedUser,
      token: tokenResult.token,
      expiresIn,
      error: null,
    };
  } catch (e) {
    console.error('[authService] Session validation failed:', e);
    clearAuthState();

    return {
      status: AUTH_STATUS.UNAUTHENTICATED,
      user: null,
      token: null,
      expiresIn: null,
      error: 'An unexpected error occurred during session validation.',
    };
  }
};

/**
 * Get the current authenticated user from localStorage.
 * This is a synchronous, lightweight check that does NOT validate the token.
 * Use validateSession() for a full validation check.
 *
 * @returns {Object|null} The current user object or null if not authenticated.
 */
const getCurrentUser = () => {
  try {
    const status = getStoredAuthStatus();

    if (status !== AUTH_STATUS.AUTHENTICATED) {
      return null;
    }

    const user = getStoredAuthUser();

    if (!user || !user.id || !user.role) {
      return null;
    }

    return user;
  } catch (_e) {
    return null;
  }
};

/**
 * Check if the current user is authenticated.
 * This is a synchronous, lightweight check based on stored auth status and token presence.
 *
 * @returns {boolean} True if the user appears to be authenticated.
 */
const isAuthenticated = () => {
  try {
    const status = getStoredAuthStatus();

    if (status !== AUTH_STATUS.AUTHENTICATED) {
      return false;
    }

    return hasStoredToken();
  } catch (_e) {
    return false;
  }
};

/**
 * Check if the current authenticated user has a specific permission.
 *
 * @param {string} permission - The permission to check (from PERMISSIONS constants).
 * @returns {boolean} True if the current user has the specified permission.
 */
const currentUserHasPermission = (permission) => {
  if (!permission) {
    return false;
  }

  const user = getCurrentUser();

  if (!user || !user.role) {
    return false;
  }

  return hasPermission(user.role, permission);
};

/**
 * Get the current authentication status.
 *
 * @returns {string} The current auth status string.
 */
const getAuthStatus = () => {
  return getStoredAuthStatus();
};

/**
 * Get the current stored token.
 * Returns null if no token is stored or if the user is not authenticated.
 *
 * @returns {string|null} The current token or null.
 */
const getToken = () => {
  if (!isAuthenticated()) {
    return null;
  }

  return getStoredToken();
};

export {
  AUTH_STATUS,
  login,
  logout,
  validateSession,
  getCurrentUser,
  isAuthenticated,
  currentUserHasPermission,
  getAuthStatus,
  getToken,
  handleSSOLogin,
  clearAuthState,
};