import { useState, useCallback } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { FilterBar } from '../components/shared/FilterBar';
import { ErrorBudgetChart } from '../components/dashboard/ErrorBudgetChart';
import { ErrorBudgetTable } from '../components/dashboard/ErrorBudgetTable';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  SERVICE_STATUS,
} from '../constants/metrics';
import { formatTimestamp, formatPercentage, formatNumber } from '../utils/formatters';
import { getRelativeTime } from '../utils/dateUtils';
import { calculateTrendDirection } from '../utils/chartHelpers';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/**
 * ErrorBudgetPage - Dedicated error budget health deep-dive page with
 * ErrorBudgetChart (detailed view per service), ErrorBudgetTable (all services),
 * burn rate analysis, and breach history.
 *
 * Features:
 * - FilterBar with domain and time range filters
 * - Overall error budget summary metric cards
 * - ErrorBudgetChart widget with per-service burn-down visualization
 * - ErrorBudgetTable widget with sortable/filterable table of all services
 * - Burn rate analysis section with per-tier breakdown
 * - Breach history section showing services that have breached error budgets
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive layout with section spacing
 *
 * User Stories: SCRUM-7088 (Error Budget Health)
 *
 * @returns {React.ReactNode}
 */
const ErrorBudgetPage = () => {
  const { filteredDomains: domains, dashboardData, isLoading, error, lastUpdated, refresh, setFilters } = useDashboard();
  const { canViewMetrics } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeView, setActiveView] = useState('chart');

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
   * Handle view toggle between chart and table.
   * @param {string} view - The view to switch to ('chart' or 'table').
   */
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
  }, []);

  /**
   * Compute overall error budget summary from all domains/services.
   */
  const overallSummary = (() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return {
        totalServices: 0,
        healthyServices: 0,
        warningServices: 0,
        criticalServices: 0,
        avgBudget: 0,
        avgBurnRate: 0,
        breachedServices: [],
      };
    }

    let totalServices = 0;
    let healthyServices = 0;
    let warningServices = 0;
    let criticalServices = 0;
    let totalBudget = 0;
    let totalBurnRate = 0;
    const breachedServices = [];

    for (const domain of domains) {
      for (const service of domain.services || []) {
        totalServices++;
        const errorBudget = service.error_budget != null ? service.error_budget : 100;
        totalBudget += errorBudget;

        const budgetConsumed = 100 - errorBudget;
        const burnRate = parseFloat((budgetConsumed / 30).toFixed(2));
        totalBurnRate += burnRate;

        if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) {
          criticalServices++;
          breachedServices.push({
            service_id: service.service_id,
            name: service.name,
            domain_id: domain.domain_id,
            domain_name: domain.name,
            domain_tier: domain.tier,
            error_budget: errorBudget,
            burn_rate: burnRate,
            availability: service.availability,
            slo: service.slo != null ? service.slo : (DEFAULT_SLO_TARGETS[domain.tier] ?? 99.5),
            status: service.status,
          });
        } else if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) {
          warningServices++;
        } else {
          healthyServices++;
        }
      }
    }

    const avgBudget = totalServices > 0
      ? parseFloat((totalBudget / totalServices).toFixed(2))
      : 0;

    const avgBurnRate = totalServices > 0
      ? parseFloat((totalBurnRate / totalServices).toFixed(2))
      : 0;

    // Sort breached services by error budget ascending (worst first)
    breachedServices.sort((a, b) => a.error_budget - b.error_budget);

    return {
      totalServices,
      healthyServices,
      warningServices,
      criticalServices,
      avgBudget,
      avgBurnRate,
      breachedServices,
    };
  })();

  /**
   * Compute per-tier burn rate analysis data.
   */
  const tierBurnRateData = (() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return [];
    }

    const tierMap = new Map();

    for (const domain of domains) {
      const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;

      if (!tierMap.has(tier)) {
        tierMap.set(tier, {
          tier,
          label: DOMAIN_TIER_LABELS[tier] || tier,
          order: DOMAIN_TIER_ORDER[tier] ?? 99,
          totalServices: 0,
          totalBudget: 0,
          totalBurnRate: 0,
          healthyCount: 0,
          warningCount: 0,
          criticalCount: 0,
        });
      }

      const group = tierMap.get(tier);

      for (const service of domain.services || []) {
        group.totalServices++;
        const errorBudget = service.error_budget != null ? service.error_budget : 100;
        group.totalBudget += errorBudget;

        const budgetConsumed = 100 - errorBudget;
        const burnRate = parseFloat((budgetConsumed / 30).toFixed(2));
        group.totalBurnRate += burnRate;

        if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) {
          group.criticalCount++;
        } else if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) {
          group.warningCount++;
        } else {
          group.healthyCount++;
        }
      }
    }

    return Array.from(tierMap.values())
      .map((group) => ({
        ...group,
        avgBudget: group.totalServices > 0
          ? parseFloat((group.totalBudget / group.totalServices).toFixed(2))
          : 100,
        avgBurnRate: group.totalServices > 0
          ? parseFloat((group.totalBurnRate / group.totalServices).toFixed(2))
          : 0,
      }))
      .sort((a, b) => a.order - b.order);
  })();

  /**
   * Determine the overall error budget health status.
   */
  const overallStatus = (() => {
    if (overallSummary.totalServices === 0) return 'unknown';
    if (overallSummary.criticalServices > 0) return 'critical';
    if (overallSummary.warningServices > 0) return 'warning';
    return 'healthy';
  })();

  /**
   * Get the budget color class based on the budget value.
   * @param {number} budget - The error budget percentage.
   * @returns {string} Tailwind text color class.
   */
  const getBudgetColorClass = useCallback((budget) => {
    if (budget == null || isNaN(budget)) return 'text-dashboard-text-muted';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) return 'text-severity-critical';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Get the burn rate color class.
   * @param {number} burnRate - The burn rate percentage per day.
   * @returns {string} Tailwind text color class.
   */
  const getBurnRateColorClass = useCallback((burnRate) => {
    if (burnRate == null || isNaN(burnRate)) return 'text-dashboard-text-muted';
    if (burnRate > 3) return 'text-severity-critical';
    if (burnRate > 1.5) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Custom tooltip for the tier burn rate chart.
   */
  const renderBurnRateTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
        <p className="font-medium text-dashboard-text-primary mb-1">{label} Tier</p>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-dashboard-text-muted">Avg Budget:</span>
          <span className={`font-semibold ${getBudgetColorClass(data.avgBudget)}`}>
            {formatPercentage(data.avgBudget, 1)}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-dashboard-text-muted">Avg Burn Rate:</span>
          <span className={`font-semibold ${getBurnRateColorClass(data.avgBurnRate)}`}>
            {data.avgBurnRate}%/day
          </span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-dashboard-text-muted">Services:</span>
          <span className="font-medium text-dashboard-text-secondary">
            {data.totalServices}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-dashboard-text-muted">Breached:</span>
          <span className={`font-medium ${data.criticalCount > 0 ? 'text-severity-critical' : 'text-status-healthy'}`}>
            {data.criticalCount}
          </span>
        </div>
      </div>
    );
  }, [getBudgetColorClass, getBurnRateColorClass]);

  /**
   * Custom bar shape for the tier burn rate chart.
   */
  const renderTierBurnRateBar = useCallback((props) => {
    const { x, y, width, height, payload } = props;
    let fill = '#16a34a';
    if (payload && payload.avgBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) {
      fill = '#dc2626';
    } else if (payload && payload.avgBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) {
      fill = '#ca8a04';
    }

    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} ry={3} />;
  }, []);

  // Permission check
  if (!canViewMetrics) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Metrics Access Required"
          description="You do not have permission to view error budget data. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading error budget data…" size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !domains?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load error budget data"
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
              Error Budget Health
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Monitor error budget consumption, burn rates, and breach status across all services
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

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => handleViewChange('chart')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${activeView === 'chart'
                  ? 'bg-white text-dashboard-text-primary shadow-sm'
                  : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
                }`}
              aria-pressed={activeView === 'chart'}
              aria-label="Chart view"
            >
              Chart
            </button>
            <button
              onClick={() => handleViewChange('table')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${activeView === 'table'
                  ? 'bg-white text-dashboard-text-primary shadow-sm'
                  : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
                }`}
              aria-pressed={activeView === 'table'}
              aria-label="Table view"
            >
              Table
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors duration-150 ${isRefreshing
                ? 'bg-gray-50 text-dashboard-text-muted border-dashboard-border cursor-not-allowed'
                : 'bg-white text-dashboard-text-secondary border-dashboard-border hover:bg-gray-50 hover:text-dashboard-text-primary'
              }`}
            aria-label="Refresh error budget data"
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
        storageKey="filters_error_budget"
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
      <section aria-label="Error Budget Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Avg Error Budget"
            value={overallSummary.avgBudget}
            unit="%"
            size="md"
            status={overallStatus}
            trend={{
              direction:
                overallSummary.avgBudget > DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING
                  ? 'stable'
                  : 'down',
              invertColor: true,
            }}
          />
          <MetricCard
            title="Total Services"
            value={overallSummary.totalServices}
            unit="count"
            size="md"
            subtitle={`${domains?.length || 0} domains`}
          />
          <MetricCard
            title="Budget Breaches"
            value={overallSummary.criticalServices}
            unit="count"
            size="md"
            status={overallSummary.criticalServices > 0 ? 'critical' : 'healthy'}
            trend={{
              direction: overallSummary.criticalServices > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="At Risk"
            value={overallSummary.warningServices}
            unit="count"
            size="md"
            status={overallSummary.warningServices > 0 ? 'warning' : 'healthy'}
            trend={{
              direction: overallSummary.warningServices > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Avg Burn Rate"
            value={overallSummary.avgBurnRate}
            unit="%"
            size="md"
            subtitle="per day (30d window)"
            status={
              overallSummary.avgBurnRate > 3
                ? 'critical'
                : overallSummary.avgBurnRate > 1.5
                  ? 'warning'
                  : undefined
            }
          />
        </div>
      </section>

      {/* Main Content: Chart or Table View */}
      {activeView === 'chart' ? (
        <section aria-label="Error Budget Chart">
          <ErrorBudgetChart
            showServiceDetail={true}
            showChart={true}
            compact={false}
          />
        </section>
      ) : (
        <section aria-label="Error Budget Table">
          <ErrorBudgetTable
            compact={false}
            limit={0}
            showBreachedOnly={false}
            showSearch={true}
            showPagination={true}
          />
        </section>
      )}

      {/* Burn Rate Analysis by Tier */}
      {tierBurnRateData.length > 0 && (
        <section aria-label="Burn Rate Analysis">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Burn Rate Analysis by Tier
                </h3>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {tierBurnRateData.length}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
                  Healthy
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
                  At Risk (≤{DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
                  Breached (≤{DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-dashboard-border">
              {/* Tier Burn Rate Bar Chart */}
              <div className="p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted mb-3">
                  Average Budget Remaining by Tier
                </h4>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={tierBurnRateData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                        width={50}
                      />
                      <Tooltip content={renderBurnRateTooltip} />
                      <Bar
                        dataKey="avgBudget"
                        name="Avg Budget"
                        maxBarSize={48}
                        shape={renderTierBurnRateBar}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tier Summary Table */}
              <div className="p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted mb-3">
                  Tier Breakdown
                </h4>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-sm" role="grid">
                    <thead>
                      <tr className="border-b border-dashboard-border bg-gray-50/50">
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left">
                          Tier
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center">
                          Services
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right">
                          Avg Budget
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right">
                          Burn Rate
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center">
                          Health
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashboard-border">
                      {tierBurnRateData.map((tier) => {
                        const tierStatus = tier.criticalCount > 0
                          ? 'critical'
                          : tier.warningCount > 0
                            ? 'warning'
                            : 'healthy';

                        return (
                          <tr
                            key={tier.tier}
                            className="hover:bg-gray-50/50 transition-colors duration-150"
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${tierStatus === 'healthy'
                                      ? 'bg-status-healthy'
                                      : tierStatus === 'warning'
                                        ? 'bg-status-degraded'
                                        : 'bg-status-down animate-pulse'
                                    }`}
                                />
                                <span className="text-sm font-medium text-dashboard-text-primary">
                                  {tier.label}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-sm text-dashboard-text-secondary">
                                {tier.totalServices}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-sm font-semibold ${getBudgetColorClass(tier.avgBudget)}`}>
                                {formatPercentage(tier.avgBudget, 1)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-sm font-medium ${getBurnRateColorClass(tier.avgBurnRate)}`}>
                                {tier.avgBurnRate}%/day
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {tier.healthyCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                                    {tier.healthyCount}
                                  </span>
                                )}
                                {tier.warningCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-yellow-50 text-yellow-800">
                                    {tier.warningCount}
                                  </span>
                                )}
                                {tier.criticalCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                    {tier.criticalCount}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span>
                  {tierBurnRateData.length} tier{tierBurnRateData.length !== 1 ? 's' : ''} ·{' '}
                  {overallSummary.totalServices} services
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span>
                  Thresholds: Warning{' '}
                  <span className="font-medium text-status-degraded">
                    {DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}%
                  </span>
                  {' / '}Critical{' '}
                  <span className="font-medium text-severity-critical">
                    {DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Breach History */}
      <section aria-label="Breach History">
        <div className="dashboard-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Budget Breach History
              </h3>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {overallSummary.breachedServices.length}
              </span>
              {overallSummary.breachedServices.length > 0 && (
                <StatusBadge status="critical" size="sm" label="Active Breaches" />
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                Services with error budget ≤{' '}
                <span className="font-medium text-severity-critical">
                  {DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%
                </span>
              </span>
            </div>
          </div>

          {overallSummary.breachedServices.length > 0 ? (
            <>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm" role="grid">
                  <thead>
                    <tr className="border-b border-dashboard-border bg-gray-50/50">
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left" style={{ width: '22%' }}>
                        Service
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left" style={{ width: '16%' }}>
                        Domain
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '12%' }}>
                        Budget Remaining
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '10%' }}>
                        Burn Rate
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '10%' }}>
                        Availability
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '10%' }}>
                        SLO Target
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center" style={{ width: '10%' }}>
                        Status
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center" style={{ width: '10%' }}>
                        Severity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashboard-border">
                    {overallSummary.breachedServices.map((service) => (
                      <tr
                        key={service.service_id}
                        className="bg-red-50/30 hover:bg-red-50/50 transition-colors duration-150"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-block w-2 h-2 rounded-full bg-status-down animate-pulse flex-shrink-0" />
                            <span className="text-sm font-medium text-dashboard-text-primary truncate">
                              {service.name || service.service_id}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm text-dashboard-text-secondary truncate">
                              {service.domain_name}
                            </span>
                            {service.domain_tier && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-gray-100 text-dashboard-text-muted flex-shrink-0">
                                {DOMAIN_TIER_LABELS[service.domain_tier] || service.domain_tier}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 h-1.5 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                              <div
                                className="h-full rounded-full bg-severity-critical transition-all duration-300"
                                style={{
                                  width: `${Math.max(0, Math.min(100, service.error_budget))}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-severity-critical">
                              {formatPercentage(service.error_budget, 1)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-medium ${getBurnRateColorClass(service.burn_rate)}`}>
                            {service.burn_rate}%/day
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-semibold ${service.availability != null && service.availability >= service.slo
                              ? 'text-status-healthy'
                              : 'text-severity-critical'
                            }`}>
                            {service.availability != null
                              ? formatPercentage(service.availability, 2)
                              : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-dashboard-text-muted">
                            {formatPercentage(service.slo, 2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge
                            status={service.status || 'unknown'}
                            size="sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge
                            status="critical"
                            size="sm"
                            label="Breached"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Breach History Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
                <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                  <span>
                    {overallSummary.breachedServices.length} service{overallSummary.breachedServices.length !== 1 ? 's' : ''} with breached error budgets
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                  <span>
                    Breach threshold: ≤{' '}
                    <span className="font-medium text-severity-critical">
                      {DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%
                    </span>{' '}
                    remaining
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12">
              <svg
                className="w-10 h-10 text-status-healthy"
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
              <h4 className="text-sm font-semibold text-dashboard-text-primary">
                No Budget Breaches
              </h4>
              <p className="text-sm text-dashboard-text-muted text-center max-w-sm">
                All services are operating within their error budget thresholds. No breaches detected.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {domains?.length || 0} domain{(domains?.length || 0) !== 1 ? 's' : ''} monitored
          </span>
          <span>·</span>
          <span>
            {overallSummary.totalServices} total services
          </span>
          <span>·</span>
          <span>
            Thresholds: Warning {DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}% / Critical {DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%
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

export { ErrorBudgetPage };
export default ErrorBudgetPage;