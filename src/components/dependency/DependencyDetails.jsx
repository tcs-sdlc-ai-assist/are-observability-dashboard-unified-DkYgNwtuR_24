import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { MetricCard } from '../shared/MetricCard';
import { StatusBadge } from '../shared/StatusBadge';
import { TrendArrow } from '../shared/TrendArrow';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatPercentage, formatNumber, formatTimestamp } from '../../utils/formatters';
import { getRelativeTime } from '../../utils/dateUtils';

/**
 * DependencyDetails - Side panel component showing details for a selected service
 * node in the dependency map. Displays service name, domain, tier, health status,
 * golden signals, dependencies (upstream/downstream), and current incidents.
 *
 * Features:
 * - Service identity: name, ID, domain, tier, status badge
 * - Health metrics: availability, error budget, SLA/SLO targets
 * - Golden signals summary (latency, traffic, errors, saturation)
 * - Upstream dependencies list (services this service depends on)
 * - Downstream dependents list (services that depend on this service)
 * - Blast radius summary (total impacted services)
 * - Current/recent incidents for the selected service
 * - Collapsible sections for dependencies and incidents
 * - Close button to deselect the node
 * - Loading and empty states
 * - Responsive layout with compact mode support
 *
 * @param {Object} props
 * @param {Object} [props.service] - The selected service object with enriched data.
 * @param {string} [props.service.service_id] - The service ID.
 * @param {string} [props.service.name] - The service display name.
 * @param {string} [props.service.domain_id] - The domain ID.
 * @param {string} [props.service.domain_name] - The domain display name.
 * @param {string} [props.service.domain_tier] - The domain tier.
 * @param {string} [props.service.status] - The service health status.
 * @param {number} [props.service.availability] - The service availability percentage.
 * @param {number} [props.service.error_budget] - The error budget remaining percentage.
 * @param {number} [props.service.sla] - The SLA target.
 * @param {number} [props.service.slo] - The SLO target.
 * @param {Object} [props.service.golden_signals] - The golden signals object.
 * @param {Set} [props.upstreamIds] - Set of upstream service IDs.
 * @param {Set} [props.downstreamIds] - Set of downstream service IDs.
 * @param {Function} [props.onClose] - Callback to close/deselect the detail panel.
 * @param {Function} [props.onNodeSelect] - Callback when a dependency node is clicked. Receives (serviceId).
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @returns {React.ReactNode}
 */
const DependencyDetails = ({
  service,
  upstreamIds,
  downstreamIds,
  onClose,
  onNodeSelect,
  compact = false,
  className = '',
}) => {
  const { domains, dashboardData, isLoading } = useDashboard();
  const [expandedSections, setExpandedSections] = useState({
    metrics: true,
    goldenSignals: true,
    upstream: true,
    downstream: true,
    incidents: true,
  });

  /**
   * Toggle the expanded state of a collapsible section.
   * @param {string} sectionKey - The section key to toggle.
   */
  const toggleSection = useCallback((sectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }, []);

  /**
   * Handle close button click.
   */
  const handleClose = useCallback(() => {
    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  /**
   * Handle clicking on a dependency node to select it.
   * @param {string} serviceId - The service ID to select.
   */
  const handleNodeClick = useCallback(
    (serviceId) => {
      if (onNodeSelect && typeof onNodeSelect === 'function') {
        onNodeSelect(serviceId);
      }
    },
    [onNodeSelect],
  );

  /**
   * Build a service lookup map from domains for resolving dependency names.
   */
  const serviceLookup = useMemo(() => {
    const map = new Map();

    if (!domains || !Array.isArray(domains)) {
      return map;
    }

    for (const domain of domains) {
      for (const svc of domain.services || []) {
        map.set(svc.service_id, {
          ...svc,
          domain_id: domain.domain_id,
          domain_name: domain.name,
          domain_tier: domain.tier,
        });
      }
    }

    return map;
  }, [domains]);

  /**
   * Resolve upstream service details from IDs.
   */
  const upstreamServices = useMemo(() => {
    if (!upstreamIds || upstreamIds.size === 0) {
      return [];
    }

    return Array.from(upstreamIds)
      .map((id) => {
        const svc = serviceLookup.get(id);
        return svc
          ? {
              service_id: svc.service_id,
              name: svc.name || id,
              status: svc.status || SERVICE_STATUS.UNKNOWN,
              availability: svc.availability ?? null,
              domain_name: svc.domain_name || '',
              domain_tier: svc.domain_tier || DOMAIN_TIERS.SUPPORTING,
            }
          : {
              service_id: id,
              name: id,
              status: SERVICE_STATUS.UNKNOWN,
              availability: null,
              domain_name: '',
              domain_tier: DOMAIN_TIERS.SUPPORTING,
            };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [upstreamIds, serviceLookup]);

  /**
   * Resolve downstream service details from IDs.
   */
  const downstreamServices = useMemo(() => {
    if (!downstreamIds || downstreamIds.size === 0) {
      return [];
    }

    return Array.from(downstreamIds)
      .map((id) => {
        const svc = serviceLookup.get(id);
        return svc
          ? {
              service_id: svc.service_id,
              name: svc.name || id,
              status: svc.status || SERVICE_STATUS.UNKNOWN,
              availability: svc.availability ?? null,
              domain_name: svc.domain_name || '',
              domain_tier: svc.domain_tier || DOMAIN_TIERS.SUPPORTING,
            }
          : {
              service_id: id,
              name: id,
              status: SERVICE_STATUS.UNKNOWN,
              availability: null,
              domain_name: '',
              domain_tier: DOMAIN_TIERS.SUPPORTING,
            };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [downstreamIds, serviceLookup]);

  /**
   * Get incidents for the selected service.
   */
  const serviceIncidents = useMemo(() => {
    if (!service || !service.service_id || !dashboardData || !dashboardData.incidents) {
      return [];
    }

    return dashboardData.incidents
      .filter((inc) => inc.service_id === service.service_id)
      .sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);
  }, [service, dashboardData]);

  /**
   * Get the blast radius total count.
   */
  const blastRadiusCount = useMemo(() => {
    const upCount = upstreamIds ? upstreamIds.size : 0;
    const downCount = downstreamIds ? downstreamIds.size : 0;
    return upCount + downCount;
  }, [upstreamIds, downstreamIds]);

  /**
   * Get the status color class for a service status.
   * @param {string} status - The service status.
   * @returns {string} Tailwind CSS class.
   */
  const getStatusDotClass = useCallback((status) => {
    switch (status) {
      case SERVICE_STATUS.HEALTHY:
        return 'bg-status-healthy';
      case SERVICE_STATUS.DEGRADED:
        return 'bg-status-degraded';
      case SERVICE_STATUS.DOWN:
        return 'bg-status-down animate-pulse';
      case SERVICE_STATUS.MAINTENANCE:
        return 'bg-status-maintenance';
      default:
        return 'bg-status-unknown';
    }
  }, []);

  /**
   * Get the availability color class based on value and target.
   * @param {number} availability - The availability percentage.
   * @param {number} slaTarget - The SLA target percentage.
   * @returns {string} Tailwind text color class.
   */
  const getAvailabilityColorClass = useCallback((availability, slaTarget) => {
    if (availability == null || isNaN(availability)) return 'text-dashboard-text-muted';
    if (availability >= slaTarget) return 'text-status-healthy';
    if (availability >= slaTarget - 0.1) return 'text-status-degraded';
    return 'text-severity-critical';
  }, []);

  /**
   * Get the error budget color class.
   * @param {number} budget - The error budget percentage.
   * @returns {string} Tailwind text color class.
   */
  const getBudgetColorClass = useCallback((budget) => {
    if (budget == null || isNaN(budget)) return 'text-dashboard-text-muted';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) return 'text-severity-critical';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Render a collapsible section header.
   * @param {string} sectionKey - The section key.
   * @param {string} title - The section title.
   * @param {number} [count] - Optional count badge.
   * @returns {React.ReactNode}
   */
  const renderSectionHeader = useCallback(
    (sectionKey, title, count) => {
      const isExpanded = expandedSections[sectionKey];

      return (
        <button
          onClick={() => toggleSection(sectionKey)}
          className="flex items-center justify-between gap-2 w-full py-2 text-left group"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title} section`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted group-hover:text-dashboard-text-secondary transition-colors duration-150">
              {title}
            </h5>
            {count != null && count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {count}
              </span>
            )}
          </div>
          <svg
            className={`w-3.5 h-3.5 text-dashboard-text-muted transition-transform duration-200 ${
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
        </button>
      );
    },
    [expandedSections, toggleSection],
  );

  /**
   * Render a dependency service row.
   * @param {Object} svc - The dependency service object.
   * @param {'upstream'|'downstream'} direction - The dependency direction.
   * @returns {React.ReactNode}
   */
  const renderDependencyRow = useCallback(
    (svc, direction) => {
      const isClickable = typeof onNodeSelect === 'function';

      return (
        <div
          key={svc.service_id}
          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md transition-colors duration-150 ${
            isClickable
              ? 'cursor-pointer hover:bg-gray-100'
              : ''
          }`}
          onClick={isClickable ? () => handleNodeClick(svc.service_id) : undefined}
          onKeyDown={
            isClickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(svc.service_id);
                  }
                }
              : undefined
          }
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          aria-label={`${direction === 'upstream' ? 'Upstream dependency' : 'Downstream dependent'}: ${svc.name}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotClass(svc.status)}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-dashboard-text-primary truncate block">
                {svc.name}
              </span>
              {svc.domain_name && (
                <span className="text-[10px] text-dashboard-text-muted truncate block">
                  {svc.domain_name}
                  {svc.domain_tier && (
                    <span className="ml-1">
                      · {DOMAIN_TIER_LABELS[svc.domain_tier] || svc.domain_tier}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {svc.availability != null && (
              <span
                className={`text-xs font-medium ${getAvailabilityColorClass(
                  svc.availability,
                  DEFAULT_SLA_TARGETS[svc.domain_tier] ?? 99.9,
                )}`}
              >
                {formatPercentage(svc.availability, 2)}
              </span>
            )}
            {direction === 'upstream' && (
              <svg
                className="w-3 h-3 text-brand-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                />
              </svg>
            )}
            {direction === 'downstream' && (
              <svg
                className="w-3 h-3 text-orange-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25"
                />
              </svg>
            )}
          </div>
        </div>
      );
    },
    [getStatusDotClass, getAvailabilityColorClass, handleNodeClick, onNodeSelect],
  );

  // No service selected
  if (!service) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No service selected"
          description="Click on a service node in the dependency map to view its details."
          size="sm"
          compact
        />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading service details…" size="sm" />
      </div>
    );
  }

  const statusStr = service.status || 'unknown';
  const slaTarget = service.sla ?? DEFAULT_SLA_TARGETS[service.domain_tier] ?? 99.9;
  const sloTarget = service.slo ?? DEFAULT_SLO_TARGETS[service.domain_tier] ?? 99.5;
  const goldenSignals = service.golden_signals || {};

  return (
    <div className={`bg-white border border-dashboard-border rounded-lg shadow-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-dashboard-border">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className={`inline-block w-3 h-3 rounded-full flex-shrink-0 mt-1 ${getStatusDotClass(statusStr)}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-dashboard-text-primary truncate">
              {service.name || service.label || service.service_id}
            </h4>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <StatusBadge status={statusStr} size="sm" />
              {service.domain_name && (
                <span className="text-xs text-dashboard-text-muted">
                  {service.domain_name}
                </span>
              )}
              {(service.domain_tier || service.tier) && (
                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-gray-100 text-dashboard-text-muted">
                  {DOMAIN_TIER_LABELS[service.domain_tier || service.tier] ||
                    service.domain_tier ||
                    service.tier}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-dashboard-text-muted font-mono">
                {service.service_id || service.id}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-7 h-7 rounded-md text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary transition-colors duration-150 flex-shrink-0 -mt-0.5 -mr-1"
          aria-label="Close detail panel"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: compact ? '400px' : '600px' }}>
        {/* Blast Radius Summary */}
        {blastRadiusCount > 0 && (
          <div className="px-4 py-2.5 border-b border-dashboard-border bg-brand-50/30">
            <div className="flex items-center gap-2 text-xs">
              <svg
                className="w-3.5 h-3.5 text-brand-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span className="text-brand-700 font-medium">
                Blast radius: {blastRadiusCount} service{blastRadiusCount !== 1 ? 's' : ''}
              </span>
              <span className="text-dashboard-text-muted">
                ({upstreamServices.length} upstream · {downstreamServices.length} downstream)
              </span>
            </div>
          </div>
        )}

        {/* Health Metrics Section */}
        <div className="px-4 pt-3 pb-1">
          {renderSectionHeader('metrics', 'Health Metrics')}
          {expandedSections.metrics && (
            <div className={`grid gap-2 pb-3 ${compact ? 'grid-cols-2' : 'grid-cols-2'}`}>
              <MetricCard
                title="Availability"
                value={service.availability}
                unit="%"
                size="sm"
                status={
                  statusStr === SERVICE_STATUS.HEALTHY
                    ? 'healthy'
                    : statusStr === SERVICE_STATUS.DEGRADED
                      ? 'degraded'
                      : statusStr === SERVICE_STATUS.DOWN
                        ? 'critical'
                        : undefined
                }
              />
              <MetricCard
                title="Error Budget"
                value={service.error_budget}
                unit="%"
                size="sm"
                status={
                  service.error_budget != null &&
                  service.error_budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL
                    ? 'critical'
                    : service.error_budget != null &&
                        service.error_budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING
                      ? 'warning'
                      : undefined
                }
              />
              <div className="flex items-center justify-between gap-1 px-3 py-2 bg-gray-50 rounded-lg border border-dashboard-border">
                <span className="text-[10px] font-medium uppercase tracking-wider text-dashboard-text-muted">
                  SLA Target
                </span>
                <span className="text-sm font-semibold text-dashboard-text-secondary">
                  {formatPercentage(slaTarget, 2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 px-3 py-2 bg-gray-50 rounded-lg border border-dashboard-border">
                <span className="text-[10px] font-medium uppercase tracking-wider text-dashboard-text-muted">
                  SLO Target
                </span>
                <span className="text-sm font-semibold text-dashboard-text-secondary">
                  {formatPercentage(sloTarget, 2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Golden Signals Section */}
        {Object.keys(goldenSignals).length > 0 && (
          <div className="px-4 pt-1 pb-1 border-t border-dashboard-border">
            {renderSectionHeader('goldenSignals', 'Golden Signals')}
            {expandedSections.goldenSignals && (
              <div className="grid grid-cols-2 gap-2 pb-3">
                {goldenSignals.latency_p95 != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">P95 Latency</span>
                    <span className="text-xs font-medium text-dashboard-text-primary">
                      {formatNumber(goldenSignals.latency_p95, { decimals: 1 })} ms
                    </span>
                  </div>
                )}
                {goldenSignals.latency_p99 != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">P99 Latency</span>
                    <span className="text-xs font-medium text-dashboard-text-primary">
                      {formatNumber(goldenSignals.latency_p99, { decimals: 1 })} ms
                    </span>
                  </div>
                )}
                {goldenSignals.traffic_rps != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">Traffic</span>
                    <span className="text-xs font-medium text-dashboard-text-primary">
                      {formatNumber(goldenSignals.traffic_rps, { decimals: 0 })} rps
                    </span>
                  </div>
                )}
                {goldenSignals.errors_5xx != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">5xx Errors</span>
                    <span
                      className={`text-xs font-medium ${
                        goldenSignals.errors_5xx > 10
                          ? 'text-severity-critical'
                          : 'text-dashboard-text-primary'
                      }`}
                    >
                      {formatNumber(goldenSignals.errors_5xx, { decimals: 0 })}
                    </span>
                  </div>
                )}
                {goldenSignals.errors_functional != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">Func Errors</span>
                    <span
                      className={`text-xs font-medium ${
                        goldenSignals.errors_functional > 20
                          ? 'text-severity-critical'
                          : 'text-dashboard-text-primary'
                      }`}
                    >
                      {formatNumber(goldenSignals.errors_functional, { decimals: 0 })}
                    </span>
                  </div>
                )}
                {goldenSignals.saturation_cpu != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">CPU</span>
                    <span
                      className={`text-xs font-medium ${
                        goldenSignals.saturation_cpu > 80
                          ? 'text-severity-critical'
                          : goldenSignals.saturation_cpu > 60
                            ? 'text-status-degraded'
                            : 'text-dashboard-text-primary'
                      }`}
                    >
                      {formatPercentage(goldenSignals.saturation_cpu, 1)}
                    </span>
                  </div>
                )}
                {goldenSignals.saturation_mem != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">Memory</span>
                    <span
                      className={`text-xs font-medium ${
                        goldenSignals.saturation_mem > 80
                          ? 'text-severity-critical'
                          : goldenSignals.saturation_mem > 60
                            ? 'text-status-degraded'
                            : 'text-dashboard-text-primary'
                      }`}
                    >
                      {formatPercentage(goldenSignals.saturation_mem, 1)}
                    </span>
                  </div>
                )}
                {goldenSignals.saturation_queue != null && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white rounded border border-dashboard-border">
                    <span className="text-[10px] text-dashboard-text-muted">Queue</span>
                    <span
                      className={`text-xs font-medium ${
                        goldenSignals.saturation_queue > 70
                          ? 'text-severity-critical'
                          : goldenSignals.saturation_queue > 50
                            ? 'text-status-degraded'
                            : 'text-dashboard-text-primary'
                      }`}
                    >
                      {formatPercentage(goldenSignals.saturation_queue, 1)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Upstream Dependencies Section */}
        <div className="px-4 pt-1 pb-1 border-t border-dashboard-border">
          {renderSectionHeader('upstream', 'Upstream Dependencies', upstreamServices.length)}
          {expandedSections.upstream && (
            <div className="pb-3">
              {upstreamServices.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {upstreamServices.map((svc) => renderDependencyRow(svc, 'upstream'))}
                </div>
              ) : (
                <p className="text-xs text-dashboard-text-muted py-2 text-center">
                  No upstream dependencies
                </p>
              )}
            </div>
          )}
        </div>

        {/* Downstream Dependents Section */}
        <div className="px-4 pt-1 pb-1 border-t border-dashboard-border">
          {renderSectionHeader('downstream', 'Downstream Dependents', downstreamServices.length)}
          {expandedSections.downstream && (
            <div className="pb-3">
              {downstreamServices.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {downstreamServices.map((svc) => renderDependencyRow(svc, 'downstream'))}
                </div>
              ) : (
                <p className="text-xs text-dashboard-text-muted py-2 text-center">
                  No downstream dependents
                </p>
              )}
            </div>
          )}
        </div>

        {/* Incidents Section */}
        <div className="px-4 pt-1 pb-1 border-t border-dashboard-border">
          {renderSectionHeader('incidents', 'Recent Incidents', serviceIncidents.length)}
          {expandedSections.incidents && (
            <div className="pb-3">
              {serviceIncidents.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {serviceIncidents.map((incident) => (
                    <div
                      key={incident.incident_id}
                      className="px-2.5 py-2 rounded-md border border-dashboard-border bg-gray-50/50 hover:bg-gray-50 transition-colors duration-150"
                    >
                      <div className="flex items-start justify-between gap-2">
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
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-dashboard-text-muted">
                        {incident.start_time && (
                          <span title={formatTimestamp(incident.start_time)}>
                            {getRelativeTime(incident.start_time)}
                          </span>
                        )}
                        {incident.root_cause && (
                          <span>
                            RCA:{' '}
                            <span className="font-medium text-dashboard-text-secondary">
                              {incident.root_cause}
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
                      {incident.description && (
                        <p className="text-[10px] text-dashboard-text-muted mt-1 line-clamp-2">
                          {incident.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-4">
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
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
        <div className="flex items-center gap-3 text-[10px] text-dashboard-text-muted">
          <span>
            {upstreamServices.length} upstream · {downstreamServices.length} downstream
          </span>
          {serviceIncidents.length > 0 && (
            <span>· {serviceIncidents.length} incident{serviceIncidents.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <span className="text-[10px] text-dashboard-text-muted font-mono truncate max-w-[120px]">
          {service.service_id || service.id}
        </span>
      </div>
    </div>
  );
};

export { DependencyDetails };
export default DependencyDetails;