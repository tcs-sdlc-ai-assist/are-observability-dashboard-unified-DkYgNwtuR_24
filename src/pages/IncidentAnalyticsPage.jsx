import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { FilterBar } from '../components/shared/FilterBar';
import { IncidentSummary } from '../components/incidents/IncidentSummary';
import { MTTRTrendChart } from '../components/incidents/MTTRTrendChart';
import { RCACategoryChart } from '../components/incidents/RCACategoryChart';
import { FailurePatterns } from '../components/incidents/FailurePatterns';
import { ChangeCorrelation } from '../components/incidents/ChangeCorrelation';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import {
  SEVERITY_LEVELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
  RCA_CATEGORIES,
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_COLORS,
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  SERVICE_STATUS,
} from '../constants/metrics';
import { formatTimestamp, formatPercentage, formatNumber } from '../utils/formatters';
import { getRelativeTime } from '../utils/dateUtils';

/**
 * Active view tab constants for the incident analytics page.
 */
const ANALYTICS_TABS = Object.freeze({
  SUMMARY: 'summary',
  MTTR_TRENDS: 'mttr_trends',
  RCA_ANALYSIS: 'rca_analysis',
  FAILURE_PATTERNS: 'failure_patterns',
  CHANGE_CORRELATION: 'change_correlation',
});

/**
 * Tab configuration for the analytics view selector.
 */
const TAB_CONFIG = Object.freeze([
  {
    key: ANALYTICS_TABS.SUMMARY,
    label: 'Summary',
    icon: 'summary',
    description: 'Incident counts, severity breakdown, and RCA distribution',
  },
  {
    key: ANALYTICS_TABS.MTTR_TRENDS,
    label: 'MTTR / MTTD',
    icon: 'trend',
    description: 'Mean time to resolve and detect trends over time',
  },
  {
    key: ANALYTICS_TABS.RCA_ANALYSIS,
    label: 'Root Cause',
    icon: 'rca',
    description: 'Root cause analysis distribution and per-category breakdown',
  },
  {
    key: ANALYTICS_TABS.FAILURE_PATTERNS,
    label: 'Failure Patterns',
    icon: 'patterns',
    description: 'Repeated failure patterns and flagged recurring issues',
  },
  {
    key: ANALYTICS_TABS.CHANGE_CORRELATION,
    label: 'Change Correlation',
    icon: 'correlation',
    description: 'Deployment-to-incident correlation and change failure rate',
  },
]);

/**
 * IncidentAnalyticsPage - Incident intelligence and RCA analytics page composing
 * IncidentSummary, MTTRTrendChart, RCACategoryChart, FailurePatterns, and
 * ChangeCorrelation widgets. Includes time range filter and severity filter.
 *
 * Features:
 * - FilterBar with domain, time range, severity, and root cause filters
 * - Tabbed analytics view selector (Summary, MTTR/MTTD, Root Cause, Failure Patterns, Change Correlation)
 * - Overall incident health summary metric cards
 * - IncidentSummary widget with severity breakdown and RCA pie chart
 * - MTTRTrendChart widget with MTTR/MTTD line chart and per-severity breakdown
 * - RCACategoryChart widget with RCA distribution donut and MTTR comparison
 * - FailurePatterns widget with repeated failure detection and flagging
 * - ChangeCorrelation widget with deployment-incident timeline and CFR analysis
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive layout with section spacing
 *
 * User Stories: SCRUM-7092 (Incident Summary & Trends), SCRUM-7093 (RCA & Failure Patterns), SCRUM-7094 (Change Failure Correlation)
 *
 * @returns {React.ReactNode}
 */
const IncidentAnalyticsPage = () => {
  const {
    filteredDomains,
    filteredDashboardData,
    isLoading,
    error,
    lastUpdated,
    refresh,
    setFilters,
  } = useDashboard();
  const { canViewAlerts } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(ANALYTICS_TABS.SUMMARY);

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
   * Get all incidents from dashboard data.
   */
  const allIncidents = useMemo(() => {
    if (!filteredDashboardData || !filteredDashboardData.incidents) {
      return [];
    }
    return filteredDashboardData.incidents;
  }, [filteredDashboardData]);

  /**
   * Get all deployment events from dashboard data.
   */
  const allDeployments = useMemo(() => {
    if (!filteredDashboardData || !filteredDashboardData.deployment_events) {
      return [];
    }
    return filteredDashboardData.deployment_events;
  }, [filteredDashboardData]);

  /**
   * Flatten all services from filteredDomains with domain metadata attached.
   */
  const allServices = useMemo(() => {
    if (!filteredDomains || !Array.isArray(filteredDomains) || filteredDomains.length === 0) {
      return [];
    }

    return filteredDomains.flatMap((domain) =>
      (domain.services || []).map((service) => ({
        ...service,
        domain_id: domain.domain_id,
        domain_name: domain.name,
        domain_tier: domain.tier,
      })),
    );
  }, [filteredDomains]);

  /**
   * Build service options for the FilterBar service selector.
   */
  const serviceOptions = useMemo(() => {
    return allServices.map((service) => ({
      value: service.service_id,
      label: service.name,
      domainId: service.domain_id,
      domain_id: service.domain_id,
      tier: DOMAIN_TIER_LABELS[service.domain_tier] || service.domain_tier,
    }));
  }, [allServices]);

  /**
   * Compute overall incident analytics summary.
   */
  const overallSummary = useMemo(() => {
    if (!allIncidents || allIncidents.length === 0) {
      return {
        totalIncidents: 0,
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
        p4Count: 0,
        activeCount: 0,
        resolvedCount: 0,
        avgMTTR: null,
        avgMTTD: null,
        avgMTBF: null,
        totalDeployments: 0,
        rolledBackDeployments: 0,
        changeFailureRate: 0,
        domainsAffected: 0,
      };
    }

    const p1Count = allIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P1).length;
    const p2Count = allIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P2).length;
    const p3Count = allIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P3).length;
    const p4Count = allIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P4).length;

    let activeCount = 0;
    let resolvedCount = 0;

    for (const inc of allIncidents) {
      const status = (inc.status || '').toLowerCase().trim();
      if (status === 'resolved') {
        resolvedCount++;
      } else {
        activeCount++;
      }
    }

    const mttrValues = allIncidents
      .filter((i) => i.mttr != null && !isNaN(i.mttr))
      .map((i) => parseFloat(i.mttr));

    const mttdValues = allIncidents
      .filter((i) => i.mttd != null && !isNaN(i.mttd))
      .map((i) => parseFloat(i.mttd));

    const mtbfValues = allIncidents
      .filter((i) => i.mtbf != null && !isNaN(i.mtbf))
      .map((i) => parseFloat(i.mtbf));

    const avgMTTR =
      mttrValues.length > 0
        ? parseFloat((mttrValues.reduce((sum, v) => sum + v, 0) / mttrValues.length).toFixed(2))
        : null;

    const avgMTTD =
      mttdValues.length > 0
        ? parseFloat((mttdValues.reduce((sum, v) => sum + v, 0) / mttdValues.length).toFixed(2))
        : null;

    const avgMTBF =
      mtbfValues.length > 0
        ? parseFloat((mtbfValues.reduce((sum, v) => sum + v, 0) / mtbfValues.length).toFixed(2))
        : null;

    const totalDeployments = allDeployments.length;
    const rolledBackDeployments = allDeployments.filter((d) => d.rollback === true).length;
    const changeFailureRate =
      totalDeployments > 0
        ? parseFloat(((rolledBackDeployments / totalDeployments) * 100).toFixed(2))
        : 0;

    const domainSet = new Set();
    for (const inc of allIncidents) {
      if (inc.domain_id) {
        domainSet.add(inc.domain_id);
      }
    }

    return {
      totalIncidents: allIncidents.length,
      p1Count,
      p2Count,
      p3Count,
      p4Count,
      activeCount,
      resolvedCount,
      avgMTTR,
      avgMTTD,
      avgMTBF,
      totalDeployments,
      rolledBackDeployments,
      changeFailureRate,
      domainsAffected: domainSet.size,
    };
  }, [allIncidents, allDeployments]);

  /**
   * Determine the overall incident health status.
   */
  const overallStatus = useMemo(() => {
    if (allIncidents.length === 0) return 'healthy';

    if (overallSummary.p1Count > 0 || overallSummary.activeCount > 2) return 'critical';
    if (overallSummary.p2Count > 0 || overallSummary.activeCount > 0) return 'warning';
    return 'healthy';
  }, [allIncidents, overallSummary]);

  /**
   * Get the MTTR color class based on value.
   * @param {number} value - The MTTR value in minutes.
   * @returns {string} Tailwind text color class.
   */
  const getMTTRColorClass = useCallback((value) => {
    if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
    if (value > 60) return 'text-severity-critical';
    if (value > 30) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Render the tab icon for a given tab key.
   * @param {string} iconKey - The icon key.
   * @param {string} className - Additional CSS classes.
   * @returns {React.ReactNode}
   */
  const renderTabIcon = useCallback((iconKey, className = '') => {
    const baseClass = `w-4 h-4 flex-shrink-0 ${className}`;

    switch (iconKey) {
      case 'summary':
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
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
        );
      case 'trend':
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
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        );
      case 'rca':
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
              d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
            />
          </svg>
        );
      case 'patterns':
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
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        );
      case 'correlation':
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
              d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
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
  if (!canViewAlerts) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Alerts Access Required"
          description="You do not have permission to view incident analytics. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading incident analytics…" size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !filteredDashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load incident analytics"
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
              Incident Analytics
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Incident intelligence, RCA analysis, failure patterns, and change failure correlation
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
            aria-label="Refresh incident analytics data"
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
        showService={true}
        showEnvironment={false}
        showTimeRange={true}
        showSeverity={true}
        showRootCause={true}
        showSearch={false}
        showReset={true}
        serviceOptions={serviceOptions}
        storageKey="filters_incident_analytics"
        className="mb-2"
      />

      {/* Error banner (non-blocking) */}
      {error && filteredDashboardData && (
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
      <section aria-label="Incident Analytics Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Total Incidents"
            value={overallSummary.totalIncidents}
            unit="count"
            size="md"
            status={overallStatus}
            subtitle={`${overallSummary.activeCount} active · ${overallSummary.resolvedCount} resolved`}
          />
          <MetricCard
            title="Avg MTTR"
            value={overallSummary.avgMTTR}
            unit="min"
            size="md"
            status={
              overallSummary.avgMTTR != null && overallSummary.avgMTTR > 60
                ? 'critical'
                : overallSummary.avgMTTR != null && overallSummary.avgMTTR > 30
                  ? 'warning'
                  : undefined
            }
            trend={{
              direction:
                overallSummary.avgMTTR != null && overallSummary.avgMTTR <= 30 ? 'stable' : 'up',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Avg MTTD"
            value={overallSummary.avgMTTD}
            unit="min"
            size="md"
            status={
              overallSummary.avgMTTD != null && overallSummary.avgMTTD > 30 ? 'warning' : undefined
            }
          />
          <MetricCard
            title="Avg MTBF"
            value={overallSummary.avgMTBF}
            unit="hr"
            size="md"
            status={
              overallSummary.avgMTBF != null && overallSummary.avgMTBF < 200
                ? 'warning'
                : overallSummary.avgMTBF != null && overallSummary.avgMTBF >= 500
                  ? 'healthy'
                  : undefined
            }
            trend={{
              direction:
                overallSummary.avgMTBF != null && overallSummary.avgMTBF >= 500 ? 'stable' : 'down',
              invertColor: true,
            }}
          />
          <MetricCard
            title="Change Failure Rate"
            value={overallSummary.changeFailureRate}
            unit="%"
            size="md"
            status={
              overallSummary.changeFailureRate > 25
                ? 'critical'
                : overallSummary.changeFailureRate > 10
                  ? 'warning'
                  : overallSummary.changeFailureRate > 0
                    ? 'degraded'
                    : 'healthy'
            }
            subtitle={`${overallSummary.rolledBackDeployments} of ${overallSummary.totalDeployments} rolled back`}
            trend={{
              direction: overallSummary.changeFailureRate > 15 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Severity Breakdown"
            value={overallSummary.p1Count + overallSummary.p2Count}
            unit="count"
            size="md"
            status={
              overallSummary.p1Count > 0
                ? 'critical'
                : overallSummary.p2Count > 0
                  ? 'warning'
                  : 'healthy'
            }
            subtitle={`P1: ${overallSummary.p1Count} · P2: ${overallSummary.p2Count} · P3: ${overallSummary.p3Count} · P4: ${overallSummary.p4Count}`}
          />
        </div>
      </section>

      {/* Analytics Tab Navigation */}
      <section aria-label="Analytics View Selector">
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

          {/* Severity quick-filter badges */}
          <div className="flex items-center gap-3 ml-auto text-xs text-dashboard-text-muted">
            {Object.values(SEVERITY_LEVELS).map((level) => {
              const count =
                level === SEVERITY_LEVELS.P1
                  ? overallSummary.p1Count
                  : level === SEVERITY_LEVELS.P2
                    ? overallSummary.p2Count
                    : level === SEVERITY_LEVELS.P3
                      ? overallSummary.p3Count
                      : overallSummary.p4Count;

              if (count === 0) return null;

              return (
                <span key={level} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[level] }}
                  />
                  {level}: {count}
                </span>
              );
            })}
            {overallSummary.domainsAffected > 0 && (
              <span>
                {overallSummary.domainsAffected} domain
                {overallSummary.domainsAffected !== 1 ? 's' : ''} affected
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Active Tab Content */}
      {activeTab === ANALYTICS_TABS.SUMMARY && (
        <section aria-label="Incident Summary">
          <IncidentSummary
            compact={false}
            showSeverityChart={true}
            showRCAChart={true}
            showRecentIncidents={true}
            showMetricCards={true}
            recentLimit={8}
            chartHeight={240}
          />
        </section>
      )}

      {activeTab === ANALYTICS_TABS.MTTR_TRENDS && (
        <section aria-label="MTTR / MTTD Trends">
          <MTTRTrendChart
            compact={false}
            showMetricCards={true}
            showSeverityBreakdown={true}
            chartHeight={320}
          />
        </section>
      )}

      {activeTab === ANALYTICS_TABS.RCA_ANALYSIS && (
        <section aria-label="Root Cause Analysis">
          <RCACategoryChart
            compact={false}
            showSeverityBreakdown={true}
            showMTTRComparison={true}
            showRecentIncidents={true}
            showMetricCards={true}
            recentLimit={8}
            chartHeight={280}
          />
        </section>
      )}

      {activeTab === ANALYTICS_TABS.FAILURE_PATTERNS && (
        <section aria-label="Failure Patterns">
          <FailurePatterns
            compact={false}
            flagThreshold={3}
            showMetricCards={true}
            showIncidentDetail={true}
            limit={0}
          />
        </section>
      )}

      {activeTab === ANALYTICS_TABS.CHANGE_CORRELATION && (
        <section aria-label="Change Failure Correlation">
          <ChangeCorrelation
            compact={false}
            showMetricCards={true}
            showCorrelationDetail={true}
            chartHeight={360}
            defaultCorrelationWindowHours={4}
          />
        </section>
      )}

      {/* Cross-Section Quick Links (shown below the active tab) */}
      {activeTab !== ANALYTICS_TABS.SUMMARY && (
        <section aria-label="Related Analytics">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Related Analytics
                </h3>
                <span className="text-xs text-dashboard-text-muted">
                  Quick access to other incident intelligence views
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
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

      {/* No incidents state */}
      {allIncidents.length === 0 && filteredDashboardData && (
        <section aria-label="No Incidents">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-col items-center gap-3 py-16">
              <svg
                className="w-12 h-12 text-status-healthy"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-dashboard-text-primary">
                No Incidents Recorded
              </h3>
              <p className="text-sm text-dashboard-text-muted text-center max-w-md">
                No incident data is available. Upload incident data to populate the analytics views
                with severity breakdowns, MTTR/MTTD trends, RCA analysis, and failure pattern
                detection.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {overallSummary.totalIncidents} incident{overallSummary.totalIncidents !== 1 ? 's' : ''}{' '}
            total
          </span>
          <span>·</span>
          <span>
            {overallSummary.totalDeployments} deployment
            {overallSummary.totalDeployments !== 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {filteredDomains?.length || 0} domain{(filteredDomains?.length || 0) !== 1 ? 's' : ''}{' '}
            monitored
          </span>
          {overallSummary.p1Count > 0 && (
            <>
              <span>·</span>
              <span className="text-severity-critical font-medium">
                {overallSummary.p1Count} P1 incident{overallSummary.p1Count !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span>Last refresh: {formatTimestamp(lastUpdated)}</span>}
        </div>
      </div>
    </div>
  );
};

export { IncidentAnalyticsPage };
export default IncidentAnalyticsPage;
