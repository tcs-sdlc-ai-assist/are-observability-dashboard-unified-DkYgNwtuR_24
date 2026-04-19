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

/**
 * FailurePatterns - Widget highlighting repeated failure patterns across services.
 * Lists services with recurring incidents of the same root cause, frequency count,
 * last occurrence, and severity. Flagged items (≥3 occurrences of same RCA on same
 * service) are shown prominently with visual emphasis.
 *
 * Features:
 * - Detects repeated failure patterns: same service + same root cause recurring
 * - Frequency count per pattern with severity breakdown
 * - Last occurrence timestamp with relative time display
 * - Flagged patterns (≥3 occurrences) shown prominently with warning styling
 * - Per-pattern severity distribution (P1–P4)
 * - Toggleable time window (24h / 7d / 30d)
 * - Sortable by frequency, severity, or last occurrence
 * - Summary metric cards (total patterns, flagged count, top RCA, avg frequency)
 * - Expandable pattern rows to show individual incidents
 * - Color-coded by root cause category
 * - Responsive layout with compact mode support
 * - Loading and empty states
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {number} [props.flagThreshold=3] - Minimum recurrence count to flag a pattern.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {boolean} [props.showIncidentDetail=true] - Whether to allow expanding patterns to show individual incidents.
 * @param {number} [props.limit=0] - Maximum number of patterns to display. 0 for all.
 * @returns {React.ReactNode}
 */
const FailurePatterns = ({
  className = '',
  compact = false,
  flagThreshold = 3,
  showMetricCards = true,
  showIncidentDetail = true,
  limit = 0,
}) => {
  const { dashboardData, isLoading, error } = useDashboard();
  const [timeWindow, setTimeWindow] = useState('30d');
  const [sortKey, setSortKey] = useState('frequency');
  const [sortDirection, setSortDirection] = useState('desc');
  const [expandedPatterns, setExpandedPatterns] = useState({});

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
   * Detect repeated failure patterns by grouping incidents by service_id + root_cause.
   * A pattern is a unique combination of (service_id, root_cause) with ≥2 occurrences.
   */
  const failurePatterns = useMemo(() => {
    if (!filteredIncidents || filteredIncidents.length === 0) {
      return [];
    }

    const patternMap = new Map();

    for (const inc of filteredIncidents) {
      if (!inc.service_id || !inc.root_cause) {
        continue;
      }

      const patternKey = `${inc.service_id}::${inc.root_cause}`;

      if (!patternMap.has(patternKey)) {
        patternMap.set(patternKey, {
          pattern_key: patternKey,
          service_id: inc.service_id,
          domain_id: inc.domain_id || '',
          root_cause: inc.root_cause,
          incidents: [],
          frequency: 0,
          last_occurrence: null,
          last_occurrence_ts: 0,
          highest_severity: SEVERITY_LEVELS.P4,
          highest_severity_order: SEVERITY_ORDER[SEVERITY_LEVELS.P4] ?? 99,
          severity_counts: {
            [SEVERITY_LEVELS.P1]: 0,
            [SEVERITY_LEVELS.P2]: 0,
            [SEVERITY_LEVELS.P3]: 0,
            [SEVERITY_LEVELS.P4]: 0,
          },
          avg_mttr: null,
          is_flagged: false,
        });
      }

      const pattern = patternMap.get(patternKey);
      pattern.incidents.push(inc);
      pattern.frequency += 1;

      // Track severity counts
      if (inc.severity && pattern.severity_counts[inc.severity] != null) {
        pattern.severity_counts[inc.severity] += 1;
      }

      // Track highest severity
      const incSeverityOrder = SEVERITY_ORDER[inc.severity] ?? 99;
      if (incSeverityOrder < pattern.highest_severity_order) {
        pattern.highest_severity = inc.severity;
        pattern.highest_severity_order = incSeverityOrder;
      }

      // Track last occurrence
      if (inc.start_time) {
        const incTs = new Date(inc.start_time).getTime();
        if (!isNaN(incTs) && incTs > pattern.last_occurrence_ts) {
          pattern.last_occurrence = inc.start_time;
          pattern.last_occurrence_ts = incTs;
        }
      }
    }

    // Compute averages and flag status
    const patterns = [];

    for (const pattern of patternMap.values()) {
      // Only include patterns with ≥2 occurrences (repeated failures)
      if (pattern.frequency < 2) {
        continue;
      }

      // Compute average MTTR
      const mttrValues = pattern.incidents
        .filter((i) => i.mttr != null && !isNaN(i.mttr))
        .map((i) => parseFloat(i.mttr));

      pattern.avg_mttr =
        mttrValues.length > 0
          ? parseFloat(
              (mttrValues.reduce((sum, v) => sum + v, 0) / mttrValues.length).toFixed(2),
            )
          : null;

      // Flag patterns that meet or exceed the threshold
      pattern.is_flagged = pattern.frequency >= flagThreshold;

      // Sort incidents within pattern by start_time descending
      pattern.incidents.sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      });

      patterns.push(pattern);
    }

    return patterns;
  }, [filteredIncidents, flagThreshold]);

  /**
   * Sort failure patterns by the current sort key and direction.
   */
  const sortedPatterns = useMemo(() => {
    if (!failurePatterns || failurePatterns.length === 0) {
      return [];
    }

    const sorted = [...failurePatterns];

    sorted.sort((a, b) => {
      let diff = 0;

      switch (sortKey) {
        case 'frequency':
          diff = a.frequency - b.frequency;
          break;
        case 'severity':
          diff = a.highest_severity_order - b.highest_severity_order;
          break;
        case 'last_occurrence':
          diff = a.last_occurrence_ts - b.last_occurrence_ts;
          break;
        case 'mttr':
          diff = (a.avg_mttr || 0) - (b.avg_mttr || 0);
          break;
        default:
          diff = a.frequency - b.frequency;
      }

      return sortDirection === 'desc' ? -diff : diff;
    });

    // Apply limit
    if (limit > 0 && sorted.length > limit) {
      return sorted.slice(0, limit);
    }

    return sorted;
  }, [failurePatterns, sortKey, sortDirection, limit]);

  /**
   * Compute summary statistics.
   */
  const summary = useMemo(() => {
    if (!failurePatterns || failurePatterns.length === 0) {
      return {
        totalPatterns: 0,
        flaggedPatterns: 0,
        totalIncidentsInPatterns: 0,
        topRootCause: null,
        topRootCauseCount: 0,
        avgFrequency: 0,
      };
    }

    const flaggedPatterns = failurePatterns.filter((p) => p.is_flagged).length;
    const totalIncidentsInPatterns = failurePatterns.reduce((sum, p) => sum + p.frequency, 0);
    const avgFrequency =
      failurePatterns.length > 0
        ? parseFloat(
            (totalIncidentsInPatterns / failurePatterns.length).toFixed(1),
          )
        : 0;

    // Find the most common root cause across patterns
    const rcaCounts = {};
    for (const pattern of failurePatterns) {
      const rca = pattern.root_cause;
      rcaCounts[rca] = (rcaCounts[rca] || 0) + pattern.frequency;
    }

    let topRootCause = null;
    let topRootCauseCount = 0;
    for (const [rca, count] of Object.entries(rcaCounts)) {
      if (count > topRootCauseCount) {
        topRootCause = rca;
        topRootCauseCount = count;
      }
    }

    return {
      totalPatterns: failurePatterns.length,
      flaggedPatterns,
      totalIncidentsInPatterns,
      topRootCause,
      topRootCauseCount,
      avgFrequency,
    };
  }, [failurePatterns]);

  /**
   * Determine the overall health status based on flagged patterns.
   */
  const overallStatus = useMemo(() => {
    if (failurePatterns.length === 0) return 'healthy';

    const hasP1Flagged = failurePatterns.some(
      (p) => p.is_flagged && p.highest_severity === SEVERITY_LEVELS.P1,
    );
    const hasP2Flagged = failurePatterns.some(
      (p) => p.is_flagged && p.highest_severity === SEVERITY_LEVELS.P2,
    );

    if (hasP1Flagged || summary.flaggedPatterns > 3) return 'critical';
    if (hasP2Flagged || summary.flaggedPatterns > 0) return 'warning';
    return 'healthy';
  }, [failurePatterns, summary]);

  /**
   * Handle time window toggle.
   */
  const handleTimeWindowChange = useCallback((window) => {
    setTimeWindow(window);
    setExpandedPatterns({});
  }, []);

  /**
   * Handle sort change.
   */
  const handleSortChange = useCallback(
    (key) => {
      if (sortKey === key) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDirection('desc');
      }
    },
    [sortKey],
  );

  /**
   * Toggle the expanded state of a pattern row.
   */
  const togglePattern = useCallback(
    (patternKey) => {
      if (!showIncidentDetail) {
        return;
      }

      setExpandedPatterns((prev) => ({
        ...prev,
        [patternKey]: !prev[patternKey],
      }));
    },
    [showIncidentDetail],
  );

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

  /**
   * Get the frequency color class based on count and flag threshold.
   * @param {number} frequency - The occurrence count.
   * @param {boolean} isFlagged - Whether the pattern is flagged.
   * @returns {string} Tailwind text color class.
   */
  const getFrequencyColorClass = useCallback(
    (frequency, isFlagged) => {
      if (isFlagged) return 'text-severity-critical';
      if (frequency >= flagThreshold - 1) return 'text-status-degraded';
      return 'text-dashboard-text-secondary';
    },
    [flagThreshold],
  );

  /**
   * Render the sort indicator icon for a column header.
   */
  const renderSortIcon = useCallback(
    (columnKey) => {
      if (sortKey !== columnKey) {
        return (
          <svg
            className="w-3.5 h-3.5 text-dashboard-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
            />
          </svg>
        );
      }

      if (sortDirection === 'asc') {
        return (
          <svg
            className="w-3.5 h-3.5 text-brand-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 15.75l7.5-7.5 7.5 7.5"
            />
          </svg>
        );
      }

      return (
        <svg
          className="w-3.5 h-3.5 text-brand-600"
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
      );
    },
    [sortKey, sortDirection],
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
        <LoadingSpinner message="Loading failure pattern data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load failure pattern data"
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
          description="No incident data is available. Upload incident data to detect repeated failure patterns."
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
                Failure Patterns
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

  // No repeated failure patterns detected
  if (failurePatterns.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Failure Patterns
              </h3>
              <StatusBadge status="healthy" size="sm" label="No Patterns" />
            </div>
            {renderTimeWindowToggle()}
          </div>

          <EmptyState
            preset="no-incidents"
            title="No repeated failure patterns"
            description={`No service has experienced recurring incidents with the same root cause in the last ${timeWindow === '24h' ? '24 hours' : timeWindow === '7d' ? '7 days' : '30 days'}. This is a positive indicator.`}
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
            Failure Patterns
          </h3>
          <StatusBadge
            status={overallStatus}
            size="sm"
            label={
              overallStatus === 'healthy'
                ? 'No Flagged Patterns'
                : overallStatus === 'warning'
                  ? 'Patterns Detected'
                  : overallStatus === 'critical'
                    ? 'Critical Patterns'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-4">
          {renderTimeWindowToggle()}
          <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-severity-critical animate-pulse" />
              {summary.flaggedPatterns} Flagged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
              {summary.totalPatterns} Patterns
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
            title="Repeated Patterns"
            value={summary.totalPatterns}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={overallStatus}
            subtitle={`${summary.totalIncidentsInPatterns} total incidents`}
          />
          <MetricCard
            title="Flagged Patterns"
            value={summary.flaggedPatterns}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={summary.flaggedPatterns > 0 ? 'critical' : 'healthy'}
            subtitle={`≥${flagThreshold} occurrences`}
            trend={{
              direction: summary.flaggedPatterns > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Top Root Cause"
            value={
              summary.topRootCause
                ? (RCA_CATEGORY_LABELS[summary.topRootCause] || summary.topRootCause).split(' ')[0]
                : '—'
            }
            unit=""
            size={compact ? 'sm' : 'md'}
            subtitle={
              summary.topRootCause
                ? `${summary.topRootCauseCount} incidents`
                : undefined
            }
          />
          <MetricCard
            title="Avg Frequency"
            value={summary.avgFrequency}
            unit="count"
            size={compact ? 'sm' : 'md'}
            subtitle="per pattern"
            status={summary.avgFrequency >= flagThreshold ? 'warning' : undefined}
          />
        </div>
      )}

      {/* Patterns Table */}
      <div className="dashboard-card overflow-hidden">
        {/* Table Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <h4 className="text-sm font-semibold text-dashboard-text-primary">
              Detected Patterns
            </h4>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
              {sortedPatterns.length}
            </span>
            {summary.flaggedPatterns > 0 && (
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
                {summary.flaggedPatterns} flagged
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Flag threshold: <span className="font-medium text-dashboard-text-secondary">≥{flagThreshold}</span>
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="border-b border-dashboard-border bg-gray-50/50">
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                  style={{ width: compact ? '30%' : '24%' }}
                  scope="col"
                >
                  Service
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                  style={{ width: compact ? '20%' : '16%' }}
                  scope="col"
                >
                  Root Cause
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                  style={{ width: '10%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSortChange('frequency')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'frequency' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'frequency'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by frequency"
                  >
                    <span>Frequency</span>
                    {renderSortIcon('frequency')}
                  </button>
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                  style={{ width: '12%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSortChange('severity')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'severity' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'severity'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by severity"
                  >
                    <span>Severity</span>
                    {renderSortIcon('severity')}
                  </button>
                </th>
                {!compact && (
                  <th
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                    style={{ width: '12%' }}
                    scope="col"
                  >
                    Breakdown
                  </th>
                )}
                {!compact && (
                  <th
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right"
                    style={{ width: '10%' }}
                    scope="col"
                  >
                    <button
                      onClick={() => handleSortChange('mttr')}
                      className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                        sortKey === 'mttr' ? 'text-brand-600' : ''
                      }`}
                      aria-sort={
                        sortKey === 'mttr'
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      aria-label="Sort by MTTR"
                    >
                      <span>Avg MTTR</span>
                      {renderSortIcon('mttr')}
                    </button>
                  </th>
                )}
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right"
                  style={{ width: compact ? '18%' : '14%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSortChange('last_occurrence')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'last_occurrence' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'last_occurrence'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by last occurrence"
                  >
                    <span>Last Seen</span>
                    {renderSortIcon('last_occurrence')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashboard-border">
              {sortedPatterns.map((pattern) => {
                const isExpanded = expandedPatterns[pattern.pattern_key] || false;
                const rcaColor = RCA_CATEGORY_COLORS[pattern.root_cause] || '#6b7280';

                return (
                  <tr key={pattern.pattern_key} className="group">
                    <td colSpan={compact ? 5 : 7} className="p-0">
                      {/* Pattern Row */}
                      <div
                        className={`flex items-center transition-colors duration-150 ${
                          pattern.is_flagged
                            ? 'bg-red-50/40 hover:bg-red-50/60'
                            : 'hover:bg-gray-50/50'
                        } ${showIncidentDetail ? 'cursor-pointer' : ''}`}
                        onClick={() => togglePattern(pattern.pattern_key)}
                        onKeyDown={(e) => {
                          if (showIncidentDetail && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            togglePattern(pattern.pattern_key);
                          }
                        }}
                        role={showIncidentDetail ? 'button' : undefined}
                        tabIndex={showIncidentDetail ? 0 : undefined}
                        aria-expanded={showIncidentDetail ? isExpanded : undefined}
                        aria-label={`${pattern.service_id} — ${RCA_CATEGORY_LABELS[pattern.root_cause] || pattern.root_cause} — ${pattern.frequency} occurrences`}
                      >
                        {/* Service */}
                        <div
                          className="px-4 py-3 flex items-center gap-2 min-w-0"
                          style={{ width: compact ? '30%' : '24%' }}
                        >
                          {pattern.is_flagged && (
                            <svg
                              className="w-4 h-4 text-severity-critical flex-shrink-0 animate-pulse"
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
                          )}
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-dashboard-text-primary truncate block">
                              {pattern.service_id}
                            </span>
                            {pattern.domain_id && (
                              <span className="text-[10px] text-dashboard-text-muted truncate block">
                                {pattern.domain_id}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Root Cause */}
                        <div
                          className="px-4 py-3"
                          style={{ width: compact ? '20%' : '16%' }}
                        >
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${rcaColor}15`,
                              color: rcaColor,
                            }}
                          >
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: rcaColor }}
                            />
                            {(RCA_CATEGORY_LABELS[pattern.root_cause] || pattern.root_cause).split(' ')[0]}
                          </span>
                        </div>

                        {/* Frequency */}
                        <div
                          className="px-4 py-3 text-center"
                          style={{ width: '10%' }}
                        >
                          <span
                            className={`text-sm font-bold ${getFrequencyColorClass(pattern.frequency, pattern.is_flagged)}`}
                          >
                            {pattern.frequency}×
                          </span>
                        </div>

                        {/* Highest Severity */}
                        <div
                          className="px-4 py-3 text-center"
                          style={{ width: '12%' }}
                        >
                          <StatusBadge
                            status={pattern.highest_severity || 'P4'}
                            size="sm"
                          />
                        </div>

                        {/* Severity Breakdown (hidden in compact) */}
                        {!compact && (
                          <div
                            className="px-4 py-3 text-center"
                            style={{ width: '12%' }}
                          >
                            <div className="flex items-center justify-center gap-1">
                              {Object.values(SEVERITY_LEVELS).map((level) => {
                                const count = pattern.severity_counts[level] || 0;
                                if (count === 0) return null;
                                return (
                                  <span
                                    key={level}
                                    className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded text-[10px] font-semibold"
                                    style={{
                                      backgroundColor: `${SEVERITY_COLORS[level]}15`,
                                      color: SEVERITY_COLORS[level],
                                    }}
                                    title={`${SEVERITY_LABELS[level]} (${level}): ${count}`}
                                  >
                                    {count}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Avg MTTR (hidden in compact) */}
                        {!compact && (
                          <div
                            className="px-4 py-3 text-right"
                            style={{ width: '10%' }}
                          >
                            <span
                              className={`text-sm font-medium ${getMTTRColorClass(pattern.avg_mttr)}`}
                            >
                              {pattern.avg_mttr != null
                                ? `${formatNumber(pattern.avg_mttr, { decimals: 0 })}m`
                                : '—'}
                            </span>
                          </div>
                        )}

                        {/* Last Occurrence */}
                        <div
                          className="px-4 py-3 text-right flex items-center justify-end gap-2"
                          style={{ width: compact ? '18%' : '14%' }}
                        >
                          <span className="text-xs text-dashboard-text-muted">
                            {pattern.last_occurrence
                              ? getRelativeTime(pattern.last_occurrence)
                              : '—'}
                          </span>
                          {showIncidentDetail && (
                            <svg
                              className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-200 flex-shrink-0 ${
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

                      {/* Expanded Incident Detail */}
                      {showIncidentDetail && isExpanded && pattern.incidents.length > 0 && (
                        <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                          <div className="px-4 py-2">
                            <div className="flex items-center gap-2 mb-2">
                              <h6 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                Incident History
                              </h6>
                              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                                {pattern.incidents.length}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {pattern.incidents.map((incident) => (
                                <div
                                  key={incident.incident_id}
                                  className="flex items-start justify-between gap-3 px-3 py-2 rounded-md border border-dashboard-border bg-white hover:bg-gray-50/50 transition-colors duration-150"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <StatusBadge
                                        status={incident.severity || 'P4'}
                                        size="sm"
                                      />
                                      <StatusBadge
                                        status={incident.status || 'unknown'}
                                        size="sm"
                                      />
                                    </div>
                                    <p className="text-xs font-medium text-dashboard-text-primary truncate">
                                      {incident.title || incident.incident_id}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-dashboard-text-muted">
                                      {incident.start_time && (
                                        <span>{getRelativeTime(incident.start_time)}</span>
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
                                      {incident.mttd != null && (
                                        <span>
                                          MTTD:{' '}
                                          <span className="font-medium text-dashboard-text-secondary">
                                            {formatNumber(incident.mttd, { decimals: 0 })} min
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                    {incident.description && (
                                      <p className="text-[10px] text-dashboard-text-muted mt-1 line-clamp-2">
                                        {incident.description}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-dashboard-text-muted font-mono flex-shrink-0">
                                    {incident.incident_id}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              {sortedPatterns.length} pattern{sortedPatterns.length !== 1 ? 's' : ''} detected
            </span>
            <span>·</span>
            <span>
              {summary.totalIncidentsInPatterns} total incidents
            </span>
            <span>·</span>
            <span>
              {timeWindow === '24h'
                ? 'Last 24 Hours'
                : timeWindow === '7d'
                  ? 'Last 7 Days'
                  : 'Last 30 Days'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            {summary.topRootCause && (
              <span>
                Top RCA:{' '}
                <span
                  className="font-medium"
                  style={{ color: RCA_CATEGORY_COLORS[summary.topRootCause] || '#6b7280' }}
                >
                  {(RCA_CATEGORY_LABELS[summary.topRootCause] || summary.topRootCause).split(' ')[0]}
                </span>
              </span>
            )}
            <span>
              Flag threshold: ≥{flagThreshold}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { FailurePatterns };
export default FailurePatterns;