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
  RCA_CATEGORY_COLORS,
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatNumber, formatPercentage } from '../../utils/formatters';
import { getRelativeTime } from '../../utils/dateUtils';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * IncidentSummary - Incident summary widget showing total incident count,
 * breakdown by severity (P1–P4) with color-coded bars, active vs resolved
 * counts, RCA distribution pie chart, and MTTR/MTTD/MTBF metric cards.
 *
 * Features:
 * - Total incident count with active/resolved breakdown
 * - Severity breakdown bar chart (P1–P4) with color-coded bars
 * - RCA distribution pie chart (Code, Infra, Data, Config)
 * - MTTR, MTTD, MTBF metric cards with trend arrows
 * - Per-domain incident count summary
 * - Recent incidents list with severity badges
 * - Toggleable time window (24h / 7d / 30d)
 * - Color-coded severity indicators
 * - Responsive grid layout
 * - Loading and empty states
 * - Compact mode support
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showSeverityChart=true] - Whether to show the severity bar chart.
 * @param {boolean} [props.showRCAChart=true] - Whether to show the RCA pie chart.
 * @param {boolean} [props.showRecentIncidents=true] - Whether to show the recent incidents list.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the MTTR/MTTD/MTBF metric cards.
 * @param {number} [props.recentLimit=5] - Maximum number of recent incidents to display.
 * @param {number} [props.chartHeight=220] - Height of the chart areas in pixels.
 * @returns {React.ReactNode}
 */
const IncidentSummary = ({
  className = '',
  compact = false,
  showSeverityChart = true,
  showRCAChart = true,
  showRecentIncidents = true,
  showMetricCards = true,
  recentLimit = 5,
  chartHeight = 220,
}) => {
  const { dashboardData, incidentSummary, isLoading, error } = useDashboard();
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
   * Compute severity breakdown data for the bar chart.
   */
  const severityData = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    return Object.values(SEVERITY_LEVELS)
      .map((level) => {
        const count = filteredIncidents.filter((i) => i.severity === level).length;
        return {
          severity: level,
          label: SEVERITY_LABELS[level] || level,
          count,
          color: SEVERITY_COLORS[level] || '#6b7280',
          order: SEVERITY_ORDER[level] ?? 99,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [filteredIncidents]);

  /**
   * Compute RCA distribution data for the pie chart.
   */
  const rcaData = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    return Object.values(RCA_CATEGORIES)
      .map((category) => {
        const count = filteredIncidents.filter((i) => i.root_cause === category).length;
        return {
          name: RCA_CATEGORY_LABELS[category] || category,
          value: count,
          color: RCA_CATEGORY_COLORS[category] || '#6b7280',
          category,
        };
      })
      .filter((d) => d.value > 0);
  }, [filteredIncidents]);

  /**
   * Compute active vs resolved counts.
   */
  const statusCounts = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return { active: 0, resolved: 0, investigating: 0, total: 0 };
    }

    let active = 0;
    let resolved = 0;
    let investigating = 0;

    for (const inc of filteredIncidents) {
      const status = (inc.status || '').toLowerCase().trim();
      if (status === 'resolved') {
        resolved++;
      } else if (status === 'investigating') {
        investigating++;
      } else {
        active++;
      }
    }

    return {
      active,
      resolved,
      investigating,
      total: filteredIncidents.length,
    };
  }, [filteredIncidents]);

  /**
   * Compute MTTR, MTTD, MTBF averages from filtered incidents.
   */
  const metricsData = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return { avgMTTR: null, avgMTTD: null, avgMTBF: null };
    }

    const mttrValues = filteredIncidents
      .filter((i) => i.mttr != null && !isNaN(i.mttr))
      .map((i) => i.mttr);

    const mttdValues = filteredIncidents
      .filter((i) => i.mttd != null && !isNaN(i.mttd))
      .map((i) => i.mttd);

    const mtbfValues = filteredIncidents
      .filter((i) => i.mtbf != null && !isNaN(i.mtbf))
      .map((i) => i.mtbf);

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

    return { avgMTTR, avgMTTD, avgMTBF };
  }, [filteredIncidents]);

  /**
   * Compute per-domain incident counts.
   */
  const domainBreakdown = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    const domainMap = new Map();

    for (const inc of filteredIncidents) {
      const domainId = inc.domain_id || 'unknown';

      if (!domainMap.has(domainId)) {
        domainMap.set(domainId, {
          domain_id: domainId,
          count: 0,
          p1Count: 0,
          p2Count: 0,
        });
      }

      const entry = domainMap.get(domainId);
      entry.count++;
      if (inc.severity === SEVERITY_LEVELS.P1) entry.p1Count++;
      if (inc.severity === SEVERITY_LEVELS.P2) entry.p2Count++;
    }

    return Array.from(domainMap.values()).sort((a, b) => b.count - a.count);
  }, [filteredIncidents]);

  /**
   * Get recent incidents sorted by start_time descending.
   */
  const recentIncidents = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    return [...filteredIncidents]
      .sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, recentLimit);
  }, [filteredIncidents, recentLimit]);

  /**
   * Determine the overall incident health status.
   */
  const overallStatus = useMemo(() => {
    if (filteredIncidents.length === 0) return 'healthy';

    const p1Count = filteredIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P1).length;
    const p2Count = filteredIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P2).length;
    const activeCount = statusCounts.active + statusCounts.investigating;

    if (p1Count > 0 || activeCount > 2) return 'critical';
    if (p2Count > 0 || activeCount > 0) return 'warning';
    return 'healthy';
  }, [filteredIncidents, statusCounts]);

  /**
   * MTTR sparkline data from individual incident MTTR values.
   */
  const mttrSparkData = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length < 2) return null;

    const values = filteredIncidents
      .filter((i) => i.mttr != null && !isNaN(i.mttr))
      .sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateA - dateB;
      })
      .map((i) => i.mttr);

    return values.length >= 2 ? values : null;
  }, [filteredIncidents]);

  /**
   * Handle time window toggle.
   */
  const handleTimeWindowChange = useCallback((window) => {
    setTimeWindow(window);
  }, []);

  /**
   * Custom tooltip for the severity bar chart.
   */
  const renderSeverityTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0];
    const severity = data.payload;

    return (
      <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
        <p className="font-medium text-dashboard-text-primary mb-1">
          {severity.label} ({severity.severity})
        </p>
        <div className="flex items-center gap-2">
          <span className="text-dashboard-text-muted">Count:</span>
          <span className="font-semibold text-dashboard-text-primary">
            {formatNumber(severity.count, { decimals: 0 })}
          </span>
        </div>
        {statusCounts.total > 0 && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Share:</span>
            <span className="font-medium text-dashboard-text-secondary">
              {formatPercentage((severity.count / statusCounts.total) * 100, 1)}
            </span>
          </div>
        )}
      </div>
    );
  }, [statusCounts.total]);

  /**
   * Custom tooltip for the RCA pie chart.
   */
  const renderRCATooltip = useCallback(({ active, payload }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0];

    return (
      <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: data.payload.color }}
          />
          <span className="font-medium text-dashboard-text-primary">{data.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-dashboard-text-muted">Count:</span>
          <span className="font-semibold text-dashboard-text-primary">
            {formatNumber(data.value, { decimals: 0 })}
          </span>
        </div>
        {statusCounts.total > 0 && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Share:</span>
            <span className="font-medium text-dashboard-text-secondary">
              {formatPercentage((data.value / statusCounts.total) * 100, 1)}
            </span>
          </div>
        )}
      </div>
    );
  }, [statusCounts.total]);

  /**
   * Custom bar shape that colors each bar based on its severity.
   */
  const renderSeverityBar = useCallback((props) => {
    const { x, y, width, height, payload } = props;
    const fill = payload.color || '#6b7280';

    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={3}
        ry={3}
      />
    );
  }, []);

  /**
   * Custom pie chart label renderer.
   */
  const renderPieLabel = useCallback(({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null;

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  }, []);

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
        <LoadingSpinner message="Loading incident data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load incident data"
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
          description="No incident data is available. Upload incident data to populate the incident summary."
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
              <h3 className="text-lg font-semibold text-dashboard-text-primary">
                Incident Summary
              </h3>
              <StatusBadge status="healthy" size="sm" label="No Incidents" />
            </div>
            {renderTimeWindowToggle()}
          </div>

          <EmptyState
            preset="no-incidents"
            title="No incidents in this period"
            description={`No incidents were recorded in the last ${timeWindow === '24h' ? '24 hours' : timeWindow === '7d' ? '7 days' : '30 days'}. All systems are operating normally.`}
            size="sm"
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            Incident Summary
          </h3>
          <StatusBadge
            status={overallStatus}
            size="sm"
            label={
              overallStatus === 'healthy'
                ? 'All Clear'
                : overallStatus === 'warning'
                  ? 'Active Incidents'
                  : overallStatus === 'critical'
                    ? 'Critical Incidents'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-4">
          {renderTimeWindowToggle()}
          <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
              {statusCounts.active + statusCounts.investigating} Active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
              {statusCounts.resolved} Resolved
            </span>
          </div>
        </div>
      </div>

      {/* Top-Level Metric Cards */}
      {showMetricCards && (
        <div
          className={`grid gap-4 mb-6 ${
            compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          <MetricCard
            title="Total Incidents"
            value={statusCounts.total}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={overallStatus}
            subtitle={`${statusCounts.active + statusCounts.investigating} active · ${statusCounts.resolved} resolved`}
          />
          <MetricCard
            title="Avg MTTR"
            value={metricsData.avgMTTR}
            unit="min"
            size={compact ? 'sm' : 'md'}
            status={
              metricsData.avgMTTR != null && metricsData.avgMTTR > 60
                ? 'critical'
                : metricsData.avgMTTR != null && metricsData.avgMTTR > 30
                  ? 'warning'
                  : undefined
            }
            sparkData={mttrSparkData}
            trend={{
              direction:
                metricsData.avgMTTR != null && metricsData.avgMTTR <= 30
                  ? 'stable'
                  : 'up',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Avg MTTD"
            value={metricsData.avgMTTD}
            unit="min"
            size={compact ? 'sm' : 'md'}
            status={
              metricsData.avgMTTD != null && metricsData.avgMTTD > 30
                ? 'warning'
                : undefined
            }
            trend={{
              direction:
                metricsData.avgMTTD != null && metricsData.avgMTTD <= 15
                  ? 'stable'
                  : 'up',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Avg MTBF"
            value={metricsData.avgMTBF}
            unit="hr"
            size={compact ? 'sm' : 'md'}
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
        </div>
      )}

      {/* Charts Row */}
      <div
        className={`grid gap-4 mb-6 ${
          showSeverityChart && showRCAChart
            ? compact
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        {/* Severity Breakdown Bar Chart */}
        {showSeverityChart && (
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Severity Breakdown
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {statusCounts.total}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                {severityData.map((item) => (
                  <span key={item.severity} className="flex items-center gap-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.severity}: {item.count}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4">
              <div style={{ width: '100%', height: compact ? 160 : chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={severityData}
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
                      dataKey="severity"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={compact ? 30 : 40}
                    />
                    <Tooltip content={renderSeverityTooltip} />
                    <Bar
                      dataKey="count"
                      name="Incidents"
                      maxBarSize={compact ? 36 : 48}
                      shape={renderSeverityBar}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* RCA Distribution Pie Chart */}
        {showRCAChart && (
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Root Cause Distribution
                </h4>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                {rcaData.map((item) => (
                  <span key={item.category} className="flex items-center gap-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.name.split(' ')[0]}: {item.value}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4">
              {rcaData.length > 0 ? (
                <div style={{ width: '100%', height: compact ? 160 : chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={rcaData}
                        cx="50%"
                        cy="50%"
                        innerRadius={compact ? 35 : 50}
                        outerRadius={compact ? 65 : 85}
                        paddingAngle={2}
                        dataKey="value"
                        labelLine={false}
                        label={renderPieLabel}
                      >
                        {rcaData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={renderRCATooltip} />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', color: '#475569' }}
                        formatter={(value) => {
                          const parts = value.split(' ');
                          return parts.length > 1 ? parts[0] : value;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-dashboard-text-muted">No RCA data available</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Domain Breakdown + Recent Incidents Row */}
      <div
        className={`grid gap-4 ${
          showRecentIncidents
            ? compact
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        {/* Per-Domain Incident Counts */}
        <div className="dashboard-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h4 className="text-sm font-semibold text-dashboard-text-primary">
                Incidents by Domain
              </h4>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {domainBreakdown.length}
              </span>
            </div>
          </div>

          <div className="divide-y divide-dashboard-border">
            {domainBreakdown.length > 0 ? (
              domainBreakdown.map((domain) => (
                <div
                  key={domain.domain_id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50/50 transition-colors duration-150"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        domain.p1Count > 0
                          ? 'bg-severity-critical animate-pulse'
                          : domain.p2Count > 0
                            ? 'bg-severity-high'
                            : 'bg-status-degraded'
                      }`}
                    />
                    <span className="text-sm font-medium text-dashboard-text-primary truncate">
                      {domain.domain_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {domain.p1Count > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                        P1: {domain.p1Count}
                      </span>
                    )}
                    {domain.p2Count > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-orange-50 text-orange-800">
                        P2: {domain.p2Count}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-dashboard-text-primary min-w-[24px] text-right">
                      {domain.count}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-dashboard-text-muted">No domain data available</p>
              </div>
            )}
          </div>

          {/* Domain footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
            <span className="text-xs text-dashboard-text-muted">
              {domainBreakdown.length} domain{domainBreakdown.length !== 1 ? 's' : ''} affected
            </span>
            <span className="text-xs text-dashboard-text-muted">
              Window: {timeWindow === '24h' ? 'Last 24 Hours' : timeWindow === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
            </span>
          </div>
        </div>

        {/* Recent Incidents List */}
        {showRecentIncidents && (
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Recent Incidents
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {recentIncidents.length}
                </span>
              </div>
            </div>

            <div className="divide-y divide-dashboard-border">
              {recentIncidents.length > 0 ? (
                recentIncidents.map((incident) => (
                  <div
                    key={incident.incident_id}
                    className="px-4 py-3 hover:bg-gray-50/50 transition-colors duration-150"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <StatusBadge
                            status={incident.severity || 'P4'}
                            size="sm"
                          />
                          <StatusBadge
                            status={incident.status || 'unknown'}
                            size="sm"
                          />
                        </div>
                        <p className="text-sm font-medium text-dashboard-text-primary truncate">
                          {incident.title || incident.incident_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-dashboard-text-muted">
                      {incident.start_time && (
                        <span>{getRelativeTime(incident.start_time)}</span>
                      )}
                      {incident.domain_id && (
                        <span>
                          Domain:{' '}
                          <span className="font-medium text-dashboard-text-secondary">
                            {incident.domain_id}
                          </span>
                        </span>
                      )}
                      {incident.root_cause && (
                        <span>
                          RCA:{' '}
                          <span className="font-medium text-dashboard-text-secondary">
                            {RCA_CATEGORY_LABELS[incident.root_cause] || incident.root_cause}
                          </span>
                        </span>
                      )}
                      {incident.mttr != null && (
                        <span>
                          MTTR:{' '}
                          <span className="font-medium text-dashboard-text-secondary">
                            {formatNumber(incident.mttr, { decimals: 0 })} min
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-8">
                  <svg
                    className="w-6 h-6 text-status-healthy"
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
                  <p className="text-xs text-dashboard-text-muted">No recent incidents</p>
                </div>
              )}
            </div>

            {/* Recent incidents footer */}
            {recentIncidents.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
                <span className="text-xs text-dashboard-text-muted">
                  Showing {recentIncidents.length} of {filteredIncidents.length} incidents
                </span>
                <span className="text-xs text-dashboard-text-muted">
                  Most recent first
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { IncidentSummary };
export default IncidentSummary;