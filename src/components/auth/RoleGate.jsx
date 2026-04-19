import { useMemo } from 'react';
import { usePermissions } from '../../hooks/usePermissions';

/**
 * RoleGate - Conditional rendering component that shows or hides children
 * based on the current user's role permissions.
 *
 * Behavior:
 * - If the user has the requiredPermission, renders the children.
 * - If the user lacks the requiredPermission, renders the fallback (if provided)
 *   or renders nothing (null).
 * - If a minimumRole is specified instead of (or in addition to) a permission,
 *   checks that the user meets the minimum role level.
 * - If requiredPermissions (array) is provided, checks that the user has ALL
 *   of the specified permissions.
 * - If anyPermission (array) is provided, checks that the user has AT LEAST ONE
 *   of the specified permissions.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The content to render when access is granted.
 * @param {string} [props.requiredPermission] - A single permission required (from PERMISSIONS constants).
 * @param {string[]} [props.requiredPermissions] - An array of permissions ALL required.
 * @param {string[]} [props.anyPermission] - An array of permissions where AT LEAST ONE is required.
 * @param {string} [props.minimumRole] - The minimum role required (from ROLES constants).
 * @param {React.ReactNode} [props.fallback=null] - Optional fallback UI when access is denied.
 * @param {boolean} [props.silent=true] - If true (default), renders nothing on denial. If false, renders fallback.
 * @returns {React.ReactNode}
 */
const RoleGate = ({
  children,
  requiredPermission,
  requiredPermissions,
  anyPermission,
  minimumRole,
  fallback = null,
  silent = true,
}) => {
  const { hasPermission, hasMinRole, isAuthenticated } = usePermissions();

  const isAllowed = useMemo(() => {
    if (!isAuthenticated) {
      return false;
    }

    // Check single permission
    if (requiredPermission) {
      if (!hasPermission(requiredPermission)) {
        return false;
      }
    }

    // Check all required permissions
    if (requiredPermissions && Array.isArray(requiredPermissions) && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((perm) => hasPermission(perm));
      if (!hasAll) {
        return false;
      }
    }

    // Check any permission (at least one)
    if (anyPermission && Array.isArray(anyPermission) && anyPermission.length > 0) {
      const hasAny = anyPermission.some((perm) => hasPermission(perm));
      if (!hasAny) {
        return false;
      }
    }

    // Check minimum role
    if (minimumRole) {
      if (!hasMinRole(minimumRole)) {
        return false;
      }
    }

    // If no constraints were specified, default to allowing authenticated users
    const hasConstraint =
      requiredPermission ||
      (requiredPermissions && requiredPermissions.length > 0) ||
      (anyPermission && anyPermission.length > 0) ||
      minimumRole;

    if (!hasConstraint) {
      return true;
    }

    return true;
  }, [
    isAuthenticated,
    requiredPermission,
    requiredPermissions,
    anyPermission,
    minimumRole,
    hasPermission,
    hasMinRole,
  ]);

  if (isAllowed) {
    return children;
  }

  if (silent && !fallback) {
    return null;
  }

  return fallback;
};

export { RoleGate };
export default RoleGate;