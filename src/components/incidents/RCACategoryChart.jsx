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
 * RCACategoryChart - Root cause analysis chart component showing distribution
 * of incidents by RCA category (Code, Infra, Data, Config) using Recharts
 * PieChart/DonutChart. Includes count and percentage labels, severity breakdown
 * per category, MTTR comparison by category, and recent incidents per category.
 *
 * Features:
 * - Donut chart showing RCA category distribution with count and percentage labels
 * - Per-category severity breakdown (P1–P4) in a stacked bar chart
 * - MTTR comparison by RCA category
 * - Per-category incident count metric cards
 * - Toggleable time window (24h / 7d / 30d)
 * - Color-coded categories (Code=indigo, Infra=orange, Data=amber, Config=green)
 * - Custom tooltips with formatted values
 * - Recent incidents list grouped by RCA category
 * - Responsive layout with compact mode support
 * - Loading and empty states
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showSeverityBreakdown=true] - Whether to show the per-category severity breakdown.
 * @param {boolean} [props.showMTTRComparison=true] - Whether to show the MTTR comparison by category.
 * @param {boolean} [props.showRecentIncidents=true] - Whether to show the recent incidents list.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {number} [props.recentLimit=5] - Maximum number of recent incidents to display per category.
 * @param {number} [props.chartHeight=260] - Height of the chart areas in pixels.
 * @returns {React.ReactNode}
 */
const RCACategoryChart = ({
  className = '',
  compact = false,
  showSeverityBreakdown = true,
  showMTTRComparison = true,
  showRecentIncidents = true,
  showMetricCards = true,
  recentLimit = 5,
  chartHeight = 260,
}) => {
  const { dashboardData, isLoading, error } = useDashboard();
  const [timeWindow, setTimeWindow] = useState('30d');
  const [selectedCategory, setSelectedCategory] = useState(null);

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
   * Compute RCA distribution data for the donut chart.
   */
  const rcaDistribution = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    const total = filteredIncidents.length;

    return Object.values(RCA_CATEGORIES)
      .map((category) => {
        const count = filteredIncidents.filter((i) => i.root_cause === category).length;
        const percentage = total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;

        return {
          name: RCA_CATEGORY_LABELS[category] || category,
          category,
          value: count,
          percentage,
          color: RCA_CATEGORY_COLORS[category] || '#6b7280',
        };
      })
      .filter((d) => d.value > 0);
  }, [filteredIncidents]);

  /**
   * Compute per-category severity breakdown for the stacked bar chart.
   */
  const severityByCategory = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    return Object.values(RCA_CATEGORIES)
      .map((category) => {
        const categoryIncidents = filteredIncidents.filter((i) => i.root_cause === category);

        if (categoryIncidents.length === 0) {
          return null;
        }

        const entry = {
          category,
          name: RCA_CATEGORY_LABELS[category] || category,
          shortName: (RCA_CATEGORY_LABELS[category] || category).split(' ')[0],
          total: categoryIncidents.length,
          color: RCA_CATEGORY_COLORS[category] || '#6b7280',
        };

        for (const level of Object.values(SEVERITY_LEVELS)) {
          entry[level] = categoryIncidents.filter((i) => i.severity === level).length;
        }

        return entry;
      })
      .filter((item) => item !== null);
  }, [filteredIncidents]);

  /**
   * Compute MTTR comparison by RCA category.
   */
  const mttrByCategory = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    return Object.values(RCA_CATEGORIES)
      .map((category) => {
        const categoryIncidents = filteredIncidents.filter(
          (i) => i.root_cause === category && i.mttr != null && !isNaN(i.mttr),
        );

        if (categoryIncidents.length === 0) {
          return null;
        }

        const mttrValues = categoryIncidents.map((i) => parseFloat(i.mttr));
        const avgMTTR = parseFloat(
          (mttrValues.reduce((sum, v) => sum + v, 0) / mttrValues.length).toFixed(2),
        );
        const maxMTTR = parseFloat(Math.max(...mttrValues).toFixed(2));
        const minMTTR = parseFloat(Math.min(...mttrValues).toFixed(2));

        return {
          category,
          name: RCA_CATEGORY_LABELS[category] || category,
          shortName: (RCA_CATEGORY_LABELS[category] || category).split(' ')[0],
          avgMTTR,
          maxMTTR,
          minMTTR,
          count: categoryIncidents.length,
          color: RCA_CATEGORY_COLORS[category] || '#6b7280',
        };
      })
      .filter((item) => item !== null);
  }, [filteredIncidents]);

  /**
   * Compute overall summary metrics.
   */
  const summary = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return {
        total: 0,
        byCategory: {},
        dominantCategory: null,
        avgMTTR: null,
      };
    }

    const byCategory = {};
    for (const category of Object.values(RCA_CATEGORIES)) {
      byCategory[category] = filteredIncidents.filter((i) => i.root_cause === category).length;
    }

    // Find dominant category
    let dominantCategory = null;
    let maxCount = 0;
    for (const [cat, count] of Object.entries(byCategory)) {
      if (count > maxCount) {
        maxCount = count;
        dominantCategory = cat;
      }
    }

    // Compute overall avg MTTR
    const mttrValues = filteredIncidents
      .filter((i) => i.mttr != null && !isNaN(i.mttr))
      .map((i) => parseFloat(i.mttr));

    const avgMTTR =
      mttrValues.length > 0
        ? parseFloat((mttrValues.reduce((sum, v) => sum + v, 0) / mttrValues.length).toFixed(2))
        : null;

    return {
      total: filteredIncidents.length,
      byCategory,
      dominantCategory,
      avgMTTR,
    };
  }, [filteredIncidents]);

  /**
   * Get recent incidents, optionally filtered by selected category.
   */
  const recentIncidentsList = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    let incidents = [...filteredIncidents];

    if (selectedCategory) {
      incidents = incidents.filter((i) => i.root_cause === selectedCategory);
    }

    return incidents
      .sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, recentLimit);
  }, [filteredIncidents, selectedCategory, recentLimit]);

  /**
   * Determine the overall RCA health status.
   */
  const overallStatus = useMemo(() => {
    if (filteredIncidents.length === 0) return 'healthy';

    const p1Count = filteredIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P1).length;
    const p2Count = filteredIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P2).length;

    if (p1Count > 0) return 'critical';
    if (p2Count > 0) return 'warning';
    return 'healthy';
  }, [filteredIncidents]);

  /**
   * Handle time window toggle.
   */
  const handleTimeWindowChange = useCallback((window) => {
    setTimeWindow(window);
  }, []);

  /**
   * Handle category selection from the donut chart.
   */
  const handleCategorySelect = useCallback((category) => {
    setSelectedCategory((prev) => (prev === category ? null : category));
  }, []);

  /**
   * Custom pie chart label renderer showing percentage inside the donut.
   */
  const renderPieLabel = useCallback(
    ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
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
    },
    [],
  );

  /**
   * Custom tooltip for the RCA donut chart.
   */
  const renderRCATooltip = useCallback(
    ({ active, payload }) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const data = payload[0];
      const entry = data.payload;

      return (
        <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-medium text-dashboard-text-primary">{entry.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-dashboard-text-muted">Count:</span>
            <span className="font-semibold text-dashboard-text-primary">
              {formatNumber(data.value, { decimals: 0 })}
            </span>
          </div>
          {summary.total > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-dashboard-text-muted">Share:</span>
              <span className="font-medium text-dashboard-text-secondary">
                {formatPercentage((data.value / summary.total) * 100, 1)}
              </span>
            </div>
          )}
        </div>
      );
    },
    [summary.total],
  );

  /**
   * Custom tooltip for the severity breakdown bar chart.
   */
  const renderSeverityTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      return (
        <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
          <p className="font-medium text-dashboard-text-primary mb-1.5">{label}</p>
          {payload.map((entry) => (
            <div key={entry.dataKey} className="flex items-center gap-2 mb-0.5">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-dashboard-text-muted">
                {SEVERITY_LABELS[entry.dataKey] || entry.dataKey} ({entry.dataKey}):
              </span>
              <span className="font-semibold text-dashboard-text-primary">
                {formatNumber(entry.value, { decimals: 0 })}
              </span>
            </div>
          ))}
          {payload.length > 0 && payload[0].payload && (
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-dashboard-border">
              <span className="text-dashboard-text-muted">Total:</span>
              <span className="font-semibold text-dashboard-text-primary">
                {formatNumber(payload[0].payload.total, { decimals: 0 })}
              </span>
            </div>
          )}
        </div>
      );
    },
    [],
  );

  /**
   * Custom tooltip for the MTTR comparison bar chart.
   */
  const renderMTTRTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0]?.payload;

    return (
      <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
        <p className="font-medium text-dashboard-text-primary mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-dashboard-text-muted">Avg MTTR:</span>
          <span className="font-semibold text-dashboard-text-primary">
            {data?.avgMTTR != null ? `${formatNumber(data.avgMTTR, { decimals: 1 })} min` : '—'}
          </span>
        </div>
        {data?.maxMTTR != null && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Max MTTR:</span>
            <span className="font-medium text-dashboard-text-secondary">
              {formatNumber(data.maxMTTR, { decimals: 1 })} min
            </span>
          </div>
        )}
        {data?.minMTTR != null && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Min MTTR:</span>
            <span className="font-medium text-dashboard-text-secondary">
              {formatNumber(data.minMTTR, { decimals: 1 })} min
            </span>
          </div>
        )}
        {data?.count != null && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Incidents:</span>
            <span className="font-medium text-dashboard-text-secondary">
              {formatNumber(data.count, { decimals: 0 })}
            </span>
          </div>
        )}
      </div>
    );
  }, []);

  /**
   * Custom bar shape for MTTR chart that colors each bar by category.
   */
  const renderMTTRBar = useCallback((props) => {
    const { x, y, width, height, payload } = props;
    const fill = payload?.color || '#6b7280';

    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} ry={3} />;
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

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading RCA data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load RCA data"
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
          description="No incident data is available. Upload incident data to populate the RCA category chart."
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
                Root Cause Analysis
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

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            Root Cause Analysis
          </h3>
          <StatusBadge
            status={overallStatus}
            size="sm"
            label={
              overallStatus === 'healthy'
                ? 'All Clear'
                : overallStatus === 'warning'
                  ? 'Active Issues'
                  : overallStatus === 'critical'
                    ? 'Critical Issues'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-4">
          {renderTimeWindowToggle()}
          <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
            {Object.values(RCA_CATEGORIES).map((category) => {
              const count = summary.byCategory[category] || 0;
              if (count === 0) return null;
              return (
                <span key={category} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: RCA_CATEGORY_COLORS[category] }}
                  />
                  {(RCA_CATEGORY_LABELS[category] || category).split(' ')[0]}: {count}
                </span>
              );
            })}
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
            value={summary.total}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={overallStatus}
            subtitle={`${timeWindow === '24h' ? 'Last 24 Hours' : timeWindow === '7d' ? 'Last 7 Days' : 'Last 30 Days'}`}
          />
          <MetricCard
            title="Dominant Category"
            value={
              summary.dominantCategory
                ? (RCA_CATEGORY_LABELS[summary.dominantCategory] || summary.dominantCategory).split(
                    ' ',
                  )[0]
                : '—'
            }
            unit=""
            size={compact ? 'sm' : 'md'}
            subtitle={
              summary.dominantCategory && summary.total > 0
                ? `${summary.byCategory[summary.dominantCategory]} of ${summary.total} (${formatPercentage((summary.byCategory[summary.dominantCategory] / summary.total) * 100, 1)})`
                : undefined
            }
          />
          <MetricCard
            title="Avg MTTR"
            value={summary.avgMTTR}
            unit="min"
            size={compact ? 'sm' : 'md'}
            status={
              summary.avgMTTR != null && summary.avgMTTR > 60
                ? 'critical'
                : summary.avgMTTR != null && summary.avgMTTR > 30
                  ? 'warning'
                  : undefined
            }
            trend={{
              direction:
                summary.avgMTTR != null && summary.avgMTTR <= 30 ? 'stable' : 'up',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Categories Active"
            value={rcaDistribution.length}
            unit="count"
            size={compact ? 'sm' : 'md'}
            subtitle={`of ${Object.values(RCA_CATEGORIES).length} total`}
          />
        </div>
      )}

      {/* Charts Row: Donut + Severity Breakdown */}
      <div
        className={`grid gap-4 mb-6 ${
          showSeverityBreakdown
            ? compact
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        {/* RCA Distribution Donut Chart */}
        <div className="dashboard-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h4 className="text-sm font-semibold text-dashboard-text-primary">
                RCA Category Distribution
              </h4>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {summary.total}
              </span>
            </div>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="p-4">
            {rcaDistribution.length > 0 ? (
              <div style={{ width: '100%', height: compact ? 180 : chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={rcaDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={compact ? 35 : 55}
                      outerRadius={compact ? 70 : 95}
                      paddingAngle={2}
                      dataKey="value"
                      labelLine={false}
                      label={renderPieLabel}
                      onClick={(data) => {
                        if (data && data.category) {
                          handleCategorySelect(data.category);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {rcaDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="#ffffff"
                          strokeWidth={2}
                          opacity={
                            selectedCategory
                              ? entry.category === selectedCategory
                                ? 1
                                : 0.35
                              : 1
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip content={renderRCATooltip} />
                    <Legend
                      verticalAlign="bottom"
                      height={32}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '11px', color: '#475569' }}
                      formatter={(value, entry) => {
                        const item = rcaDistribution.find((d) => d.name === value);
                        if (item) {
                          return `${item.name.split(' ')[0]} (${item.value})`;
                        }
                        return value;
                      }}
                      onClick={(data) => {
                        const item = rcaDistribution.find((d) => d.name === data.value);
                        if (item) {
                          handleCategorySelect(item.category);
                        }
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

          {/* Category detail cards below the donut */}
          <div className="border-t border-dashboard-border divide-y divide-dashboard-border">
            {rcaDistribution.map((item) => (
              <button
                key={item.category}
                onClick={() => handleCategorySelect(item.category)}
                className={`flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left transition-colors duration-150 ${
                  selectedCategory === item.category
                    ? 'bg-brand-50/50'
                    : 'hover:bg-gray-50/50'
                }`}
                aria-pressed={selectedCategory === item.category}
                aria-label={`Filter by ${item.name}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-dashboard-text-primary truncate">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-dashboard-text-primary">
                    {item.value}
                  </span>
                  <span className="text-xs text-dashboard-text-muted min-w-[40px] text-right">
                    {formatPercentage(item.percentage, 1)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Severity Breakdown by Category */}
        {showSeverityBreakdown && (
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Severity by Category
                </h4>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                {Object.values(SEVERITY_LEVELS).map((level) => (
                  <span key={level} className="flex items-center gap-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: SEVERITY_COLORS[level] }}
                    />
                    {level}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4">
              {severityByCategory.length > 0 ? (
                <div style={{ width: '100%', height: compact ? 180 : chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={severityByCategory}
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
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
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
                      <Legend
                        verticalAlign="top"
                        height={28}
                        iconType="rect"
                        iconSize={10}
                        wrapperStyle={{ fontSize: '10px', color: '#475569' }}
                        formatter={(value) => SEVERITY_LABELS[value] || value}
                      />
                      {Object.values(SEVERITY_LEVELS).map((level) => (
                        <Bar
                          key={level}
                          dataKey={level}
                          stackId="severity"
                          fill={SEVERITY_COLORS[level]}
                          radius={
                            level === SEVERITY_LEVELS.P4 ? [3, 3, 0, 0] : [0, 0, 0, 0]
                          }
                          maxBarSize={compact ? 32 : 44}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-dashboard-text-muted">
                    No severity breakdown data available
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MTTR Comparison + Recent Incidents Row */}
      <div
        className={`grid gap-4 ${
          showMTTRComparison && showRecentIncidents
            ? compact
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        {/* MTTR Comparison by Category */}
        {showMTTRComparison && (
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Avg MTTR by Category
                </h4>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-px"
                    style={{ borderTop: '2px dashed #16a34a' }}
                  />
                  Target: 30min
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-px"
                    style={{ borderTop: '2px dashed #ca8a04' }}
                  />
                  Warn: 60min
                </span>
              </div>
            </div>

            <div className="p-4">
              {mttrByCategory.length > 0 ? (
                <div style={{ width: '100%', height: compact ? 180 : chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mttrByCategory}
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
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Math.round(v)}m`}
                        width={compact ? 35 : 45}
                      />
                      <Tooltip content={renderMTTRTooltip} />
                      {/* Target reference line */}
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <Bar
                        dataKey="avgMTTR"
                        name="Avg MTTR"
                        maxBarSize={compact ? 36 : 48}
                        shape={renderMTTRBar}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-dashboard-text-muted">No MTTR data available</p>
                </div>
              )}
            </div>

            {/* MTTR summary per category */}
            {mttrByCategory.length > 0 && (
              <div className="border-t border-dashboard-border">
                <div className="px-4 py-3">
                  <div
                    className={`grid gap-2 ${
                      compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
                    }`}
                  >
                    {mttrByCategory.map((item) => (
                      <div
                        key={item.category}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-dashboard-border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs font-medium text-dashboard-text-primary truncate">
                            {item.shortName}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-semibold flex-shrink-0 ${getMTTRColorClass(item.avgMTTR)}`}
                        >
                          {formatNumber(item.avgMTTR, { decimals: 0 })}m
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Incidents by Category */}
        {showRecentIncidents && (
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Recent Incidents
                  {selectedCategory && (
                    <span className="ml-1 text-dashboard-text-muted font-normal">
                      — {RCA_CATEGORY_LABELS[selectedCategory] || selectedCategory}
                    </span>
                  )}
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {recentIncidentsList.length}
                </span>
              </div>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150"
                >
                  Show all
                </button>
              )}
            </div>

            <div className="divide-y divide-dashboard-border">
              {recentIncidentsList.length > 0 ? (
                recentIncidentsList.map((incident) => (
                  <div
                    key={incident.incident_id}
                    className="px-4 py-3 hover:bg-gray-50/50 transition-colors duration-150"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <StatusBadge status={incident.severity || 'P4'} size="sm" />
                          <StatusBadge status={incident.status || 'unknown'} size="sm" />
                          {incident.root_cause && (
                            <span
                              className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4"
                              style={{
                                backgroundColor: `${RCA_CATEGORY_COLORS[incident.root_cause] || '#6b7280'}15`,
                                color: RCA_CATEGORY_COLORS[incident.root_cause] || '#6b7280',
                              }}
                            >
                              {(
                                RCA_CATEGORY_LABELS[incident.root_cause] || incident.root_cause
                              ).split(' ')[0]}
                            </span>
                          )}
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
                      {incident.mttr != null && (
                        <span>
                          MTTR:{' '}
                          <span
                            className={`font-medium ${getMTTRColorClass(incident.mttr)}`}
                          >
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
                  <p className="text-xs text-dashboard-text-muted">
                    {selectedCategory
                      ? `No incidents for ${RCA_CATEGORY_LABELS[selectedCategory] || selectedCategory}`
                      : 'No recent incidents'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {recentIncidentsList.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
                <span className="text-xs text-dashboard-text-muted">
                  Showing {recentIncidentsList.length} of{' '}
                  {selectedCategory
                    ? filteredIncidents.filter((i) => i.root_cause === selectedCategory).length
                    : filteredIncidents.length}{' '}
                  incidents
                </span>
                <span className="text-xs text-dashboard-text-muted">Most recent first</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { RCACategoryChart };
export default RCACategoryChart;