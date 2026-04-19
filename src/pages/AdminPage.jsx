import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../contexts/AuthContext';
import { FileUploader } from '../components/admin/FileUploader';
import { DataPreview } from '../components/admin/DataPreview';
import { ThresholdConfig } from '../components/admin/ThresholdConfig';
import { AuditLogViewer } from '../components/admin/AuditLogViewer';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { RoleGate } from '../components/auth/RoleGate';
import { PERMISSIONS, ROLES } from '../constants/roles';
import { formatTimestamp } from '../utils/formatters';
import { logAction, AUDIT_ACTIONS, AUDIT_RESULTS, getLogSummary } from '../services/auditLogger';

/**
 * Active tab constants for the admin page.
 */
const ADMIN_TABS = Object.freeze({
  UPLOAD: 'upload',
  THRESHOLDS: 'thresholds',
  AUDIT_LOGS: 'audit_logs',
});

/**
 * Tab configuration for the admin view selector.
 */
const TAB_CONFIG = Object.freeze([
  {
    key: ADMIN_TABS.UPLOAD,
    label: 'Data Upload',
    icon: 'upload',
    description: 'Upload CSV or Excel files to populate dashboard metrics, incidents, and deployments',
    permission: PERMISSIONS.UPLOAD_DATA,
  },
  {
    key: ADMIN_TABS.THRESHOLDS,
    label: 'Threshold Configuration',
    icon: 'settings',
    description: 'Configure warning and critical thresholds for observability metrics',
    permission: PERMISSIONS.CONFIGURE_THRESHOLDS,
  },
  {
    key: ADMIN_TABS.AUDIT_LOGS,
    label: 'Audit Logs',
    icon: 'audit',
    description: 'View and export the immutable audit trail of all user actions',
    permission: PERMISSIONS.VIEW_AUDIT_LOGS,
  },
]);

/**
 * AdminPage - Admin management page with tabs for Data Upload (FileUploader +
 * DataPreview), Threshold Configuration (ThresholdConfig), and Audit Logs
 * (AuditLogViewer). Admin role required.
 *
 * Features:
 * - Tabbed interface for Data Upload, Threshold Configuration, and Audit Logs
 * - FileUploader widget for CSV/Excel interim data upload
 * - ThresholdConfig widget for metric threshold configuration
 * - AuditLogViewer widget for viewing and exporting audit trail
 * - Overall admin summary metric cards
 * - Permission-gated tabs (only visible tabs the user has access to)
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive layout with section spacing
 *
 * User Stories: SCRUM-7097 (Admin Interim Data Upload), SCRUM-7098 (Configurable Metrics & Thresholds), SCRUM-7086 (Audit Logs)
 *
 * @returns {React.ReactNode}
 */
const AdminPage = () => {
  const {
    domains,
    dashboardData,
    isLoading,
    error,
    lastUpdated,
    refresh,
  } = useDashboard();
  const { currentUser } = useAuth();
  const {
    canUpload,
    canConfigure,
    canConfigureThresholds,
    canViewAudit,
    canManageUsers,
    isAdmin,
    isARELead,
    hasPermission,
  } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(null);

  /**
   * Determine the initial active tab based on user permissions.
   * Selects the first tab the user has access to.
   */
  const resolvedActiveTab = useMemo(() => {
    if (activeTab) {
      // Verify the user still has permission for the active tab
      const tabConfig = TAB_CONFIG.find((t) => t.key === activeTab);
      if (tabConfig && hasPermission(tabConfig.permission)) {
        return activeTab;
      }
    }

    // Find the first accessible tab
    for (const tab of TAB_CONFIG) {
      if (hasPermission(tab.permission)) {
        return tab.key;
      }
    }

    return null;
  }, [activeTab, hasPermission]);

  /**
   * Get the list of tabs accessible to the current user.
   */
  const accessibleTabs = useMemo(() => {
    return TAB_CONFIG.filter((tab) => hasPermission(tab.permission));
  }, [hasPermission]);

  /**
   * Handle manual refresh of dashboard data.
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } catch (_e) {
      // Error is handled by the DashboardContext
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  /**
   * Handle tab change.
   * @param {string} tabKey - The tab key to switch to.
   */
  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
  }, []);

  /**
   * Handle successful upload completion.
   * @param {Object} result - The upload result object.
   */
  const handleUploadComplete = useCallback(
    (result) => {
      // Log the view action for audit trail
      if (currentUser) {
        logAction(currentUser.id, AUDIT_ACTIONS.VIEW_DASHBOARD, 'admin_page', {
          user_name: currentUser.name,
          user_email: currentUser.email,
          status: AUDIT_RESULTS.SUCCESS,
          description: `Upload completed: ${result?.rowsImported || 0} rows imported`,
          details: {
            rows_imported: result?.rowsImported || 0,
          },
        });
      }
    },
    [currentUser],
  );

  /**
   * Handle threshold save completion.
   * @param {Object} config - The saved threshold configuration.
   */
  const handleThresholdSave = useCallback(() => {
    // Refresh dashboard data to reflect new thresholds
    handleRefresh();
  }, [handleRefresh]);

  /**
   * Compute overall admin summary from dashboard data.
   */
  const adminSummary = useMemo(() => {
    const totalDomains = domains && Array.isArray(domains) ? domains.length : 0;
    const totalServices = domains
      ? domains.reduce((sum, d) => sum + (d.services ? d.services.length : 0), 0)
      : 0;
    const totalIncidents = dashboardData?.incidents
      ? dashboardData.incidents.length
      : 0;
    const totalDeployments = dashboardData?.deployment_events
      ? dashboardData.deployment_events.length
      : 0;

    // Get audit log summary
    const auditSummary = getLogSummary();
    const totalAuditEntries = auditSummary.totalEntries || 0;

    // Count configured thresholds
    const thresholdConfig = dashboardData?.config?.thresholds;
    const configuredThresholds = thresholdConfig
      ? Array.isArray(thresholdConfig)
        ? thresholdConfig.length
        : Object.keys(thresholdConfig).length
      : 0;

    return {
      totalDomains,
      totalServices,
      totalIncidents,
      totalDeployments,
      totalAuditEntries,
      configuredThresholds,
    };
  }, [domains, dashboardData]);

  /**
   * Render the tab icon for a given tab key.
   * @param {string} iconKey - The icon key.
   * @param {string} className - Additional CSS classes.
   * @returns {React.ReactNode}
   */
  const renderTabIcon = useCallback((iconKey, className = '') => {
    const baseClass = `w-4 h-4 flex-shrink-0 ${className}`;

    switch (iconKey) {
      case 'upload':
        return (
          <svg
            className={baseClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        );
      case 'settings':
        return (
          <svg
            className={baseClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        );
      case 'audit':
        return (
          <svg
            className={baseClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
            />
          </svg>
        );
      default:
        return (
          <svg
            className={baseClass}
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
        );
    }
  }, []);

  /**
   * Check if the user has access to any admin features.
   */
  const hasAnyAdminAccess = useMemo(() => {
    return canUpload || canConfigure || canConfigureThresholds || canViewAudit || canManageUsers;
  }, [canUpload, canConfigure, canConfigureThresholds, canViewAudit, canManageUsers]);

  // Permission check — no admin access at all
  if (!hasAnyAdminAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Admin Access Required"
          description="You do not have permission to access the admin management page. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // No accessible tabs (edge case)
  if (accessibleTabs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="No Admin Features Available"
          description="Your role does not grant access to any admin features on this page. Contact an administrator if you believe this is an error."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading admin dashboard…" size="lg" />
      </div>
    );
  }

  // Error state (blocking)
  if (error && !domains?.length && !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load admin dashboard"
          description={error}
          size="md"
          actionLabel="Retry"
          onAction={handleRefresh}
        />
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
              Admin Management
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Data upload, metric threshold configuration, and audit log management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Role badge */}
          {currentUser && (
            <StatusBadge
              status={isAdmin ? 'healthy' : isARELead ? 'warning' : 'unknown'}
              size="sm"
              label={isAdmin ? 'Admin' : isARELead ? 'ARE Lead' : 'User'}
            />
          )}

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
            aria-label="Refresh admin dashboard data"
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
      {error && (domains?.length > 0 || dashboardData) && (
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

      {/* Top-Level Summary Metric Cards */}
      <section aria-label="Admin Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Domains"
            value={adminSummary.totalDomains}
            unit="count"
            size="md"
            subtitle={`${adminSummary.totalServices} services`}
          />
          <MetricCard
            title="Incidents"
            value={adminSummary.totalIncidents}
            unit="count"
            size="md"
            status={
              adminSummary.totalIncidents > 5
                ? 'warning'
                : adminSummary.totalIncidents > 0
                  ? 'degraded'
                  : 'healthy'
            }
          />
          <MetricCard
            title="Deployments"
            value={adminSummary.totalDeployments}
            unit="count"
            size="md"
          />
          <MetricCard
            title="Thresholds"
            value={adminSummary.configuredThresholds}
            unit="count"
            size="md"
            subtitle="Configured metrics"
            status={adminSummary.configuredThresholds > 0 ? 'healthy' : 'warning'}
          />
          <MetricCard
            title="Audit Entries"
            value={adminSummary.totalAuditEntries}
            unit="count"
            size="md"
            subtitle="Total log entries"
            status={adminSummary.totalAuditEntries > 0 ? 'healthy' : undefined}
          />
          <MetricCard
            title="Active View"
            value={
              resolvedActiveTab === ADMIN_TABS.UPLOAD
                ? 'Upload'
                : resolvedActiveTab === ADMIN_TABS.THRESHOLDS
                  ? 'Config'
                  : resolvedActiveTab === ADMIN_TABS.AUDIT_LOGS
                    ? 'Audit'
                    : '—'
            }
            unit=""
            size="md"
            subtitle={
              resolvedActiveTab
                ? TAB_CONFIG.find((t) => t.key === resolvedActiveTab)?.label || ''
                : 'No tab selected'
            }
          />
        </div>
      </section>

      {/* Tab Navigation */}
      <section aria-label="Admin View Selector">
        <div className="flex flex-wrap items-center gap-2">
          {accessibleTabs.map((tab) => {
            const isActive = resolvedActiveTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 border-brand-200 ring-2 ring-brand-500/20'
                    : 'bg-white text-dashboard-text-muted border-dashboard-border hover:bg-gray-50 hover:text-dashboard-text-secondary hover:border-gray-300'
                }`}
                aria-pressed={isActive}
                aria-label={`View ${tab.label}`}
                title={tab.description}
              >
                {renderTabIcon(tab.icon, isActive ? 'text-brand-600' : '')}
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* Summary badges */}
          <div className="flex items-center gap-4 ml-auto text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
              {adminSummary.totalDomains} Domains
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
              {adminSummary.totalServices} Services
            </span>
            {adminSummary.totalAuditEntries > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                {adminSummary.totalAuditEntries} Audit Entries
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Active Tab Content */}
      {resolvedActiveTab === ADMIN_TABS.UPLOAD && (
        <RoleGate requiredPermission={PERMISSIONS.UPLOAD_DATA}>
          <section aria-label="Data Upload">
            <FileUploader
              defaultSchemaType="metrics"
              onUploadComplete={handleUploadComplete}
            />
          </section>
        </RoleGate>
      )}

      {resolvedActiveTab === ADMIN_TABS.THRESHOLDS && (
        <RoleGate requiredPermission={PERMISSIONS.CONFIGURE_THRESHOLDS}>
          <section aria-label="Threshold Configuration">
            <ThresholdConfig
              compact={false}
              onSave={handleThresholdSave}
            />
          </section>
        </RoleGate>
      )}

      {resolvedActiveTab === ADMIN_TABS.AUDIT_LOGS && (
        <RoleGate requiredPermission={PERMISSIONS.VIEW_AUDIT_LOGS}>
          <section aria-label="Audit Logs">
            <AuditLogViewer
              compact={false}
              showMetricCards={true}
              showExport={true}
              pageSize={15}
            />
          </section>
        </RoleGate>
      )}

      {/* Cross-Section Quick Links (shown below the active tab) */}
      {resolvedActiveTab && accessibleTabs.length > 1 && (
        <section aria-label="Related Admin Views">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Other Admin Tools
                </h3>
                <span className="text-xs text-dashboard-text-muted">
                  Quick access to other admin management views
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {accessibleTabs
                .filter((tab) => tab.key !== resolvedActiveTab)
                .map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className="flex items-start gap-3 px-4 py-3 rounded-lg border border-dashboard-border bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors duration-150 text-left group"
                    aria-label={`Switch to ${tab.label} view`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 flex-shrink-0 group-hover:bg-brand-100 transition-colors duration-150">
                      {renderTabIcon(tab.icon, 'text-brand-600')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-dashboard-text-primary group-hover:text-brand-600 transition-colors duration-150">
                        {tab.label}
                      </p>
                      <p className="text-[10px] text-dashboard-text-muted mt-0.5 line-clamp-2">
                        {tab.description}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Admin Info Footer */}
      <section aria-label="Admin Information">
        <div className="dashboard-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Admin Information
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {/* Current User Info */}
            {currentUser && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-dashboard-border bg-gray-50/50">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 text-white text-xs font-semibold flex-shrink-0">
                  {currentUser.avatar || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-dashboard-text-primary truncate">
                    {currentUser.name || 'User'}
                  </p>
                  <p className="text-xs text-dashboard-text-muted truncate">
                    {currentUser.email || ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge
                      status={isAdmin ? 'healthy' : isARELead ? 'warning' : 'unknown'}
                      size="sm"
                      label={isAdmin ? 'Admin' : isARELead ? 'ARE Lead' : 'View Only'}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Permissions Summary */}
            <div className="flex flex-col gap-2 px-4 py-3 rounded-lg border border-dashboard-border bg-gray-50/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
                Your Permissions
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {canUpload && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                    Upload Data
                  </span>
                )}
                {canConfigureThresholds && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 bg-purple-50 text-purple-800">
                    Configure Thresholds
                  </span>
                )}
                {canConfigure && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 bg-purple-50 text-purple-800">
                    Configure Metrics
                  </span>
                )}
                {canViewAudit && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 bg-blue-50 text-blue-800">
                    View Audit Logs
                  </span>
                )}
                {canManageUsers && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 bg-orange-50 text-orange-800">
                    Manage Users
                  </span>
                )}
              </div>
            </div>

            {/* Data Status */}
            <div className="flex flex-col gap-2 px-4 py-3 rounded-lg border border-dashboard-border bg-gray-50/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
                Data Status
              </h4>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dashboard-text-muted">Domains:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {adminSummary.totalDomains}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dashboard-text-muted">Services:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {adminSummary.totalServices}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dashboard-text-muted">Incidents:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {adminSummary.totalIncidents}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dashboard-text-muted">Deployments:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {adminSummary.totalDeployments}
                  </span>
                </div>
                {lastUpdated && (
                  <div className="flex items-center justify-between gap-2 mt-1 pt-1 border-t border-dashboard-border">
                    <span className="text-dashboard-text-muted">Last Updated:</span>
                    <span className="font-medium text-dashboard-text-secondary">
                      {formatTimestamp(lastUpdated, { relative: true })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                {accessibleTabs.length} admin tool{accessibleTabs.length !== 1 ? 's' : ''} available
              </span>
              <span>·</span>
              <span>
                Data persisted to local storage
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              {lastUpdated && (
                <span>
                  Last refresh: {formatTimestamp(lastUpdated)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {adminSummary.totalDomains} domain{adminSummary.totalDomains !== 1 ? 's' : ''} · {adminSummary.totalServices} service{adminSummary.totalServices !== 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {adminSummary.totalAuditEntries} audit log entr{adminSummary.totalAuditEntries !== 1 ? 'ies' : 'y'}
          </span>
          <span>·</span>
          <span>
            {adminSummary.configuredThresholds} threshold{adminSummary.configuredThresholds !== 1 ? 's' : ''} configured
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

export { AdminPage, ADMIN_TABS };
export default AdminPage;