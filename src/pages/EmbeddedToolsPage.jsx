import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { EmbeddedDashboard } from '../components/embedded/EmbeddedDashboard';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { formatTimestamp } from '../utils/formatters';

/**
 * Tab configuration for embedded tool dashboards.
 * Each tab maps to an external observability tool with its environment variable key.
 */
const EMBEDDED_TABS = Object.freeze([
  {
    key: 'dynatrace',
    label: 'Dynatrace',
    envKey: 'VITE_DYNATRACE_EMBED_URL',
    description: 'Application Performance Monitoring — real-time infrastructure and application health',
    icon: 'apm',
    height: 700,
  },
  {
    key: 'elastic',
    label: 'Elastic',
    envKey: 'VITE_ELASTIC_EMBED_URL',
    description: 'Log analytics and observability — centralized logging, metrics, and traces',
    icon: 'logs',
    height: 700,
  },
]);

/**
 * Storage key for persisting the selected tab.
 */
const ACTIVE_TAB_STORAGE_KEY = 'embedded_tools_active_tab';

/**
 * EmbeddedToolsPage - Page with tabbed interface for embedded Dynatrace and
 * Elastic dashboards using the EmbeddedDashboard component. Tab selection
 * persists across sessions via localStorage. Includes fallback messaging if
 * URLs are not configured.
 *
 * Features:
 * - Tabbed interface for switching between Dynatrace and Elastic dashboards
 * - Tab selection persists to localStorage across sessions
 * - EmbeddedDashboard component renders each tool in a responsive iframe
 * - Fallback messaging when embed URLs are not configured
 * - Summary cards showing tool availability status
 * - Refresh button to reload the active embedded dashboard
 * - Last updated timestamp display
 * - Loading and error states
 * - Responsive layout with accessible tab navigation
 *
 * User Stories: SCRUM-7091 (Embedded Tool Dashboards)
 *
 * @returns {React.ReactNode}
 */
const EmbeddedToolsPage = () => {
  const { isLoading, error, lastUpdated, refresh } = useDashboard();
  const { canViewMetrics } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useLocalStorage(ACTIVE_TAB_STORAGE_KEY, EMBEDDED_TABS[0].key);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Resolve the URLs for each embedded tool from environment variables.
   */
  const toolStatuses = useMemo(() => {
    return EMBEDDED_TABS.map((tab) => {
      const envUrl = import.meta.env[tab.envKey];
      const isConfigured = Boolean(envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0);

      let isValidUrl = false;
      if (isConfigured) {
        try {
          new URL(envUrl.trim());
          isValidUrl = true;
        } catch (_e) {
          isValidUrl = false;
        }
      }

      return {
        ...tab,
        url: isConfigured ? envUrl.trim() : null,
        isConfigured,
        isAvailable: isConfigured && isValidUrl,
      };
    });
  }, []);

  /**
   * Get the currently active tab configuration.
   */
  const activeTabConfig = useMemo(() => {
    const found = toolStatuses.find((t) => t.key === activeTab);
    return found || toolStatuses[0];
  }, [activeTab, toolStatuses]);

  /**
   * Summary counts for the tool status cards.
   */
  const summary = useMemo(() => {
    const total = toolStatuses.length;
    const configured = toolStatuses.filter((t) => t.isConfigured).length;
    const available = toolStatuses.filter((t) => t.isAvailable).length;
    const notConfigured = total - configured;

    return { total, configured, available, notConfigured };
  }, [toolStatuses]);

  /**
   * Handle tab selection change.
   * @param {string} tabKey - The tab key to switch to.
   */
  const handleTabChange = useCallback(
    (tabKey) => {
      if (tabKey === activeTab) return;
      setActiveTab(tabKey);
    },
    [activeTab, setActiveTab],
  );

  /**
   * Handle manual refresh of the active embedded dashboard.
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);

    try {
      await refresh();
    } catch (_e) {
      // Error is handled by the DashboardContext
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  /**
   * Handle keyboard navigation for tabs.
   * @param {KeyboardEvent} event - The keyboard event.
   * @param {number} tabIndex - The current tab index.
   */
  const handleTabKeyDown = useCallback(
    (event, tabIndex) => {
      let newIndex = tabIndex;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        newIndex = (tabIndex + 1) % EMBEDDED_TABS.length;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        newIndex = (tabIndex - 1 + EMBEDDED_TABS.length) % EMBEDDED_TABS.length;
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = EMBEDDED_TABS.length - 1;
      } else {
        return;
      }

      setActiveTab(EMBEDDED_TABS[newIndex].key);
    },
    [setActiveTab],
  );

  /**
   * Render the icon for a tool tab.
   * @param {string} iconKey - The icon key.
   * @param {string} className - Additional CSS classes.
   * @returns {React.ReactNode}
   */
  const renderTabIcon = useCallback((iconKey, className = '') => {
    const baseClass = `w-4 h-4 flex-shrink-0 ${className}`;

    switch (iconKey) {
      case 'apm':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        );
      case 'logs':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        );
      default:
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        );
    }
  }, []);

  // Permission check
  if (!canViewMetrics) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Metrics Access Required"
          description="You do not have permission to view embedded tool dashboards. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading embedded tools…" size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h1 className="text-2xl font-bold text-dashboard-text-primary tracking-tight">
              Embedded Tool Dashboards
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Access Dynatrace APM and Elastic observability dashboards directly within Horizon
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Last updated timestamp */}
          {lastUpdated && (
            <span className="hidden sm:inline text-xs text-dashboard-text-muted">
              Updated {formatTimestamp(lastUpdated, { relative: true })}
            </span>
          )}

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors duration-150 ${
              isRefreshing
                ? 'bg-gray-50 text-dashboard-text-muted border-dashboard-border cursor-not-allowed'
                : 'bg-white text-dashboard-text-secondary border-dashboard-border hover:bg-gray-50 hover:text-dashboard-text-primary'
            }`}
            aria-label="Refresh embedded dashboard"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error banner (non-blocking) */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-50/50 border border-yellow-200 animate-fade-in">
          <svg
            className="w-5 h-5 text-status-degraded flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-yellow-800">Data may be stale</p>
            <p className="text-sm text-yellow-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-xs text-yellow-700 hover:text-yellow-800 font-medium transition-colors duration-150 flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tool Status Summary Cards */}
      <section aria-label="Tool Status Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Tools"
            value={summary.total}
            unit="count"
            size="md"
            subtitle="Embedded observability tools"
          />
          <MetricCard
            title="Configured"
            value={summary.configured}
            unit="count"
            size="md"
            status={summary.configured === summary.total ? 'healthy' : 'warning'}
            subtitle={`${summary.notConfigured} not configured`}
          />
          <MetricCard
            title="Available"
            value={summary.available}
            unit="count"
            size="md"
            status={summary.available === summary.total ? 'healthy' : summary.available > 0 ? 'degraded' : 'critical'}
            subtitle={summary.available === summary.total ? 'All tools reachable' : `${summary.total - summary.available} unavailable`}
          />
          <MetricCard
            title="Active View"
            value={activeTabConfig.label}
            unit=""
            size="md"
            subtitle={activeTabConfig.isAvailable ? 'Connected' : 'Not configured'}
            status={activeTabConfig.isAvailable ? 'healthy' : 'warning'}
          />
        </div>
      </section>

      {/* Tab Navigation + Embedded Dashboard */}
      <section aria-label="Embedded Dashboards">
        <div className="dashboard-card overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center justify-between gap-3 px-4 border-b border-dashboard-border">
            <div
              className="flex items-center gap-0"
              role="tablist"
              aria-label="Embedded tool tabs"
            >
              {toolStatuses.map((tab, index) => {
                const isActive = tab.key === activeTabConfig.key;

                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 ${
                      isActive
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-dashboard-text-muted hover:text-dashboard-text-secondary hover:border-gray-300'
                    }`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.key}`}
                    id={`tab-${tab.key}`}
                    tabIndex={isActive ? 0 : -1}
                  >
                    {renderTabIcon(tab.icon, isActive ? 'text-brand-600' : '')}
                    <span>{tab.label}</span>
                    {tab.isAvailable ? (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-healthy flex-shrink-0" />
                    ) : (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-unknown flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab-level status info */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-dashboard-text-muted">
              {activeTabConfig.isAvailable ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-healthy" />
                  Connected
                </span>
              ) : activeTabConfig.isConfigured ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-degraded" />
                  Invalid URL
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-unknown" />
                  Not Configured
                </span>
              )}
            </div>
          </div>

          {/* Tab Panels */}
          {toolStatuses.map((tab) => {
            const isActive = tab.key === activeTabConfig.key;

            return (
              <div
                key={tab.key}
                id={`tabpanel-${tab.key}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab.key}`}
                hidden={!isActive}
                tabIndex={0}
              >
                {isActive && (
                  <EmbeddedDashboard
                    key={`${tab.key}-${refreshKey}`}
                    url={tab.url}
                    title={tab.label}
                    height={tab.height}
                    envKey={tab.envKey}
                    description={tab.description}
                    showHeader={false}
                    showRefresh={false}
                    showOpenExternal={false}
                  />
                )}
              </div>
            );
          })}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
                External Dashboard
              </span>
              <span>·</span>
              <span>
                {activeTabConfig.label}
                {activeTabConfig.isAvailable && activeTabConfig.url && (
                  <span className="hidden lg:inline ml-1 font-mono text-[10px] truncate max-w-[300px]">
                    ({activeTabConfig.url})
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {activeTabConfig.isAvailable && activeTabConfig.url && (
                <a
                  href={activeTabConfig.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                  Open in new tab
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Configuration Guide (shown when tools are not configured) */}
      {summary.notConfigured > 0 && (
        <section aria-label="Configuration Guide">
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Configuration Guide
                </h3>
                <StatusBadge
                  status="warning"
                  size="sm"
                  label={`${summary.notConfigured} tool${summary.notConfigured !== 1 ? 's' : ''} not configured`}
                />
              </div>
            </div>

            <div className="p-4">
              <p className="text-sm text-dashboard-text-secondary mb-4">
                To enable embedded dashboards, configure the following environment variables in your{' '}
                <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-dashboard-text-primary">
                  .env
                </code>{' '}
                file:
              </p>

              <div className="flex flex-col gap-3">
                {toolStatuses
                  .filter((tab) => !tab.isConfigured)
                  .map((tab) => (
                    <div
                      key={tab.key}
                      className="flex items-start gap-3 px-4 py-3 rounded-lg border border-dashboard-border bg-gray-50/50"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 flex-shrink-0 mt-0.5">
                        {renderTabIcon(tab.icon, 'text-brand-600')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-dashboard-text-primary">
                          {tab.label}
                        </p>
                        <p className="text-xs text-dashboard-text-muted mt-0.5">
                          {tab.description}
                        </p>
                        <div className="mt-2 px-3 py-2 bg-white rounded-md border border-dashboard-border">
                          <code className="text-xs font-mono text-dashboard-text-secondary">
                            {tab.envKey}=https://your-{tab.key}-instance.example.com/dashboard
                          </code>
                        </div>
                      </div>
                      <StatusBadge status="unknown" size="sm" label="Not Set" />
                    </div>
                  ))}
              </div>

              <div className="flex items-center gap-2 mt-4 text-xs text-dashboard-text-muted">
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <span>
                  After updating environment variables, restart the development server for changes to take effect.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* All Tools Status Overview */}
      <section aria-label="Tool Status Overview">
        <div className="dashboard-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Tool Status Overview
              </h3>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {summary.total}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
                Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-status-unknown" />
                Not Configured
              </span>
            </div>
          </div>

          <div className="divide-y divide-dashboard-border">
            {toolStatuses.map((tab) => {
              const isActive = tab.key === activeTabConfig.key;

              return (
                <div
                  key={tab.key}
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ${
                    isActive ? 'bg-brand-50/30' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 flex-shrink-0">
                      {renderTabIcon(tab.icon, 'text-brand-600')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-dashboard-text-primary">
                          {tab.label}
                        </p>
                        {isActive && (
                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-brand-100 text-brand-800">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-dashboard-text-muted mt-0.5 truncate">
                        {tab.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {tab.isAvailable ? (
                      <StatusBadge status="healthy" size="sm" label="Available" />
                    ) : tab.isConfigured ? (
                      <StatusBadge status="warning" size="sm" label="Invalid URL" />
                    ) : (
                      <StatusBadge status="unknown" size="sm" label="Not Configured" />
                    )}

                    <button
                      onClick={() => handleTabChange(tab.key)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
                        isActive
                          ? 'bg-brand-100 text-brand-700'
                          : 'text-brand-600 hover:bg-brand-50 hover:text-brand-700'
                      }`}
                      aria-label={`View ${tab.label} dashboard`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
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
                      {isActive ? 'Viewing' : 'View'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                {summary.available} of {summary.total} tool{summary.total !== 1 ? 's' : ''} available
              </span>
              <span>·</span>
              <span>
                Dashboards are embedded via secure iframes
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                Configure URLs in{' '}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">
                  .env
                </code>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {summary.total} embedded tool{summary.total !== 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {summary.available} available · {summary.notConfigured} not configured
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span>
              Last refresh: {formatTimestamp(lastUpdated)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export { EmbeddedToolsPage };
export default EmbeddedToolsPage;