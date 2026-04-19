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
import { getRelativeTime, parseTimestamp } from '../../utils/dateUtils';
import { calculateTrendDirection } from '../../utils/chartHelpers';
import {
  ComposedChart,
  Bar,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/**
 * ChangeCorrelation - Change failure correlation view showing deployment events
 * overlaid with incident occurrences on a timeline. Highlights deployments that
 * preceded incidents within a configurable correlation window. Uses Recharts
 * ComposedChart for the combined timeline visualization.
 *
 * Features:
 * - Combined timeline of deployments and incidents using ComposedChart
 * - Configurable correlation window (1h, 2h, 4h, 8h, 24h) to link deployments to incidents
 * - Correlated deployments highlighted with visual emphasis
 * - Change failure rate (CFR) metric card with trend
 * - Deployment count, incident count, and correlation count metric cards
 * - Per-deployment detail with related incident info
 * - Severity-coded incident markers on the timeline
 * - Deployment status indicators (success, rolled_back, failed)
 * - Toggleable time window (7d / 30d / 90d)
 * - Expandable correlated pairs showing deployment → incident links
 * - Domain/service filter support
 * - Responsive layout with compact mode support
 * - Loading and empty states
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {boolean} [props.showCorrelationDetail=true] - Whether to allow expanding correlated pairs.
 * @param {number} [props.chartHeight=320] - Height of the chart area in pixels.
 * @param {number} [props.defaultCorrelationWindowHours=4] - Default correlation window in hours.
 * @returns {React.ReactNode}
 */
const ChangeCorrelation = ({
  className = '',
  compact = false,
  showMetricCards = true,
  showCorrelationDetail = true,
  chartHeight = 320,
  defaultCorrelationWindowHours = 4,
}) => {
  const { dashboardData, isLoading, error } = useDashboard();
  const [timeWindow, setTimeWindow] = useState('30d');
  const [correlationWindowHours, setCorrelationWindowHours] = useState(
    defaultCorrelationWindowHours,
  );
  const [expandedPairs, setExpandedPairs] = useState({});

  /**
   * Get all deployments from dashboard data.
   */
  const allDeployments = useMemo(() => {
    if (!dashboardData || !dashboardData.deployment_events) {
      return [];
    }
    return dashboardData.deployment_events;
  }, [dashboardData]);

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
   * Filter deployments and incidents based on the selected time window.
   */
  const filteredData = useMemo(() => {
    const now = new Date();
    let hoursBack = 720; // 30d default

    if (timeWindow === '7d') {
      hoursBack = 168;
    } else if (timeWindow === '30d') {
      hoursBack = 720;
    } else if (timeWindow === '90d') {
      hoursBack = 2160;
    }

    const cutoff = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    const deployments = allDeployments.filter((dep) => {
      if (!dep.timestamp) return false;
      const depDate = new Date(dep.timestamp);
      return !isNaN(depDate.getTime()) && depDate.getTime() >= cutoff.getTime();
    });

    const incidents = allIncidents.filter((inc) => {
      if (!inc.start_time) return false;
      const incDate = new Date(inc.start_time);
      return !isNaN(incDate.getTime()) && incDate.getTime() >= cutoff.getTime();
    });

    return { deployments, incidents };
  }, [allDeployments, allIncidents, timeWindow]);

  /**
   * Compute correlated deployment-incident pairs.
   * A deployment is correlated with an incident if the incident started within
   * the correlation window after the deployment timestamp.
   */
  const correlations = useMemo(() => {
    const { deployments, incidents } = filteredData;

    if (deployments.length === 0 || incidents.length === 0) {
      return [];
    }

    const windowMs = correlationWindowHours * 60 * 60 * 1000;
    const pairs = [];

    for (const dep of deployments) {
      const depDate = parseTimestamp(dep.timestamp);
      if (!depDate) continue;

      const depMs = depDate.getTime();

      for (const inc of incidents) {
        const incDate = parseTimestamp(inc.start_time);
        if (!incDate) continue;

        const incMs = incDate.getTime();
        const diff = incMs - depMs;

        // Incident must occur after the deployment and within the window
        if (diff >= 0 && diff <= windowMs) {
          // Also check if they share the same service or domain
          const sameService = dep.service_id === inc.service_id;
          const sameDomain = dep.domain_id === inc.domain_id;

          pairs.push({
            pair_key: `${dep.deployment_id}::${inc.incident_id}`,
            deployment: dep,
            incident: inc,
            time_gap_minutes: parseFloat((diff / (1000 * 60)).toFixed(2)),
            same_service: sameService,
            same_domain: sameDomain,
            confidence: sameService ? 'high' : sameDomain ? 'medium' : 'low',
            is_explicit: dep.related_incident_id === inc.incident_id,
          });
        }
      }
    }

    // Also include explicitly linked deployments that may fall outside the window
    for (const dep of deployments) {
      if (!dep.related_incident_id) continue;

      const alreadyPaired = pairs.some(
        (p) =>
          p.deployment.deployment_id === dep.deployment_id &&
          p.incident.incident_id === dep.related_incident_id,
      );

      if (!alreadyPaired) {
        const linkedIncident = incidents.find(
          (inc) => inc.incident_id === dep.related_incident_id,
        );

        if (linkedIncident) {
          const depDate = parseTimestamp(dep.timestamp);
          const incDate = parseTimestamp(linkedIncident.start_time);
          const diff =
            depDate && incDate ? incDate.getTime() - depDate.getTime() : 0;

          pairs.push({
            pair_key: `${dep.deployment_id}::${linkedIncident.incident_id}`,
            deployment: dep,
            incident: linkedIncident,
            time_gap_minutes: parseFloat((Math.abs(diff) / (1000 * 60)).toFixed(2)),
            same_service: dep.service_id === linkedIncident.service_id,
            same_domain: dep.domain_id === linkedIncident.domain_id,
            confidence: 'explicit',
            is_explicit: true,
          });
        }
      }
    }

    // Sort by time gap ascending (closest correlations first)
    pairs.sort((a, b) => a.time_gap_minutes - b.time_gap_minutes);

    return pairs;
  }, [filteredData, correlationWindowHours]);

  /**
   * Compute summary statistics.
   */
  const summary = useMemo(() => {
    const { deployments, incidents } = filteredData;

    const totalDeployments = deployments.length;
    const totalIncidents = incidents.length;
    const totalCorrelations = correlations.length;

    // Unique deployments that are correlated
    const correlatedDeploymentIds = new Set(
      correlations.map((c) => c.deployment.deployment_id),
    );
    const correlatedDeployments = correlatedDeploymentIds.size;

    // Unique incidents that are correlated
    const correlatedIncidentIds = new Set(
      correlations.map((c) => c.incident.incident_id),
    );
    const correlatedIncidents = correlatedIncidentIds.size;

    // Rolled back deployments
    const rolledBackDeployments = deployments.filter((d) => d.rollback === true).length;

    // Change failure rate
    const changeFailureRate =
      totalDeployments > 0
        ? parseFloat(((rolledBackDeployments / totalDeployments) * 100).toFixed(2))
        : 0;

    // Correlation rate (% of deployments that correlate with incidents)
    const correlationRate =
      totalDeployments > 0
        ? parseFloat(((correlatedDeployments / totalDeployments) * 100).toFixed(2))
        : 0;

    // High confidence correlations
    const highConfidenceCorrelations = correlations.filter(
      (c) => c.confidence === 'high' || c.confidence === 'explicit',
    ).length;

    // Average time gap for correlations
    const avgTimeGap =
      correlations.length > 0
        ? parseFloat(
            (
              correlations.reduce((sum, c) => sum + c.time_gap_minutes, 0) /
              correlations.length
            ).toFixed(2),
          )
        : null;

    return {
      totalDeployments,
      totalIncidents,
      totalCorrelations,
      correlatedDeployments,
      correlatedIncidents,
      rolledBackDeployments,
      changeFailureRate,
      correlationRate,
      highConfidenceCorrelations,
      avgTimeGap,
    };
  }, [filteredData, correlations]);

  /**
   * Build Recharts-compatible timeline data.
   * Merges deployments and incidents into a single timeline sorted by date.
   */
  const chartData = useMemo(() => {
    const { deployments, incidents } = filteredData;

    if (deployments.length === 0 && incidents.length === 0) {
      return [];
    }

    // Build a map of correlated deployment IDs for highlighting
    const correlatedDepIds = new Set(
      correlations.map((c) => c.deployment.deployment_id),
    );
    const correlatedIncIds = new Set(
      correlations.map((c) => c.incident.incident_id),
    );

    // Create timeline entries for deployments
    const depEntries = deployments.map((dep) => {
      const date = new Date(dep.timestamp);
      return {
        timestamp: dep.timestamp,
        epochMs: date.getTime(),
        timeLabel: date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        deployment: 1,
        incident: 0,
        deployment_id: dep.deployment_id,
        service_id: dep.service_id,
        domain_id: dep.domain_id,
        version: dep.version,
        status: dep.status,
        rollback: dep.rollback,
        change_type: dep.change_type,
        description: dep.description,
        is_correlated: correlatedDepIds.has(dep.deployment_id),
        type: 'deployment',
        severity: null,
        incident_id: null,
        title: dep.description || dep.version || dep.deployment_id,
      };
    });

    // Create timeline entries for incidents
    const incEntries = incidents.map((inc) => {
      const date = new Date(inc.start_time);
      const severityValue =
        inc.severity === SEVERITY_LEVELS.P1
          ? 4
          : inc.severity === SEVERITY_LEVELS.P2
            ? 3
            : inc.severity === SEVERITY_LEVELS.P3
              ? 2
              : 1;

      return {
        timestamp: inc.start_time,
        epochMs: date.getTime(),
        timeLabel: date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        deployment: 0,
        incident: 1,
        incident_severity: severityValue,
        deployment_id: null,
        service_id: inc.service_id,
        domain_id: inc.domain_id,
        version: null,
        status: inc.status,
        rollback: false,
        change_type: null,
        description: inc.title || inc.description,
        is_correlated: correlatedIncIds.has(inc.incident_id),
        type: 'incident',
        severity: inc.severity,
        incident_id: inc.incident_id,
        title: inc.title || inc.incident_id,
        root_cause: inc.root_cause,
        mttr: inc.mttr,
      };
    });

    // Merge and sort by timestamp
    const merged = [...depEntries, ...incEntries].sort(
      (a, b) => a.epochMs - b.epochMs,
    );

    return merged;
  }, [filteredData, correlations]);

  /**
   * Determine the overall health status based on change failure rate and correlations.
   */
  const overallStatus = useMemo(() => {
    if (summary.totalDeployments === 0) return 'unknown';
    if (summary.changeFailureRate > 25 || summary.highConfidenceCorrelations > 3) return 'critical';
    if (summary.changeFailureRate > 10 || summary.highConfidenceCorrelations > 0) return 'warning';
    return 'healthy';
  }, [summary]);

  /**
   * Handle time window toggle.
   */
  const handleTimeWindowChange = useCallback((window) => {
    setTimeWindow(window);
    setExpandedPairs({});
  }, []);

  /**
   * Handle correlation window change.
   */
  const handleCorrelationWindowChange = useCallback((hours) => {
    setCorrelationWindowHours(hours);
    setExpandedPairs({});
  }, []);

  /**
   * Toggle the expanded state of a correlated pair.
   */
  const togglePair = useCallback(
    (pairKey) => {
      if (!showCorrelationDetail) return;
      setExpandedPairs((prev) => ({
        ...prev,
        [pairKey]: !prev[pairKey],
      }));
    },
    [showCorrelationDetail],
  );

  /**
   * Get the deployment status color class.
   */
  const getDeploymentStatusColorClass = useCallback((status, rollback) => {
    if (rollback) return 'text-severity-critical';
    if (status === 'success') return 'text-status-healthy';
    if (status === 'rolled_back') return 'text-severity-high';
    if (status === 'failed') return 'text-severity-critical';
    return 'text-dashboard-text-muted';
  }, []);

  /**
   * Get the deployment status dot class.
   */
  const getDeploymentStatusDotClass = useCallback((status, rollback) => {
    if (rollback) return 'bg-severity-critical';
    if (status === 'success') return 'bg-status-healthy';
    if (status === 'rolled_back') return 'bg-severity-high';
    if (status === 'failed') return 'bg-severity-critical';
    return 'bg-status-unknown';
  }, []);

  /**
   * Get the confidence badge color.
   */
  const getConfidenceBadgeClass = useCallback((confidence) => {
    switch (confidence) {
      case 'explicit':
        return 'bg-brand-100 text-brand-800';
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }, []);

  /**
   * Get the confidence label.
   */
  const getConfidenceLabel = useCallback((confidence) => {
    switch (confidence) {
      case 'explicit':
        return 'Linked';
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return confidence;
    }
  }, []);

  /**
   * Custom tooltip renderer for the timeline chart.
   */
  const renderChartTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const dataPoint = payload[0]?.payload;
      if (!dataPoint) return null;

      return (
        <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs max-w-[260px]">
          <p className="font-medium text-dashboard-text-primary mb-1">{dataPoint.timeLabel}</p>

          {dataPoint.type === 'deployment' && (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getDeploymentStatusDotClass(dataPoint.status, dataPoint.rollback)}`}
                />
                <span className="font-medium text-dashboard-text-primary">Deployment</span>
                {dataPoint.is_correlated && (
                  <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold leading-3 bg-red-50 text-red-800">
                    Correlated
                  </span>
                )}
              </div>
              {dataPoint.version && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-dashboard-text-muted">Version:</span>
                  <span className="font-medium text-dashboard-text-secondary font-mono text-[10px]">
                    {dataPoint.version}
                  </span>
                </div>
              )}
              {dataPoint.service_id && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-dashboard-text-muted">Service:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {dataPoint.service_id}
                  </span>
                </div>
              )}
              {dataPoint.change_type && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-dashboard-text-muted">Type:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {dataPoint.change_type}
                  </span>
                </div>
              )}
              {dataPoint.rollback && (
                <div className="flex items-center gap-1 mt-1 text-severity-critical font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  Rolled Back
                </div>
              )}
            </>
          )}

          {dataPoint.type === 'incident' && (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <StatusBadge status={dataPoint.severity || 'P4'} size="sm" />
                {dataPoint.is_correlated && (
                  <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold leading-3 bg-red-50 text-red-800">
                    Correlated
                  </span>
                )}
              </div>
              <p className="text-dashboard-text-primary font-medium truncate mb-0.5">
                {dataPoint.title}
              </p>
              {dataPoint.root_cause && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-dashboard-text-muted">RCA:</span>
                  <span
                    className="font-medium"
                    style={{ color: RCA_CATEGORY_COLORS[dataPoint.root_cause] || '#6b7280' }}
                  >
                    {RCA_CATEGORY_LABELS[dataPoint.root_cause] || dataPoint.root_cause}
                  </span>
                </div>
              )}
              {dataPoint.mttr != null && (
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-dashboard-text-muted">MTTR:</span>
                  <span className="font-medium text-dashboard-text-secondary">
                    {formatNumber(dataPoint.mttr, { decimals: 0 })} min
                  </span>
                </div>
              )}
            </>
          )}

          {dataPoint.description && (
            <p className="text-[10px] text-dashboard-text-muted mt-1 line-clamp-2">
              {dataPoint.description}
            </p>
          )}
        </div>
      );
    },
    [getDeploymentStatusDotClass],
  );

  /**
   * Custom bar shape for deployments that colors based on status and correlation.
   */
  const renderDeploymentBar = useCallback(
    (props) => {
      const { x, y, width, height, payload } = props;

      if (!payload || payload.type !== 'deployment') {
        return null;
      }

      let fill = '#6366f1'; // default indigo
      if (payload.rollback) {
        fill = '#dc2626'; // red for rolled back
      } else if (payload.status === 'failed') {
        fill = '#dc2626';
      } else if (payload.is_correlated) {
        fill = '#ea580c'; // orange for correlated
      }

      const opacity = payload.is_correlated ? 1 : 0.7;

      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          opacity={opacity}
          rx={2}
          ry={2}
          stroke={payload.is_correlated ? '#dc2626' : 'none'}
          strokeWidth={payload.is_correlated ? 1.5 : 0}
        />
      );
    },
    [],
  );

  /**
   * Render the time window toggle buttons.
   */
  function renderTimeWindowToggle() {
    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {['7d', '30d', '90d'].map((window) => (
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
   * Render the correlation window selector.
   */
  function renderCorrelationWindowSelector() {
    const windowOptions = [1, 2, 4, 8, 24];

    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {windowOptions.map((hours) => (
          <button
            key={hours}
            onClick={() => handleCorrelationWindowChange(hours)}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
              correlationWindowHours === hours
                ? 'bg-white text-dashboard-text-primary shadow-sm'
                : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
            }`}
            aria-pressed={correlationWindowHours === hours}
            aria-label={`${hours} hour correlation window`}
          >
            {hours}h
          </button>
        ))}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading change correlation data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load change correlation data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state — no deployments or incidents at all
  if (allDeployments.length === 0 && allIncidents.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No deployment or incident data"
          description="No deployment events or incident data is available. Upload data to populate the change failure correlation view."
          size="md"
        />
      </div>
    );
  }

  // No data in the selected time window
  if (filteredData.deployments.length === 0 && filteredData.incidents.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Change Failure Correlation
              </h3>
              <StatusBadge status="healthy" size="sm" label="No Events" />
            </div>
            {renderTimeWindowToggle()}
          </div>

          <EmptyState
            preset="no-data"
            title="No events in this period"
            description={`No deployments or incidents were recorded in the last ${timeWindow === '7d' ? '7 days' : timeWindow === '30d' ? '30 days' : '90 days'}.`}
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
            Change Failure Correlation
          </h3>
          <StatusBadge
            status={overallStatus}
            size="sm"
            label={
              overallStatus === 'healthy'
                ? 'Low Risk'
                : overallStatus === 'warning'
                  ? 'Correlations Detected'
                  : overallStatus === 'critical'
                    ? 'High Failure Rate'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-4">
          {renderTimeWindowToggle()}
          <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
              {summary.totalDeployments} Deployments
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
              {summary.totalIncidents} Incidents
            </span>
            {summary.totalCorrelations > 0 && (
              <span className="flex items-center gap-1.5 text-severity-high font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-severity-high animate-pulse" />
                {summary.totalCorrelations} Correlated
              </span>
            )}
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
            title="Change Failure Rate"
            value={summary.changeFailureRate}
            unit="%"
            size={compact ? 'sm' : 'md'}
            status={
              summary.changeFailureRate > 25
                ? 'critical'
                : summary.changeFailureRate > 10
                  ? 'warning'
                  : summary.changeFailureRate > 0
                    ? 'degraded'
                    : 'healthy'
            }
            subtitle={`${summary.rolledBackDeployments} of ${summary.totalDeployments} rolled back`}
            trend={{
              direction: summary.changeFailureRate > 15 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Correlated Deployments"
            value={summary.correlatedDeployments}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={summary.correlatedDeployments > 0 ? 'warning' : 'healthy'}
            subtitle={`${summary.correlationRate}% correlation rate`}
            trend={{
              direction: summary.correlatedDeployments > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="High Confidence"
            value={summary.highConfidenceCorrelations}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={summary.highConfidenceCorrelations > 0 ? 'critical' : 'healthy'}
            subtitle="Same service or explicit link"
          />
          <MetricCard
            title="Avg Time Gap"
            value={summary.avgTimeGap}
            unit="min"
            size={compact ? 'sm' : 'md'}
            subtitle={`Within ${correlationWindowHours}h window`}
            status={
              summary.avgTimeGap != null && summary.avgTimeGap < 30
                ? 'warning'
                : undefined
            }
          />
        </div>
      )}

      {/* Timeline Chart */}
      <div className="dashboard-card overflow-hidden mb-6">
        {/* Chart Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <h4 className="text-sm font-semibold text-dashboard-text-primary">
              Deployment & Incident Timeline
            </h4>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
              {chartData.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-dashboard-text-muted">
              <span>Correlation Window:</span>
            </div>
            {renderCorrelationWindowSelector()}
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="p-4">
            <div style={{ width: '100%', height: compact ? 220 : chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
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
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={compact ? 30 : 40}
                    label={
                      !compact
                        ? {
                            value: 'Deployments',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#94a3b8',
                            fontSize: 10,
                            offset: 10,
                          }
                        : undefined
                    }
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    domain={[0, 5]}
                    width={compact ? 30 : 40}
                    tickFormatter={(v) => {
                      if (v === 4) return 'P1';
                      if (v === 3) return 'P2';
                      if (v === 2) return 'P3';
                      if (v === 1) return 'P4';
                      return '';
                    }}
                    label={
                      !compact
                        ? {
                            value: 'Severity',
                            angle: 90,
                            position: 'insideRight',
                            fill: '#94a3b8',
                            fontSize: 10,
                            offset: 10,
                          }
                        : undefined
                    }
                  />
                  <Tooltip content={renderChartTooltip} />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconSize={10}
                    wrapperStyle={{ fontSize: '11px', color: '#475569' }}
                    formatter={(value) => {
                      if (value === 'deployment') return 'Deployments';
                      if (value === 'incident_severity') return 'Incidents (by Severity)';
                      return value;
                    }}
                  />

                  {/* Deployment bars */}
                  <Bar
                    yAxisId="left"
                    dataKey="deployment"
                    name="deployment"
                    fill="#6366f1"
                    maxBarSize={compact ? 12 : 18}
                    shape={renderDeploymentBar}
                  />

                  {/* Incident severity scatter */}
                  <Scatter
                    yAxisId="right"
                    dataKey="incident_severity"
                    name="incident_severity"
                    fill="#dc2626"
                  >
                    {chartData.map((entry, index) => {
                      if (entry.type !== 'incident') return null;

                      let fill = SEVERITY_COLORS[entry.severity] || '#6b7280';
                      const size = entry.is_correlated ? 8 : 5;

                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={fill}
                          r={size}
                          stroke={entry.is_correlated ? '#dc2626' : '#fff'}
                          strokeWidth={entry.is_correlated ? 2 : 1}
                        />
                      );
                    })}
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <EmptyState
            preset="no-data"
            title="No timeline data"
            description="No deployments or incidents to display on the timeline."
            size="sm"
            compact
          />
        )}

        {/* Chart Legend / Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-sm bg-brand-500" />
              Deployment
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-sm bg-severity-high" style={{ border: '1px solid #dc2626' }} />
              Correlated Deploy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-sm bg-severity-critical" />
              Rolled Back
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
              Incident
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Window: {correlationWindowHours}h
            </span>
            <span>
              {timeWindow === '7d'
                ? 'Last 7 Days'
                : timeWindow === '30d'
                  ? 'Last 30 Days'
                  : 'Last 90 Days'}
            </span>
          </div>
        </div>
      </div>

      {/* Correlated Pairs Table */}
      <div className="dashboard-card overflow-hidden">
        {/* Table Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <h4 className="text-sm font-semibold text-dashboard-text-primary">
              Correlated Deployment → Incident Pairs
            </h4>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
              {correlations.length}
            </span>
            {summary.highConfidenceCorrelations > 0 && (
              <span className="flex items-center gap-1 text-xs text-severity-critical font-medium">
                <svg
                  className="w-3.5 h-3.5"
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
                {summary.highConfidenceCorrelations} high confidence
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Correlation window:{' '}
              <span className="font-medium text-dashboard-text-secondary">
                {correlationWindowHours}h
              </span>
            </span>
          </div>
        </div>

        {/* Pairs List */}
        {correlations.length > 0 ? (
          <div className="divide-y divide-dashboard-border">
            {correlations.map((pair) => {
              const isExpanded = expandedPairs[pair.pair_key] || false;
              const dep = pair.deployment;
              const inc = pair.incident;

              return (
                <div key={pair.pair_key}>
                  {/* Pair Row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 transition-colors duration-150 ${
                      pair.confidence === 'high' || pair.confidence === 'explicit'
                        ? 'bg-red-50/30 hover:bg-red-50/50'
                        : 'hover:bg-gray-50/50'
                    } ${showCorrelationDetail ? 'cursor-pointer' : ''}`}
                    onClick={() => togglePair(pair.pair_key)}
                    onKeyDown={(e) => {
                      if (showCorrelationDetail && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        togglePair(pair.pair_key);
                      }
                    }}
                    role={showCorrelationDetail ? 'button' : undefined}
                    tabIndex={showCorrelationDetail ? 0 : undefined}
                    aria-expanded={showCorrelationDetail ? isExpanded : undefined}
                    aria-label={`Deployment ${dep.deployment_id} → Incident ${inc.incident_id}, ${pair.time_gap_minutes} min gap`}
                  >
                    {/* Deployment Info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1" style={{ maxWidth: compact ? '35%' : '30%' }}>
                      <span
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getDeploymentStatusDotClass(dep.status, dep.rollback)}`}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-dashboard-text-primary truncate block">
                          {dep.version || dep.deployment_id}
                        </span>
                        <span className="text-[10px] text-dashboard-text-muted truncate block">
                          {dep.service_id}
                          {dep.change_type && ` · ${dep.change_type}`}
                        </span>
                      </div>
                    </div>

                    {/* Arrow + Time Gap */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-severity-high"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                      <span className="text-xs font-medium text-dashboard-text-secondary whitespace-nowrap">
                        {pair.time_gap_minutes < 60
                          ? `${formatNumber(pair.time_gap_minutes, { decimals: 0 })}m`
                          : `${formatNumber(pair.time_gap_minutes / 60, { decimals: 1 })}h`}
                      </span>
                    </div>

                    {/* Incident Info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1" style={{ maxWidth: compact ? '35%' : '30%' }}>
                      <StatusBadge status={inc.severity || 'P4'} size="sm" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-dashboard-text-primary truncate block">
                          {inc.title || inc.incident_id}
                        </span>
                        <span className="text-[10px] text-dashboard-text-muted truncate block">
                          {inc.service_id}
                          {inc.root_cause && (
                            <span
                              className="ml-1"
                              style={{ color: RCA_CATEGORY_COLORS[inc.root_cause] || '#6b7280' }}
                            >
                              · {(RCA_CATEGORY_LABELS[inc.root_cause] || inc.root_cause).split(' ')[0]}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Confidence Badge */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 ${getConfidenceBadgeClass(pair.confidence)}`}
                      >
                        {getConfidenceLabel(pair.confidence)}
                      </span>

                      {showCorrelationDetail && (
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

                  {/* Expanded Detail */}
                  {showCorrelationDetail && isExpanded && (
                    <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                      <div className="px-4 py-3">
                        <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                          {/* Deployment Detail */}
                          <div className="px-3 py-2.5 rounded-lg border border-dashboard-border bg-white">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${getDeploymentStatusDotClass(dep.status, dep.rollback)}`}
                              />
                              <h6 className="text-xs font-semibold text-dashboard-text-primary">
                                Deployment
                              </h6>
                              {dep.rollback && (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                  Rolled Back
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">ID:</span>
                                <span className="font-mono text-[10px] text-dashboard-text-secondary truncate">
                                  {dep.deployment_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Version:</span>
                                <span className="font-medium text-dashboard-text-secondary font-mono text-[10px]">
                                  {dep.version || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Service:</span>
                                <span className="font-medium text-dashboard-text-secondary">
                                  {dep.service_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Domain:</span>
                                <span className="font-medium text-dashboard-text-secondary">
                                  {dep.domain_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Type:</span>
                                <span className="font-medium text-dashboard-text-secondary">
                                  {dep.change_type || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Time:</span>
                                <span className="text-dashboard-text-secondary">
                                  {dep.timestamp ? getRelativeTime(dep.timestamp) : '—'}
                                </span>
                              </div>
                              {dep.description && (
                                <div className="flex items-start gap-2 mt-1">
                                  <span className="text-dashboard-text-muted w-16 flex-shrink-0">Desc:</span>
                                  <span className="text-dashboard-text-secondary line-clamp-2">
                                    {dep.description}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Incident Detail */}
                          <div className="px-3 py-2.5 rounded-lg border border-dashboard-border bg-white">
                            <div className="flex items-center gap-2 mb-2">
                              <StatusBadge status={inc.severity || 'P4'} size="sm" />
                              <h6 className="text-xs font-semibold text-dashboard-text-primary">
                                Incident
                              </h6>
                              <StatusBadge status={inc.status || 'unknown'} size="sm" />
                            </div>
                            <div className="flex flex-col gap-1 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">ID:</span>
                                <span className="font-mono text-[10px] text-dashboard-text-secondary truncate">
                                  {inc.incident_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Title:</span>
                                <span className="font-medium text-dashboard-text-secondary truncate">
                                  {inc.title || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Service:</span>
                                <span className="font-medium text-dashboard-text-secondary">
                                  {inc.service_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Domain:</span>
                                <span className="font-medium text-dashboard-text-secondary">
                                  {inc.domain_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">RCA:</span>
                                <span
                                  className="font-medium"
                                  style={{
                                    color: RCA_CATEGORY_COLORS[inc.root_cause] || '#6b7280',
                                  }}
                                >
                                  {RCA_CATEGORY_LABELS[inc.root_cause] || inc.root_cause || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-dashboard-text-muted w-16">Time:</span>
                                <span className="text-dashboard-text-secondary">
                                  {inc.start_time ? getRelativeTime(inc.start_time) : '—'}
                                </span>
                              </div>
                              {inc.mttr != null && (
                                <div className="flex items-center gap-2">
                                  <span className="text-dashboard-text-muted w-16">MTTR:</span>
                                  <span
                                    className={`font-medium ${
                                      inc.mttr > 60
                                        ? 'text-severity-critical'
                                        : inc.mttr > 30
                                          ? 'text-status-degraded'
                                          : 'text-status-healthy'
                                    }`}
                                  >
                                    {formatNumber(inc.mttr, { decimals: 0 })} min
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Correlation Summary */}
                        <div className="flex flex-wrap items-center gap-4 mt-3 px-1 text-xs text-dashboard-text-muted">
                          <span>
                            Time gap:{' '}
                            <span className="font-medium text-dashboard-text-secondary">
                              {pair.time_gap_minutes < 60
                                ? `${formatNumber(pair.time_gap_minutes, { decimals: 1 })} min`
                                : `${formatNumber(pair.time_gap_minutes / 60, { decimals: 1 })} hr`}
                            </span>
                          </span>
                          <span>
                            Same service:{' '}
                            <span
                              className={`font-medium ${pair.same_service ? 'text-severity-critical' : 'text-dashboard-text-secondary'}`}
                            >
                              {pair.same_service ? 'Yes' : 'No'}
                            </span>
                          </span>
                          <span>
                            Same domain:{' '}
                            <span
                              className={`font-medium ${pair.same_domain ? 'text-status-degraded' : 'text-dashboard-text-secondary'}`}
                            >
                              {pair.same_domain ? 'Yes' : 'No'}
                            </span>
                          </span>
                          <span>
                            Confidence:{' '}
                            <span
                              className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 ${getConfidenceBadgeClass(pair.confidence)}`}
                            >
                              {getConfidenceLabel(pair.confidence)}
                            </span>
                          </span>
                          {pair.is_explicit && (
                            <span className="flex items-center gap-1 text-brand-600 font-medium">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-6.364-6.364L4.5 8.257"
                                />
                              </svg>
                              Explicitly linked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            preset="no-incidents"
            title="No correlated pairs"
            description={`No deployments preceded incidents within the ${correlationWindowHours}-hour correlation window during the selected time period. This is a positive indicator.`}
            size="sm"
            compact
          />
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              {correlations.length} correlation{correlations.length !== 1 ? 's' : ''} detected
            </span>
            <span>·</span>
            <span>
              {summary.totalDeployments} deployment{summary.totalDeployments !== 1 ? 's' : ''}
              {' · '}
              {summary.totalIncidents} incident{summary.totalIncidents !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span>
              {timeWindow === '7d'
                ? 'Last 7 Days'
                : timeWindow === '30d'
                  ? 'Last 30 Days'
                  : 'Last 90 Days'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              CFR:{' '}
              <span
                className={`font-medium ${
                  summary.changeFailureRate > 25
                    ? 'text-severity-critical'
                    : summary.changeFailureRate > 10
                      ? 'text-status-degraded'
                      : 'text-status-healthy'
                }`}
              >
                {formatPercentage(summary.changeFailureRate, 1)}
              </span>
            </span>
            <span>
              Window: {correlationWindowHours}h
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { ChangeCorrelation };
export default ChangeCorrelation;