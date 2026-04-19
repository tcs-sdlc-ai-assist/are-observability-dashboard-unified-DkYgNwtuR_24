import { v4 as uuidv4 } from 'uuid';
import { getItem, setItem, removeItem, hasItem } from '../utils/storage';
import { ROLES, ROLE_PERMISSIONS, getPermissionsForRoles } from '../constants/roles';

const TOKEN_STORAGE_KEY = 'auth_token';
const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Base64url-encode a string (browser-safe base64 without padding).
 * @param {string} str - The string to encode.
 * @returns {string} Base64url-encoded string.
 */
const base64UrlEncode = (str) => {
  try {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (_e) {
    return '';
  }
};

/**
 * Base64url-decode a string back to the original.
 * @param {string} str - The base64url-encoded string.
 * @returns {string} Decoded string.
 */
const base64UrlDecode = (str) => {
  if (!str || typeof str !== 'string') {
    return '';
  }

  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding === 2) {
      base64 += '==';
    } else if (padding === 3) {
      base64 += '=';
    }
    return atob(base64);
  } catch (_e) {
    return '';
  }
};

/**
 * Generate a mock JWT-like token for a given user.
 * The token contains a header, payload (with user info, role claim, and expiry), and a mock signature.
 * @param {Object} user - The user object.
 * @param {string} user.id - The user's unique identifier.
 * @param {string} user.name - The user's display name.
 * @param {string} user.email - The user's email address.
 * @param {string} user.role - The user's role (e.g., 'ADMIN', 'ARE_LEAD', 'VIEW_ONLY').
 * @param {Object} [options] - Token generation options.
 * @param {number} [options.expiresIn=TOKEN_EXPIRY_SECONDS] - Token expiry in seconds.
 * @returns {string|null} The generated mock JWT token string, or null if user is invalid.
 */
const generateToken = (user, options = {}) => {
  if (!user || !user.id || !user.role) {
    console.error('[tokenManager] Invalid user provided to generateToken');
    return null;
  }

  const { expiresIn = TOKEN_EXPIRY_SECONDS } = options;

  const nowSeconds = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    sub: user.id,
    name: user.name || '',
    email: user.email || '',
    role: user.role,
    permissions: getPermissionsForRoles(user.role),
    iat: nowSeconds,
    exp: nowSeconds + expiresIn,
    jti: uuidv4(),
  };

  const signature = base64UrlEncode(`mock-signature-${user.id}-${payload.jti}`);

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));

  const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

  return token;
};

/**
 * Decode a mock JWT-like token and return its payload.
 * Does NOT validate the token — use validateToken for that.
 * @param {string} token - The JWT-like token string.
 * @returns {Object|null} The decoded payload object, or null if decoding fails.
 */
const decodeToken = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadJson = base64UrlDecode(parts[1]);

    if (!payloadJson) {
      return null;
    }

    const payload = JSON.parse(payloadJson);

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    return payload;
  } catch (_e) {
    return null;
  }
};

/**
 * Check if a token is expired based on its 'exp' claim.
 * @param {string} token - The JWT-like token string.
 * @returns {boolean} True if the token is expired or invalid, false if still valid.
 */
const isTokenExpired = (token) => {
  const payload = decodeToken(token);

  if (!payload || payload.exp == null) {
    return true;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  return nowSeconds >= payload.exp;
};

/**
 * Validate a mock JWT-like token.
 * Checks structure, decodability, required claims, role validity, and expiry.
 * @param {string} token - The JWT-like token string.
 * @returns {{ valid: boolean, payload: Object|null, error: string|null }}
 *   Validation result with the decoded payload if valid.
 */
const validateToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, payload: null, error: 'Token is missing or not a string.' };
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    return { valid: false, payload: null, error: 'Token structure is invalid (expected 3 parts).' };
  }

  const payload = decodeToken(token);

  if (!payload) {
    return { valid: false, payload: null, error: 'Token payload could not be decoded.' };
  }

  // Check required claims
  if (!payload.sub) {
    return { valid: false, payload: null, error: 'Token is missing "sub" (subject) claim.' };
  }

  if (!payload.role) {
    return { valid: false, payload: null, error: 'Token is missing "role" claim.' };
  }

  if (payload.iat == null || typeof payload.iat !== 'number') {
    return { valid: false, payload: null, error: 'Token is missing or has invalid "iat" (issued at) claim.' };
  }

  if (payload.exp == null || typeof payload.exp !== 'number') {
    return { valid: false, payload: null, error: 'Token is missing or has invalid "exp" (expiry) claim.' };
  }

  // Validate role is a known role
  const validRoles = Object.values(ROLES);
  if (!validRoles.includes(payload.role)) {
    return { valid: false, payload: null, error: `Token contains unknown role: "${payload.role}".` };
  }

  // Check expiry
  if (isTokenExpired(token)) {
    return { valid: false, payload, error: 'Token has expired.' };
  }

  return { valid: true, payload, error: null };
};

/**
 * Get the remaining time-to-live for a token in seconds.
 * @param {string} token - The JWT-like token string.
 * @returns {number} Remaining seconds until expiry, or 0 if expired/invalid.
 */
const getTokenTTL = (token) => {
  const payload = decodeToken(token);

  if (!payload || payload.exp == null) {
    return 0;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - nowSeconds;

  return remaining > 0 ? remaining : 0;
};

/**
 * Store a token in localStorage.
 * @param {string} token - The JWT-like token string to store.
 * @returns {boolean} True if the token was stored successfully.
 */
const storeToken = (token) => {
  if (!token || typeof token !== 'string') {
    console.error('[tokenManager] Invalid token provided to storeToken');
    return false;
  }

  return setItem(TOKEN_STORAGE_KEY, token);
};

/**
 * Retrieve the stored token from localStorage.
 * @returns {string|null} The stored token string, or null if not found.
 */
const getStoredToken = () => {
  return getItem(TOKEN_STORAGE_KEY, null);
};

/**
 * Remove the stored token from localStorage.
 * @returns {boolean} True if the token was removed successfully.
 */
const removeStoredToken = () => {
  return removeItem(TOKEN_STORAGE_KEY);
};

/**
 * Check if a token is currently stored in localStorage.
 * @returns {boolean} True if a token exists in storage.
 */
const hasStoredToken = () => {
  return hasItem(TOKEN_STORAGE_KEY);
};

/**
 * Retrieve and validate the stored token in a single call.
 * Returns the decoded payload if the token is valid, or null if missing/invalid/expired.
 * @returns {{ valid: boolean, payload: Object|null, token: string|null, error: string|null }}
 *   Combined retrieval and validation result.
 */
const getValidatedStoredToken = () => {
  const token = getStoredToken();

  if (!token) {
    return { valid: false, payload: null, token: null, error: 'No token found in storage.' };
  }

  const result = validateToken(token);

  return {
    valid: result.valid,
    payload: result.payload,
    token: result.valid ? token : null,
    error: result.error,
  };
};

/**
 * Extract user information from a token payload.
 * @param {string} token - The JWT-like token string.
 * @returns {Object|null} User object with id, name, email, role, and permissions, or null if invalid.
 */
const getUserFromToken = (token) => {
  const payload = decodeToken(token);

  if (!payload || !payload.sub) {
    return null;
  }

  return {
    id: payload.sub,
    name: payload.name || '',
    email: payload.email || '',
    role: payload.role || '',
    permissions: payload.permissions || [],
  };
};

export {
  TOKEN_STORAGE_KEY,
  TOKEN_EXPIRY_SECONDS,
  generateToken,
  decodeToken,
  isTokenExpired,
  validateToken,
  getTokenTTL,
  storeToken,
  getStoredToken,
  removeStoredToken,
  hasStoredToken,
  getValidatedStoredToken,
  getUserFromToken,
};