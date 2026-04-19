import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/**
 * DashboardLayout - Main layout wrapper that combines the Sidebar, Header,
 * and routed content area (Outlet) into a consistent page structure.
 *
 * Features:
 * - Sidebar navigation (collapsible on desktop, drawer on mobile)
 * - Sticky top header bar with page title, search, user menu
 * - Scrollable content area rendered via react-router-dom Outlet
 * - Mobile sidebar drawer with overlay toggle
 * - Responsive layout adapting to sidebar collapsed/expanded state
 *
 * @returns {React.ReactNode}
 */
const DashboardLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /**
   * Toggle the mobile sidebar drawer open/closed.
   */
  const handleMobileMenuToggle = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  /**
   * Close the mobile sidebar drawer.
   */
  const handleMobileMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="flex min-h-screen bg-dashboard-bg">
      {/* Sidebar (desktop fixed + mobile drawer) */}
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={handleMobileMenuClose} />

      {/* Main content area (pushed right by sidebar spacer on desktop) */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Sticky header */}
        <Header onMobileMenuToggle={handleMobileMenuToggle} />

        {/* Page content rendered by nested routes */}
        <main className="flex-1 overflow-y-auto scrollbar-thin content-area">
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export { DashboardLayout };
export default DashboardLayout;