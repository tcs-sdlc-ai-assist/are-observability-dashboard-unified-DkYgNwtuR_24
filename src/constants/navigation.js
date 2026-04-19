import { PERMISSIONS } from './roles';

const NAV_SECTIONS = Object.freeze({
  MAIN: 'MAIN',
  OBSERVABILITY: 'OBSERVABILITY',
  MANAGEMENT: 'MANAGEMENT',
  EXTERNAL: 'EXTERNAL',
});

const NAV_SECTION_LABELS = Object.freeze({
  [NAV_SECTIONS.MAIN]: 'Main',
  [NAV_SECTIONS.OBSERVABILITY]: 'Observability',
  [NAV_SECTIONS.MANAGEMENT]: 'Management',
  [NAV_SECTIONS.EXTERNAL]: 'Resources',
});

const NAV_ITEMS = Object.freeze([
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: 'dashboard',
    section: NAV_SECTIONS.MAIN,
    permissions: [PERMISSIONS.VIEW_DASHBOARD],
    order: 0,
  },
  {
    key: 'metrics',
    label: 'Metrics',
    path: '/metrics',
    icon: 'metrics',
    section: NAV_SECTIONS.OBSERVABILITY,
    permissions: [PERMISSIONS.VIEW_METRICS],
    order: 10,
  },
  {
    key: 'alerts',
    label: 'Alerts',
    path: '/alerts',
    icon: 'alerts',
    section: NAV_SECTIONS.OBSERVABILITY,
    permissions: [PERMISSIONS.VIEW_ALERTS],
    order: 11,
  },
  {
    key: 'golden-signals',
    label: 'Golden Signals',
    path: '/golden-signals',
    icon: 'signals',
    section: NAV_SECTIONS.OBSERVABILITY,
    permissions: [PERMISSIONS.VIEW_METRICS],
    order: 12,
  },
  {
    key: 'error-budget',
    label: 'Error Budget',
    path: '/error-budget',
    icon: 'budget',
    section: NAV_SECTIONS.OBSERVABILITY,
    permissions: [PERMISSIONS.VIEW_METRICS],
    order: 13,
  },
  {
    key: 'incidents',
    label: 'Incidents',
    path: '/incidents',
    icon: 'incidents',
    section: NAV_SECTIONS.OBSERVABILITY,
    permissions: [PERMISSIONS.VIEW_ALERTS],
    order: 14,
  },
  {
    key: 'upload',
    label: 'Upload Data',
    path: '/upload',
    icon: 'upload',
    section: NAV_SECTIONS.MANAGEMENT,
    permissions: [PERMISSIONS.UPLOAD_DATA],
    order: 20,
  },
  {
    key: 'configuration',
    label: 'Configuration',
    path: '/configuration',
    icon: 'settings',
    section: NAV_SECTIONS.MANAGEMENT,
    permissions: [PERMISSIONS.CONFIGURE_METRICS],
    order: 21,
  },
  {
    key: 'users',
    label: 'User Management',
    path: '/users',
    icon: 'users',
    section: NAV_SECTIONS.MANAGEMENT,
    permissions: [PERMISSIONS.MANAGE_USERS],
    order: 22,
  },
  {
    key: 'audit-logs',
    label: 'Audit Logs',
    path: '/audit-logs',
    icon: 'audit',
    section: NAV_SECTIONS.MANAGEMENT,
    permissions: [PERMISSIONS.VIEW_AUDIT_LOGS],
    order: 23,
  },
]);

const EXTERNAL_LINKS = Object.freeze([
  {
    key: 'sop-playbook',
    label: 'SOP / Playbook',
    url: 'https://confluence.example.com/are/sop-playbook',
    icon: 'book',
    section: NAV_SECTIONS.EXTERNAL,
    description: 'Standard Operating Procedures and incident response playbooks',
    order: 30,
  },
  {
    key: 'runbook',
    label: 'Runbook',
    url: 'https://confluence.example.com/are/runbook',
    icon: 'document',
    section: NAV_SECTIONS.EXTERNAL,
    description: 'Operational runbooks for common tasks and troubleshooting',
    order: 31,
  },
  {
    key: 'dynatrace',
    label: 'Dynatrace',
    url: '',
    icon: 'external',
    section: NAV_SECTIONS.EXTERNAL,
    description: 'Dynatrace APM dashboard',
    envKey: 'VITE_DYNATRACE_EMBED_URL',
    order: 32,
  },
  {
    key: 'elastic',
    label: 'Elastic',
    url: '',
    icon: 'external',
    section: NAV_SECTIONS.EXTERNAL,
    description: 'Elastic observability dashboard',
    envKey: 'VITE_ELASTIC_EMBED_URL',
    order: 33,
  },
]);

/**
 * Get navigation items filtered by user permissions.
 * @param {string|string[]} userRoles - A single role string or array of role strings.
 * @param {Function} hasPermissionFn - The hasPermission function from roles.js.
 * @returns {Object[]} Filtered and sorted navigation items.
 */
const getNavItemsForRoles = (userRoles, hasPermissionFn) => {
  if (!userRoles || !hasPermissionFn) {
    return [];
  }

  return NAV_ITEMS.filter((item) =>
    item.permissions.some((permission) => hasPermissionFn(userRoles, permission)),
  ).sort((a, b) => a.order - b.order);
};

/**
 * Get navigation items grouped by section, filtered by user permissions.
 * @param {string|string[]} userRoles - A single role string or array of role strings.
 * @param {Function} hasPermissionFn - The hasPermission function from roles.js.
 * @returns {Object} Object keyed by section with arrays of nav items.
 */
const getNavItemsBySection = (userRoles, hasPermissionFn) => {
  const filteredItems = getNavItemsForRoles(userRoles, hasPermissionFn);

  return filteredItems.reduce((sections, item) => {
    const section = item.section;
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(item);
    return sections;
  }, {});
};

/**
 * Get external links with resolved URLs from environment variables.
 * @returns {Object[]} External links with resolved URLs.
 */
const getExternalLinks = () => {
  return EXTERNAL_LINKS.map((link) => {
    if (link.envKey) {
      const envUrl = import.meta.env[link.envKey];
      return {
        ...link,
        url: envUrl || link.url,
        isAvailable: Boolean(envUrl),
      };
    }
    return {
      ...link,
      isAvailable: Boolean(link.url),
    };
  });
};

/**
 * Find a navigation item by its path.
 * @param {string} path - The route path to match.
 * @returns {Object|null} The matching navigation item or null.
 */
const getNavItemByPath = (path) => {
  if (!path) {
    return null;
  }

  return NAV_ITEMS.find((item) => item.path === path) ?? null;
};

/**
 * Find a navigation item by its key.
 * @param {string} key - The navigation item key.
 * @returns {Object|null} The matching navigation item or null.
 */
const getNavItemByKey = (key) => {
  if (!key) {
    return null;
  }

  return NAV_ITEMS.find((item) => item.key === key) ?? null;
};

export {
  NAV_SECTIONS,
  NAV_SECTION_LABELS,
  NAV_ITEMS,
  EXTERNAL_LINKS,
  getNavItemsForRoles,
  getNavItemsBySection,
  getExternalLinks,
  getNavItemByPath,
  getNavItemByKey,
};