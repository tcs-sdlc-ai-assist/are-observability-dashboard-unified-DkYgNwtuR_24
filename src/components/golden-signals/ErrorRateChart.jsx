import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { MetricCard } from '../shared/MetricCard';
import { StatusBadge } from '../shared/StatusBadge';
import { TrendArrow } from '../shared/TrendArrow';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_METRICS,
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_METRIC_THRESHOLDS,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatNumber, formatPercentage } from '../../utils/formatters';
import {
  calculateTrendDirection,
  getBreachThreshold,
  buildGoldenSignalChartData,
  calculateYAxisDomain,
  getMetricUnit,
  STATUS_CHART_COLORS,
  DEFAULT_CHART_COLORS,
} from '../../utils/chartHelpers';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

/**
 * ErrorRateChart - Golden signal chart component for error rate metrics (5xx and
 * functional errors) over time using Recharts LineChart. Supports domain/service
 * filtering, breach threshold reference lines, and trend indicators.
 *
 * Features:
 * - 5xx and functional error rate line chart over time (last 24 hours, hourly)
 * - Warning and critical threshold reference lines from metric config
 * - Per-service error metric cards with trend arrows
 * - Domain/service filter dropdown
 * - Color-coded lines for 5xx (red) and functional errors (amber)
 * - Custom tooltip with formatted values and threshold status
 * - Responsive layout with compact mode support
 * - Loading and empty states
 * - Tier-grouped service selector
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {string} [props.selectedServiceId=null] - Pre-selected service ID to display.
 * @param {boolean} [props.showServiceSelector=true] - Whether to show the service selector dropdown.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {number} [props.chartHeight=280] - Height of the chart area in pixels.
 * @returns {React.ReactNode}
 */
const ErrorRateChart = ({
  className = '',
  compact = false,
  selectedServiceId = null,
  showServiceSelector = true,
  showMetricCards = true,
  chartHeight = 280,
}) => {
  const { filteredDomains, filteredDashboardData, isLoading, error } = useDashboard();
  const [activeServiceId, setActiveServiceId] = useState(selectedServiceId);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  /**
   * Flatten all services from domains with domain metadata attached.
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
   * Group services by domain tier for the selector dropdown.
   */
  const servicesByTier = useMemo(() => {
    if (!allServices || allServices.length === 0) {
      return [];
    }

    const tierMap = new Map();

    for (const service of allServices) {
      const tier = service.domain_tier || DOMAIN_TIERS.SUPPORTING;

      if (!tierMap.has(tier)) {
        tierMap.set(tier, {
          tier,
          label: DOMAIN_TIER_LABELS[tier] || tier,
          order: DOMAIN_TIER_ORDER[tier] ?? 99,
          services: [],
        });
      }

      tierMap.get(tier).services.push(service);
    }

    return Array.from(tierMap.values()).sort((a, b) => a.order - b.order);
  }, [allServices]);

  /**
   * Resolve the currently active service. Falls back to the first service with
   * golden signal time series data available.
   */
  const resolvedServiceId = useMemo(() => {
    if (activeServiceId) {
      const exists = allServices.find((s) => s.service_id === activeServiceId);
      if (exists) return activeServiceId;
    }

    // Find the first service that has time series data
    const timeSeries = filteredDashboardData?.golden_signal_time_series;
    if (timeSeries) {
      for (const service of allServices) {
        if (timeSeries[service.service_id]?.[GOLDEN_SIGNALS.ERRORS]) {
          return service.service_id;
        }
      }
    }

    // Fallback to first service
    return allServices.length > 0 ? allServices[0].service_id : null;
  }, [activeServiceId, allServices, filteredDashboardData]);

  /**
   * Get the active service object.
   */
  const activeService = useMemo(() => {
    if (!resolvedServiceId) return null;
    return allServices.find((s) => s.service_id === resolvedServiceId) || null;
  }, [resolvedServiceId, allServices]);

  /**
   * Get the error rate time series data for the active service.
   */
  const errorTimeSeries = useMemo(() => {
    if (!resolvedServiceId || !filteredDashboardData?.golden_signal_time_series) {
      return null;
    }

    const serviceTimeSeries = filteredDashboardData.golden_signal_time_series[resolvedServiceId];
    if (!serviceTimeSeries || !serviceTimeSeries[GOLDEN_SIGNALS.ERRORS]) {
      return null;
    }

    return serviceTimeSeries[GOLDEN_SIGNALS.ERRORS];
  }, [resolvedServiceId, filteredDashboardData]);

  /**
   * Build Recharts-compatible chart data from the error time series.
   */
  const chartData = useMemo(() => {
    if (!errorTimeSeries) return [];

    const data = buildGoldenSignalChartData(
      { [GOLDEN_SIGNALS.ERRORS]: errorTimeSeries },
      { sortByTime: true },
    );

    // Format timestamps for display
    return data.map((point) => {
      const date = new Date(point.timestamp);
      const timeLabel = date.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      return {
        ...point,
        timeLabel,
      };
    });
  }, [errorTimeSeries]);

  /**
   * Get the current 5xx and functional error values from the active service's golden signals.
   */
  const currentErrors = useMemo(() => {
    if (!activeService || !activeService.golden_signals) {
      return { errors_5xx: null, errors_functional: null };
    }

    return {
      errors_5xx: activeService.golden_signals.errors_5xx ?? null,
      errors_functional: activeService.golden_signals.errors_functional ?? null,
    };
  }, [activeService]);

  /**
   * Calculate trend directions from the time series data.
   */
  const trends = useMemo(() => {
    const defaultTrend = { direction: 'stable', changePercent: 0 };

    if (!errorTimeSeries) {
      return { errors_5xx: defaultTrend, errors_functional: defaultTrend };
    }

    const errors5xxValues = (errorTimeSeries.errors_5xx || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    const errorsFunctionalValues = (errorTimeSeries.errors_functional || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return {
      errors_5xx:
        errors5xxValues.length >= 2
          ? calculateTrendDirection(errors5xxValues, { threshold: 5 })
          : defaultTrend,
      errors_functional:
        errorsFunctionalValues.length >= 2
          ? calculateTrendDirection(errorsFunctionalValues, { threshold: 5 })
          : defaultTrend,
    };
  }, [errorTimeSeries]);

  /**
   * Get breach thresholds for 5xx and functional errors.
   */
  const thresholds = useMemo(() => {
    return {
      errors_5xx: getBreachThreshold('errors_5xx'),
      errors_functional: getBreachThreshold('errors_functional'),
    };
  }, []);

  /**
   * Compute the Y-axis domain from all chart data values.
   */
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 100];

    const allValues = [];

    for (const point of chartData) {
      if (point.errors_5xx != null) allValues.push(point.errors_5xx);
      if (point.errors_functional != null) allValues.push(point.errors_functional);
    }

    // Include threshold values in domain calculation
    if (thresholds.errors_5xx.warning != null) allValues.push(thresholds.errors_5xx.warning);
    if (thresholds.errors_5xx.critical != null) allValues.push(thresholds.errors_5xx.critical);
    if (thresholds.errors_functional.critical != null)
      allValues.push(thresholds.errors_functional.critical);

    return calculateYAxisDomain(allValues, {
      paddingPercent: 10,
      includeZero: true,
    });
  }, [chartData, thresholds]);

  /**
   * Determine the overall error rate health status.
   */
  const errorStatus = useMemo(() => {
    if (currentErrors.errors_5xx == null && currentErrors.errors_functional == null)
      return 'unknown';

    const e5xxCritical = thresholds.errors_5xx.critical;
    const e5xxWarning = thresholds.errors_5xx.warning;
    const eFuncCritical = thresholds.errors_functional.critical;
    const eFuncWarning = thresholds.errors_functional.warning;

    if (
      (e5xxCritical != null &&
        currentErrors.errors_5xx != null &&
        currentErrors.errors_5xx >= e5xxCritical) ||
      (eFuncCritical != null &&
        currentErrors.errors_functional != null &&
        currentErrors.errors_functional >= eFuncCritical)
    ) {
      return 'critical';
    }

    if (
      (e5xxWarning != null &&
        currentErrors.errors_5xx != null &&
        currentErrors.errors_5xx >= e5xxWarning) ||
      (eFuncWarning != null &&
        currentErrors.errors_functional != null &&
        currentErrors.errors_functional >= eFuncWarning)
    ) {
      return 'warning';
    }

    return 'healthy';
  }, [currentErrors, thresholds]);

  /**
   * Sparkline data for the 5xx errors metric card.
   */
  const errors5xxSparkData = useMemo(() => {
    if (!errorTimeSeries || !errorTimeSeries.errors_5xx) return null;

    const values = errorTimeSeries.errors_5xx
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [errorTimeSeries]);

  /**
   * Sparkline data for the functional errors metric card.
   */
  const errorsFunctionalSparkData = useMemo(() => {
    if (!errorTimeSeries || !errorTimeSeries.errors_functional) return null;

    const values = errorTimeSeries.errors_functional
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [errorTimeSeries]);

  /**
   * Compute average and peak error counts from the time series.
   */
  const errorStats = useMemo(() => {
    if (!errorTimeSeries) {
      return { avg5xx: null, peak5xx: null, avgFunc: null, peakFunc: null };
    }

    const compute = (series) => {
      if (!series) return { avg: null, peak: null };
      const values = series.map((p) => p.value).filter((v) => v != null && !isNaN(v));
      if (values.length === 0) return { avg: null, peak: null };
      const sum = values.reduce((acc, v) => acc + v, 0);
      return {
        avg: parseFloat((sum / values.length).toFixed(2)),
        peak: parseFloat(Math.max(...values).toFixed(2)),
      };
    };

    const stats5xx = compute(errorTimeSeries.errors_5xx);
    const statsFunc = compute(errorTimeSeries.errors_functional);

    return {
      avg5xx: stats5xx.avg,
      peak5xx: stats5xx.peak,
      avgFunc: statsFunc.avg,
      peakFunc: statsFunc.peak,
    };
  }, [errorTimeSeries]);

  /**
   * Handle service selection change.
   */
  const handleServiceSelect = useCallback((serviceId) => {
    setActiveServiceId(serviceId);
    setIsSelectorOpen(false);
  }, []);

  /**
   * Toggle the service selector dropdown.
   */
  const toggleSelector = useCallback(() => {
    if (!showServiceSelector) return;
    setIsSelectorOpen((prev) => !prev);
  }, [showServiceSelector]);

  /**
   * Close the service selector dropdown.
   */
  const closeSelector = useCallback(() => {
    setIsSelectorOpen(false);
  }, []);

  /**
   * Get the error count color class based on value and threshold.
   * @param {number} value - The error count value.
   * @param {Object} threshold - The threshold config with warning and critical.
   * @returns {string} Tailwind text color class.
   */
  const getErrorColorClass = useCallback((value, threshold) => {
    if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
    if (threshold.critical != null && value >= threshold.critical) return 'text-severity-critical';
    if (threshold.warning != null && value >= threshold.warning) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Custom tooltip renderer for the error rate chart.
   */
  const renderChartTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      return (
        <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
          <p className="font-medium text-dashboard-text-primary mb-1.5">{label}</p>
          {payload.map((entry) => {
            const metricKey = entry.dataKey;
            const value = entry.value;
            const threshold =
              metricKey === 'errors_5xx' ? thresholds.errors_5xx : thresholds.errors_functional;

            let statusLabel = 'Normal';
            let statusColorClass = 'text-status-healthy';

            if (threshold.critical != null && value >= threshold.critical) {
              statusLabel = 'Critical';
              statusColorClass = 'text-severity-critical';
            } else if (threshold.warning != null && value >= threshold.warning) {
              statusLabel = 'Warning';
              statusColorClass = 'text-status-degraded';
            }

            return (
              <div key={metricKey} className="flex items-center gap-2 mb-0.5">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-dashboard-text-muted">
                  {metricKey === 'errors_5xx' ? '5xx Errors' : 'Functional Errors'}:
                </span>
                <span className={`font-semibold ${statusColorClass}`}>
                  {value != null ? formatNumber(value, { decimals: 0 }) : '—'}
                </span>
                <span className={`text-[10px] ${statusColorClass}`}>({statusLabel})</span>
              </div>
            );
          })}
        </div>
      );
    },
    [thresholds],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading error rate data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load error rate data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state — no domains
  if (!filteredDomains || filteredDomains.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No error rate data"
          description="No domain or service data is available. Upload metrics data to populate the error rate chart."
          size="md"
        />
      </div>
    );
  }

  // No time series data available
  if (!chartData || chartData.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Error Rate — Golden Signal
              </h3>
              <StatusBadge status="unknown" size="sm" label="No Data" />
            </div>
          </div>

          <EmptyState
            preset="no-metrics"
            title="No error rate time series"
            description={
              activeService
                ? `No error rate time series data is available for ${activeService.name}. Select a different service or upload metrics data.`
                : 'Select a service to view error rate metrics.'
            }
            size="sm"
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="dashboard-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-sm font-semibold text-dashboard-text-primary">
              Error Rate — Golden Signal
            </h3>
            <StatusBadge
              status={errorStatus}
              size="sm"
              label={
                errorStatus === 'healthy'
                  ? 'Normal'
                  : errorStatus === 'warning'
                    ? 'Elevated'
                    : errorStatus === 'critical'
                      ? 'High Error Rate'
                      : 'Unknown'
              }
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Service Selector */}
            {showServiceSelector && (
              <div className="relative">
                <button
                  onClick={toggleSelector}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg transition-colors duration-150 ${
                    isSelectorOpen
                      ? 'border-brand-500 ring-2 ring-brand-500/20'
                      : 'border-dashboard-border hover:border-gray-300'
                  } text-dashboard-text-primary`}
                  aria-expanded={isSelectorOpen}
                  aria-haspopup="listbox"
                  aria-label="Select service"
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      activeService?.status === SERVICE_STATUS.HEALTHY
                        ? 'bg-status-healthy'
                        : activeService?.status === SERVICE_STATUS.DEGRADED
                          ? 'bg-status-degraded'
                          : activeService?.status === SERVICE_STATUS.DOWN
                            ? 'bg-status-down'
                            : 'bg-status-unknown'
                    }`}
                  />
                  <span className="truncate max-w-[160px]">
                    {activeService ? activeService.name : 'Select Service'}
                  </span>
                  <svg
                    className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-150 ${
                      isSelectorOpen ? 'rotate-180' : ''
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

                {/* Dropdown */}
                {isSelectorOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={closeSelector}
                      aria-hidden="true"
                    />
                    <div className="absolute z-40 top-full right-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-dashboard-border rounded-lg shadow-panel py-1 animate-fade-in scrollbar-thin">
                      {servicesByTier.map((tierGroup) => (
                        <div key={tierGroup.tier}>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted bg-gray-50/50">
                            {tierGroup.label} Tier
                          </div>
                          {tierGroup.services.map((service) => {
                            const isActive = service.service_id === resolvedServiceId;
                            const hasTimeSeries =
                              filteredDashboardData?.golden_signal_time_series?.[service.service_id]?.[
                                GOLDEN_SIGNALS.ERRORS
                              ] != null;

                            return (
                              <button
                                key={service.service_id}
                                onClick={() => handleServiceSelect(service.service_id)}
                                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors duration-150 ${
                                  isActive
                                    ? 'bg-brand-50 text-brand-700 font-medium'
                                    : 'text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
                                } ${!hasTimeSeries ? 'opacity-50' : ''}`}
                                role="option"
                                aria-selected={isActive}
                              >
                                <span
                                  className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    service.status === SERVICE_STATUS.HEALTHY
                                      ? 'bg-status-healthy'
                                      : service.status === SERVICE_STATUS.DEGRADED
                                        ? 'bg-status-degraded'
                                        : service.status === SERVICE_STATUS.DOWN
                                          ? 'bg-status-down'
                                          : 'bg-status-unknown'
                                  }`}
                                />
                                <span className="truncate flex-1">{service.name}</span>
                                <span className="text-[10px] text-dashboard-text-muted flex-shrink-0">
                                  {service.domain_name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Threshold legend */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-dashboard-text-muted">
              {thresholds.errors_5xx.warning != null && (
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-px bg-status-degraded"
                    style={{ borderTop: '2px dashed #ca8a04' }}
                  />
                  Warn: {formatNumber(thresholds.errors_5xx.warning, { decimals: 0 })}
                </span>
              )}
              {thresholds.errors_5xx.critical != null && (
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-px bg-severity-critical"
                    style={{ borderTop: '2px dashed #dc2626' }}
                  />
                  Crit: {formatNumber(thresholds.errors_5xx.critical, { decimals: 0 })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        {showMetricCards && (
          <div
            className={`grid gap-3 p-4 border-b border-dashboard-border ${
              compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
            }`}
          >
            <MetricCard
              title="5xx Errors"
              value={currentErrors.errors_5xx}
              unit="count"
              size="sm"
              status={
                currentErrors.errors_5xx != null
                  ? thresholds.errors_5xx.critical != null &&
                    currentErrors.errors_5xx >= thresholds.errors_5xx.critical
                    ? 'critical'
                    : thresholds.errors_5xx.warning != null &&
                        currentErrors.errors_5xx >= thresholds.errors_5xx.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={errors5xxSparkData}
              trend={{
                direction: trends.errors_5xx.direction,
                value: Math.abs(trends.errors_5xx.changePercent),
                invertColor: false,
              }}
            />
            <MetricCard
              title="Functional Errors"
              value={currentErrors.errors_functional}
              unit="count"
              size="sm"
              status={
                currentErrors.errors_functional != null
                  ? thresholds.errors_functional.critical != null &&
                    currentErrors.errors_functional >= thresholds.errors_functional.critical
                    ? 'critical'
                    : thresholds.errors_functional.warning != null &&
                        currentErrors.errors_functional >= thresholds.errors_functional.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={errorsFunctionalSparkData}
              trend={{
                direction: trends.errors_functional.direction,
                value: Math.abs(trends.errors_functional.changePercent),
                invertColor: false,
              }}
            />
            {!compact && (
              <>
                <MetricCard
                  title="Peak 5xx"
                  value={errorStats.peak5xx}
                  unit="count"
                  size="sm"
                  status={
                    errorStats.peak5xx != null &&
                    thresholds.errors_5xx.critical != null &&
                    errorStats.peak5xx >= thresholds.errors_5xx.critical
                      ? 'critical'
                      : errorStats.peak5xx != null &&
                          thresholds.errors_5xx.warning != null &&
                          errorStats.peak5xx >= thresholds.errors_5xx.warning
                        ? 'warning'
                        : undefined
                  }
                  subtitle="Last 24 hours"
                />
                <MetricCard
                  title="Service"
                  value={activeService ? activeService.name : '—'}
                  unit=""
                  size="sm"
                  subtitle={
                    activeService
                      ? `${activeService.domain_name} · ${DOMAIN_TIER_LABELS[activeService.domain_tier] || activeService.domain_tier}`
                      : undefined
                  }
                />
              </>
            )}
          </div>
        )}

        {/* Chart */}
        <div className="p-4">
          <div style={{ width: '100%', height: compact ? 200 : chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{
                  top: 8,
                  right: 12,
                  left: compact ? -10 : 0,
                  bottom: 0,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yAxisDomain}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v)}`}
                  width={compact ? 45 : 55}
                />
                <Tooltip content={renderChartTooltip} />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="line"
                  iconSize={12}
                  wrapperStyle={{ fontSize: '11px', color: '#475569' }}
                  formatter={(value) => {
                    if (value === 'errors_5xx') return '5xx Errors';
                    if (value === 'errors_functional') return 'Functional Errors';
                    return value;
                  }}
                />

                {/* Warning threshold reference line (5xx) */}
                {thresholds.errors_5xx.warning != null && (
                  <ReferenceLine
                    y={thresholds.errors_5xx.warning}
                    stroke="#ca8a04"
                    strokeDasharray="6 4"
                    strokeWidth={1}
                    label={{
                      value: `Warn ${thresholds.errors_5xx.warning}`,
                      position: 'right',
                      fill: '#ca8a04',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* Critical threshold reference line (5xx) */}
                {thresholds.errors_5xx.critical != null && (
                  <ReferenceLine
                    y={thresholds.errors_5xx.critical}
                    stroke="#dc2626"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: `Crit ${thresholds.errors_5xx.critical}`,
                      position: 'right',
                      fill: '#dc2626',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* 5xx Errors Line */}
                <Line
                  type="monotone"
                  dataKey="errors_5xx"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#ef4444',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="errors_5xx"
                  connectNulls
                />

                {/* Functional Errors Line */}
                <Line
                  type="monotone"
                  dataKey="errors_functional"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#f59e0b',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="errors_functional"
                  connectNulls
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>{chartData.length} data points</span>
            <span>·</span>
            <span>Last 24 Hours (Hourly)</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            {activeService && (
              <span>
                Status:{' '}
                <span
                  className={`font-medium ${
                    activeService.status === SERVICE_STATUS.HEALTHY
                      ? 'text-status-healthy'
                      : activeService.status === SERVICE_STATUS.DEGRADED
                        ? 'text-status-degraded'
                        : activeService.status === SERVICE_STATUS.DOWN
                          ? 'text-severity-critical'
                          : 'text-dashboard-text-muted'
                  }`}
                >
                  {activeService.status || 'Unknown'}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1">
              5xx Trend:
              <TrendArrow
                direction={trends.errors_5xx.direction}
                value={Math.abs(trends.errors_5xx.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.errors_5xx.changePercent > 1}
              />
            </span>
            <span className="flex items-center gap-1">
              Func Trend:
              <TrendArrow
                direction={trends.errors_functional.direction}
                value={Math.abs(trends.errors_functional.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.errors_functional.changePercent > 1}
              />
            </span>
            {errorStats.avg5xx != null && (
              <span>
                Avg 5xx:{' '}
                <span className="font-medium text-dashboard-text-secondary">
                  {formatNumber(errorStats.avg5xx, { decimals: 1 })}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { ErrorRateChart };
export default ErrorRateChart;
