const ROLES = Object.freeze({
  VIEW_ONLY: 'VIEW_ONLY',
  ARE_LEAD: 'ARE_LEAD',
  ADMIN: 'ADMIN',
});

const PERMISSIONS = Object.freeze({
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_METRICS: 'VIEW_METRICS',
  VIEW_ALERTS: 'VIEW_ALERTS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  ANNOTATE: 'ANNOTATE',
  UPLOAD_DATA: 'UPLOAD_DATA',
  CONFIGURE_METRICS: 'CONFIGURE_METRICS',
  CONFIGURE_THRESHOLDS: 'CONFIGURE_THRESHOLDS',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_ROLES: 'MANAGE_ROLES',
  EXPORT_DATA: 'EXPORT_DATA',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.VIEW_ONLY]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_METRICS,
    PERMISSIONS.VIEW_ALERTS,
  ],
  [ROLES.ARE_LEAD]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_METRICS,
    PERMISSIONS.VIEW_ALERTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.ANNOTATE,
    PERMISSIONS.UPLOAD_DATA,
    PERMISSIONS.EXPORT_DATA,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_METRICS,
    PERMISSIONS.VIEW_ALERTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.ANNOTATE,
    PERMISSIONS.UPLOAD_DATA,
    PERMISSIONS.CONFIGURE_METRICS,
    PERMISSIONS.CONFIGURE_THRESHOLDS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_ROLES,
    PERMISSIONS.EXPORT_DATA,
  ],
});

const ROLE_LABELS = Object.freeze({
  [ROLES.VIEW_ONLY]: 'View Only',
  [ROLES.ARE_LEAD]: 'ARE Lead',
  [ROLES.ADMIN]: 'Admin',
});

const ROLE_HIERARCHY = Object.freeze({
  [ROLES.VIEW_ONLY]: 0,
  [ROLES.ARE_LEAD]: 1,
  [ROLES.ADMIN]: 2,
});

/**
 * Check if a given set of user roles includes a specific permission.
 * @param {string|string[]} userRoles - A single role string or array of role strings.
 * @param {string} permission - The permission to check against.
 * @returns {boolean} True if any of the user's roles grant the permission.
 */
const hasPermission = (userRoles, permission) => {
  if (!userRoles || !permission) {
    return false;
  }

  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];

  return roles.some((role) => {
    const rolePermissions = ROLE_PERMISSIONS[role];
    return rolePermissions ? rolePermissions.includes(permission) : false;
  });
};

/**
 * Get all permissions for a given set of roles (deduplicated).
 * @param {string|string[]} userRoles - A single role string or array of role strings.
 * @returns {string[]} Array of unique permission strings.
 */
const getPermissionsForRoles = (userRoles) => {
  if (!userRoles) {
    return [];
  }

  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  const permissionSet = new Set();

  roles.forEach((role) => {
    const rolePermissions = ROLE_PERMISSIONS[role];
    if (rolePermissions) {
      rolePermissions.forEach((perm) => permissionSet.add(perm));
    }
  });

  return Array.from(permissionSet);
};

/**
 * Get the highest role from a set of roles based on the role hierarchy.
 * @param {string[]} userRoles - Array of role strings.
 * @returns {string|null} The highest role or null if no valid roles.
 */
const getHighestRole = (userRoles) => {
  if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
    return null;
  }

  return userRoles.reduce((highest, role) => {
    if (!highest) return role;
    const currentLevel = ROLE_HIERARCHY[role] ?? -1;
    const highestLevel = ROLE_HIERARCHY[highest] ?? -1;
    return currentLevel > highestLevel ? role : highest;
  }, null);
};

/**
 * Check if a role meets or exceeds a minimum required role level.
 * @param {string|string[]} userRoles - A single role string or array of role strings.
 * @param {string} minimumRole - The minimum role required.
 * @returns {boolean} True if the user has at least the minimum role level.
 */
const hasMinimumRole = (userRoles, minimumRole) => {
  if (!userRoles || !minimumRole) {
    return false;
  }

  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  const minimumLevel = ROLE_HIERARCHY[minimumRole] ?? -1;

  return roles.some((role) => {
    const roleLevel = ROLE_HIERARCHY[role] ?? -1;
    return roleLevel >= minimumLevel;
  });
};

export {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_HIERARCHY,
  hasPermission,
  getPermissionsForRoles,
  getHighestRole,
  hasMinimumRole,
};