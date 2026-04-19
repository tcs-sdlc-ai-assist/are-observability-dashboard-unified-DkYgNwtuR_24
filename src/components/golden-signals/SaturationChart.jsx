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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

/**
 * SaturationChart - Golden signal chart component for saturation metrics (CPU,
 * Memory, and Queue Depth utilization) over time using Recharts AreaChart.
 * Supports domain/service filtering, warning/critical threshold reference lines,
 * and trend indicators.
 *
 * Features:
 * - CPU, Memory, and Queue saturation area chart over time (last 24 hours, hourly)
 * - Warning and critical threshold reference lines from metric config
 * - Per-service saturation metric cards with trend arrows
 * - Domain/service filter dropdown
 * - Color-coded areas for CPU (indigo), Memory (pink), Queue (amber)
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
const SaturationChart = ({
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
        if (timeSeries[service.service_id]?.[GOLDEN_SIGNALS.SATURATION]) {
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
   * Get the saturation time series data for the active service.
   */
  const saturationTimeSeries = useMemo(() => {
    if (!resolvedServiceId || !dashboardData?.golden_signal_time_series) {
      return null;
    }

    const serviceTimeSeries = dashboardData.golden_signal_time_series[resolvedServiceId];
    if (!serviceTimeSeries || !serviceTimeSeries[GOLDEN_SIGNALS.SATURATION]) {
      return null;
    }

    return serviceTimeSeries[GOLDEN_SIGNALS.SATURATION];
  }, [resolvedServiceId, dashboardData]);

  /**
   * Build Recharts-compatible chart data from the saturation time series.
   */
  const chartData = useMemo(() => {
    if (!saturationTimeSeries) return [];

    const data = buildGoldenSignalChartData(
      { [GOLDEN_SIGNALS.SATURATION]: saturationTimeSeries },
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
  }, [saturationTimeSeries]);

  /**
   * Get the current CPU, Memory, and Queue saturation values from the active service's golden signals.
   */
  const currentSaturation = useMemo(() => {
    if (!activeService || !activeService.golden_signals) {
      return { cpu: null, mem: null, queue: null };
    }

    return {
      cpu: activeService.golden_signals.saturation_cpu ?? null,
      mem: activeService.golden_signals.saturation_mem ?? null,
      queue: activeService.golden_signals.saturation_queue ?? null,
    };
  }, [activeService]);

  /**
   * Calculate trend directions from the time series data.
   */
  const trends = useMemo(() => {
    const defaultTrend = { direction: 'stable', changePercent: 0 };

    if (!saturationTimeSeries) {
      return { cpu: defaultTrend, mem: defaultTrend, queue: defaultTrend };
    }

    const cpuValues = (saturationTimeSeries.saturation_cpu || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    const memValues = (saturationTimeSeries.saturation_mem || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    const queueValues = (saturationTimeSeries.saturation_queue || [])
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return {
      cpu: cpuValues.length >= 2
        ? calculateTrendDirection(cpuValues, { threshold: 5 })
        : defaultTrend,
      mem: memValues.length >= 2
        ? calculateTrendDirection(memValues, { threshold: 5 })
        : defaultTrend,
      queue: queueValues.length >= 2
        ? calculateTrendDirection(queueValues, { threshold: 5 })
        : defaultTrend,
    };
  }, [saturationTimeSeries]);

  /**
   * Get breach thresholds for CPU, Memory, and Queue saturation.
   */
  const thresholds = useMemo(() => {
    return {
      cpu: getBreachThreshold('saturation_cpu'),
      mem: getBreachThreshold('saturation_mem'),
      queue: getBreachThreshold('saturation_queue'),
    };
  }, []);

  /**
   * Compute the Y-axis domain from all chart data values.
   */
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 100];

    const allValues = [];

    for (const point of chartData) {
      if (point.saturation_cpu != null) allValues.push(point.saturation_cpu);
      if (point.saturation_mem != null) allValues.push(point.saturation_mem);
      if (point.saturation_queue != null) allValues.push(point.saturation_queue);
    }

    // Include threshold values in domain calculation
    if (thresholds.cpu.warning != null) allValues.push(thresholds.cpu.warning);
    if (thresholds.cpu.critical != null) allValues.push(thresholds.cpu.critical);
    if (thresholds.mem.critical != null) allValues.push(thresholds.mem.critical);
    if (thresholds.queue.critical != null) allValues.push(thresholds.queue.critical);

    return calculateYAxisDomain(allValues, {
      paddingPercent: 10,
      includeZero: true,
      maxValue: 100,
    });
  }, [chartData, thresholds]);

  /**
   * Determine the overall saturation health status.
   */
  const saturationStatus = useMemo(() => {
    if (
      currentSaturation.cpu == null &&
      currentSaturation.mem == null &&
      currentSaturation.queue == null
    ) {
      return 'unknown';
    }

    const cpuCritical = thresholds.cpu.critical;
    const cpuWarning = thresholds.cpu.warning;
    const memCritical = thresholds.mem.critical;
    const memWarning = thresholds.mem.warning;
    const queueCritical = thresholds.queue.critical;
    const queueWarning = thresholds.queue.warning;

    if (
      (cpuCritical != null && currentSaturation.cpu != null && currentSaturation.cpu >= cpuCritical) ||
      (memCritical != null && currentSaturation.mem != null && currentSaturation.mem >= memCritical) ||
      (queueCritical != null && currentSaturation.queue != null && currentSaturation.queue >= queueCritical)
    ) {
      return 'critical';
    }

    if (
      (cpuWarning != null && currentSaturation.cpu != null && currentSaturation.cpu >= cpuWarning) ||
      (memWarning != null && currentSaturation.mem != null && currentSaturation.mem >= memWarning) ||
      (queueWarning != null && currentSaturation.queue != null && currentSaturation.queue >= queueWarning)
    ) {
      return 'warning';
    }

    return 'healthy';
  }, [currentSaturation, thresholds]);

  /**
   * Sparkline data for the CPU metric card.
   */
  const cpuSparkData = useMemo(() => {
    if (!saturationTimeSeries || !saturationTimeSeries.saturation_cpu) return null;

    const values = saturationTimeSeries.saturation_cpu
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [saturationTimeSeries]);

  /**
   * Sparkline data for the Memory metric card.
   */
  const memSparkData = useMemo(() => {
    if (!saturationTimeSeries || !saturationTimeSeries.saturation_mem) return null;

    const values = saturationTimeSeries.saturation_mem
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [saturationTimeSeries]);

  /**
   * Sparkline data for the Queue metric card.
   */
  const queueSparkData = useMemo(() => {
    if (!saturationTimeSeries || !saturationTimeSeries.saturation_queue) return null;

    const values = saturationTimeSeries.saturation_queue
      .map((p) => p.value)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [saturationTimeSeries]);

  /**
   * Compute average and peak saturation values from the time series.
   */
  const saturationStats = useMemo(() => {
    if (!saturationTimeSeries) {
      return { avgCpu: null, peakCpu: null, avgMem: null, peakMem: null, avgQueue: null, peakQueue: null };
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

    const cpuStats = compute(saturationTimeSeries.saturation_cpu);
    const memStats = compute(saturationTimeSeries.saturation_mem);
    const queueStats = compute(saturationTimeSeries.saturation_queue);

    return {
      avgCpu: cpuStats.avg,
      peakCpu: cpuStats.peak,
      avgMem: memStats.avg,
      peakMem: memStats.peak,
      avgQueue: queueStats.avg,
      peakQueue: queueStats.peak,
    };
  }, [saturationTimeSeries]);

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
   * Get the saturation color class based on value and threshold.
   * @param {number} value - The saturation value in %.
   * @param {Object} threshold - The threshold config with warning and critical.
   * @returns {string} Tailwind text color class.
   */
  const getSaturationColorClass = useCallback((value, threshold) => {
    if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
    if (threshold.critical != null && value >= threshold.critical) return 'text-severity-critical';
    if (threshold.warning != null && value >= threshold.warning) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Custom tooltip renderer for the saturation chart.
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
            let threshold;
            let metricLabel;

            if (metricKey === 'saturation_cpu') {
              threshold = thresholds.cpu;
              metricLabel = 'CPU';
            } else if (metricKey === 'saturation_mem') {
              threshold = thresholds.mem;
              metricLabel = 'Memory';
            } else {
              threshold = thresholds.queue;
              metricLabel = 'Queue';
            }

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
                <span className="text-dashboard-text-muted">{metricLabel}:</span>
                <span className={`font-semibold ${statusColorClass}`}>
                  {value != null ? formatPercentage(value, 1) : '—'}
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
        <LoadingSpinner message="Loading saturation data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load saturation data"
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
          title="No saturation data"
          description="No domain or service data is available. Upload metrics data to populate the saturation chart."
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
                Saturation — Golden Signal
              </h3>
              <StatusBadge status="unknown" size="sm" label="No Data" />
            </div>
          </div>

          <EmptyState
            preset="no-metrics"
            title="No saturation time series"
            description={
              activeService
                ? `No saturation time series data is available for ${activeService.name}. Select a different service or upload metrics data.`
                : 'Select a service to view saturation metrics.'
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
              Saturation — Golden Signal
            </h3>
            <StatusBadge
              status={saturationStatus}
              size="sm"
              label={
                saturationStatus === 'healthy'
                  ? 'Normal'
                  : saturationStatus === 'warning'
                    ? 'Elevated'
                    : saturationStatus === 'critical'
                      ? 'High Utilization'
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
                                GOLDEN_SIGNALS.SATURATION
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
              {thresholds.cpu.warning != null && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-px bg-status-degraded" style={{ borderTop: '2px dashed #ca8a04' }} />
                  Warn: {formatNumber(thresholds.cpu.warning, { decimals: 0 })}%
                </span>
              )}
              {thresholds.cpu.critical != null && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-px bg-severity-critical" style={{ borderTop: '2px dashed #dc2626' }} />
                  Crit: {formatNumber(thresholds.cpu.critical, { decimals: 0 })}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        {showMetricCards && (
          <div
            className={`grid gap-3 p-4 border-b border-dashboard-border ${
              compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6'
            }`}
          >
            <MetricCard
              title="CPU Utilization"
              value={currentSaturation.cpu}
              unit="%"
              size="sm"
              status={
                currentSaturation.cpu != null
                  ? thresholds.cpu.critical != null && currentSaturation.cpu >= thresholds.cpu.critical
                    ? 'critical'
                    : thresholds.cpu.warning != null && currentSaturation.cpu >= thresholds.cpu.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={cpuSparkData}
              trend={{
                direction: trends.cpu.direction,
                value: Math.abs(trends.cpu.changePercent),
                invertColor: false,
              }}
            />
            <MetricCard
              title="Memory Utilization"
              value={currentSaturation.mem}
              unit="%"
              size="sm"
              status={
                currentSaturation.mem != null
                  ? thresholds.mem.critical != null && currentSaturation.mem >= thresholds.mem.critical
                    ? 'critical'
                    : thresholds.mem.warning != null && currentSaturation.mem >= thresholds.mem.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={memSparkData}
              trend={{
                direction: trends.mem.direction,
                value: Math.abs(trends.mem.changePercent),
                invertColor: false,
              }}
            />
            <MetricCard
              title="Queue Saturation"
              value={currentSaturation.queue}
              unit="%"
              size="sm"
              status={
                currentSaturation.queue != null
                  ? thresholds.queue.critical != null && currentSaturation.queue >= thresholds.queue.critical
                    ? 'critical'
                    : thresholds.queue.warning != null && currentSaturation.queue >= thresholds.queue.warning
                      ? 'warning'
                      : 'healthy'
                  : undefined
              }
              sparkData={queueSparkData}
              trend={{
                direction: trends.queue.direction,
                value: Math.abs(trends.queue.changePercent),
                invertColor: false,
              }}
            />
            {!compact && (
              <>
                <MetricCard
                  title="Peak CPU"
                  value={saturationStats.peakCpu}
                  unit="%"
                  size="sm"
                  status={
                    saturationStats.peakCpu != null &&
                    thresholds.cpu.critical != null &&
                    saturationStats.peakCpu >= thresholds.cpu.critical
                      ? 'critical'
                      : saturationStats.peakCpu != null &&
                          thresholds.cpu.warning != null &&
                          saturationStats.peakCpu >= thresholds.cpu.warning
                        ? 'warning'
                        : undefined
                  }
                  subtitle="Last 24 hours"
                />
                <MetricCard
                  title="Peak Memory"
                  value={saturationStats.peakMem}
                  unit="%"
                  size="sm"
                  status={
                    saturationStats.peakMem != null &&
                    thresholds.mem.critical != null &&
                    saturationStats.peakMem >= thresholds.mem.critical
                      ? 'critical'
                      : saturationStats.peakMem != null &&
                          thresholds.mem.warning != null &&
                          saturationStats.peakMem >= thresholds.mem.warning
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
              <AreaChart
                data={chartData}
                margin={{
                  top: 8,
                  right: 12,
                  left: compact ? -10 : 0,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient id="saturation-cpu-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="saturation-mem-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="saturation-queue-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={(v) => `${Math.round(v)}%`}
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
                    if (value === 'saturation_cpu') return 'CPU';
                    if (value === 'saturation_mem') return 'Memory';
                    if (value === 'saturation_queue') return 'Queue';
                    return value;
                  }}
                />

                {/* Warning threshold reference line (CPU) */}
                {thresholds.cpu.warning != null && (
                  <ReferenceLine
                    y={thresholds.cpu.warning}
                    stroke="#ca8a04"
                    strokeDasharray="6 4"
                    strokeWidth={1}
                    label={{
                      value: `Warn ${thresholds.cpu.warning}%`,
                      position: 'right',
                      fill: '#ca8a04',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* Critical threshold reference line (CPU) */}
                {thresholds.cpu.critical != null && (
                  <ReferenceLine
                    y={thresholds.cpu.critical}
                    stroke="#dc2626"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: `Crit ${thresholds.cpu.critical}%`,
                      position: 'right',
                      fill: '#dc2626',
                      fontSize: 9,
                    }}
                  />
                )}

                {/* CPU Utilization Area */}
                <Area
                  type="monotone"
                  dataKey="saturation_cpu"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#saturation-cpu-grad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#6366f1',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="saturation_cpu"
                  connectNulls
                />

                {/* Memory Utilization Area */}
                <Area
                  type="monotone"
                  dataKey="saturation_mem"
                  stroke="#ec4899"
                  strokeWidth={2}
                  fill="url(#saturation-mem-grad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#ec4899',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="saturation_mem"
                  connectNulls
                />

                {/* Queue Saturation Area */}
                <Area
                  type="monotone"
                  dataKey="saturation_queue"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#saturation-queue-grad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#f59e0b',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="saturation_queue"
                  connectNulls
                />
              </AreaChart>
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
              CPU Trend:
              <TrendArrow
                direction={trends.cpu.direction}
                value={Math.abs(trends.cpu.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.cpu.changePercent > 1}
              />
            </span>
            <span className="flex items-center gap-1">
              Mem Trend:
              <TrendArrow
                direction={trends.mem.direction}
                value={Math.abs(trends.mem.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.mem.changePercent > 1}
              />
            </span>
            <span className="flex items-center gap-1">
              Queue Trend:
              <TrendArrow
                direction={trends.queue.direction}
                value={Math.abs(trends.queue.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.queue.changePercent > 1}
              />
            </span>
            {saturationStats.avgCpu != null && (
              <span>
                Avg CPU:{' '}
                <span className="font-medium text-dashboard-text-secondary">
                  {formatPercentage(saturationStats.avgCpu, 1)}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { SaturationChart };
export default SaturationChart;