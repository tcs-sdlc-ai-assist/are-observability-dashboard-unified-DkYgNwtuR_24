import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { MetricCard } from '../shared/MetricCard';
import { StatusBadge } from '../shared/StatusBadge';
import { TrendArrow } from '../shared/TrendArrow';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_ORDER,
  DOMAIN_TIER_LABELS,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatPercentage, formatNumber } from '../../utils/formatters';
import {
  calculateTrendDirection,
  getBreachThreshold,
  STATUS_CHART_COLORS,
} from '../../utils/chartHelpers';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

/**
 * ErrorBudgetChart - Error budget burn-down visualization component using
 * Recharts AreaChart. Shows remaining budget %, burn rate, breach threshold
 * line, and trend arrows per service. Color changes on breach.
 *
 * Features:
 * - Per-service error budget burn-down area chart
 * - Remaining budget percentage with color-coded status
 * - Burn rate calculation and display
 * - Warning and critical breach threshold reference lines
 * - Trend arrows indicating budget consumption direction
 * - Tier-grouped layout (Critical, Core, Supporting)
 * - Expandable domain cards for service-level detail
 * - Overall error budget summary metric cards
 * - Color transitions on breach (green → yellow → red)
 * - Loading and empty states
 * - Responsive grid layout
 * - Compact mode support
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showServiceDetail=true] - Whether to allow expanding domains to show service-level detail.
 * @param {boolean} [props.showChart=true] - Whether to show the burn-down chart for each service.
 * @returns {React.ReactNode}
 */
const ErrorBudgetChart = ({
  className = '',
  compact = false,
  showServiceDetail = true,
  showChart = true,
}) => {
  const { filteredDomains: domains, isLoading, error } = useDashboard();
  const [expandedDomains, setExpandedDomains] = useState({});

  /**
   * Toggle the expanded state of a domain card.
   * @param {string} domainId - The domain ID to toggle.
   */
  const toggleDomain = useCallback(
    (domainId) => {
      if (!showServiceDetail) {
        return;
      }

      setExpandedDomains((prev) => ({
        ...prev,
        [domainId]: !prev[domainId],
      }));
    },
    [showServiceDetail],
  );

  /**
   * Generate simulated burn-down data points for a service's error budget.
   * In production, this would come from real time-series data.
   * @param {number} currentBudget - The current error budget percentage.
   * @param {string} serviceId - The service ID for deterministic jitter.
   * @returns {Object[]} Array of data points for the chart.
   */
  const generateBurnDownData = useCallback((currentBudget, serviceId) => {
    const points = 14; // 14 days
    const data = [];
    const hash = (serviceId || '')
      .split('')
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);

    // Start from a higher budget and burn down to the current value
    const startBudget = Math.min(100, currentBudget + (100 - currentBudget) * 0.6 + (hash % 10));

    for (let i = 0; i < points; i++) {
      const progress = i / (points - 1);
      const jitter = (Math.sin(i * 0.8 + hash * 0.1) + Math.cos(i * 1.5)) * 1.5;
      const baseValue = startBudget - (startBudget - currentBudget) * progress;
      const value = parseFloat(
        Math.max(0, Math.min(100, baseValue + jitter)).toFixed(2),
      );

      const dayLabel = `Day ${i + 1}`;

      data.push({
        day: dayLabel,
        dayIndex: i,
        budget: value,
      });
    }

    // Ensure the last point matches the current budget
    if (data.length > 0) {
      data[data.length - 1].budget = currentBudget;
    }

    return data;
  }, []);

  /**
   * Compute per-domain and per-service error budget data grouped by tier.
   */
  const budgetData = useMemo(() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return { tierGroups: [], overall: null };
    }

    const tierMap = new Map();
    let totalServices = 0;
    let healthyBudgetServices = 0;
    let warningBudgetServices = 0;
    let criticalBudgetServices = 0;
    let totalBudget = 0;

    for (const domain of domains) {
      const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;

      if (!tierMap.has(tier)) {
        tierMap.set(tier, {
          tier,
          label: DOMAIN_TIER_LABELS[tier] || tier,
          order: DOMAIN_TIER_ORDER[tier] ?? 99,
          domains: [],
          totalServices: 0,
          healthyServices: 0,
          warningServices: 0,
          criticalServices: 0,
          avgBudget: 0,
        });
      }

      const group = tierMap.get(tier);
      const services = domain.services || [];

      const domainServices = services.map((service) => {
        const errorBudget =
          service.error_budget != null ? service.error_budget : 100;
        const sloTarget =
          service.slo != null
            ? service.slo
            : (DEFAULT_SLO_TARGETS[tier] ?? 99.5);

        let budgetStatus = 'healthy';
        if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) {
          budgetStatus = 'critical';
        } else if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) {
          budgetStatus = 'warning';
        }

        // Calculate burn rate (simulated: budget consumed per day)
        const budgetConsumed = 100 - errorBudget;
        const burnRate = parseFloat((budgetConsumed / 30).toFixed(2)); // per day over 30-day window

        // Generate burn-down chart data
        const burnDownData = generateBurnDownData(errorBudget, service.service_id);

        // Calculate trend from burn-down data
        const budgetValues = burnDownData.map((d) => d.budget);
        const trendResult = calculateTrendDirection(budgetValues, { threshold: 3 });

        return {
          service_id: service.service_id,
          name: service.name,
          availability: service.availability,
          slo: sloTarget,
          error_budget: errorBudget,
          budget_status: budgetStatus,
          burn_rate: burnRate,
          burn_down_data: burnDownData,
          trend_direction: trendResult.direction,
          trend_change: Math.abs(trendResult.changePercent),
          status: service.status,
        };
      });

      const domainAvgBudget =
        domainServices.length > 0
          ? parseFloat(
              (
                domainServices.reduce((sum, s) => sum + s.error_budget, 0) /
                domainServices.length
              ).toFixed(2),
            )
          : 100;

      const domainHealthy = domainServices.filter(
        (s) => s.budget_status === 'healthy',
      ).length;
      const domainWarning = domainServices.filter(
        (s) => s.budget_status === 'warning',
      ).length;
      const domainCritical = domainServices.filter(
        (s) => s.budget_status === 'critical',
      ).length;

      let domainBudgetStatus = 'healthy';
      if (domainCritical > 0) domainBudgetStatus = 'critical';
      else if (domainWarning > 0) domainBudgetStatus = 'warning';

      group.domains.push({
        domain_id: domain.domain_id,
        name: domain.name,
        tier: domain.tier,
        avg_budget: domainAvgBudget,
        budget_status: domainBudgetStatus,
        total_services: domainServices.length,
        healthy_services: domainHealthy,
        warning_services: domainWarning,
        critical_services: domainCritical,
        services: domainServices,
      });

      group.totalServices += domainServices.length;
      group.healthyServices += domainHealthy;
      group.warningServices += domainWarning;
      group.criticalServices += domainCritical;

      totalServices += domainServices.length;
      healthyBudgetServices += domainHealthy;
      warningBudgetServices += domainWarning;
      criticalBudgetServices += domainCritical;
      totalBudget += domainServices.reduce((sum, s) => sum + s.error_budget, 0);
    }

    // Compute tier-level averages
    for (const group of tierMap.values()) {
      if (group.totalServices > 0) {
        const allServices = group.domains.flatMap((d) => d.services);
        group.avgBudget = parseFloat(
          (
            allServices.reduce((sum, s) => sum + s.error_budget, 0) /
            allServices.length
          ).toFixed(2),
        );
      }
    }

    const tierGroups = Array.from(tierMap.values()).sort(
      (a, b) => a.order - b.order,
    );

    const overallAvgBudget =
      totalServices > 0
        ? parseFloat((totalBudget / totalServices).toFixed(2))
        : 100;

    return {
      tierGroups,
      overall: {
        totalServices,
        healthyBudgetServices,
        warningBudgetServices,
        criticalBudgetServices,
        overallAvgBudget,
      },
    };
  }, [domains, generateBurnDownData]);

  /**
   * Get the budget color class based on the budget value.
   * @param {number} budget - The error budget percentage.
   * @returns {string} Tailwind text color class.
   */
  const getBudgetColorClass = useCallback((budget) => {
    if (budget == null || isNaN(budget)) return 'text-dashboard-text-muted';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL)
      return 'text-severity-critical';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING)
      return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Get the area chart fill color based on budget status.
   * @param {string} budgetStatus - The budget status ('healthy', 'warning', 'critical').
   * @returns {string} Hex color string.
   */
  const getChartColor = useCallback((budgetStatus) => {
    switch (budgetStatus) {
      case 'critical':
        return '#dc2626';
      case 'warning':
        return '#ca8a04';
      case 'healthy':
      default:
        return '#16a34a';
    }
  }, []);

  /**
   * Get the budget status label.
   * @param {string} budgetStatus - The budget status.
   * @returns {string} Human-readable label.
   */
  const getBudgetStatusLabel = useCallback((budgetStatus) => {
    switch (budgetStatus) {
      case 'critical':
        return 'Breached';
      case 'warning':
        return 'At Risk';
      case 'healthy':
      default:
        return 'Healthy';
    }
  }, []);

  /**
   * Determine the overall budget health status.
   */
  const overallStatus = useMemo(() => {
    if (!budgetData.overall) return 'unknown';
    if (budgetData.overall.criticalBudgetServices > 0) return 'critical';
    if (budgetData.overall.warningBudgetServices > 0) return 'warning';
    if (budgetData.overall.totalServices === 0) return 'unknown';
    return 'healthy';
  }, [budgetData.overall]);

  /**
   * Custom tooltip for the burn-down chart.
   */
  const renderChartTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0];
    const budget = data.value;
    let statusLabel = 'Healthy';
    let statusColorClass = 'text-status-healthy';

    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) {
      statusLabel = 'Critical';
      statusColorClass = 'text-severity-critical';
    } else if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) {
      statusLabel = 'Warning';
      statusColorClass = 'text-status-degraded';
    }

    return (
      <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
        <p className="font-medium text-dashboard-text-primary mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-dashboard-text-muted">Budget:</span>
          <span className={`font-semibold ${statusColorClass}`}>
            {formatPercentage(budget, 2)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-dashboard-text-muted">Status:</span>
          <span className={`font-medium ${statusColorClass}`}>{statusLabel}</span>
        </div>
      </div>
    );
  }, []);

  /**
   * Render a burn-down area chart for a single service.
   * @param {Object} service - The service budget data object.
   * @returns {React.ReactNode}
   */
  const renderBurnDownChart = useCallback(
    (service) => {
      if (!showChart || !service.burn_down_data || service.burn_down_data.length < 2) {
        return null;
      }

      const chartColor = getChartColor(service.budget_status);
      const gradientId = `budget-grad-${service.service_id.replace(/[^a-zA-Z0-9]/g, '-')}`;

      return (
        <div className="w-full h-32 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={service.burn_down_data}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={renderChartTooltip} />
              <ReferenceLine
                y={DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}
                stroke="#ca8a04"
                strokeDasharray="6 4"
                strokeWidth={1}
                label={{
                  value: 'Warning',
                  position: 'right',
                  fill: '#ca8a04',
                  fontSize: 9,
                }}
              />
              <ReferenceLine
                y={DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}
                stroke="#dc2626"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{
                  value: 'Critical',
                  position: 'right',
                  fill: '#dc2626',
                  fontSize: 9,
                }}
              />
              <Area
                type="monotone"
                dataKey="budget"
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: chartColor,
                  stroke: '#fff',
                  strokeWidth: 1.5,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    },
    [showChart, getChartColor, renderChartTooltip],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading error budget data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load error budget data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state
  if (!domains || domains.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No error budget data"
          description="No domain or service data is available. Upload metrics data to populate the error budget view."
          size="md"
        />
      </div>
    );
  }

  const { tierGroups, overall } = budgetData;

  if (!overall) {
    return null;
  }

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            Error Budget Health
          </h3>
          <StatusBadge
            status={overallStatus}
            size="sm"
            label={
              overallStatus === 'healthy'
                ? 'All Budgets Healthy'
                : overallStatus === 'warning'
                  ? 'Budgets At Risk'
                  : overallStatus === 'critical'
                    ? 'Budget Breaches'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
            {overall.healthyBudgetServices} Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
            {overall.warningBudgetServices} At Risk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-down animate-pulse" />
            {overall.criticalBudgetServices} Breached
          </span>
        </div>
      </div>

      {/* Top-Level Metric Cards */}
      <div
        className={`grid gap-4 mb-6 ${compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}
      >
        <MetricCard
          title="Avg Error Budget"
          value={overall.overallAvgBudget}
          unit="%"
          size={compact ? 'sm' : 'md'}
          status={overallStatus}
          trend={{
            direction:
              overall.overallAvgBudget > DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING
                ? 'stable'
                : 'down',
            invertColor: true,
          }}
        />
        <MetricCard
          title="Total Services"
          value={overall.totalServices}
          unit="count"
          size={compact ? 'sm' : 'md'}
          subtitle={`${tierGroups.length} tiers`}
        />
        <MetricCard
          title="Budget Breaches"
          value={overall.criticalBudgetServices}
          unit="count"
          size={compact ? 'sm' : 'md'}
          status={overall.criticalBudgetServices > 0 ? 'critical' : 'healthy'}
          trend={{
            direction: overall.criticalBudgetServices > 0 ? 'up' : 'stable',
            invertColor: false,
          }}
        />
        <MetricCard
          title="At Risk"
          value={overall.warningBudgetServices}
          unit="count"
          size={compact ? 'sm' : 'md'}
          status={overall.warningBudgetServices > 0 ? 'warning' : 'healthy'}
          trend={{
            direction: overall.warningBudgetServices > 0 ? 'up' : 'stable',
            invertColor: false,
          }}
        />
      </div>

      {/* Tier-Grouped Domain Cards */}
      <div className="space-y-6">
        {tierGroups.map((tierGroup) => (
          <div key={tierGroup.tier}>
            {/* Tier Header */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  {tierGroup.label} Tier
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {tierGroup.domains.length}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span>
                  Avg Budget:{' '}
                  <span
                    className={`font-medium ${getBudgetColorClass(tierGroup.avgBudget)}`}
                  >
                    {formatPercentage(tierGroup.avgBudget, 1)}
                  </span>
                </span>
                <span>
                  Thresholds:{' '}
                  <span className="font-medium text-status-degraded">
                    {DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}%
                  </span>
                  {' / '}
                  <span className="font-medium text-severity-critical">
                    {DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%
                  </span>
                </span>
              </div>
            </div>

            {/* Domain Cards Grid */}
            <div
              className={`grid gap-3 items-stretch ${compact ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}
            >
              {tierGroup.domains.map((domainData) => {
                const isExpanded =
                  expandedDomains[domainData.domain_id] || false;

                return (
                  <div
                    key={domainData.domain_id}
                    className={`dashboard-card overflow-hidden h-full ${
                      showServiceDetail ? 'cursor-pointer' : ''
                    }`}
                  >
                    {/* Domain Header */}
                    <div
                      className={`flex items-center justify-between gap-3 p-4 ${
                        showServiceDetail
                          ? 'hover:bg-gray-50/50 transition-colors duration-150'
                          : ''
                      }`}
                      onClick={() => toggleDomain(domainData.domain_id)}
                      onKeyDown={(e) => {
                        if (
                          showServiceDetail &&
                          (e.key === 'Enter' || e.key === ' ')
                        ) {
                          e.preventDefault();
                          toggleDomain(domainData.domain_id);
                        }
                      }}
                      role={showServiceDetail ? 'button' : undefined}
                      tabIndex={showServiceDetail ? 0 : undefined}
                      aria-expanded={
                        showServiceDetail ? isExpanded : undefined
                      }
                      aria-label={`${domainData.name} domain — ${formatPercentage(domainData.avg_budget, 1)} avg error budget`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Status dot */}
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            domainData.budget_status === 'healthy'
                              ? 'bg-status-healthy'
                              : domainData.budget_status === 'warning'
                                ? 'bg-status-degraded'
                                : domainData.budget_status === 'critical'
                                  ? 'bg-status-down animate-pulse'
                                  : 'bg-status-unknown'
                          }`}
                          aria-hidden="true"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className="text-sm font-semibold text-dashboard-text-primary truncate">
                              {domainData.name}
                            </h5>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-dashboard-text-muted">
                              {domainData.total_services}{' '}
                              {domainData.total_services === 1
                                ? 'service'
                                : 'services'}
                            </span>
                            {domainData.critical_services > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                {domainData.critical_services} breached
                              </span>
                            )}
                            {domainData.warning_services > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-yellow-50 text-yellow-800">
                                {domainData.warning_services} at risk
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Avg Budget Value */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-lg font-bold leading-none ${getBudgetColorClass(domainData.avg_budget)}`}
                        >
                          {formatPercentage(domainData.avg_budget, 1)}
                        </span>

                        {/* Expand/Collapse chevron */}
                        {showServiceDetail && (
                          <svg
                            className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
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
                        )}
                      </div>
                    </div>

                    {/* Budget Health Bar */}
                    <div className="px-4 pb-3">
                      <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-gray-100">
                        {domainData.total_services > 0 && (
                          <>
                            {domainData.healthy_services > 0 && (
                              <div
                                className="bg-status-healthy transition-all duration-300"
                                style={{
                                  width: `${(domainData.healthy_services / domainData.total_services) * 100}%`,
                                }}
                                title={`${domainData.healthy_services} healthy`}
                              />
                            )}
                            {domainData.warning_services > 0 && (
                              <div
                                className="bg-status-degraded transition-all duration-300"
                                style={{
                                  width: `${(domainData.warning_services / domainData.total_services) * 100}%`,
                                }}
                                title={`${domainData.warning_services} at risk`}
                              />
                            )}
                            {domainData.critical_services > 0 && (
                              <div
                                className="bg-status-down transition-all duration-300"
                                style={{
                                  width: `${(domainData.critical_services / domainData.total_services) * 100}%`,
                                }}
                                title={`${domainData.critical_services} breached`}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded Service Detail */}
                    {showServiceDetail &&
                      isExpanded &&
                      domainData.services.length > 0 && (
                        <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                          <div className="divide-y divide-dashboard-border">
                            {domainData.services.map((service) => (
                              <div
                                key={service.service_id}
                                className="px-4 py-3"
                              >
                                {/* Service Header Row */}
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                        service.budget_status === 'healthy'
                                          ? 'bg-status-healthy'
                                          : service.budget_status === 'warning'
                                            ? 'bg-status-degraded'
                                            : 'bg-status-down animate-pulse'
                                      }`}
                                    />
                                    <span className="text-sm font-medium text-dashboard-text-primary truncate">
                                      {service.name}
                                    </span>
                                    <StatusBadge
                                      status={
                                        service.budget_status === 'critical'
                                          ? 'critical'
                                          : service.budget_status === 'warning'
                                            ? 'warning'
                                            : 'healthy'
                                      }
                                      size="sm"
                                      label={getBudgetStatusLabel(
                                        service.budget_status,
                                      )}
                                    />
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="text-right">
                                      <span
                                        className={`text-sm font-bold ${getBudgetColorClass(service.error_budget)}`}
                                      >
                                        {formatPercentage(
                                          service.error_budget,
                                          1,
                                        )}
                                      </span>
                                      <div className="text-[10px] text-dashboard-text-muted">
                                        remaining
                                      </div>
                                    </div>
                                    <TrendArrow
                                      direction={service.trend_direction}
                                      value={service.trend_change}
                                      invertColor={true}
                                      size="sm"
                                      showValue={service.trend_change > 1}
                                    />
                                  </div>
                                </div>

                                {/* Service Metrics Row */}
                                <div className="flex items-center gap-4 mt-2 text-xs text-dashboard-text-muted">
                                  <span>
                                    SLO:{' '}
                                    <span className="font-medium text-dashboard-text-secondary">
                                      {formatPercentage(service.slo, 2)}
                                    </span>
                                  </span>
                                  <span>
                                    Availability:{' '}
                                    <span
                                      className={`font-medium ${
                                        service.availability != null &&
                                        service.availability >= service.slo
                                          ? 'text-status-healthy'
                                          : 'text-severity-critical'
                                      }`}
                                    >
                                      {service.availability != null
                                        ? formatPercentage(
                                            service.availability,
                                            2,
                                          )
                                        : '—'}
                                    </span>
                                  </span>
                                  <span>
                                    Burn Rate:{' '}
                                    <span
                                      className={`font-medium ${
                                        service.burn_rate > 3
                                          ? 'text-severity-critical'
                                          : service.burn_rate > 1.5
                                            ? 'text-status-degraded'
                                            : 'text-dashboard-text-secondary'
                                      }`}
                                    >
                                      {service.burn_rate}%/day
                                    </span>
                                  </span>
                                </div>

                                {/* Budget Progress Bar */}
                                <div className="mt-2">
                                  <div className="flex items-center gap-2 w-full">
                                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-gray-100 relative">
                                      {/* Warning threshold marker */}
                                      <div
                                        className="absolute top-0 bottom-0 w-px bg-status-degraded z-10"
                                        style={{
                                          left: `${DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}%`,
                                        }}
                                        title={`Warning: ${DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}%`}
                                      />
                                      {/* Critical threshold marker */}
                                      <div
                                        className="absolute top-0 bottom-0 w-px bg-severity-critical z-10"
                                        style={{
                                          left: `${DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%`,
                                        }}
                                        title={`Critical: ${DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%`}
                                      />
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          service.budget_status === 'critical'
                                            ? 'bg-severity-critical'
                                            : service.budget_status ===
                                                'warning'
                                              ? 'bg-status-degraded'
                                              : 'bg-status-healthy'
                                        }`}
                                        style={{
                                          width: `${Math.max(0, Math.min(100, service.error_budget))}%`,
                                        }}
                                        title={`${formatPercentage(service.error_budget, 1)} remaining`}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Burn-Down Chart */}
                                {renderBurnDownChart(service)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { ErrorBudgetChart };
export default ErrorBudgetChart;