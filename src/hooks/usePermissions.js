import { useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkPermission,
  checkMinimumRole,
  getAccessibleRoutes,
  canAccessRoute,
  getRoleLabel,
  getPermissions,
  checkPermissions,
} from '../services/rbacService';
import { PERMISSIONS, ROLES } from '../constants/roles';

/**
 * Custom hook that provides permission checks for the current authenticated user.
 * Wraps the rbacService and AuthContext to expose a convenient API for UI components.
 *
 * @returns {{
 *   canView: boolean,
 *   canViewMetrics: boolean,
 *   canViewAlerts: boolean,
 *   canViewAudit: boolean,
 *   canAnnotate: boolean,
 *   canUpload: boolean,
 *   canConfigure: boolean,
 *   canConfigureThresholds: boolean,
 *   canManageUsers: boolean,
 *   canManageRoles: boolean,
 *   canExport: boolean,
 *   role: string|null,
 *   roleLabel: string,
 *   isAdmin: boolean,
 *   isARELead: boolean,
 *   isViewOnly: boolean,
 *   isAuthenticated: boolean,
 *   permissions: string[],
 *   accessibleRoutes: Object[],
 *   hasPermission: (permission: string) => boolean,
 *   hasMinRole: (minimumRole: string) => boolean,
 *   canAccess: (path: string) => boolean,
 *   checkMultiple: (actions: string[]) => Object<string, boolean>,
 * }}
 */
const usePermissions = () => {
  const { role, permissions, isAuthenticated } = useAuth();

  /**
   * Check if the current user has a specific permission.
   * @param {string} permission - The permission to check (from PERMISSIONS constants).
   * @returns {boolean} True if the user has the specified permission.
   */
  const hasPermission = useCallback(
    (permission) => {
      if (!isAuthenticated || !role) {
        return false;
      }

      return checkPermission(role, permission);
    },
    [isAuthenticated, role],
  );

  /**
   * Check if the current user meets a minimum required role level.
   * @param {string} minimumRole - The minimum role required (from ROLES constants).
   * @returns {boolean} True if the user has at least the minimum role level.
   */
  const hasMinRole = useCallback(
    (minimumRole) => {
      if (!isAuthenticated || !role) {
        return false;
      }

      return checkMinimumRole(role, minimumRole);
    },
    [isAuthenticated, role],
  );

  /**
   * Check if the current user can access a specific route path.
   * @param {string} path - The route path to check.
   * @returns {boolean} True if the user can access the route.
   */
  const canAccess = useCallback(
    (path) => {
      if (!isAuthenticated || !role) {
        return false;
      }

      return canAccessRoute(role, path);
    },
    [isAuthenticated, role],
  );

  /**
   * Check multiple permissions at once.
   * @param {string[]} actions - Array of permission strings to check.
   * @returns {Object<string, boolean>} Object keyed by permission with boolean values.
   */
  const checkMultiple = useCallback(
    (actions) => {
      if (!isAuthenticated || !role) {
        if (!actions || !Array.isArray(actions)) {
          return {};
        }

        const result = {};
        for (const action of actions) {
          result[action] = false;
        }
        return result;
      }

      return checkPermissions(role, actions);
    },
    [isAuthenticated, role],
  );

  // ─── Derived Permission Flags ──────────────────────────────────────────

  const canView = useMemo(
    () => hasPermission(PERMISSIONS.VIEW_DASHBOARD),
    [hasPermission],
  );

  const canViewMetrics = useMemo(
    () => hasPermission(PERMISSIONS.VIEW_METRICS),
    [hasPermission],
  );

  const canViewAlerts = useMemo(
    () => hasPermission(PERMISSIONS.VIEW_ALERTS),
    [hasPermission],
  );

  const canViewAudit = useMemo(
    () => hasPermission(PERMISSIONS.VIEW_AUDIT_LOGS),
    [hasPermission],
  );

  const canAnnotate = useMemo(
    () => hasPermission(PERMISSIONS.ANNOTATE),
    [hasPermission],
  );

  const canUpload = useMemo(
    () => hasPermission(PERMISSIONS.UPLOAD_DATA),
    [hasPermission],
  );

  const canConfigure = useMemo(
    () => hasPermission(PERMISSIONS.CONFIGURE_METRICS),
    [hasPermission],
  );

  const canConfigureThresholds = useMemo(
    () => hasPermission(PERMISSIONS.CONFIGURE_THRESHOLDS),
    [hasPermission],
  );

  const canManageUsers = useMemo(
    () => hasPermission(PERMISSIONS.MANAGE_USERS),
    [hasPermission],
  );

  const canManageRoles = useMemo(
    () => hasPermission(PERMISSIONS.MANAGE_ROLES),
    [hasPermission],
  );

  const canExport = useMemo(
    () => hasPermission(PERMISSIONS.EXPORT_DATA),
    [hasPermission],
  );

  // ─── Derived Role Flags ────────────────────────────────────────────────

  const isAdmin = useMemo(() => role === ROLES.ADMIN, [role]);

  const isARELead = useMemo(() => role === ROLES.ARE_LEAD, [role]);

  const isViewOnly = useMemo(() => role === ROLES.VIEW_ONLY, [role]);

  const roleLabel = useMemo(() => {
    if (!role) {
      return '';
    }

    return getRoleLabel(role);
  }, [role]);

  // ─── Accessible Routes ─────────────────────────────────────────────────

  const accessibleRoutes = useMemo(() => {
    if (!isAuthenticated || !role) {
      return [];
    }

    return getAccessibleRoutes(role);
  }, [isAuthenticated, role]);

  return {
    // Permission flags
    canView,
    canViewMetrics,
    canViewAlerts,
    canViewAudit,
    canAnnotate,
    canUpload,
    canConfigure,
    canConfigureThresholds,
    canManageUsers,
    canManageRoles,
    canExport,

    // Role info
    role,
    roleLabel,
    isAdmin,
    isARELead,
    isViewOnly,
    isAuthenticated,
    permissions,

    // Accessible routes
    accessibleRoutes,

    // Permission check functions
    hasPermission,
    hasMinRole,
    canAccess,
    checkMultiple,
  };
};

export { usePermissions };
export default usePermissions;