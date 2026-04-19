import { v4 as uuidv4 } from 'uuid';
import { ROLES } from '../constants/roles';
import { findMockUserByEmail } from '../constants/mockUsers';

const SSO_CONFIG = Object.freeze({
  enabled: import.meta.env.VITE_SSO_ENABLED === 'true',
  clientId: import.meta.env.VITE_SSO_CLIENT_ID || '',
  authority: import.meta.env.VITE_SSO_AUTHORITY || '',
  redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
  responseType: 'code',
  scope: 'openid profile email',
});

const SSO_STATUS = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
});

/**
 * Check if SSO is enabled based on environment configuration.
 * @returns {boolean} True if SSO is enabled.
 */
const isSSOEnabled = () => {
  return SSO_CONFIG.enabled;
};

/**
 * Get the current SSO configuration (safe subset, no secrets).
 * @returns {{ enabled: boolean, clientId: string, authority: string, redirectUri: string }}
 */
const getSSOConfig = () => {
  return {
    enabled: SSO_CONFIG.enabled,
    clientId: SSO_CONFIG.clientId,
    authority: SSO_CONFIG.authority,
    redirectUri: SSO_CONFIG.redirectUri,
  };
};

/**
 * Build the SSO login URL for redirecting the user to the identity provider.
 * For MVP, returns a mock URL. Structured for future Okta/OIDC integration.
 * @param {Object} [options] - Options for building the login URL.
 * @param {string} [options.state] - An opaque state value for CSRF protection. Auto-generated if omitted.
 * @param {string} [options.nonce] - A nonce value for token validation. Auto-generated if omitted.
 * @param {string} [options.redirectUri] - Override the default redirect URI.
 * @returns {{ url: string, state: string, nonce: string }} The login URL and associated state/nonce values.
 */
const getSSOLoginUrl = (options = {}) => {
  const state = options.state || uuidv4();
  const nonce = options.nonce || uuidv4();
  const redirectUri = options.redirectUri || SSO_CONFIG.redirectUri;

  if (!SSO_CONFIG.enabled || !SSO_CONFIG.authority) {
    return {
      url: '',
      state,
      nonce,
      error: 'SSO is not enabled or authority is not configured.',
    };
  }

  // For future Okta/OIDC integration, build the authorization URL
  const params = new URLSearchParams({
    client_id: SSO_CONFIG.clientId,
    response_type: SSO_CONFIG.responseType,
    scope: SSO_CONFIG.scope,
    redirect_uri: redirectUri,
    state,
    nonce,
  });

  const url = `${SSO_CONFIG.authority}/authorize?${params.toString()}`;

  return {
    url,
    state,
    nonce,
    error: null,
  };
};

/**
 * Initialize the SSO flow. Stores state/nonce for later validation and returns
 * the login URL for redirect.
 * For MVP, returns a mock successful initialization.
 * @param {Object} [options] - Initialization options.
 * @param {string} [options.redirectUri] - Override the default redirect URI.
 * @returns {Promise<{ status: string, loginUrl: string, state: string, nonce: string, error: string|null }>}
 */
const initSSO = async (options = {}) => {
  try {
    if (!SSO_CONFIG.enabled) {
      return {
        status: SSO_STATUS.ERROR,
        loginUrl: '',
        state: '',
        nonce: '',
        error: 'SSO is not enabled. Use standard login instead.',
      };
    }

    const loginUrlResult = getSSOLoginUrl(options);

    if (loginUrlResult.error) {
      return {
        status: SSO_STATUS.ERROR,
        loginUrl: '',
        state: '',
        nonce: '',
        error: loginUrlResult.error,
      };
    }

    // In a real implementation, store state and nonce in sessionStorage
    // for CSRF and replay protection during the callback phase
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('sso_state', loginUrlResult.state);
        window.sessionStorage.setItem('sso_nonce', loginUrlResult.nonce);
      }
    } catch (_e) {
      // sessionStorage may not be available; continue without storing
    }

    return {
      status: SSO_STATUS.PENDING,
      loginUrl: loginUrlResult.url,
      state: loginUrlResult.state,
      nonce: loginUrlResult.nonce,
      error: null,
    };
  } catch (e) {
    console.error('[ssoProvider] Failed to initialize SSO:', e);
    return {
      status: SSO_STATUS.ERROR,
      loginUrl: '',
      state: '',
      nonce: '',
      error: 'Failed to initialize SSO. Please try again.',
    };
  }
};

/**
 * Handle the SSO callback after the identity provider redirects back.
 * Validates the authorization code and state, then exchanges for user info.
 * For MVP, returns a mock user response based on the provided email or a default mock user.
 * @param {Object} callbackParams - The callback parameters from the identity provider.
 * @param {string} [callbackParams.code] - The authorization code from the IdP.
 * @param {string} [callbackParams.state] - The state parameter for CSRF validation.
 * @param {string} [callbackParams.error] - Error code from the IdP (if login failed).
 * @param {string} [callbackParams.error_description] - Error description from the IdP.
 * @returns {Promise<{ status: string, user: Object|null, error: string|null }>}
 */
const handleSSOCallback = async (callbackParams = {}) => {
  try {
    // Check for IdP-reported errors
    if (callbackParams.error) {
      const errorMessage = callbackParams.error_description || callbackParams.error;
      console.error('[ssoProvider] SSO callback error from IdP:', errorMessage);
      return {
        status: SSO_STATUS.ERROR,
        user: null,
        error: `SSO login failed: ${errorMessage}`,
      };
    }

    if (!SSO_CONFIG.enabled) {
      return {
        status: SSO_STATUS.ERROR,
        user: null,
        error: 'SSO is not enabled.',
      };
    }

    // Validate state parameter for CSRF protection
    if (callbackParams.state) {
      let storedState = null;
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          storedState = window.sessionStorage.getItem('sso_state');
        }
      } catch (_e) {
        // sessionStorage may not be available
      }

      if (storedState && storedState !== callbackParams.state) {
        return {
          status: SSO_STATUS.ERROR,
          user: null,
          error: 'SSO state mismatch. Possible CSRF attack. Please try logging in again.',
        };
      }
    }

    if (!callbackParams.code) {
      return {
        status: SSO_STATUS.ERROR,
        user: null,
        error: 'No authorization code received from identity provider.',
      };
    }

    // ─── MVP Mock Implementation ───────────────────────────────────────
    // In production, this would:
    // 1. Exchange the authorization code for tokens via POST to /token endpoint
    // 2. Validate the ID token signature and claims
    // 3. Extract user info from the ID token or call /userinfo endpoint
    // 4. Map IdP roles/groups to application roles
    //
    // For MVP, we return a mock user based on the code value or default to ARE_LEAD
    const mockUser = resolveMockSSOUser(callbackParams.code);

    // Clean up stored state/nonce
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('sso_state');
        window.sessionStorage.removeItem('sso_nonce');
      }
    } catch (_e) {
      // Silently handle cleanup errors
    }

    return {
      status: SSO_STATUS.SUCCESS,
      user: mockUser,
      error: null,
    };
  } catch (e) {
    console.error('[ssoProvider] Failed to handle SSO callback:', e);
    return {
      status: SSO_STATUS.ERROR,
      user: null,
      error: 'Failed to process SSO callback. Please try again.',
    };
  }
};

/**
 * Resolve a mock SSO user from the authorization code.
 * In MVP, the code can optionally encode an email to look up a mock user.
 * Falls back to a default ARE_LEAD user.
 * @param {string} code - The authorization code (may encode an email for mock purposes).
 * @returns {Object} A user object with id, name, email, role, and avatar.
 */
const resolveMockSSOUser = (code) => {
  // Allow mock codes that encode an email (e.g., "mock-alice.admin@horizon.com")
  if (code && typeof code === 'string' && code.startsWith('mock-')) {
    const email = code.slice(5);
    const mockUser = findMockUserByEmail(email);
    if (mockUser) {
      return { ...mockUser };
    }
  }

  // Default mock SSO user
  return {
    id: `sso-${uuidv4().slice(0, 8)}`,
    name: 'SSO User',
    email: 'sso.user@horizon.com',
    role: ROLES.ARE_LEAD,
    avatar: 'SU',
  };
};

/**
 * Validate an SSO token (ID token) from the identity provider.
 * For MVP, returns a mock validation result.
 * In production, this would verify the JWT signature, issuer, audience, and expiry.
 * @param {string} idToken - The ID token from the identity provider.
 * @returns {Promise<{ valid: boolean, user: Object|null, error: string|null }>}
 */
const validateSSOToken = async (idToken) => {
  try {
    if (!idToken || typeof idToken !== 'string') {
      return {
        valid: false,
        user: null,
        error: 'No ID token provided for validation.',
      };
    }

    if (!SSO_CONFIG.enabled) {
      return {
        valid: false,
        user: null,
        error: 'SSO is not enabled.',
      };
    }

    // ─── MVP Mock Implementation ───────────────────────────────────────
    // In production, this would:
    // 1. Decode the JWT header and payload
    // 2. Fetch the IdP's JWKS (JSON Web Key Set) for signature verification
    // 3. Verify the token signature
    // 4. Validate issuer (iss), audience (aud), expiry (exp), and nonce
    // 5. Extract user claims
    //
    // For MVP, we accept any non-empty token and return a mock user
    const mockUser = {
      id: `sso-${uuidv4().slice(0, 8)}`,
      name: 'SSO User',
      email: 'sso.user@horizon.com',
      role: ROLES.ARE_LEAD,
      avatar: 'SU',
    };

    return {
      valid: true,
      user: mockUser,
      error: null,
    };
  } catch (e) {
    console.error('[ssoProvider] Failed to validate SSO token:', e);
    return {
      valid: false,
      user: null,
      error: 'Failed to validate SSO token.',
    };
  }
};

/**
 * Initiate SSO logout. Clears local SSO state and returns the IdP logout URL.
 * For MVP, returns a mock logout result.
 * @param {Object} [options] - Logout options.
 * @param {string} [options.idToken] - The ID token to include in the logout request.
 * @param {string} [options.postLogoutRedirectUri] - URI to redirect to after logout.
 * @returns {Promise<{ logoutUrl: string, error: string|null }>}
 */
const initSSOLogout = async (options = {}) => {
  try {
    // Clean up stored SSO state
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('sso_state');
        window.sessionStorage.removeItem('sso_nonce');
      }
    } catch (_e) {
      // Silently handle cleanup errors
    }

    if (!SSO_CONFIG.enabled || !SSO_CONFIG.authority) {
      return {
        logoutUrl: '',
        error: null,
      };
    }

    const postLogoutRedirectUri =
      options.postLogoutRedirectUri ||
      (typeof window !== 'undefined' ? window.location.origin : '');

    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogoutRedirectUri,
    });

    if (options.idToken) {
      params.set('id_token_hint', options.idToken);
    }

    const logoutUrl = `${SSO_CONFIG.authority}/logout?${params.toString()}`;

    return {
      logoutUrl,
      error: null,
    };
  } catch (e) {
    console.error('[ssoProvider] Failed to initiate SSO logout:', e);
    return {
      logoutUrl: '',
      error: 'Failed to initiate SSO logout.',
    };
  }
};

/**
 * SSOProvider object — the primary export for SSO integration.
 * Aggregates all SSO operations into a single namespace.
 */
const SSOProvider = Object.freeze({
  isSSOEnabled,
  getSSOConfig,
  getSSOLoginUrl,
  initSSO,
  handleSSOCallback,
  validateSSOToken,
  initSSOLogout,
});

export {
  SSO_CONFIG,
  SSO_STATUS,
  isSSOEnabled,
  getSSOConfig,
  getSSOLoginUrl,
  initSSO,
  handleSSOCallback,
  validateSSOToken,
  initSSOLogout,
  SSOProvider,
};

export default SSOProvider;