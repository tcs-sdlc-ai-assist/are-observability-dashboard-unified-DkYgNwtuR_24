import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { MetricCard } from '../shared/MetricCard';
import { StatusBadge } from '../shared/StatusBadge';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_ORDER,
  DOMAIN_TIER_LABELS,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatPercentage, formatNumber } from '../../utils/formatters';

/**
 * AvailabilityOverview - Executive availability snapshot widget displaying
 * overall platform availability, per-domain availability with tier grouping,
 * color-coded status indicators, and SLA/SLO compliance badges.
 *
 * Features:
 * - Overall platform availability metric card with trend
 * - Availability breakdown by domain tier (Critical, Core, Supporting)
 * - Per-domain availability with SLA/SLO compliance indicators
 * - Per-service drill-down within each domain
 * - Color-coded health status indicators
 * - Responsive grid layout
 * - Expandable domain cards to show service-level detail
 * - Loading and empty states
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.showServiceDetail=true] - Whether to allow expanding domains to show service-level detail.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @returns {React.ReactNode}
 */
const AvailabilityOverview = ({ className = '', showServiceDetail = true, compact = false }) => {
  const { filteredDomains, isLoading, error } = useDashboard();
  const [expandedDomains, setExpandedDomains] = useState({});

  /**
   * Toggle the expanded state of a domain card.
   * @param {string} domainId - The domain ID to toggle.
   */
  const toggleDomain = useCallback(
    (domainId) => {
      if (!showServiceDetail) {
        return;
      }

      setExpandedDomains((prev) => ({
        ...prev,
        [domainId]: !prev[domainId],
      }));
    },
    [showServiceDetail],
  );

  /**
   * Compute overall platform availability as a weighted average across all services.
   */
  const overallAvailability = useMemo(() => {
    if (!filteredDomains || !Array.isArray(filteredDomains) || filteredDomains.length === 0) {
      return null;
    }

    const allServices = filteredDomains.flatMap((domain) => domain.services || []);

    if (allServices.length === 0) {
      return null;
    }

    const totalAvailability = allServices.reduce(
      (sum, service) => sum + (service.availability != null ? service.availability : 0),
      0,
    );

    return parseFloat((totalAvailability / allServices.length).toFixed(2));
  }, [filteredDomains]);

  /**
   * Compute sparkline data from service availabilities for the overall metric card.
   */
  const overallSparkData = useMemo(() => {
    if (!filteredDomains || !Array.isArray(filteredDomains) || filteredDomains.length === 0) {
      return null;
    }

    // Generate spark data from per-domain average availabilities
    const domainAvgs = filteredDomains
      .map((domain) => {
        const services = domain.services || [];
        if (services.length === 0) return null;
        const avg = services.reduce((sum, s) => sum + (s.availability || 0), 0) / services.length;
        return parseFloat(avg.toFixed(2));
      })
      .filter((v) => v !== null);

    return domainAvgs.length >= 2 ? domainAvgs : null;
  }, [filteredDomains]);

  /**
   * Group domains by tier and compute tier-level aggregates.
   */
  const tierGroups = useMemo(() => {
    if (!filteredDomains || !Array.isArray(filteredDomains) || filteredDomains.length === 0) {
      return [];
    }

    const tierMap = new Map();

    for (const domain of filteredDomains) {
      const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;

      if (!tierMap.has(tier)) {
        tierMap.set(tier, {
          tier,
          label: DOMAIN_TIER_LABELS[tier] || tier,
          order: DOMAIN_TIER_ORDER[tier] ?? 99,
          slaTarget: DEFAULT_SLA_TARGETS[tier] ?? 99.9,
          sloTarget: DEFAULT_SLO_TARGETS[tier] ?? 99.5,
          domains: [],
          totalServices: 0,
          healthyServices: 0,
          degradedServices: 0,
          downServices: 0,
          avgAvailability: 0,
        });
      }

      const group = tierMap.get(tier);
      const services = domain.services || [];

      const domainAvailability =
        services.length > 0
          ? parseFloat(
              (
                services.reduce((sum, s) => sum + (s.availability || 0), 0) / services.length
              ).toFixed(2),
            )
          : 0;

      const healthyCount = services.filter((s) => s.status === SERVICE_STATUS.HEALTHY).length;
      const degradedCount = services.filter((s) => s.status === SERVICE_STATUS.DEGRADED).length;
      const downCount = services.filter((s) => s.status === SERVICE_STATUS.DOWN).length;

      const slaCompliant = domainAvailability >= (DEFAULT_SLA_TARGETS[tier] ?? 99.9);
      const sloCompliant = domainAvailability >= (DEFAULT_SLO_TARGETS[tier] ?? 99.5);

      group.domains.push({
        domain_id: domain.domain_id,
        name: domain.name,
        tier: domain.tier,
        availability: domainAvailability,
        slaTarget: DEFAULT_SLA_TARGETS[tier] ?? 99.9,
        sloTarget: DEFAULT_SLO_TARGETS[tier] ?? 99.5,
        slaCompliant,
        sloCompliant,
        services,
        totalServices: services.length,
        healthyServices: healthyCount,
        degradedServices: degradedCount,
        downServices: downCount,
      });

      group.totalServices += services.length;
      group.healthyServices += healthyCount;
      group.degradedServices += degradedCount;
      group.downServices += downCount;
    }

    // Compute tier-level average availability
    for (const group of tierMap.values()) {
      if (group.domains.length > 0) {
        group.avgAvailability = parseFloat(
          (
            group.domains.reduce((sum, d) => sum + d.availability, 0) / group.domains.length
          ).toFixed(2),
        );
      }
    }

    // Sort by tier order
    return Array.from(tierMap.values()).sort((a, b) => a.order - b.order);
  }, [filteredDomains]);

  /**
   * Compute summary counts for the overview header.
   */
  const summary = useMemo(() => {
    if (!filteredDomains || !Array.isArray(filteredDomains) || filteredDomains.length === 0) {
      return {
        totalDomains: 0,
        totalServices: 0,
        healthyServices: 0,
        degradedServices: 0,
        downServices: 0,
        slaBreaches: 0,
      };
    }

    let totalServices = 0;
    let healthyServices = 0;
    let degradedServices = 0;
    let downServices = 0;
    let slaBreaches = 0;

    for (const domain of filteredDomains) {
      const services = domain.services || [];
      const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;
      const slaTarget = DEFAULT_SLA_TARGETS[tier] ?? 99.9;

      totalServices += services.length;

      for (const service of services) {
        if (service.status === SERVICE_STATUS.HEALTHY) healthyServices++;
        else if (service.status === SERVICE_STATUS.DEGRADED) degradedServices++;
        else if (service.status === SERVICE_STATUS.DOWN) downServices++;

        if (service.availability != null && service.availability < slaTarget) {
          slaBreaches++;
        }
      }
    }

    return {
      totalDomains: filteredDomains.length,
      totalServices,
      healthyServices,
      degradedServices,
      downServices,
      slaBreaches,
    };
  }, [filteredDomains]);

  /**
   * Determine the overall platform health status.
   */
  const platformStatus = useMemo(() => {
    if (summary.downServices > 0) return 'critical';
    if (summary.degradedServices > 0) return 'warning';
    if (summary.totalServices === 0) return 'unknown';
    return 'healthy';
  }, [summary]);

  /**
   * Get the availability color class based on the value and target.
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
   * Get the service health status string for a domain.
   * @param {Object} domainData - The domain data object.
   * @returns {string} Status string.
   */
  const getDomainStatus = useCallback((domainData) => {
    if (domainData.downServices > 0) return 'down';
    if (domainData.degradedServices > 0) return 'degraded';
    if (domainData.totalServices === 0) return 'unknown';
    return 'healthy';
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading availability data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load availability data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state
  if (!filteredDomains || filteredDomains.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No availability data"
          description="No domain or service data is available. Upload metrics data to populate the availability overview."
          size="md"
        />
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            Availability Overview
          </h3>
          <StatusBadge
            status={platformStatus}
            size="sm"
            label={
              platformStatus === 'healthy'
                ? 'All Systems Operational'
                : platformStatus === 'warning'
                  ? 'Degraded Performance'
                  : platformStatus === 'critical'
                    ? 'Service Disruption'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
            {summary.healthyServices} Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
            {summary.degradedServices} Degraded
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-down animate-pulse" />
            {summary.downServices} Down
          </span>
        </div>
      </div>

      {/* Top-Level Metric Cards */}
      <div
        className={`grid gap-4 mb-6 ${compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}
      >
        <MetricCard
          title="Platform Availability"
          value={overallAvailability}
          unit="%"
          size={compact ? 'sm' : 'md'}
          status={platformStatus}
          sparkData={overallSparkData}
          trend={{
            direction:
              overallAvailability != null && overallAvailability >= 99.9 ? 'stable' : 'down',
            invertColor: true,
          }}
        />
        <MetricCard
          title="Total Services"
          value={summary.totalServices}
          unit="count"
          size={compact ? 'sm' : 'md'}
          subtitle={`${summary.totalDomains} domains`}
        />
        <MetricCard
          title="SLA Breaches"
          value={summary.slaBreaches}
          unit="count"
          size={compact ? 'sm' : 'md'}
          status={summary.slaBreaches > 0 ? 'critical' : 'healthy'}
          trend={{
            direction: summary.slaBreaches > 0 ? 'up' : 'stable',
            invertColor: false,
          }}
        />
        <MetricCard
          title="Service Health"
          value={
            summary.totalServices > 0
              ? parseFloat(((summary.healthyServices / summary.totalServices) * 100).toFixed(1))
              : 0
          }
          unit="%"
          size={compact ? 'sm' : 'md'}
          status={
            summary.totalServices > 0 && summary.healthyServices === summary.totalServices
              ? 'healthy'
              : summary.downServices > 0
                ? 'critical'
                : 'degraded'
          }
          trend={{
            direction:
              summary.totalServices > 0 && summary.healthyServices === summary.totalServices
                ? 'stable'
                : 'down',
            invertColor: true,
          }}
        />
      </div>

      {/* Tier-Grouped Domain Cards */}
      <div className="space-y-6">
        {tierGroups.map((tierGroup) => (
          <div key={tierGroup.tier}>
            {/* Tier Header */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  {tierGroup.label} Tier
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {tierGroup.domains.length}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span>
                  SLA Target:{' '}
                  <span className="font-medium text-dashboard-text-secondary">
                    {formatPercentage(tierGroup.slaTarget, 2)}
                  </span>
                </span>
                <span>
                  Avg:{' '}
                  <span
                    className={`font-medium ${getAvailabilityColorClass(tierGroup.avgAvailability, tierGroup.slaTarget)}`}
                  >
                    {formatPercentage(tierGroup.avgAvailability, 2)}
                  </span>
                </span>
              </div>
            </div>

            {/* Domain Cards Grid */}
            <div
              className={`grid gap-3 items-stretch ${compact ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}
            >
              {tierGroup.domains.map((domainData) => {
                const isExpanded = expandedDomains[domainData.domain_id] || false;
                const domainStatus = getDomainStatus(domainData);

                return (
                  <div
                    key={domainData.domain_id}
                    className={`dashboard-card overflow-hidden h-full ${
                      showServiceDetail ? 'cursor-pointer' : ''
                    }`}
                  >
                    {/* Domain Header */}
                    <div
                      className={`flex items-center justify-between gap-3 p-4 ${
                        showServiceDetail
                          ? 'hover:bg-gray-50/50 transition-colors duration-150'
                          : ''
                      }`}
                      onClick={() => toggleDomain(domainData.domain_id)}
                      onKeyDown={(e) => {
                        if (showServiceDetail && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          toggleDomain(domainData.domain_id);
                        }
                      }}
                      role={showServiceDetail ? 'button' : undefined}
                      tabIndex={showServiceDetail ? 0 : undefined}
                      aria-expanded={showServiceDetail ? isExpanded : undefined}
                      aria-label={`${domainData.name} domain — ${formatPercentage(domainData.availability, 2)} availability`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Status dot */}
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            domainStatus === 'healthy'
                              ? 'bg-status-healthy'
                              : domainStatus === 'degraded'
                                ? 'bg-status-degraded'
                                : domainStatus === 'down'
                                  ? 'bg-status-down animate-pulse'
                                  : 'bg-status-unknown'
                          }`}
                          aria-hidden="true"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className="text-sm font-semibold text-dashboard-text-primary truncate">
                              {domainData.name}
                            </h5>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-dashboard-text-muted">
                              {domainData.totalServices}{' '}
                              {domainData.totalServices === 1 ? 'service' : 'services'}
                            </span>
                            {/* SLA Compliance Badge */}
                            {domainData.slaCompliant ? (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                                SLA ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                SLA ✗
                              </span>
                            )}
                            {/* SLO Compliance Badge */}
                            {domainData.sloCompliant ? (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-700">
                                SLO ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-yellow-50 text-yellow-800">
                                SLO ✗
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Availability Value */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-lg font-bold leading-none ${getAvailabilityColorClass(domainData.availability, domainData.slaTarget)}`}
                        >
                          {formatPercentage(domainData.availability, 2)}
                        </span>

                        {/* Expand/Collapse chevron */}
                        {showServiceDetail && (
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

                    {/* Service Health Bar */}
                    <div className="px-4 pb-3">
                      <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-gray-100">
                        {domainData.totalServices > 0 && (
                          <>
                            {domainData.healthyServices > 0 && (
                              <div
                                className="bg-status-healthy transition-all duration-300"
                                style={{
                                  width: `${(domainData.healthyServices / domainData.totalServices) * 100}%`,
                                }}
                                title={`${domainData.healthyServices} healthy`}
                              />
                            )}
                            {domainData.degradedServices > 0 && (
                              <div
                                className="bg-status-degraded transition-all duration-300"
                                style={{
                                  width: `${(domainData.degradedServices / domainData.totalServices) * 100}%`,
                                }}
                                title={`${domainData.degradedServices} degraded`}
                              />
                            )}
                            {domainData.downServices > 0 && (
                              <div
                                className="bg-status-down transition-all duration-300"
                                style={{
                                  width: `${(domainData.downServices / domainData.totalServices) * 100}%`,
                                }}
                                title={`${domainData.downServices} down`}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded Service Detail */}
                    {showServiceDetail && isExpanded && domainData.services.length > 0 && (
                      <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                        <div className="px-4 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                <th className="text-left py-1.5 pr-2">Service</th>
                                <th className="text-right py-1.5 px-2">Availability</th>
                                <th className="text-right py-1.5 px-2">SLA</th>
                                <th className="text-right py-1.5 px-2">Error Budget</th>
                                <th className="text-center py-1.5 pl-2">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-dashboard-border">
                              {domainData.services.map((service) => {
                                const svcSlaCompliant =
                                  service.availability != null &&
                                  service.sla != null &&
                                  service.availability >= service.sla;

                                return (
                                  <tr
                                    key={service.service_id}
                                    className="hover:bg-white/50 transition-colors duration-150"
                                  >
                                    <td className="py-2 pr-2">
                                      <span className="text-sm text-dashboard-text-primary font-medium truncate block max-w-[160px]">
                                        {service.name}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      <span
                                        className={`text-sm font-semibold ${getAvailabilityColorClass(
                                          service.availability,
                                          service.sla || domainData.slaTarget,
                                        )}`}
                                      >
                                        {service.availability != null
                                          ? formatPercentage(service.availability, 2)
                                          : '—'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      <span className="text-dashboard-text-muted">
                                        {service.sla != null
                                          ? formatPercentage(service.sla, 2)
                                          : '—'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      <span
                                        className={`font-medium ${
                                          service.error_budget != null && service.error_budget <= 10
                                            ? 'text-severity-critical'
                                            : service.error_budget != null &&
                                                service.error_budget <= 25
                                              ? 'text-status-degraded'
                                              : 'text-dashboard-text-secondary'
                                        }`}
                                      >
                                        {service.error_budget != null
                                          ? formatPercentage(service.error_budget, 1)
                                          : '—'}
                                      </span>
                                    </td>
                                    <td className="py-2 pl-2 text-center">
                                      <StatusBadge
                                        status={service.status || 'unknown'}
                                        size="sm"
                                        showDot={true}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { AvailabilityOverview };
export default AvailabilityOverview;
