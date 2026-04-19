import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_HIERARCHY,
  hasPermission,
  getPermissionsForRoles,
  getHighestRole,
  hasMinimumRole,
} from '../constants/roles';
import { NAV_ITEMS, getNavItemsForRoles } from '../constants/navigation';
import { getCurrentUser } from './authService';

/**
 * Get all permissions granted to a given role or set of roles.
 * Returns a deduplicated array of permission strings.
 * @param {string|string[]} roles - A single role string or array of role strings.
 * @returns {{ role: string|string[], permissions: string[], highestRole: string|null }}
 *   Object containing the role(s), resolved permissions, and highest role.
 */
const getPermissions = (roles) => {
  if (!roles) {
    return {
      role: roles,
      permissions: [],
      highestRole: null,
    };
  }

  const roleArray = Array.isArray(roles) ? roles : [roles];

  // Filter out invalid roles
  const validRoles = Object.values(ROLES);
  const filteredRoles = roleArray.filter((role) => validRoles.includes(role));

  if (filteredRoles.length === 0) {
    return {
      role: roles,
      permissions: [],
      highestRole: null,
    };
  }

  const permissions = getPermissionsForRoles(filteredRoles);
  const highestRole = getHighestRole(filteredRoles);

  return {
    role: roles,
    permissions,
    highestRole,
  };
};

/**
 * Check if a given role or set of roles has a specific permission.
 * @param {string|string[]} roles - A single role string or array of role strings.
 * @param {string} action - The permission/action to check (from PERMISSIONS constants).
 * @returns {boolean} True if the role(s) grant the specified permission.
 */
const checkPermission = (roles, action) => {
  if (!roles || !action) {
    return false;
  }

  // Validate that the action is a known permission
  const validPermissions = Object.values(PERMISSIONS);
  if (!validPermissions.includes(action)) {
    console.warn(`[rbacService] Unknown permission action: "${action}"`);
    return false;
  }

  return hasPermission(roles, action);
};

/**
 * Check if a given role or set of roles meets a minimum required role level.
 * Useful for gating features that require at least a certain role tier.
 * @param {string|string[]} roles - A single role string or array of role strings.
 * @param {string} minimumRole - The minimum role required (from ROLES constants).
 * @returns {boolean} True if the user has at least the minimum role level.
 */
const checkMinimumRole = (roles, minimumRole) => {
  if (!roles || !minimumRole) {
    return false;
  }

  return hasMinimumRole(roles, minimumRole);
};

/**
 * Get all navigation routes accessible to a given role or set of roles.
 * Returns filtered and sorted navigation items based on the role's permissions.
 * @param {string|string[]} roles - A single role string or array of role strings.
 * @returns {Object[]} Array of accessible navigation item objects, sorted by order.
 */
const getAccessibleRoutes = (roles) => {
  if (!roles) {
    return [];
  }

  return getNavItemsForRoles(roles, hasPermission);
};

/**
 * Check if a given role or set of roles can access a specific route path.
 * @param {string|string[]} roles - A single role string or array of role strings.
 * @param {string} path - The route path to check (e.g., '/upload', '/configuration').
 * @returns {boolean} True if the role(s) can access the specified route.
 */
const canAccessRoute = (roles, path) => {
  if (!roles || !path) {
    return false;
  }

  const navItem = NAV_ITEMS.find((item) => item.path === path);

  if (!navItem) {
    // Unknown routes are not accessible by default
    return false;
  }

  // Check if the role has at least one of the required permissions for this route
  return navItem.permissions.some((permission) => hasPermission(roles, permission));
};

/**
 * Get the role label (human-readable name) for a given role key.
 * @param {string} role - The role key (e.g., 'ADMIN', 'ARE_LEAD', 'VIEW_ONLY').
 * @returns {string} The human-readable role label, or the raw role key if unknown.
 */
const getRoleLabel = (role) => {
  if (!role || typeof role !== 'string') {
    return '';
  }

  return ROLE_LABELS[role] ?? role;
};

/**
 * Get all available roles as an array of { value, label } objects.
 * Useful for populating role selection dropdowns.
 * @returns {{ value: string, label: string, level: number }[]} Array of role option objects sorted by hierarchy.
 */
const getAllRoles = () => {
  return Object.values(ROLES)
    .map((role) => ({
      value: role,
      label: ROLE_LABELS[role] ?? role,
      level: ROLE_HIERARCHY[role] ?? 0,
    }))
    .sort((a, b) => a.level - b.level);
};

/**
 * Check multiple permissions at once for a given role or set of roles.
 * Returns an object keyed by permission with boolean values.
 * @param {string|string[]} roles - A single role string or array of role strings.
 * @param {string[]} actions - Array of permission/action strings to check.
 * @returns {Object<string, boolean>} Object keyed by permission with boolean access values.
 */
const checkPermissions = (roles, actions) => {
  if (!roles || !actions || !Array.isArray(actions)) {
    return {};
  }

  const result = {};

  for (const action of actions) {
    result[action] = hasPermission(roles, action);
  }

  return result;
};

/**
 * Get the permissions for the currently authenticated user.
 * Reads the current user from the auth service and resolves their permissions.
 * @returns {{ role: string|null, permissions: string[], highestRole: string|null, authenticated: boolean }}
 *   Object containing the current user's role, permissions, and auth status.
 */
const getCurrentUserPermissions = () => {
  const user = getCurrentUser();

  if (!user || !user.role) {
    return {
      role: null,
      permissions: [],
      highestRole: null,
      authenticated: false,
    };
  }

  const { permissions, highestRole } = getPermissions(user.role);

  return {
    role: user.role,
    permissions,
    highestRole,
    authenticated: true,
  };
};

/**
 * Check if the currently authenticated user has a specific permission.
 * Convenience wrapper that reads the current user and checks the permission.
 * @param {string} action - The permission/action to check (from PERMISSIONS constants).
 * @returns {boolean} True if the current user has the specified permission.
 */
const currentUserCan = (action) => {
  if (!action) {
    return false;
  }

  const user = getCurrentUser();

  if (!user || !user.role) {
    return false;
  }

  return checkPermission(user.role, action);
};

/**
 * Check if the currently authenticated user can access a specific route.
 * @param {string} path - The route path to check.
 * @returns {boolean} True if the current user can access the route.
 */
const currentUserCanAccessRoute = (path) => {
  if (!path) {
    return false;
  }

  const user = getCurrentUser();

  if (!user || !user.role) {
    return false;
  }

  return canAccessRoute(user.role, path);
};

export {
  getPermissions,
  checkPermission,
  checkMinimumRole,
  getAccessibleRoutes,
  canAccessRoute,
  getRoleLabel,
  getAllRoles,
  checkPermissions,
  getCurrentUserPermissions,
  currentUserCan,
  currentUserCanAccessRoute,
};