import { useState, useCallback } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { FilterBar } from '../components/shared/FilterBar';
import { AvailabilityOverview } from '../components/dashboard/AvailabilityOverview';
import { DegradedServices } from '../components/dashboard/DegradedServices';
import { SLOComplianceCard } from '../components/dashboard/SLOComplianceCard';
import { ErrorBudgetChart } from '../components/dashboard/ErrorBudgetChart';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { formatTimestamp } from '../utils/formatters';

/**
 * ExecutiveOverviewPage - Executive availability and SLO overview dashboard page.
 * Default landing page after login. Composes AvailabilityOverview, DegradedServices,
 * SLOComplianceCard, and ErrorBudgetChart widgets with a FilterBar for domain/time
 * range selection.
 *
 * Features:
 * - FilterBar with domain and time range filters
 * - AvailabilityOverview widget showing platform availability and per-domain breakdown
 * - DegradedServices widget listing top degraded/down services
 * - SLOComplianceCard widget showing SLA/SLO compliance status
 * - ErrorBudgetChart widget showing error budget burn-down per service
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive layout with section spacing
 *
 * User Stories: SCRUM-7087 (Enterprise Availability Snapshot), SCRUM-7088 (Error Budget Health)
 *
 * @returns {React.ReactNode}
 */
const ExecutiveOverviewPage = () => {
  const { domains, isLoading, error, lastUpdated, refresh, setFilters } = useDashboard();
  const { canView } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Permission check
  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Dashboard Access Required"
          description="You do not have permission to view the executive overview. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading executive overview…" size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !domains?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load dashboard"
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
              Executive Overview
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Platform availability, SLO compliance, and error budget health at a glance
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
            aria-label="Refresh dashboard data"
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

      {/* Availability Overview Section */}
      <section aria-label="Availability Overview">
        <AvailabilityOverview showServiceDetail={true} compact={false} />
      </section>

      {/* SLO Compliance + Error Budget Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* SLO Compliance Section */}
        <section aria-label="SLO Compliance">
          <SLOComplianceCard
            showServiceDetail={true}
            compact={false}
            mode="both"
          />
        </section>

        {/* Error Budget Health Section */}
        <section aria-label="Error Budget Health">
          <ErrorBudgetChart
            showServiceDetail={true}
            showChart={true}
            compact={false}
          />
        </section>
      </div>

      {/* Degraded Services Section */}
      <section aria-label="Degraded Services">
        <DegradedServices
          compact={false}
          limit={10}
          showAllServices={false}
        />
      </section>

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {domains?.length || 0} domain{(domains?.length || 0) !== 1 ? 's' : ''} monitored
          </span>
          <span>·</span>
          <span>
            {domains?.reduce((sum, d) => sum + (d.services?.length || 0), 0) || 0} total services
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

export { ExecutiveOverviewPage };
export default ExecutiveOverviewPage;