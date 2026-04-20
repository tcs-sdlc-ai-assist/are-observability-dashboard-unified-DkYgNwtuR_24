import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  NAV_SECTIONS,
  NAV_SECTION_LABELS,
  NAV_ITEMS,
  EXTERNAL_LINKS,
  getNavItemsBySection,
  getExternalLinks,
} from '../../constants/navigation';
import { hasPermission as checkHasPermission } from '../../constants/roles';

/**
 * Icon component that renders SVG icons based on a string key.
 * Maps navigation icon keys to inline SVG paths.
 *
 * @param {Object} props
 * @param {string} props.name - The icon key name from navigation items.
 * @param {string} [props.className=''] - Additional CSS classes.
 * @returns {React.ReactNode}
 */
const NavIcon = ({ name, className = '' }) => {
  const baseClass = `w-5 h-5 flex-shrink-0 ${className}`;

  switch (name) {
    case 'dashboard':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      );
    case 'metrics':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case 'alerts':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      );
    case 'signals':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
        </svg>
      );
    case 'budget':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </svg>
      );
    case 'incidents':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case 'upload':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'users':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case 'audit':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
      );
    case 'book':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
    case 'document':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case 'external':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      );
    default:
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      );
  }
};

/**
 * Sidebar - Main navigation sidebar component.
 *
 * Features:
 * - Collapsible sidebar with expand/collapse toggle
 * - Navigation items from navigation.js filtered by user role/permissions
 * - Active route highlighting via react-router-dom NavLink
 * - Grouped navigation sections (Main, Observability, Management, Resources)
 * - External links section with availability indicators
 * - Horizon logo/branding at the top
 * - User info display at the bottom
 * - Responsive mobile drawer with overlay
 *
 * @param {Object} props
 * @param {boolean} [props.mobileOpen=false] - Whether the mobile drawer is open.
 * @param {Function} [props.onMobileClose] - Callback to close the mobile drawer.
 * @returns {React.ReactNode}
 */
const Sidebar = ({ mobileOpen = false, onMobileClose }) => {
  const { currentUser, logout } = useAuth();
  const { role, roleLabel, isAuthenticated } = usePermissions();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const sidebarRef = useRef(null);

  // Get navigation items grouped by section, filtered by user permissions
  const navSections = useMemo(() => {
    if (!isAuthenticated || !role) {
      return {};
    }

    return getNavItemsBySection(role, checkHasPermission);
  }, [isAuthenticated, role]);

  // Get external links with resolved URLs
  const externalLinks = useMemo(() => {
    return getExternalLinks();
  }, []);

  // Available external links only
  const availableExternalLinks = useMemo(() => {
    return externalLinks.filter((link) => link.isAvailable);
  }, [externalLinks]);

  // Toggle sidebar collapsed state
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  // Close mobile drawer when route changes
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onMobileClose) {
        onMobileClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, onMobileClose]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    const result = await logout();

    if (result.logoutUrl) {
      window.location.href = result.logoutUrl;
    }
  }, [logout]);

  // Determine the section order for rendering
  const sectionOrder = useMemo(() => {
    return [NAV_SECTIONS.MAIN, NAV_SECTIONS.OBSERVABILITY, NAV_SECTIONS.MANAGEMENT];
  }, []);

  /**
   * Render a single navigation item.
   * @param {Object} item - The navigation item object.
   * @returns {React.ReactNode}
   */
  const renderNavItem = useCallback(
    (item) => {
      const isExternal = Boolean(item.url);
      const linkProps = isExternal
        ? {
            href: item.url,
            target: '_blank',
            rel: 'noopener noreferrer',
          }
        : {
            to: item.path,
            end: item.path === '/',
          };

      const LinkComponent = isExternal ? 'a' : NavLink;

      const itemClassName = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 group ${
        collapsed ? 'justify-center px-2' : ''
      }`;

      const navLinkClassName = ({ isActive }) =>
        `${itemClassName} ${
          isActive
            ? 'bg-dashboard-sidebar-active text-white'
            : 'text-dashboard-sidebar-text hover:bg-dashboard-sidebar-hover hover:text-white'
        }`;

      const externalLinkClassName = `${itemClassName} text-dashboard-sidebar-text hover:bg-dashboard-sidebar-hover hover:text-white`;

      return (
        <LinkComponent
          key={item.key}
          {...linkProps}
          className={isExternal ? externalLinkClassName : navLinkClassName}
          title={collapsed ? item.label : undefined}
        >
          <NavIcon
            name={item.icon}
            className="transition-colors duration-150"
          />
          {!collapsed && (
            <span className="truncate">{item.label}</span>
          )}
          {!collapsed && isExternal && (
            <svg
              className="w-3 h-3 flex-shrink-0 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
              />
            </svg>
          )}
        </LinkComponent>
      );
    },
    [collapsed],
  );

  /**
   * Render a navigation section with its label and items.
   * @param {string} sectionKey - The section key from NAV_SECTIONS.
   * @returns {React.ReactNode|null}
   */
  const renderSection = useCallback(
    (sectionKey) => {
      const items = navSections[sectionKey];

      if (!items || items.length === 0) {
        return null;
      }

      return (
        <div key={sectionKey} className="mb-2">
          {!collapsed && (
            <div className="px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
                {NAV_SECTION_LABELS[sectionKey] || sectionKey}
              </span>
            </div>
          )}
          {collapsed && <div className="my-2 mx-3 border-t border-dashboard-sidebar-hover" />}
          <nav className="flex flex-col gap-0.5">
            {items.map((item) => renderNavItem(item))}
          </nav>
        </div>
      );
    },
    [navSections, collapsed, renderNavItem],
  );

  /**
   * Render external links section.
   * @returns {React.ReactNode|null}
   */
  const renderExternalLinks = useCallback(() => {
    if (availableExternalLinks.length === 0) {
      return null;
    }

    return (
      <div className="mb-2">
        {!collapsed && (
          <div className="px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
              {NAV_SECTION_LABELS[NAV_SECTIONS.EXTERNAL] || 'Resources'}
            </span>
          </div>
        )}
        {collapsed && <div className="my-2 mx-3 border-t border-dashboard-sidebar-hover" />}
        <nav className="flex flex-col gap-0.5">
          {availableExternalLinks.map((link) => (
            <a
              key={link.key}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-dashboard-sidebar-text hover:bg-dashboard-sidebar-hover hover:text-white transition-colors duration-150 ${
                collapsed ? 'justify-center px-2' : ''
              }`}
              title={collapsed ? link.label : link.description || link.label}
            >
              <NavIcon
                name={link.icon}
                className="transition-colors duration-150"
              />
              {!collapsed && (
                <span className="truncate flex-1">{link.label}</span>
              )}
              {!collapsed && (
                <svg
                  className="w-3 h-3 flex-shrink-0 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                  />
                </svg>
              )}
            </a>
          ))}
        </nav>
      </div>
    );
  }, [availableExternalLinks, collapsed]);

  /**
   * Render the sidebar content (shared between desktop and mobile).
   * @returns {React.ReactNode}
   */
  const renderSidebarContent = () => {
    return (
      <div className="flex flex-col h-full">
        {/* Logo / Brand */}
        <div
          className={`flex items-center h-16 border-b border-dashboard-sidebar-hover flex-shrink-0 ${
            collapsed ? 'justify-center px-2' : 'px-4'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 flex-shrink-0">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
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
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-white truncate">Horizon</h1>
                <p className="text-xs text-dashboard-sidebar-text truncate">ARE Observability</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-4 px-2">
          {sectionOrder.map((sectionKey) => renderSection(sectionKey))}
          {renderExternalLinks()}
        </div>

        {/* Collapse Toggle (desktop only) */}
        <div className="hidden lg:block px-2 py-2 border-t border-dashboard-sidebar-hover">
          <button
            onClick={toggleCollapsed}
            className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-dashboard-sidebar-text hover:bg-dashboard-sidebar-hover hover:text-white transition-colors duration-150"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`w-5 h-5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
              />
            </svg>
            {!collapsed && <span className="ml-3 text-sm">Collapse</span>}
          </button>
        </div>

        {/* User Info */}
        {currentUser && (
          <div className="border-t border-dashboard-sidebar-hover flex-shrink-0">
            <div
              className={`flex items-center gap-3 p-3 ${collapsed ? 'justify-center' : ''}`}
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-semibold flex-shrink-0"
                title={currentUser.name || currentUser.email}
              >
                {currentUser.avatar || 'U'}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {currentUser.name || 'User'}
                  </p>
                  <p className="text-xs text-dashboard-sidebar-text truncate">
                    {roleLabel || currentUser.role || ''}
                  </p>
                </div>
              )}
              {!collapsed && (
                <button
                  onClick={handleLogout}
                  className="flex-shrink-0 p-1.5 rounded-lg text-dashboard-sidebar-text hover:bg-dashboard-sidebar-hover hover:text-white transition-colors duration-150"
                  title="Sign out"
                  aria-label="Sign out"
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
                      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-dashboard-sidebar-bg transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
        aria-label="Main navigation"
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-dashboard-sidebar-bg transform transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile navigation"
        role="dialog"
        aria-modal={mobileOpen}
      >
        {/* Mobile close button */}
        <div className="absolute top-3 right-3">
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg text-dashboard-sidebar-text hover:bg-dashboard-sidebar-hover hover:text-white transition-colors duration-150"
            aria-label="Close navigation"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        {renderSidebarContent()}
      </aside>

      {/* Spacer for desktop layout to push content right */}
      <div
        className={`hidden lg:block flex-shrink-0 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
        aria-hidden="true"
      />
    </>
  );
};

export { Sidebar };
export default Sidebar;