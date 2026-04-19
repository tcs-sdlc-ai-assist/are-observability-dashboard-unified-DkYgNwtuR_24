import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { MetricCard } from '../shared/MetricCard';
import { StatusBadge } from '../shared/StatusBadge';
import { TrendArrow } from '../shared/TrendArrow';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  SEVERITY_LEVELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
  RCA_CATEGORIES,
  RCA_CATEGORY_LABELS,
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatNumber, formatPercentage } from '../../utils/formatters';
import { getRelativeTime, parseTimestamp } from '../../utils/dateUtils';
import { calculateTrendDirection, STATUS_CHART_COLORS } from '../../utils/chartHelpers';
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
 * MTTRTrendChart - MTTR and MTTD trend visualization component using Recharts
 * LineChart. Shows mean time to resolve and mean time to detect over time with
 * trend lines, improvement/degradation indicators, and summary metric cards.
 *
 * Features:
 * - MTTR and MTTD line chart over time (per-incident data points)
 * - Warning and target threshold reference lines
 * - Summary metric cards for avg MTTR, avg MTTD, avg MTBF, and total incidents
 * - Trend arrows indicating improvement or degradation
 * - Sparkline data for metric cards
 * - Toggleable time window (24h / 7d / 30d)
 * - Color-coded lines for MTTR (indigo) and MTTD (pink)
 * - Custom tooltip with formatted values and severity info
 * - Per-severity breakdown of MTTR/MTTD averages
 * - Responsive layout with compact mode support
 * - Loading and empty states
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {boolean} [props.showSeverityBreakdown=true] - Whether to show the per-severity breakdown.
 * @param {number} [props.chartHeight=280] - Height of the chart area in pixels.
 * @returns {React.ReactNode}
 */
const MTTRTrendChart = ({
  className = '',
  compact = false,
  showMetricCards = true,
  showSeverityBreakdown = true,
  chartHeight = 280,
}) => {
  const { dashboardData, isLoading, error } = useDashboard();
  const [timeWindow, setTimeWindow] = useState('30d');

  /**
   * Get all incidents from dashboard data.
   */
  const allIncidents = useMemo(() => {
    if (!dashboardData || !dashboardData.incidents) {
      return [];
    }

    return dashboardData.incidents;
  }, [dashboardData]);

  /**
   * Filter incidents based on the selected time window.
   */
  const filteredIncidents = useMemo(() => {
    if (!allIncidents || allIncidents.length === 0) {
      return [];
    }

    const now = new Date();
    let hoursBack = 720; // 30d default

    if (timeWindow === '24h') {
      hoursBack = 24;
    } else if (timeWindow === '7d') {
      hoursBack = 168;
    } else if (timeWindow === '30d') {
      hoursBack = 720;
    }

    const cutoff = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    return allIncidents.filter((inc) => {
      if (!inc.start_time) {
        return false;
      }

      const incDate = new Date(inc.start_time);
      return !isNaN(incDate.getTime()) && incDate.getTime() >= cutoff.getTime();
    });
  }, [allIncidents, timeWindow]);

  /**
   * Build Recharts-compatible chart data from filtered incidents.
   * Each data point represents one incident with its MTTR and MTTD values.
   */
  const chartData = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    // Sort incidents by start_time ascending
    const sorted = [...filteredIncidents]
      .filter((inc) => inc.start_time && (inc.mttr != null || inc.mttd != null))
      .sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateA - dateB;
      });

    return sorted.map((inc) => {
      const date = new Date(inc.start_time);
      const timeLabel = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      return {
        timestamp: inc.start_time,
        timeLabel,
        mttr: inc.mttr != null && !isNaN(inc.mttr) ? parseFloat(inc.mttr) : null,
        mttd: inc.mttd != null && !isNaN(inc.mttd) ? parseFloat(inc.mttd) : null,
        mtbf: inc.mtbf != null && !isNaN(inc.mtbf) ? parseFloat(inc.mtbf) : null,
        incident_id: inc.incident_id,
        severity: inc.severity,
        title: inc.title || inc.incident_id,
        domain_id: inc.domain_id,
        root_cause: inc.root_cause,
        status: inc.status,
      };
    });
  }, [filteredIncidents]);

  /**
   * Compute MTTR, MTTD, and MTBF averages from filtered incidents.
   */
  const metricsData = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return { avgMTTR: null, avgMTTD: null, avgMTBF: null, medianMTTR: null, medianMTTD: null };
    }

    const mttrValues = filteredIncidents
      .filter((i) => i.mttr != null && !isNaN(i.mttr))
      .map((i) => parseFloat(i.mttr));

    const mttdValues = filteredIncidents
      .filter((i) => i.mttd != null && !isNaN(i.mttd))
      .map((i) => parseFloat(i.mttd));

    const mtbfValues = filteredIncidents
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

    // Compute medians
    const computeMedian = (values) => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? parseFloat(sorted[mid].toFixed(2))
        : parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
    };

    return {
      avgMTTR,
      avgMTTD,
      avgMTBF,
      medianMTTR: computeMedian(mttrValues),
      medianMTTD: computeMedian(mttdValues),
    };
  }, [filteredIncidents]);

  /**
   * Calculate trend directions for MTTR and MTTD from the chart data.
   */
  const trends = useMemo(() => {
    const defaultTrend = { direction: 'stable', changePercent: 0 };

    if (!chartData || chartData.length < 2) {
      return { mttr: defaultTrend, mttd: defaultTrend };
    }

    const mttrValues = chartData
      .map((p) => p.mttr)
      .filter((v) => v != null && !isNaN(v));

    const mttdValues = chartData
      .map((p) => p.mttd)
      .filter((v) => v != null && !isNaN(v));

    return {
      mttr:
        mttrValues.length >= 2
          ? calculateTrendDirection(mttrValues, { threshold: 5 })
          : defaultTrend,
      mttd:
        mttdValues.length >= 2
          ? calculateTrendDirection(mttdValues, { threshold: 5 })
          : defaultTrend,
    };
  }, [chartData]);

  /**
   * Sparkline data for the MTTR metric card.
   */
  const mttrSparkData = useMemo(() => {
    if (!chartData || chartData.length < 2) return null;

    const values = chartData
      .map((p) => p.mttr)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [chartData]);

  /**
   * Sparkline data for the MTTD metric card.
   */
  const mttdSparkData = useMemo(() => {
    if (!chartData || chartData.length < 2) return null;

    const values = chartData
      .map((p) => p.mttd)
      .filter((v) => v != null && !isNaN(v));

    return values.length >= 2 ? values : null;
  }, [chartData]);

  /**
   * Compute per-severity MTTR/MTTD breakdown.
   */
  const severityBreakdown = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    return Object.values(SEVERITY_LEVELS)
      .map((level) => {
        const levelIncidents = filteredIncidents.filter((i) => i.severity === level);

        if (levelIncidents.length === 0) {
          return null;
        }

        const mttrValues = levelIncidents
          .filter((i) => i.mttr != null && !isNaN(i.mttr))
          .map((i) => parseFloat(i.mttr));

        const mttdValues = levelIncidents
          .filter((i) => i.mttd != null && !isNaN(i.mttd))
          .map((i) => parseFloat(i.mttd));

        const avgMTTR =
          mttrValues.length > 0
            ? parseFloat(
                (mttrValues.reduce((sum, v) => sum + v, 0) / mttrValues.length).toFixed(2),
              )
            : null;

        const avgMTTD =
          mttdValues.length > 0
            ? parseFloat(
                (mttdValues.reduce((sum, v) => sum + v, 0) / mttdValues.length).toFixed(2),
              )
            : null;

        return {
          severity: level,
          label: SEVERITY_LABELS[level] || level,
          color: SEVERITY_COLORS[level] || '#6b7280',
          order: SEVERITY_ORDER[level] ?? 99,
          count: levelIncidents.length,
          avgMTTR,
          avgMTTD,
        };
      })
      .filter((item) => item !== null)
      .sort((a, b) => a.order - b.order);
  }, [filteredIncidents]);

  /**
   * Compute the Y-axis domain from all chart data values.
   */
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 120];

    const allValues = [];

    for (const point of chartData) {
      if (point.mttr != null) allValues.push(point.mttr);
      if (point.mttd != null) allValues.push(point.mttd);
    }

    if (allValues.length === 0) return [0, 120];

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;
    const padding = range * 0.1;

    return [
      parseFloat(Math.max(0, min - padding).toFixed(2)),
      parseFloat((max + padding).toFixed(2)),
    ];
  }, [chartData]);

  /**
   * MTTR/MTTD target thresholds for reference lines.
   */
  const thresholds = useMemo(() => {
    return {
      mttrTarget: 30, // 30 minutes target MTTR
      mttrWarning: 60, // 60 minutes warning MTTR
      mttdTarget: 15, // 15 minutes target MTTD
    };
  }, []);

  /**
   * Determine the overall MTTR health status.
   */
  const mttrStatus = useMemo(() => {
    if (metricsData.avgMTTR == null) return 'unknown';
    if (metricsData.avgMTTR > thresholds.mttrWarning) return 'critical';
    if (metricsData.avgMTTR > thresholds.mttrTarget) return 'warning';
    return 'healthy';
  }, [metricsData.avgMTTR, thresholds]);

  /**
   * Determine the overall MTTD health status.
   */
  const mttdStatus = useMemo(() => {
    if (metricsData.avgMTTD == null) return 'unknown';
    if (metricsData.avgMTTD > thresholds.mttrTarget) return 'critical';
    if (metricsData.avgMTTD > thresholds.mttdTarget) return 'warning';
    return 'healthy';
  }, [metricsData.avgMTTD, thresholds]);

  /**
   * Determine the overall trend status combining MTTR and MTTD.
   */
  const overallStatus = useMemo(() => {
    if (mttrStatus === 'critical' || mttdStatus === 'critical') return 'critical';
    if (mttrStatus === 'warning' || mttdStatus === 'warning') return 'warning';
    if (mttrStatus === 'unknown' && mttdStatus === 'unknown') return 'unknown';
    return 'healthy';
  }, [mttrStatus, mttdStatus]);

  /**
   * Handle time window toggle.
   */
  const handleTimeWindowChange = useCallback((window) => {
    setTimeWindow(window);
  }, []);

  /**
   * Get the MTTR color class based on value.
   * @param {number} value - The MTTR value in minutes.
   * @returns {string} Tailwind text color class.
   */
  const getMTTRColorClass = useCallback(
    (value) => {
      if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
      if (value > thresholds.mttrWarning) return 'text-severity-critical';
      if (value > thresholds.mttrTarget) return 'text-status-degraded';
      return 'text-status-healthy';
    },
    [thresholds],
  );

  /**
   * Get the MTTD color class based on value.
   * @param {number} value - The MTTD value in minutes.
   * @returns {string} Tailwind text color class.
   */
  const getMTTDColorClass = useCallback(
    (value) => {
      if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
      if (value > thresholds.mttrTarget) return 'text-severity-critical';
      if (value > thresholds.mttdTarget) return 'text-status-degraded';
      return 'text-status-healthy';
    },
    [thresholds],
  );

  /**
   * Custom tooltip renderer for the MTTR/MTTD chart.
   */
  const renderChartTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const dataPoint = payload[0]?.payload;

      return (
        <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
          <p className="font-medium text-dashboard-text-primary mb-1">{label}</p>
          {dataPoint?.title && (
            <p className="text-dashboard-text-secondary mb-1.5 truncate max-w-[200px]">
              {dataPoint.title}
            </p>
          )}
          {dataPoint?.severity && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <StatusBadge status={dataPoint.severity} size="sm" />
              {dataPoint.domain_id && (
                <span className="text-dashboard-text-muted">{dataPoint.domain_id}</span>
              )}
            </div>
          )}
          {payload.map((entry) => {
            const metricKey = entry.dataKey;
            const value = entry.value;

            let statusLabel = 'Normal';
            let statusColorClass = 'text-status-healthy';

            if (metricKey === 'mttr') {
              if (value > thresholds.mttrWarning) {
                statusLabel = 'Critical';
                statusColorClass = 'text-severity-critical';
              } else if (value > thresholds.mttrTarget) {
                statusLabel = 'Warning';
                statusColorClass = 'text-status-degraded';
              }
            } else if (metricKey === 'mttd') {
              if (value > thresholds.mttrTarget) {
                statusLabel = 'Critical';
                statusColorClass = 'text-severity-critical';
              } else if (value > thresholds.mttdTarget) {
                statusLabel = 'Warning';
                statusColorClass = 'text-status-degraded';
              }
            }

            return (
              <div key={metricKey} className="flex items-center gap-2 mb-0.5">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-dashboard-text-muted">
                  {metricKey === 'mttr' ? 'MTTR' : 'MTTD'}:
                </span>
                <span className={`font-semibold ${statusColorClass}`}>
                  {value != null ? `${formatNumber(value, { decimals: 1 })} min` : '—'}
                </span>
                <span className={`text-[10px] ${statusColorClass}`}>({statusLabel})</span>
              </div>
            );
          })}
          {dataPoint?.root_cause && (
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-dashboard-border">
              <span className="text-dashboard-text-muted">RCA:</span>
              <span className="font-medium text-dashboard-text-secondary">
                {RCA_CATEGORY_LABELS[dataPoint.root_cause] || dataPoint.root_cause}
              </span>
            </div>
          )}
        </div>
      );
    },
    [thresholds],
  );

  /**
   * Render the time window toggle buttons.
   */
  function renderTimeWindowToggle() {
    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {['24h', '7d', '30d'].map((window) => (
          <button
            key={window}
            onClick={() => handleTimeWindowChange(window)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
              timeWindow === window
                ? 'bg-white text-dashboard-text-primary shadow-sm'
                : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
            }`}
            aria-pressed={timeWindow === window}
            aria-label={`Show last ${window}`}
          >
            {window}
          </button>
        ))}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading MTTR/MTTD trend data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load MTTR/MTTD data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state — no incidents at all
  if (!allIncidents || allIncidents.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-incidents"
          title="No incident data"
          description="No incident data is available. Upload incident data to populate the MTTR/MTTD trend chart."
          size="md"
        />
      </div>
    );
  }

  // No incidents in the selected time window
  if (filteredIncidents.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                MTTR / MTTD Trends
              </h3>
              <StatusBadge status="healthy" size="sm" label="No Incidents" />
            </div>
            {renderTimeWindowToggle()}
          </div>

          <EmptyState
            preset="no-incidents"
            title="No incidents in this period"
            description={`No incidents were recorded in the last ${timeWindow === '24h' ? '24 hours' : timeWindow === '7d' ? '7 days' : '30 days'}.`}
            size="sm"
            compact
          />
        </div>
      </div>
    );
  }

  // No chart data (incidents exist but none have MTTR/MTTD values)
  if (!chartData || chartData.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                MTTR / MTTD Trends
              </h3>
              <StatusBadge status="unknown" size="sm" label="No Data" />
            </div>
            {renderTimeWindowToggle()}
          </div>

          <EmptyState
            preset="no-metrics"
            title="No MTTR/MTTD data"
            description="Incidents exist but none have MTTR or MTTD values recorded."
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
              MTTR / MTTD Trends
            </h3>
            <StatusBadge
              status={overallStatus}
              size="sm"
              label={
                overallStatus === 'healthy'
                  ? 'On Target'
                  : overallStatus === 'warning'
                    ? 'Needs Improvement'
                    : overallStatus === 'critical'
                      ? 'Above Threshold'
                      : 'Unknown'
              }
            />
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
              {filteredIncidents.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {renderTimeWindowToggle()}

            {/* Threshold legend */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-4 h-px"
                  style={{ borderTop: '2px dashed #16a34a' }}
                />
                Target: {thresholds.mttrTarget}min
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-4 h-px"
                  style={{ borderTop: '2px dashed #ca8a04' }}
                />
                Warn: {thresholds.mttrWarning}min
              </span>
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
              title="Avg MTTR"
              value={metricsData.avgMTTR}
              unit="min"
              size="sm"
              status={mttrStatus !== 'unknown' ? mttrStatus : undefined}
              sparkData={mttrSparkData}
              trend={{
                direction: trends.mttr.direction,
                value: Math.abs(trends.mttr.changePercent),
                invertColor: false,
              }}
            />
            <MetricCard
              title="Avg MTTD"
              value={metricsData.avgMTTD}
              unit="min"
              size="sm"
              status={mttdStatus !== 'unknown' ? mttdStatus : undefined}
              sparkData={mttdSparkData}
              trend={{
                direction: trends.mttd.direction,
                value: Math.abs(trends.mttd.changePercent),
                invertColor: false,
              }}
            />
            {!compact && (
              <>
                <MetricCard
                  title="Avg MTBF"
                  value={metricsData.avgMTBF}
                  unit="hr"
                  size="sm"
                  status={
                    metricsData.avgMTBF != null && metricsData.avgMTBF < 200
                      ? 'warning'
                      : metricsData.avgMTBF != null && metricsData.avgMTBF >= 500
                        ? 'healthy'
                        : undefined
                  }
                  trend={{
                    direction:
                      metricsData.avgMTBF != null && metricsData.avgMTBF >= 500
                        ? 'stable'
                        : 'down',
                    invertColor: true,
                  }}
                />
                <MetricCard
                  title="Total Incidents"
                  value={filteredIncidents.length}
                  unit="count"
                  size="sm"
                  subtitle={`${timeWindow === '24h' ? 'Last 24 Hours' : timeWindow === '7d' ? 'Last 7 Days' : 'Last 30 Days'}`}
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
                  tickFormatter={(v) => `${Math.round(v)}min`}
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
                    if (value === 'mttr') return 'MTTR (Time to Resolve)';
                    if (value === 'mttd') return 'MTTD (Time to Detect)';
                    return value;
                  }}
                />

                {/* MTTR Target reference line */}
                <ReferenceLine
                  y={thresholds.mttrTarget}
                  stroke="#16a34a"
                  strokeDasharray="6 4"
                  strokeWidth={1}
                  label={{
                    value: `Target ${thresholds.mttrTarget}min`,
                    position: 'right',
                    fill: '#16a34a',
                    fontSize: 9,
                  }}
                />

                {/* MTTR Warning reference line */}
                <ReferenceLine
                  y={thresholds.mttrWarning}
                  stroke="#ca8a04"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  label={{
                    value: `Warn ${thresholds.mttrWarning}min`,
                    position: 'right',
                    fill: '#ca8a04',
                    fontSize: 9,
                  }}
                />

                {/* MTTD Target reference line */}
                <ReferenceLine
                  y={thresholds.mttdTarget}
                  stroke="#ec4899"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                  label={{
                    value: `MTTD ${thresholds.mttdTarget}min`,
                    position: 'left',
                    fill: '#ec4899',
                    fontSize: 9,
                  }}
                />

                {/* MTTR Line */}
                <Line
                  type="monotone"
                  dataKey="mttr"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    fill: '#6366f1',
                    stroke: '#fff',
                    strokeWidth: 1.5,
                  }}
                  activeDot={{
                    r: 5,
                    fill: '#6366f1',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="mttr"
                  connectNulls
                />

                {/* MTTD Line */}
                <Line
                  type="monotone"
                  dataKey="mttd"
                  stroke="#ec4899"
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    fill: '#ec4899',
                    stroke: '#fff',
                    strokeWidth: 1.5,
                  }}
                  activeDot={{
                    r: 5,
                    fill: '#ec4899',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name="mttd"
                  connectNulls
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-Severity Breakdown */}
        {showSeverityBreakdown && severityBreakdown.length > 0 && (
          <div className="border-t border-dashboard-border">
            <div className="px-4 py-3">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-2">
                MTTR / MTTD by Severity
              </h5>
              <div
                className={`grid gap-2 ${
                  compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {severityBreakdown.map((item) => (
                  <div
                    key={item.severity}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-dashboard-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-dashboard-text-primary block">
                          {item.severity}
                        </span>
                        <span className="text-[10px] text-dashboard-text-muted">
                          {item.count} incident{item.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-dashboard-text-muted">MTTR:</span>
                        <span
                          className={`text-xs font-semibold ${getMTTRColorClass(item.avgMTTR)}`}
                        >
                          {item.avgMTTR != null
                            ? `${formatNumber(item.avgMTTR, { decimals: 0 })}m`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-dashboard-text-muted">MTTD:</span>
                        <span
                          className={`text-xs font-semibold ${getMTTDColorClass(item.avgMTTD)}`}
                        >
                          {item.avgMTTD != null
                            ? `${formatNumber(item.avgMTTD, { decimals: 0 })}m`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>{chartData.length} data points</span>
            <span>·</span>
            <span>
              {timeWindow === '24h'
                ? 'Last 24 Hours'
                : timeWindow === '7d'
                  ? 'Last 7 Days'
                  : 'Last 30 Days'}
            </span>
            {metricsData.medianMTTR != null && (
              <>
                <span>·</span>
                <span>
                  Median MTTR:{' '}
                  <span className="font-medium text-dashboard-text-secondary">
                    {formatNumber(metricsData.medianMTTR, { decimals: 1 })} min
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1">
              MTTR Trend:
              <TrendArrow
                direction={trends.mttr.direction}
                value={Math.abs(trends.mttr.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.mttr.changePercent > 1}
              />
            </span>
            <span className="flex items-center gap-1">
              MTTD Trend:
              <TrendArrow
                direction={trends.mttd.direction}
                value={Math.abs(trends.mttd.changePercent)}
                invertColor={false}
                size="sm"
                showValue={trends.mttd.changePercent > 1}
              />
            </span>
            {metricsData.avgMTTR != null && (
              <span>
                Avg MTTR:{' '}
                <span className={`font-medium ${getMTTRColorClass(metricsData.avgMTTR)}`}>
                  {formatNumber(metricsData.avgMTTR, { decimals: 1 })} min
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { MTTRTrendChart };
export default MTTRTrendChart;