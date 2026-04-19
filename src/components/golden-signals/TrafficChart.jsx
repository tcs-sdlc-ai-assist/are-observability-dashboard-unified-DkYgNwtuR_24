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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

/**
 * TrafficChart - Golden signal chart component for traffic metrics (Requests Per Second)
 * over time using Recharts BarChart. Supports domain/service filtering,
 * threshold reference lines, and trend indicators.
 *
 * Features:
 * - RPS bar chart over time (last 24 hours, hourly)
 * - Warning and critical threshold reference lines from metric config
 * - Per-service traffic metric cards with trend arrows
 * - Domain/service filter dropdown
 * - Color-coded bars based on threshold status
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
const TrafficChart = ({
  className = '',
  compact = false,
  selectedServiceId = null,
  showServiceSelector = true,
  showMetricCards = true,
  chartHeight = 280,
}) => {
  const { domains, dashboardData, isLoading, error } = useDashboard();
  const [activeServiceId, setActiveServiceId] = useState(selectedServiceId);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  /**
   * Flatten all services from domains with domain metadata attached.
   */
  const allServices = useMemo(() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return [];
    }

    return domains.flatMap((domain) =>
      (domain.services || []).map((service) => ({
        ...service,
        domain_id: domain.domain_id,
        domain_name: domain.name,
        domain_tier: domain.tier,
      })),
    );
  }, [domains]);

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
    const timeSeries = dashboardData?.golden_signal_time_series;
    if (timeSeries) {
      for (const service of allServices) {
        if (timeSeries[service.service_id]?.[GOLDEN_SIGNALS.TRAFFIC]) {
          return service.service_id;
        }
      }
    }

    // Fallback to first service
    return allServices.length > 0 ? allServices[0].service_id : null;
  }, [activeServiceId, allServices, dashboardData]);

  /**
   * Get the active service object.
   */
  const activeService = useMemo(() => {
    if (!resolvedServiceId) return null;
    return allServices.find((s) => s.service_id === resolvedServiceId) || null;
  }, [resolvedServiceId, allServices]);

  /**
   * Get the traffic time series data for the active service.
   */
  const trafficTimeSeries = useMemo(() => {
    if (!resolvedServiceId || !dashboardData?.golden_signal_time_series) {
      return null;
    }

    const serviceTimeSeries = dashboardData.golden_signal_time_series[resolvedServiceId];
    if (!serviceTimeSeries || !serviceTimeSeries[GOLDEN_SIGNALS.TRAFFIC]) {
      return null;
    }

    return serviceTimeSeries[GOLDEN_SIGNALS.TRAFFIC];
  }, [resolvedServiceId, dashboardData]);

  /**
   * Build Recharts-compatible chart data from the traffic time series.
   */
  const chartData = useMemo(() => {
    if (!trafficTimeSeries) return [];

    const data = buildGoldenSignalChartData(
      { [GOLDEN_SIGNALS.TRAFFIC]: trafficTimeSeries },
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
  }, [trafficTimeSeries]);

  /**
   * Get the current traffic RPS value from the active service's golden signals.
   */
  const currentTraffic = useMemo(() => {
    if (!activeService || !activeService.golden_signals) {
      return { rps: null };
    }

    return {
      rps: activeService.golden_signals.traffic_rps ?? null,
    };
  }, [activeService]);

  /**
   * Calculate trend direction from the time series data.
   */
  const trends = useMemo(() => {
    const defaultTrend = { direction: 'stable', changePercent: 0 };

    if (!trafficTimeSeries) {
      return { rps: defaultTrend };
    }

    const rpsValues = (trafficTimeSeries.traffic_rps || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return {
      rps: rpsValues.length >= 2
        ? calculateTrendDirection(rpsValues, { threshold: 5 })
        : defaultTrend,
    };
  }, [trafficTimeSeries]);

  /**
   * Get breach thresholds for traffic RPS.
   */
  const thresholds = useMemo(() => {
    return {
      rps: getBreachThreshold('traffic_rps'),
    };
  }, []);

  /**
   * Compute the Y-axis domain from all chart data values.
   */
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 2000];

    const allValues = [];

    for (const point of chartData) {
      if (point.traffic_rps != null) allValues.push(point.traffic_rps);
    }

    // Include threshold values in domain calculation
    if (thresholds.rps.warning != null) allValues.push(thresholds.rps.warning);
    if (thresholds.rps.critical != null) allValues.push(thresholds.rps.critical);

    return calculateYAxisDomain(allValues, {
      paddingPercent: 10,
      includeZero: true,
    });
  }, [chartData, thresholds]);

  /**
   * Determine the overall traffic health status.
   */
  const trafficStatus = useMemo(() => {
    if (currentTraffic.rps == null) return 'unknown';

    const rpsCritical = thresholds.rps.critical;
    const rpsWarning = thresholds.rps.warning;

    if (rpsCritical != null && currentTraffic.rps >= rpsCritical) {
      return 'critical';
    }

    if (rpsWarning != null && currentTraffic.rps >= rpsWarning) {
      return 'warning';
    }

    return 'healthy';
  }, [currentTraffic, thresholds]);

  /**
   * Sparkline data for the RPS metric card.
   */
  const rpsSparkData = useMemo(() => {
    if (!trafficTimeSeries || !trafficTimeSeries.traffic_rps) return null;

    const values = trafficTimeSeries.traffic_rps
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [trafficTimeSeries]);

  /**
   * Compute average and peak RPS from the time series.
   */
  const trafficStats = useMemo(() => {
    if (!trafficTimeSeries || !trafficTimeSeries.traffic_rps) {
      return { avg: null, peak: null, min: null };
    }

    const values = trafficTimeSeries.traffic_rps
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    if (values.length === 0) {
      return { avg: null, peak: null, min: null };
    }

    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = parseFloat((sum / values.length).toFixed(2));
    const peak = parseFloat(Math.max(...values).toFixed(2));
    const min = parseFloat(Math.min(...values).toFixed(2));

    return { avg, peak, min };
  }, [trafficTimeSeries]);

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
   * Get the bar fill color based on the RPS value and thresholds.
   * @param {number} value - The RPS value.
   * @returns {string} Hex color string.
   */
  const getBarColor = useCallback(
    (value) => {
      if (value == null || isNaN(value)) return '#94a3b8';
      if (thresholds.rps.critical != null && value >= thresholds.rps.critical) return '#dc2626';
      if (thresholds.rps.warning != null && value >= thresholds.rps.warning) return '#ca8a04';
      return '#6366f1';
    },
    [thresholds],
  );

  /**
   * Custom tooltip renderer for the traffic chart.
   */
  const renderChartTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const entry = payload[0];
      const value = entry.value;

      let statusLabel = 'Normal';
      let statusColorClass = 'text-status-healthy';

      if (thresholds.rps.critical != null && value >= thresholds.rps.critical) {
        statusLabel = 'Critical';
        statusColorClass = 'text-severity-critical';
      } else if (thresholds.rps.warning != null && value >= thresholds.rps.warning) {
        statusLabel = 'Warning';
        statusColorClass = 'text-status-degraded';
      }

      return (
        <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
          <p className="font-medium text-dashboard-text-primary mb-1.5">{label}</p>
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color || '#6366f1' }}
            />
            <span className="text-dashboard-text-muted">RPS:</span>
            <span className={`font-semibold ${statusColorClass}`}>
              {value != null ? formatNumber(value, { decimals: 0 }) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Status:</span>
            <span className={`font-medium ${statusColorClass}`}>{statusLabel}</span>
          </div>
        </div>
      );
    },
    [thresholds],
  );

  /**
   * Custom bar shape that colors each bar based on its value relative to thresholds.
   */
  const renderCustomBar = useCallback(
    (props) => {
      const { x, y, width, height, value } = props;
      const fill = getBarColor(value);

      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          rx={2}
          ry={2}
        />
      );
    },
    [getBarColor],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading traffic data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load traffic data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state — no domains
  if (!domains || domains.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No traffic data"
          description="No domain or service data is available. Upload metrics data to populate the traffic chart."
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
                Traffic — Golden Signal
              </h3>
              <StatusBadge status="unknown" size="sm" label="No Data" />
            </div>
          </div>

          <EmptyState
            preset="no-metrics"
            title="No traffic time series"
            description={
              activeService
                ? `No traffic time series data is available for ${activeService.name}. Select a different service or upload metrics data.`
                : 'Select a service to view traffic metrics.'
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
              Traffic — Golden Signal
            </h3>
            <StatusBadge
              status={trafficStatus}
              size="sm"
              label={
                trafficStatus === 'healthy'
                  ? 'Normal'
                  : trafficStatus === 'warning'
                    ? 'Elevated'
                    : trafficStatus === 'critical'
                      ? 'High Traffic'
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
                              dashboardData?.golden_signal_time_series?.[service.service_id]?.[
                                GOLDEN_SIGNALS.TRAFFIC
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
              {thresholds.rps.warning != null && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-px bg-status-degraded" style={{ borderTop: '2px dashed #ca8a04' }} />
                  Warn: {formatNumber(thresholds.rps.warning, { decimals: 0 })} rps
                </span>
              )}
              {thresholds.rps.critical != null && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-px bg-severity-critical" style={{ borderTop: '2px dashed #dc2626' }} />
                  Crit: {formatNumber(thresholds.rps.critical, { decimals: 0 })} rps
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
              title="Current RPS"
              value={currentTraffic.rps}
              unit="rps"
              size="sm"
              status={trafficStatus !== 'unknown' ? trafficStatus : undefined}
              sparkData={rpsSparkData}
              trend={{
                direction: trends.rps.direction,
                value: Math.abs(trends.rps.changePercent),
                invertColor: false,
              }}
            />
            <MetricCard
              title="Avg RPS"
              value={trafficStats.avg}
              unit="rps"
              size="sm"
              subtitle="Last 24 hours"
            />
            {!compact && (
              <>
                <MetricCard
                  title="Peak RPS"
                  value={trafficStats.peak}
                  unit="rps"
                  size="sm"
                  status={
                    trafficStats.peak != null &&
                    thresholds.rps.critical != null &&
                    trafficStats.peak >= thresholds.rps.critical
                      ? 'critical'
                      : trafficStats.peak != null &&
                          thresholds.rps.warning != null &&
                          trafficStats.peak >= thresholds.rps.warning
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
              <BarChart
                data={chartData}
                margin={{
                  top: 8,
                  right: 12,
                  left: compact ? -10 : 0,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
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
                  iconType="rect"
                  iconSize={12}
                  wrapperStyle={{ fontSize: '11px', color: '#475569' }}
                  formatter={(value) => {
                    if (value === 'traffic_rps') return 'Requests Per Second';
                    return value;
                  }}
                />

                {/* Warning threshold reference line */}
                {thresholds.rps.warning != null && (
                  <ReferenceLine
                    y={thresholds.rps.warning}
                    stroke="#ca8a04"
                    strokeDasharray="6 4"
                    strokeWidth={1}
                    label={{
                      value: `Warn ${formatNumber(thresholds.rps.warning, { decimals: 0 })}`,
                      position: 'right',
                      fill: '#ca8a04',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* Critical threshold reference line */}
                {thresholds.rps.critical != null && (
                  <ReferenceLine
                    y={thresholds.rps.critical}
                    stroke="#dc2626"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: `Crit ${formatNumber(thresholds.rps.critical, { decimals: 0 })}`,
                      position: 'right',
                      fill: '#dc2626',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* Traffic RPS Bar */}
                <Bar
                  dataKey="traffic_rps"
                  name="traffic_rps"
                  fill="#6366f1"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={compact ? 16 : 24}
                  shape={renderCustomBar}
                />
              </BarChart>
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
              RPS Trend:
              <TrendArrow
                direction={trends.rps.direction}
                value={Math.abs(trends.rps.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.rps.changePercent > 1}
              />
            </span>
            {trafficStats.avg != null && (
              <span>
                Avg:{' '}
                <span className="font-medium text-dashboard-text-secondary">
                  {formatNumber(trafficStats.avg, { decimals: 0 })} rps
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { TrafficChart };
export default TrafficChart;