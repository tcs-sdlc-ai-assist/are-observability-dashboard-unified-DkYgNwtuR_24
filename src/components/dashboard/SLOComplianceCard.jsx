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
 * SLOComplianceCard - Card component showing SLA/SLO compliance status per
 * service and domain with target vs actual values, compliance percentage
 * (2 decimal places), and visual progress bars.
 *
 * Features:
 * - Overall SLA/SLO compliance summary metric cards
 * - Per-domain compliance breakdown with progress bars
 * - Per-service drill-down with target vs actual values
 * - Color-coded compliance indicators (green/yellow/red)
 * - Visual progress bars showing actual vs target
 * - Expandable domain cards for service-level detail
 * - Tier-grouped layout (Critical, Core, Supporting)
 * - Toggle between SLA and SLO views
 * - Loading and empty states
 * - Responsive grid layout
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showServiceDetail=true] - Whether to allow expanding domains to show service-level detail.
 * @param {'sla'|'slo'|'both'} [props.mode='both'] - Which compliance type to display.
 * @returns {React.ReactNode}
 */
const SLOComplianceCard = ({
  className = '',
  compact = false,
  showServiceDetail = true,
  mode = 'both',
}) => {
  const { filteredDomains, isLoading, error } = useDashboard();
  const [expandedDomains, setExpandedDomains] = useState({});
  const [activeView, setActiveView] = useState(mode === 'slo' ? 'slo' : 'sla');

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
   * Handle view toggle between SLA and SLO.
   * @param {string} view - The view to switch to ('sla' or 'slo').
   */
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
  }, []);

  /**
   * Compute per-domain and per-service compliance data.
   */
  const complianceData = useMemo(() => {
    if (!filteredDomains || !Array.isArray(filteredDomains) || filteredDomains.length === 0) {
      return { tierGroups: [], overall: null };
    }

    const tierMap = new Map();
    let totalServices = 0;
    let slaCompliantServices = 0;
    let sloCompliantServices = 0;
    let totalAvailability = 0;

    for (const domain of filteredDomains) {
      const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;
      const slaTarget = DEFAULT_SLA_TARGETS[tier] ?? 99.9;
      const sloTarget = DEFAULT_SLO_TARGETS[tier] ?? 99.5;

      if (!tierMap.has(tier)) {
        tierMap.set(tier, {
          tier,
          label: DOMAIN_TIER_LABELS[tier] || tier,
          order: DOMAIN_TIER_ORDER[tier] ?? 99,
          slaTarget,
          sloTarget,
          domains: [],
          totalServices: 0,
          slaCompliantServices: 0,
          sloCompliantServices: 0,
          avgAvailability: 0,
        });
      }

      const group = tierMap.get(tier);
      const services = domain.services || [];

      const domainServices = services.map((service) => {
        const availability = service.availability != null ? service.availability : 0;
        const serviceSla = service.sla != null ? service.sla : slaTarget;
        const serviceSlo = service.slo != null ? service.slo : sloTarget;
        const isSlaCompliant = availability >= serviceSla;
        const isSloCompliant = availability >= serviceSlo;
        const slaGap = parseFloat((availability - serviceSla).toFixed(4));
        const sloGap = parseFloat((availability - serviceSlo).toFixed(4));

        // Compute progress percentage (capped at 100)
        const slaProgress = serviceSla > 0 ? Math.min(100, (availability / serviceSla) * 100) : 0;
        const sloProgress = serviceSlo > 0 ? Math.min(100, (availability / serviceSlo) * 100) : 0;

        return {
          service_id: service.service_id,
          name: service.name,
          availability,
          sla_target: serviceSla,
          slo_target: serviceSlo,
          sla_compliant: isSlaCompliant,
          slo_compliant: isSloCompliant,
          sla_gap: slaGap,
          slo_gap: sloGap,
          sla_progress: parseFloat(slaProgress.toFixed(2)),
          slo_progress: parseFloat(sloProgress.toFixed(2)),
          error_budget: service.error_budget,
          status: service.status,
        };
      });

      const domainAvailability =
        domainServices.length > 0
          ? parseFloat(
              (
                domainServices.reduce((sum, s) => sum + s.availability, 0) / domainServices.length
              ).toFixed(2),
            )
          : 0;

      const domainSlaCompliant = domainServices.filter((s) => s.sla_compliant).length;
      const domainSloCompliant = domainServices.filter((s) => s.slo_compliant).length;
      const domainIsSlaCompliant =
        domainServices.length > 0 && domainSlaCompliant === domainServices.length;
      const domainIsSloCompliant =
        domainServices.length > 0 && domainSloCompliant === domainServices.length;

      const slaComplianceRate =
        domainServices.length > 0
          ? parseFloat(((domainSlaCompliant / domainServices.length) * 100).toFixed(2))
          : 100;
      const sloComplianceRate =
        domainServices.length > 0
          ? parseFloat(((domainSloCompliant / domainServices.length) * 100).toFixed(2))
          : 100;

      group.domains.push({
        domain_id: domain.domain_id,
        name: domain.name,
        tier: domain.tier,
        availability: domainAvailability,
        sla_target: slaTarget,
        slo_target: sloTarget,
        sla_compliant: domainIsSlaCompliant,
        slo_compliant: domainIsSloCompliant,
        sla_compliance_rate: slaComplianceRate,
        slo_compliance_rate: sloComplianceRate,
        sla_compliant_count: domainSlaCompliant,
        slo_compliant_count: domainSloCompliant,
        total_services: domainServices.length,
        services: domainServices,
      });

      group.totalServices += domainServices.length;
      group.slaCompliantServices += domainSlaCompliant;
      group.sloCompliantServices += domainSloCompliant;

      totalServices += domainServices.length;
      slaCompliantServices += domainSlaCompliant;
      sloCompliantServices += domainSloCompliant;
      totalAvailability += domainServices.reduce((sum, s) => sum + s.availability, 0);
    }

    // Compute tier-level averages
    for (const group of tierMap.values()) {
      if (group.domains.length > 0) {
        group.avgAvailability = parseFloat(
          (
            group.domains.reduce((sum, d) => sum + d.availability, 0) / group.domains.length
          ).toFixed(2),
        );
      }
    }

    const tierGroups = Array.from(tierMap.values()).sort((a, b) => a.order - b.order);

    const overallAvailability =
      totalServices > 0 ? parseFloat((totalAvailability / totalServices).toFixed(2)) : 0;

    const overallSlaComplianceRate =
      totalServices > 0
        ? parseFloat(((slaCompliantServices / totalServices) * 100).toFixed(2))
        : 100;

    const overallSloComplianceRate =
      totalServices > 0
        ? parseFloat(((sloCompliantServices / totalServices) * 100).toFixed(2))
        : 100;

    return {
      tierGroups,
      overall: {
        totalServices,
        slaCompliantServices,
        sloCompliantServices,
        slaNonCompliantServices: totalServices - slaCompliantServices,
        sloNonCompliantServices: totalServices - sloCompliantServices,
        overallAvailability,
        overallSlaComplianceRate,
        overallSloComplianceRate,
      },
    };
  }, [filteredDomains]);

  /**
   * Get the compliance color class based on compliance rate.
   * @param {number} rate - The compliance rate (0-100).
   * @returns {string} Tailwind text color class.
   */
  const getComplianceColorClass = useCallback((rate) => {
    if (rate == null || isNaN(rate)) return 'text-dashboard-text-muted';
    if (rate >= 100) return 'text-status-healthy';
    if (rate >= 80) return 'text-status-degraded';
    return 'text-severity-critical';
  }, []);

  /**
   * Get the progress bar color class based on compliance status.
   * @param {boolean} isCompliant - Whether the service/domain is compliant.
   * @param {number} gap - The gap between actual and target.
   * @returns {string} Tailwind background color class.
   */
  const getProgressBarColorClass = useCallback((isCompliant, gap) => {
    if (isCompliant) return 'bg-status-healthy';
    if (gap != null && gap >= -0.1) return 'bg-status-degraded';
    return 'bg-severity-critical';
  }, []);

  /**
   * Get the availability color class based on value and target.
   * @param {number} availability - The availability percentage.
   * @param {number} target - The target percentage.
   * @returns {string} Tailwind text color class.
   */
  const getAvailabilityColorClass = useCallback((availability, target) => {
    if (availability == null || isNaN(availability)) return 'text-dashboard-text-muted';
    if (availability >= target) return 'text-status-healthy';
    if (availability >= target - 0.1) return 'text-status-degraded';
    return 'text-severity-critical';
  }, []);

  /**
   * Determine the overall compliance status.
   */
  const complianceStatus = useMemo(() => {
    if (!complianceData.overall) return 'unknown';
    const { overallSlaComplianceRate, overallSloComplianceRate } = complianceData.overall;
    const rate = activeView === 'sla' ? overallSlaComplianceRate : overallSloComplianceRate;
    if (rate >= 100) return 'healthy';
    if (rate >= 80) return 'warning';
    return 'critical';
  }, [complianceData.overall, activeView]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading compliance data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load compliance data"
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
          title="No compliance data"
          description="No domain or service data is available. Upload metrics data to populate the SLA/SLO compliance view."
          size="md"
        />
      </div>
    );
  }

  const { tierGroups, overall } = complianceData;

  if (!overall) {
    return null;
  }

  /**
   * Render the view toggle buttons.
   */
  function renderViewToggle() {
    if (mode !== 'both') {
      return null;
    }

    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => handleViewChange('sla')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeView === 'sla'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={activeView === 'sla'}
          aria-label="Show SLA compliance"
        >
          SLA
        </button>
        <button
          onClick={() => handleViewChange('slo')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeView === 'slo'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={activeView === 'slo'}
          aria-label="Show SLO compliance"
        >
          SLO
        </button>
      </div>
    );
  }

  /**
   * Render a progress bar for compliance visualization.
   * @param {number} actual - The actual availability value.
   * @param {number} target - The target value.
   * @param {boolean} isCompliant - Whether the value meets the target.
   * @param {number} gap - The gap between actual and target.
   * @returns {React.ReactNode}
   */
  function renderProgressBar(actual, target, isCompliant, gap) {
    // Normalize the progress relative to a range around the target
    // Show progress from (target - 1) to target, capped at 100%
    const rangeMin = Math.max(0, target - 1);
    const rangeMax = target;
    const range = rangeMax - rangeMin;
    let progressPercent = 100;

    if (range > 0 && actual < target) {
      progressPercent = Math.max(0, Math.min(100, ((actual - rangeMin) / range) * 100));
    }

    const barColorClass = getProgressBarColorClass(isCompliant, gap);

    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
            style={{ width: `${progressPercent}%` }}
            title={`${formatPercentage(actual, 2)} / ${formatPercentage(target, 2)}`}
          />
        </div>
      </div>
    );
  }

  const currentComplianceRate =
    activeView === 'sla' ? overall.overallSlaComplianceRate : overall.overallSloComplianceRate;
  const currentCompliantCount =
    activeView === 'sla' ? overall.slaCompliantServices : overall.sloCompliantServices;
  const currentNonCompliantCount =
    activeView === 'sla' ? overall.slaNonCompliantServices : overall.sloNonCompliantServices;

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            {activeView === 'sla' ? 'SLA' : 'SLO'} Compliance
          </h3>
          <StatusBadge
            status={complianceStatus}
            size="sm"
            label={
              complianceStatus === 'healthy'
                ? 'All Compliant'
                : complianceStatus === 'warning'
                  ? 'Partial Compliance'
                  : complianceStatus === 'critical'
                    ? 'Compliance Issues'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-3">
          {renderViewToggle()}
          <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
              {currentCompliantCount} Compliant
            </span>
            {currentNonCompliantCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
                {currentNonCompliantCount} Non-Compliant
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top-Level Metric Cards */}
      <div
        className={`grid gap-4 mb-6 ${compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}
      >
        <MetricCard
          title={`${activeView === 'sla' ? 'SLA' : 'SLO'} Compliance Rate`}
          value={currentComplianceRate}
          unit="%"
          size={compact ? 'sm' : 'md'}
          status={complianceStatus}
          trend={{
            direction: currentComplianceRate >= 100 ? 'stable' : 'down',
            invertColor: true,
          }}
        />
        <MetricCard
          title="Platform Availability"
          value={overall.overallAvailability}
          unit="%"
          size={compact ? 'sm' : 'md'}
          status={overall.overallAvailability >= 99.9 ? 'healthy' : 'degraded'}
        />
        <MetricCard
          title="Compliant Services"
          value={currentCompliantCount}
          unit="count"
          size={compact ? 'sm' : 'md'}
          subtitle={`of ${overall.totalServices} total`}
          status="healthy"
        />
        <MetricCard
          title="Non-Compliant"
          value={currentNonCompliantCount}
          unit="count"
          size={compact ? 'sm' : 'md'}
          status={currentNonCompliantCount > 0 ? 'critical' : 'healthy'}
          trend={{
            direction: currentNonCompliantCount > 0 ? 'up' : 'stable',
            invertColor: false,
          }}
        />
      </div>

      {/* Tier-Grouped Domain Cards */}
      <div className="space-y-6">
        {tierGroups.map((tierGroup) => {
          const tierComplianceRate =
            tierGroup.totalServices > 0
              ? parseFloat(
                  (
                    ((activeView === 'sla'
                      ? tierGroup.slaCompliantServices
                      : tierGroup.sloCompliantServices) /
                      tierGroup.totalServices) *
                    100
                  ).toFixed(2),
                )
              : 100;

          return (
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
                    {activeView === 'sla' ? 'SLA' : 'SLO'} Target:{' '}
                    <span className="font-medium text-dashboard-text-secondary">
                      {formatPercentage(
                        activeView === 'sla' ? tierGroup.slaTarget : tierGroup.sloTarget,
                        2,
                      )}
                    </span>
                  </span>
                  <span>
                    Compliance:{' '}
                    <span className={`font-medium ${getComplianceColorClass(tierComplianceRate)}`}>
                      {formatPercentage(tierComplianceRate, 2)}
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
                  const target =
                    activeView === 'sla' ? domainData.sla_target : domainData.slo_target;
                  const isCompliant =
                    activeView === 'sla' ? domainData.sla_compliant : domainData.slo_compliant;
                  const complianceRate =
                    activeView === 'sla'
                      ? domainData.sla_compliance_rate
                      : domainData.slo_compliance_rate;
                  const compliantCount =
                    activeView === 'sla'
                      ? domainData.sla_compliant_count
                      : domainData.slo_compliant_count;

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
                        aria-label={`${domainData.name} domain — ${formatPercentage(complianceRate, 2)} ${activeView.toUpperCase()} compliance`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Compliance dot */}
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              isCompliant
                                ? 'bg-status-healthy'
                                : complianceRate >= 80
                                  ? 'bg-status-degraded'
                                  : 'bg-status-down animate-pulse'
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
                                {compliantCount}/{domainData.total_services} compliant
                              </span>
                              {isCompliant ? (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                                  {activeView.toUpperCase()} ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                  {activeView.toUpperCase()} ✗
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Compliance Rate + Chevron */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <span
                              className={`text-lg font-bold leading-none ${getAvailabilityColorClass(domainData.availability, target)}`}
                            >
                              {formatPercentage(domainData.availability, 2)}
                            </span>
                            <div className="text-[10px] text-dashboard-text-muted mt-0.5">
                              target: {formatPercentage(target, 2)}
                            </div>
                          </div>

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

                      {/* Domain-Level Progress Bar */}
                      <div className="px-4 pb-3">
                        {renderProgressBar(
                          domainData.availability,
                          target,
                          isCompliant,
                          activeView === 'sla'
                            ? domainData.availability - domainData.sla_target
                            : domainData.availability - domainData.slo_target,
                        )}
                      </div>

                      {/* Expanded Service Detail */}
                      {showServiceDetail && isExpanded && domainData.services.length > 0 && (
                        <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                          <div className="px-4 py-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                  <th className="text-left py-1.5 pr-2">Service</th>
                                  <th className="text-right py-1.5 px-2">Actual</th>
                                  <th className="text-right py-1.5 px-2">Target</th>
                                  <th className="text-right py-1.5 px-2">Gap</th>
                                  <th className="py-1.5 px-2 w-24">Progress</th>
                                  <th className="text-center py-1.5 pl-2">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-dashboard-border">
                                {domainData.services.map((service) => {
                                  const svcTarget =
                                    activeView === 'sla' ? service.sla_target : service.slo_target;
                                  const svcCompliant =
                                    activeView === 'sla'
                                      ? service.sla_compliant
                                      : service.slo_compliant;
                                  const svcGap =
                                    activeView === 'sla' ? service.sla_gap : service.slo_gap;

                                  const gapDisplay =
                                    svcGap != null && !isNaN(svcGap)
                                      ? svcGap >= 0
                                        ? `+${Math.abs(svcGap).toFixed(3)}%`
                                        : `-${Math.abs(svcGap).toFixed(3)}%`
                                      : '—';

                                  const gapColorClass =
                                    svcGap != null && !isNaN(svcGap)
                                      ? svcGap >= 0
                                        ? 'text-status-healthy'
                                        : svcGap >= -0.1
                                          ? 'text-status-degraded'
                                          : 'text-severity-critical'
                                      : 'text-dashboard-text-muted';

                                  return (
                                    <tr
                                      key={service.service_id}
                                      className="hover:bg-white/50 transition-colors duration-150"
                                    >
                                      <td className="py-2 pr-2">
                                        <span className="text-sm text-dashboard-text-primary font-medium truncate block max-w-[140px]">
                                          {service.name}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span
                                          className={`text-sm font-semibold ${getAvailabilityColorClass(service.availability, svcTarget)}`}
                                        >
                                          {formatPercentage(service.availability, 2)}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span className="text-dashboard-text-muted">
                                          {formatPercentage(svcTarget, 2)}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span className={`font-medium ${gapColorClass}`}>
                                          {gapDisplay}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2">
                                        {renderProgressBar(
                                          service.availability,
                                          svcTarget,
                                          svcCompliant,
                                          svcGap,
                                        )}
                                      </td>
                                      <td className="py-2 pl-2 text-center">
                                        {svcCompliant ? (
                                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                                            ✓
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                            ✗
                                          </span>
                                        )}
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
          );
        })}
      </div>
    </div>
  );
};

export { SLOComplianceCard };
export default SLOComplianceCard;
