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
 * LatencyChart - Golden signal chart component for latency metrics (P95 and P99)
 * over time using Recharts LineChart. Supports domain/service filtering,
 * SLO threshold reference lines, and trend indicators.
 *
 * Features:
 * - P95 and P99 latency line chart over time (last 24 hours, hourly)
 * - Warning and critical threshold reference lines from metric config
 * - Per-service latency metric cards with trend arrows
 * - Domain/service filter dropdown
 * - Color-coded lines for P95 (indigo) and P99 (pink)
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
const LatencyChart = ({
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
        if (timeSeries[service.service_id]?.[GOLDEN_SIGNALS.LATENCY]) {
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
   * Get the latency time series data for the active service.
   */
  const latencyTimeSeries = useMemo(() => {
    if (!resolvedServiceId || !filteredDashboardData?.golden_signal_time_series) {
      return null;
    }

    const serviceTimeSeries = filteredDashboardData.golden_signal_time_series[resolvedServiceId];
    if (!serviceTimeSeries || !serviceTimeSeries[GOLDEN_SIGNALS.LATENCY]) {
      return null;
    }

    return serviceTimeSeries[GOLDEN_SIGNALS.LATENCY];
  }, [resolvedServiceId, filteredDashboardData]);

  /**
   * Build Recharts-compatible chart data from the latency time series.
   */
  const chartData = useMemo(() => {
    if (!latencyTimeSeries) return [];

    const data = buildGoldenSignalChartData(
      { [GOLDEN_SIGNALS.LATENCY]: latencyTimeSeries },
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
  }, [latencyTimeSeries]);

  /**
   * Get the current P95 and P99 values from the active service's golden signals.
   */
  const currentLatency = useMemo(() => {
    if (!activeService || !activeService.golden_signals) {
      return { p95: null, p99: null };
    }

    return {
      p95: activeService.golden_signals.latency_p95 ?? null,
      p99: activeService.golden_signals.latency_p99 ?? null,
    };
  }, [activeService]);

  /**
   * Calculate trend directions from the time series data.
   */
  const trends = useMemo(() => {
    const defaultTrend = { direction: 'stable', changePercent: 0 };

    if (!latencyTimeSeries) {
      return { p95: defaultTrend, p99: defaultTrend };
    }

    const p95Values = (latencyTimeSeries.latency_p95 || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    const p99Values = (latencyTimeSeries.latency_p99 || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return {
      p95:
        p95Values.length >= 2 ? calculateTrendDirection(p95Values, { threshold: 5 }) : defaultTrend,
      p99:
        p99Values.length >= 2 ? calculateTrendDirection(p99Values, { threshold: 5 }) : defaultTrend,
    };
  }, [latencyTimeSeries]);

  /**
   * Get breach thresholds for P95 and P99 latency.
   */
  const thresholds = useMemo(() => {
    return {
      p95: getBreachThreshold('latency_p95'),
      p99: getBreachThreshold('latency_p99'),
    };
  }, []);

  /**
   * Compute the Y-axis domain from all chart data values.
   */
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 1000];

    const allValues = [];

    for (const point of chartData) {
      if (point.latency_p95 != null) allValues.push(point.latency_p95);
      if (point.latency_p99 != null) allValues.push(point.latency_p99);
    }

    // Include threshold values in domain calculation
    if (thresholds.p95.warning != null) allValues.push(thresholds.p95.warning);
    if (thresholds.p95.critical != null) allValues.push(thresholds.p95.critical);
    if (thresholds.p99.critical != null) allValues.push(thresholds.p99.critical);

    return calculateYAxisDomain(allValues, {
      paddingPercent: 10,
      includeZero: false,
    });
  }, [chartData, thresholds]);

  /**
   * Determine the overall latency health status.
   */
  const latencyStatus = useMemo(() => {
    if (currentLatency.p95 == null && currentLatency.p99 == null) return 'unknown';

    const p95Critical = thresholds.p95.critical;
    const p95Warning = thresholds.p95.warning;
    const p99Critical = thresholds.p99.critical;

    if (
      (p95Critical != null && currentLatency.p95 != null && currentLatency.p95 >= p95Critical) ||
      (p99Critical != null && currentLatency.p99 != null && currentLatency.p99 >= p99Critical)
    ) {
      return 'critical';
    }

    if (p95Warning != null && currentLatency.p95 != null && currentLatency.p95 >= p95Warning) {
      return 'warning';
    }

    return 'healthy';
  }, [currentLatency, thresholds]);

  /**
   * Sparkline data for the P95 metric card.
   */
  const p95SparkData = useMemo(() => {
    if (!latencyTimeSeries || !latencyTimeSeries.latency_p95) return null;

    const values = latencyTimeSeries.latency_p95
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [latencyTimeSeries]);

  /**
   * Sparkline data for the P99 metric card.
   */
  const p99SparkData = useMemo(() => {
    if (!latencyTimeSeries || !latencyTimeSeries.latency_p99) return null;

    const values = latencyTimeSeries.latency_p99
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [latencyTimeSeries]);

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
   * Get the latency color class based on value and threshold.
   * @param {number} value - The latency value in ms.
   * @param {Object} threshold - The threshold config with warning and critical.
   * @returns {string} Tailwind text color class.
   */
  const getLatencyColorClass = useCallback((value, threshold) => {
    if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
    if (threshold.critical != null && value >= threshold.critical) return 'text-severity-critical';
    if (threshold.warning != null && value >= threshold.warning) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Custom tooltip renderer for the latency chart.
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
            const threshold = metricKey === 'latency_p95' ? thresholds.p95 : thresholds.p99;

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
                  {metricKey === 'latency_p95' ? 'P95' : 'P99'}:
                </span>
                <span className={`font-semibold ${statusColorClass}`}>
                  {value != null ? `${formatNumber(value, { decimals: 1 })} ms` : '—'}
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
        <LoadingSpinner message="Loading latency data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load latency data"
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
          title="No latency data"
          description="No domain or service data is available. Upload metrics data to populate the latency chart."
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
                Latency — Golden Signal
              </h3>
              <StatusBadge status="unknown" size="sm" label="No Data" />
            </div>
          </div>

          <EmptyState
            preset="no-metrics"
            title="No latency time series"
            description={
              activeService
                ? `No latency time series data is available for ${activeService.name}. Select a different service or upload metrics data.`
                : 'Select a service to view latency metrics.'
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
              Latency — Golden Signal
            </h3>
            <StatusBadge
              status={latencyStatus}
              size="sm"
              label={
                latencyStatus === 'healthy'
                  ? 'Normal'
                  : latencyStatus === 'warning'
                    ? 'Elevated'
                    : latencyStatus === 'critical'
                      ? 'High Latency'
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
                                GOLDEN_SIGNALS.LATENCY
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
              {thresholds.p95.warning != null && (
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-px bg-status-degraded"
                    style={{ borderTop: '2px dashed #ca8a04' }}
                  />
                  Warn: {formatNumber(thresholds.p95.warning, { decimals: 0 })}ms
                </span>
              )}
              {thresholds.p95.critical != null && (
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-px bg-severity-critical"
                    style={{ borderTop: '2px dashed #dc2626' }}
                  />
                  Crit: {formatNumber(thresholds.p95.critical, { decimals: 0 })}ms
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
              title="P95 Latency"
              value={currentLatency.p95}
              unit="ms"
              size="sm"
              status={
                currentLatency.p95 != null
                  ? thresholds.p95.critical != null && currentLatency.p95 >= thresholds.p95.critical
                    ? 'critical'
                    : thresholds.p95.warning != null && currentLatency.p95 >= thresholds.p95.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={p95SparkData}
              trend={{
                direction: trends.p95.direction,
                value: Math.abs(trends.p95.changePercent),
                invertColor: false,
              }}
            />
            <MetricCard
              title="P99 Latency"
              value={currentLatency.p99}
              unit="ms"
              size="sm"
              status={
                currentLatency.p99 != null
                  ? thresholds.p99.critical != null && currentLatency.p99 >= thresholds.p99.critical
                    ? 'critical'
                    : thresholds.p99.warning != null && currentLatency.p99 >= thresholds.p99.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={p99SparkData}
              trend={{
                direction: trends.p99.direction,
                value: Math.abs(trends.p99.changePercent),
                invertColor: false,
              }}
            />
            {!compact && (
              <>
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
                <MetricCard
                  title="Availability"
                  value={activeService?.availability}
                  unit="%"
                  size="sm"
                  status={
                    activeService?.status === SERVICE_STATUS.HEALTHY
                      ? 'healthy'
                      : activeService?.status === SERVICE_STATUS.DEGRADED
                        ? 'degraded'
                        : activeService?.status === SERVICE_STATUS.DOWN
                          ? 'critical'
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
                  tickFormatter={(v) => `${Math.round(v)}ms`}
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
                    if (value === 'latency_p95') return 'P95 Latency';
                    if (value === 'latency_p99') return 'P99 Latency';
                    return value;
                  }}
                />

                {/* Warning threshold reference line */}
                {thresholds.p95.warning != null && (
                  <ReferenceLine
                    y={thresholds.p95.warning}
                    stroke="#ca8a04"
                    strokeDasharray="6 4"
                    strokeWidth={1}
                    label={{
                      value: `Warn ${thresholds.p95.warning}ms`,
                      position: 'right',
                      fill: '#ca8a04',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* Critical threshold reference line */}
                {thresholds.p95.critical != null && (
                  <ReferenceLine
                    y={thresholds.p95.critical}
                    stroke="#dc2626"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: `Crit ${thresholds.p95.critical}ms`,
                      position: 'right',
                      fill: '#dc2626',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* P95 Latency Line */}
                <Line
                  type="monotone"
                  dataKey="latency_p95"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#6366f1',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="latency_p95"
                  connectNulls
                />

                {/* P99 Latency Line */}
                <Line
                  type="monotone"
                  dataKey="latency_p99"
                  stroke="#ec4899"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#ec4899',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="latency_p99"
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
              P95 Trend:
              <TrendArrow
                direction={trends.p95.direction}
                value={Math.abs(trends.p95.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.p95.changePercent > 1}
              />
            </span>
            <span className="flex items-center gap-1">
              P99 Trend:
              <TrendArrow
                direction={trends.p99.direction}
                value={Math.abs(trends.p99.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.p99.changePercent > 1}
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { LatencyChart };
export default LatencyChart;
