import { useState, useCallback } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { FilterBar } from '../components/shared/FilterBar';
import { ComplianceReport } from '../components/compliance/ComplianceReport';
import { SOPLinks } from '../components/compliance/SOPLinks';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { formatTimestamp } from '../utils/formatters';

/**
 * Active view tab constants for the compliance page.
 */
const COMPLIANCE_TABS = Object.freeze({
  REPORT: 'report',
  SOP_LINKS: 'sop_links',
});

/**
 * Tab configuration for the compliance view selector.
 */
const TAB_CONFIG = Object.freeze([
  {
    key: COMPLIANCE_TABS.REPORT,
    label: 'Compliance Report',
    icon: 'report',
    description: 'SLA adherence, uptime percentages, incident audit summary, and evidence links',
  },
  {
    key: COMPLIANCE_TABS.SOP_LINKS,
    label: 'SOP & Playbooks',
    icon: 'sop',
    description: 'Standard operating procedures, runbooks, and escalation playbooks',
  },
]);

/**
 * CompliancePage - Compliance and reporting page composing ComplianceReport and
 * SOPLinks widgets. Includes export functionality for audit reports and evidence
 * links. Accessible to all roles.
 *
 * Features:
 * - FilterBar with domain and time range filters
 * - Tabbed view selector (Compliance Report, SOP & Playbooks)
 * - ComplianceReport widget with SLA adherence, uptime, incident audit, and evidence links
 * - SOPLinks widget with categorized playbook/runbook directory
 * - Overall compliance health summary metric cards
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive layout with section spacing
 *
 * User Stories: SCRUM-7095 (Operational Compliance Views), SCRUM-7096 (Confluence/SOP Links)
 *
 * @returns {React.ReactNode}
 */
const CompliancePage = () => {
  const {
    domains,
    dashboardData,
    isLoading,
    error,
    lastUpdated,
    refresh,
    setFilters,
  } = useDashboard();
  const { canView } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(COMPLIANCE_TABS.REPORT);

  /**
   * Handle filter changes from the FilterBar.
   * @param {Object} filters - The updated filter values.
   */
  const handleFilterChange = useCallback(
    (filters) => {
      if (filters && typeof filters === 'object') {
        setFilters(filters);
      }
    },
    [setFilters],
  );

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
   * Compute overall compliance summary from dashboard data.
   */
  const overallSummary = (() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return {
        totalDomains: 0,
        totalServices: 0,
        totalIncidents: 0,
        complianceRecords: 0,
        confluenceLinks: 0,
      };
    }

    const totalServices = domains.reduce(
      (sum, d) => sum + (d.services ? d.services.length : 0),
      0,
    );

    const totalIncidents = dashboardData?.incidents
      ? dashboardData.incidents.length
      : 0;

    const complianceRecords = dashboardData?.sla_compliance
      ? dashboardData.sla_compliance.length
      : 0;

    const confluenceLinks =
      dashboardData?.config?.confluence_links
        ? dashboardData.config.confluence_links.length
        : 0;

    return {
      totalDomains: domains.length,
      totalServices,
      totalIncidents,
      complianceRecords,
      confluenceLinks,
    };
  })();

  /**
   * Render the tab icon for a given tab key.
   * @param {string} iconKey - The icon key.
   * @param {string} className - Additional CSS classes.
   * @returns {React.ReactNode}
   */
  const renderTabIcon = useCallback((iconKey, className = '') => {
    const baseClass = `w-4 h-4 flex-shrink-0 ${className}`;

    switch (iconKey) {
      case 'report':
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
      case 'sop':
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
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
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

  // Permission check
  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Dashboard Access Required"
          description="You do not have permission to view the compliance page. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading compliance data…" size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !domains?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load compliance data"
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
              Operational Compliance
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              SLA compliance reports, incident audit summaries, evidence links, and operational playbooks
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
            aria-label="Refresh compliance data"
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

      {/* Filter Bar */}
      <FilterBar
        onChange={handleFilterChange}
        showDomain={true}
        showService={false}
        showEnvironment={false}
        showTimeRange={true}
        showSeverity={false}
        showRootCause={false}
        showSearch={false}
        showReset={true}
        className="mb-2"
      />

      {/* Error banner (non-blocking) */}
      {error && domains?.length > 0 && (
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
      <section aria-label="Compliance Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Domains Monitored"
            value={overallSummary.totalDomains}
            unit="count"
            size="md"
            subtitle={`${overallSummary.totalServices} services`}
          />
          <MetricCard
            title="Compliance Records"
            value={overallSummary.complianceRecords}
            unit="count"
            size="md"
            subtitle="Monthly SLA records"
            status={overallSummary.complianceRecords > 0 ? 'healthy' : 'warning'}
          />
          <MetricCard
            title="Total Incidents"
            value={overallSummary.totalIncidents}
            unit="count"
            size="md"
            status={
              overallSummary.totalIncidents > 5
                ? 'warning'
                : overallSummary.totalIncidents > 0
                  ? 'degraded'
                  : 'healthy'
            }
            subtitle="Across all domains"
          />
          <MetricCard
            title="SOP / Playbook Links"
            value={overallSummary.confluenceLinks}
            unit="count"
            size="md"
            subtitle="Operational resources"
            status={overallSummary.confluenceLinks > 0 ? 'healthy' : 'warning'}
          />
          <MetricCard
            title="Active View"
            value={activeTab === COMPLIANCE_TABS.REPORT ? 'Report' : 'SOPs'}
            unit=""
            size="md"
            subtitle={
              activeTab === COMPLIANCE_TABS.REPORT
                ? 'SLA compliance & audit'
                : 'Playbooks & runbooks'
            }
          />
        </div>
      </section>

      {/* Tab Navigation */}
      <section aria-label="Compliance View Selector">
        <div className="flex flex-wrap items-center gap-2">
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.key;

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
              {overallSummary.totalDomains} Domains
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
              {overallSummary.totalServices} Services
            </span>
            {overallSummary.totalIncidents > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
                {overallSummary.totalIncidents} Incidents
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Active Tab Content */}
      {activeTab === COMPLIANCE_TABS.REPORT && (
        <section aria-label="Compliance Report">
          <ComplianceReport
            compact={false}
            showMetricCards={true}
            showChart={true}
            showIncidentAudit={true}
            showEvidenceLinks={true}
            showExport={true}
            showConfluenceLinks={true}
            chartHeight={280}
          />
        </section>
      )}

      {activeTab === COMPLIANCE_TABS.SOP_LINKS && (
        <section aria-label="SOP & Playbook Directory">
          <SOPLinks
            compact={false}
            showSearch={true}
            showCategoryFilter={true}
            showExternalTools={true}
          />
        </section>
      )}

      {/* Cross-Section Quick Links (shown below the active tab) */}
      {activeTab !== COMPLIANCE_TABS.REPORT && (
        <section aria-label="Related Compliance Views">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Related Views
                </h3>
                <span className="text-xs text-dashboard-text-muted">
                  Quick access to other compliance views
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
              {TAB_CONFIG.filter((tab) => tab.key !== activeTab).map((tab) => (
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

      {/* No data state */}
      {(!domains || domains.length === 0) && dashboardData && (
        <section aria-label="No Compliance Data">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-col items-center gap-3 py-16">
              <svg
                className="w-12 h-12 text-dashboard-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-dashboard-text-primary">
                No Compliance Data Available
              </h3>
              <p className="text-sm text-dashboard-text-muted text-center max-w-md">
                No domain or service data is available. Upload metrics data to populate the
                compliance report with SLA adherence, uptime percentages, and incident audit summaries.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {overallSummary.totalDomains} domain{overallSummary.totalDomains !== 1 ? 's' : ''} monitored
          </span>
          <span>·</span>
          <span>
            {overallSummary.totalServices} total services
          </span>
          <span>·</span>
          <span>
            {overallSummary.complianceRecords} compliance record{overallSummary.complianceRecords !== 1 ? 's' : ''}
          </span>
          {overallSummary.confluenceLinks > 0 && (
            <>
              <span>·</span>
              <span>
                {overallSummary.confluenceLinks} SOP link{overallSummary.confluenceLinks !== 1 ? 's' : ''}
              </span>
            </>
          )}
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

export { CompliancePage };
export default CompliancePage;