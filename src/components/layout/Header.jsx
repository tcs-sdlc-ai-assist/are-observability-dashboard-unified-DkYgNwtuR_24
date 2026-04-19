import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getNavItemByPath } from '../../constants/navigation';
import { ROLE_LABELS } from '../../constants/roles';

/**
 * Header - Top navigation header bar component.
 *
 * Features:
 * - Dynamic page title based on current route
 * - Global search input placeholder
 * - Notification bell icon with badge
 * - User avatar, name, and role badge
 * - Logout button
 * - Mobile hamburger menu toggle
 * - Responsive layout
 *
 * @param {Object} props
 * @param {Function} [props.onMobileMenuToggle] - Callback to toggle the mobile sidebar drawer.
 * @returns {React.ReactNode}
 */
const Header = ({ onMobileMenuToggle }) => {
  const { currentUser, logout } = useAuth();
  const { role, roleLabel } = usePermissions();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Resolve the current page title from the navigation config
  const pageTitle = useMemo(() => {
    const navItem = getNavItemByPath(location.pathname);

    if (navItem) {
      return navItem.label;
    }

    // Fallback titles for known routes not in nav
    const routeTitles = {
      '/login': 'Sign In',
      '/auth/callback': 'Authenticating…',
    };

    return routeTitles[location.pathname] || 'Dashboard';
  }, [location.pathname]);

  // Handle search input change
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  // Handle search submit (placeholder — no-op for now)
  const handleSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      // Search functionality placeholder
      if (searchQuery.trim().length > 0) {
        // Future: dispatch search action
      }
    },
    [searchQuery],
  );

  // Toggle user dropdown menu
  const toggleUserMenu = useCallback(() => {
    setIsUserMenuOpen((prev) => !prev);
  }, []);

  // Close user menu
  const closeUserMenu = useCallback(() => {
    setIsUserMenuOpen(false);
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    closeUserMenu();
    const result = await logout();

    if (result.logoutUrl) {
      window.location.href = result.logoutUrl;
    }
  }, [logout, closeUserMenu]);

  // Close user menu on outside click
  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        closeUserMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen, closeUserMenu]);

  // Close user menu on Escape key
  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeUserMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen, closeUserMenu]);

  // Close user menu on route change
  useEffect(() => {
    closeUserMenu();
  }, [location.pathname, closeUserMenu]);

  // Role badge color mapping
  const roleBadgeClass = useMemo(() => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'ARE_LEAD':
        return 'bg-brand-100 text-brand-800';
      case 'VIEW_ONLY':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }, [role]);

  return (
    <header className="sticky top-0 z-20 flex items-center h-16 bg-white border-b border-dashboard-border px-4 lg:px-6">
      {/* Mobile menu toggle */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden flex items-center justify-center w-9 h-9 mr-3 rounded-lg text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary transition-colors duration-150"
        aria-label="Open navigation menu"
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
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>

      {/* Page title */}
      <div className="flex items-center min-w-0 mr-4">
        <h2 className="text-lg font-semibold text-dashboard-text-primary truncate">
          {pageTitle}
        </h2>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Global search */}
      <form
        onSubmit={handleSearchSubmit}
        className="hidden md:flex items-center mr-4"
      >
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-4 h-4 text-dashboard-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search…"
            className="w-56 lg:w-72 pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
            aria-label="Global search"
          />
        </div>
      </form>

      {/* Notification bell */}
      <button
        className="relative flex items-center justify-center w-9 h-9 mr-2 rounded-lg text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary transition-colors duration-150"
        aria-label="Notifications"
        title="Notifications"
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
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {/* Notification badge dot */}
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-severity-critical rounded-full" />
      </button>

      {/* User section */}
      {currentUser && (
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={toggleUserMenu}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors duration-150"
            aria-label="User menu"
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
          >
            {/* Avatar */}
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-semibold flex-shrink-0">
              {currentUser.avatar || 'U'}
            </div>

            {/* Name and role (hidden on small screens) */}
            <div className="hidden lg:flex flex-col items-start min-w-0">
              <span className="text-sm font-medium text-dashboard-text-primary truncate max-w-[120px]">
                {currentUser.name || 'User'}
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 ${roleBadgeClass}`}
              >
                {roleLabel || ROLE_LABELS[role] || role || ''}
              </span>
            </div>

            {/* Chevron */}
            <svg
              className={`hidden lg:block w-4 h-4 text-dashboard-text-muted transition-transform duration-150 ${
                isUserMenuOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {/* User dropdown menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-dashboard-border shadow-panel py-1 z-50 animate-fade-in">
              {/* User info (visible on mobile where inline info is hidden) */}
              <div className="px-4 py-3 border-b border-dashboard-border lg:hidden">
                <p className="text-sm font-medium text-dashboard-text-primary truncate">
                  {currentUser.name || 'User'}
                </p>
                <p className="text-xs text-dashboard-text-secondary truncate">
                  {currentUser.email || ''}
                </p>
                <span
                  className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${roleBadgeClass}`}
                >
                  {roleLabel || ROLE_LABELS[role] || role || ''}
                </span>
              </div>

              {/* Email display for desktop */}
              <div className="hidden lg:block px-4 py-2 border-b border-dashboard-border">
                <p className="text-xs text-dashboard-text-secondary truncate">
                  {currentUser.email || ''}
                </p>
              </div>

              {/* Logout */}
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary transition-colors duration-150"
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
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export { Header };
export default Header;