import { useState, useCallback } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { FilterBar } from '../components/shared/FilterBar';
import { LatencyChart } from '../components/golden-signals/LatencyChart';
import { TrafficChart } from '../components/golden-signals/TrafficChart';
import { ErrorRateChart } from '../components/golden-signals/ErrorRateChart';
import { SaturationChart } from '../components/golden-signals/SaturationChart';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_METRIC_THRESHOLDS,
  SERVICE_STATUS,
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_LABELS,
} from '../constants/metrics';
import { formatTimestamp, formatPercentage, formatNumber } from '../utils/formatters';
import { getRelativeTime } from '../utils/dateUtils';

/**
 * GoldenSignalsPage - Golden signals analytics dashboard page composing
 * LatencyChart, TrafficChart, ErrorRateChart, and SaturationChart widgets.
 * Full FilterBar with domain/app/env selectors. Grid layout with responsive
 * breakpoints.
 *
 * Features:
 * - FilterBar with domain, service, environment, and time range filters
 * - Overall golden signals health summary metric cards
 * - LatencyChart widget (P95/P99 latency over time)
 * - TrafficChart widget (RPS over time)
 * - ErrorRateChart widget (5xx and functional errors over time)
 * - SaturationChart widget (CPU, Memory, Queue utilization over time)
 * - Per-service golden signal selector shared across all charts
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive grid layout with section spacing
 *
 * User Stories: SCRUM-7089 (Golden Signals Dashboard)
 *
 * @returns {React.ReactNode}
 */
const GoldenSignalsPage = () => {
  const { domains, dashboardData, isLoading, error, lastUpdated, refresh, setFilters } = useDashboard();
  const { canViewMetrics } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [activeSignal, setActiveSignal] = useState(null);

  /**
   * Handle filter changes from the FilterBar.
   * @param {Object} filters - The updated filter values.
   */
  const handleFilterChange = useCallback(
    (filters) => {
      if (filters && typeof filters === 'object') {
        setFilters(filters);

        // If a service filter is set, propagate to the charts
        if (filters.serviceId) {
          setSelectedServiceId(filters.serviceId);
        }
      }
    },
    [setFilters],
  );

  /**
   * Handle manual refresh of dashboard data.
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } catch (_e) {
      // Error is handled by the DashboardContext
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  /**
   * Handle golden signal tab toggle.
   * @param {string|null} signal - The signal to focus on, or null for all.
   */
  const handleSignalToggle = useCallback((signal) => {
    setActiveSignal((prev) => (prev === signal ? null : signal));
  }, []);

  /**
   * Flatten all services from domains with domain metadata attached.
   */
  const allServices = (() => {
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
  })();

  /**
   * Build service options for the FilterBar service selector.
   */
  const serviceOptions = allServices.map((service) => ({
    value: service.service_id,
    label: service.name,
    domainId: service.domain_id,
    domain_id: service.domain_id,
    tier: DOMAIN_TIER_LABELS[service.domain_tier] || service.domain_tier,
  }));

  /**
   * Compute overall golden signals health summary.
   */
  const overallSummary = (() => {
    if (!allServices || allServices.length === 0) {
      return {
        totalServices: 0,
        healthyServices: 0,
        degradedServices: 0,
        downServices: 0,
        avgLatencyP95: null,
        avgTrafficRps: null,
        totalErrors5xx: null,
        avgCpuSaturation: null,
        servicesWithHighLatency: 0,
        servicesWithHighErrors: 0,
        servicesWithHighSaturation: 0,
      };
    }

    let healthyServices = 0;
    let degradedServices = 0;
    let downServices = 0;
    let totalLatencyP95 = 0;
    let latencyP95Count = 0;
    let totalTrafficRps = 0;
    let trafficRpsCount = 0;
    let totalErrors5xx = 0;
    let errors5xxCount = 0;
    let totalCpuSaturation = 0;
    let cpuSaturationCount = 0;
    let servicesWithHighLatency = 0;
    let servicesWithHighErrors = 0;
    let servicesWithHighSaturation = 0;

    const latencyThreshold = DEFAULT_METRIC_THRESHOLDS.latency_p95;
    const errorsThreshold = DEFAULT_METRIC_THRESHOLDS.errors_5xx;
    const cpuThreshold = DEFAULT_METRIC_THRESHOLDS.saturation_cpu;

    for (const service of allServices) {
      if (service.status === SERVICE_STATUS.HEALTHY) healthyServices++;
      else if (service.status === SERVICE_STATUS.DEGRADED) degradedServices++;
      else if (service.status === SERVICE_STATUS.DOWN) downServices++;

      const signals = service.golden_signals || {};

      if (signals.latency_p95 != null && !isNaN(signals.latency_p95)) {
        totalLatencyP95 += signals.latency_p95;
        latencyP95Count++;
        if (latencyThreshold.warning != null && signals.latency_p95 >= latencyThreshold.warning) {
          servicesWithHighLatency++;
        }
      }

      if (signals.traffic_rps != null && !isNaN(signals.traffic_rps)) {
        totalTrafficRps += signals.traffic_rps;
        trafficRpsCount++;
      }

      if (signals.errors_5xx != null && !isNaN(signals.errors_5xx)) {
        totalErrors5xx += signals.errors_5xx;
        errors5xxCount++;
        if (errorsThreshold.warning != null && signals.errors_5xx >= errorsThreshold.warning) {
          servicesWithHighErrors++;
        }
      }

      if (signals.saturation_cpu != null && !isNaN(signals.saturation_cpu)) {
        totalCpuSaturation += signals.saturation_cpu;
        cpuSaturationCount++;
        if (cpuThreshold.warning != null && signals.saturation_cpu >= cpuThreshold.warning) {
          servicesWithHighSaturation++;
        }
      }
    }

    return {
      totalServices: allServices.length,
      healthyServices,
      degradedServices,
      downServices,
      avgLatencyP95: latencyP95Count > 0
        ? parseFloat((totalLatencyP95 / latencyP95Count).toFixed(2))
        : null,
      avgTrafficRps: trafficRpsCount > 0
        ? parseFloat((totalTrafficRps / trafficRpsCount).toFixed(0))
        : null,
      totalErrors5xx: errors5xxCount > 0 ? totalErrors5xx : null,
      avgCpuSaturation: cpuSaturationCount > 0
        ? parseFloat((totalCpuSaturation / cpuSaturationCount).toFixed(2))
        : null,
      servicesWithHighLatency,
      servicesWithHighErrors,
      servicesWithHighSaturation,
    };
  })();

  /**
   * Determine the overall golden signals health status.
   */
  const overallStatus = (() => {
    if (overallSummary.totalServices === 0) return 'unknown';
    if (overallSummary.downServices > 0 || overallSummary.servicesWithHighErrors > 2) return 'critical';
    if (
      overallSummary.degradedServices > 0 ||
      overallSummary.servicesWithHighLatency > 0 ||
      overallSummary.servicesWithHighErrors > 0 ||
      overallSummary.servicesWithHighSaturation > 0
    ) {
      return 'warning';
    }
    return 'healthy';
  })();

  /**
   * Check if golden signal time series data is available.
   */
  const hasTimeSeriesData = (() => {
    if (!dashboardData || !dashboardData.golden_signal_time_series) return false;
    return Object.keys(dashboardData.golden_signal_time_series).length > 0;
  })();

  /**
   * Determine which signal charts to show based on activeSignal filter.
   */
  const showLatency = activeSignal === null || activeSignal === GOLDEN_SIGNALS.LATENCY;
  const showTraffic = activeSignal === null || activeSignal === GOLDEN_SIGNALS.TRAFFIC;
  const showErrors = activeSignal === null || activeSignal === GOLDEN_SIGNALS.ERRORS;
  const showSaturation = activeSignal === null || activeSignal === GOLDEN_SIGNALS.SATURATION;

  // Permission check
  if (!canViewMetrics) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Metrics Access Required"
          description="You do not have permission to view golden signals data. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading golden signals data…" size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !domains?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load golden signals data"
          description={error}
          size="md"
          actionLabel="Retry"
          onAction={handleRefresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h1 className="text-2xl font-bold text-dashboard-text-primary tracking-tight">
              Golden Signals
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Latency, traffic, error rates, and saturation metrics across all services
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Last updated timestamp */}
          {lastUpdated && (
            <span className="hidden sm:inline text-xs text-dashboard-text-muted">
              Updated {formatTimestamp(lastUpdated, { relative: true })}
            </span>
          )}

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors duration-150 ${
              isRefreshing
                ? 'bg-gray-50 text-dashboard-text-muted border-dashboard-border cursor-not-allowed'
                : 'bg-white text-dashboard-text-secondary border-dashboard-border hover:bg-gray-50 hover:text-dashboard-text-primary'
            }`}
            aria-label="Refresh golden signals data"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        onChange={handleFilterChange}
        showDomain={true}
        showService={true}
        showEnvironment={true}
        showTimeRange={true}
        showSeverity={false}
        showRootCause={false}
        showSearch={false}
        showReset={true}
        serviceOptions={serviceOptions}
        className="mb-2"
      />

      {/* Error banner (non-blocking) */}
      {error && domains?.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-50/50 border border-yellow-200 animate-fade-in">
          <svg
            className="w-5 h-5 text-status-degraded flex-shrink-0 mt-0.5"
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
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-yellow-800">Data may be stale</p>
            <p className="text-sm text-yellow-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-xs text-yellow-700 hover:text-yellow-800 font-medium transition-colors duration-150 flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top-Level Summary Metric Cards */}
      <section aria-label="Golden Signals Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Avg P95 Latency"
            value={overallSummary.avgLatencyP95}
            unit="ms"
            size="md"
            status={
              overallSummary.avgLatencyP95 != null
                ? DEFAULT_METRIC_THRESHOLDS.latency_p95.critical != null &&
                  overallSummary.avgLatencyP95 >= DEFAULT_METRIC_THRESHOLDS.latency_p95.critical
                  ? 'critical'
                  : DEFAULT_METRIC_THRESHOLDS.latency_p95.warning != null &&
                      overallSummary.avgLatencyP95 >= DEFAULT_METRIC_THRESHOLDS.latency_p95.warning
                    ? 'warning'
                    : 'healthy'
                : undefined
            }
            subtitle={
              overallSummary.servicesWithHighLatency > 0
                ? `${overallSummary.servicesWithHighLatency} service${overallSummary.servicesWithHighLatency !== 1 ? 's' : ''} elevated`
                : 'All within threshold'
            }
            trend={{
              direction:
                overallSummary.avgLatencyP95 != null &&
                DEFAULT_METRIC_THRESHOLDS.latency_p95.warning != null &&
                overallSummary.avgLatencyP95 >= DEFAULT_METRIC_THRESHOLDS.latency_p95.warning
                  ? 'up'
                  : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Total Traffic"
            value={overallSummary.avgTrafficRps}
            unit="rps"
            size="md"
            subtitle={`${overallSummary.totalServices} services`}
          />
          <MetricCard
            title="Total 5xx Errors"
            value={overallSummary.totalErrors5xx}
            unit="count"
            size="md"
            status={
              overallSummary.totalErrors5xx != null
                ? overallSummary.servicesWithHighErrors > 0
                  ? 'critical'
                  : 'healthy'
                : undefined
            }
            subtitle={
              overallSummary.servicesWithHighErrors > 0
                ? `${overallSummary.servicesWithHighErrors} service${overallSummary.servicesWithHighErrors !== 1 ? 's' : ''} elevated`
                : 'All within threshold'
            }
            trend={{
              direction: overallSummary.servicesWithHighErrors > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Avg CPU Utilization"
            value={overallSummary.avgCpuSaturation}
            unit="%"
            size="md"
            status={
              overallSummary.avgCpuSaturation != null
                ? DEFAULT_METRIC_THRESHOLDS.saturation_cpu.critical != null &&
                  overallSummary.avgCpuSaturation >= DEFAULT_METRIC_THRESHOLDS.saturation_cpu.critical
                  ? 'critical'
                  : DEFAULT_METRIC_THRESHOLDS.saturation_cpu.warning != null &&
                      overallSummary.avgCpuSaturation >= DEFAULT_METRIC_THRESHOLDS.saturation_cpu.warning
                    ? 'warning'
                    : 'healthy'
                : undefined
            }
            subtitle={
              overallSummary.servicesWithHighSaturation > 0
                ? `${overallSummary.servicesWithHighSaturation} service${overallSummary.servicesWithHighSaturation !== 1 ? 's' : ''} elevated`
                : 'All within threshold'
            }
            trend={{
              direction: overallSummary.servicesWithHighSaturation > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Service Health"
            value={
              overallSummary.totalServices > 0
                ? parseFloat(
                    ((overallSummary.healthyServices / overallSummary.totalServices) * 100).toFixed(1),
                  )
                : 0
            }
            unit="%"
            size="md"
            status={overallStatus}
            subtitle={`${overallSummary.healthyServices} healthy · ${overallSummary.degradedServices} degraded · ${overallSummary.downServices} down`}
            trend={{
              direction:
                overallSummary.totalServices > 0 &&
                overallSummary.healthyServices === overallSummary.totalServices
                  ? 'stable'
                  : 'down',
              invertColor: true,
            }}
          />
        </div>
      </section>

      {/* Golden Signal Tab Toggles */}
      <section aria-label="Signal Filter">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
            Focus:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => handleSignalToggle(null)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
                activeSignal === null
                  ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                  : 'bg-gray-50 text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary'
              }`}
              aria-pressed={activeSignal === null}
              aria-label="Show all golden signals"
            >
              All Signals
            </button>
            {Object.values(GOLDEN_SIGNALS).map((signal) => (
              <button
                key={signal}
                onClick={() => handleSignalToggle(signal)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
                  activeSignal === signal
                    ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                    : 'bg-gray-50 text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary'
                }`}
                aria-pressed={activeSignal === signal}
                aria-label={`Focus on ${GOLDEN_SIGNAL_LABELS[signal]}`}
              >
                {signal === GOLDEN_SIGNALS.LATENCY && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {signal === GOLDEN_SIGNALS.TRAFFIC && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                )}
                {signal === GOLDEN_SIGNALS.ERRORS && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                )}
                {signal === GOLDEN_SIGNALS.SATURATION && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                )}
                {GOLDEN_SIGNAL_LABELS[signal]}
              </button>
            ))}
          </div>

          {/* Service health summary badges */}
          <div className="flex items-center gap-4 ml-auto text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
              {overallSummary.healthyServices} Healthy
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
              {overallSummary.degradedServices} Degraded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-status-down animate-pulse" />
              {overallSummary.downServices} Down
            </span>
          </div>
        </div>
      </section>

      {/* No time series data warning */}
      {!hasTimeSeriesData && domains && domains.length > 0 && (
        <div className="dashboard-card overflow-hidden">
          <EmptyState
            preset="no-metrics"
            title="No golden signal time series data"
            description="Service data is available but no time series data has been loaded. Upload metrics data with time series to populate the golden signal charts."
            size="sm"
            compact
          />
        </div>
      )}

      {/* Golden Signal Charts Grid */}
      {hasTimeSeriesData && (
        <div
          className={`grid gap-6 ${
            activeSignal !== null
              ? 'grid-cols-1'
              : 'grid-cols-1 xl:grid-cols-2'
          }`}
        >
          {/* Latency Chart */}
          {showLatency && (
            <section aria-label="Latency Golden Signal">
              <LatencyChart
                selectedServiceId={selectedServiceId}
                showServiceSelector={true}
                showMetricCards={true}
                compact={activeSignal === null}
                chartHeight={activeSignal !== null ? 320 : 260}
              />
            </section>
          )}

          {/* Traffic Chart */}
          {showTraffic && (
            <section aria-label="Traffic Golden Signal">
              <TrafficChart
                selectedServiceId={selectedServiceId}
                showServiceSelector={true}
                showMetricCards={true}
                compact={activeSignal === null}
                chartHeight={activeSignal !== null ? 320 : 260}
              />
            </section>
          )}

          {/* Error Rate Chart */}
          {showErrors && (
            <section aria-label="Error Rate Golden Signal">
              <ErrorRateChart
                selectedServiceId={selectedServiceId}
                showServiceSelector={true}
                showMetricCards={true}
                compact={activeSignal === null}
                chartHeight={activeSignal !== null ? 320 : 260}
              />
            </section>
          )}

          {/* Saturation Chart */}
          {showSaturation && (
            <section aria-label="Saturation Golden Signal">
              <SaturationChart
                selectedServiceId={selectedServiceId}
                showServiceSelector={true}
                showMetricCards={true}
                compact={activeSignal === null}
                chartHeight={activeSignal !== null ? 320 : 260}
              />
            </section>
          )}
        </div>
      )}

      {/* Per-Service Golden Signals Summary Table */}
      {allServices.length > 0 && (
        <section aria-label="Service Golden Signals Summary">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Service Golden Signals Overview
                </h3>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {allServices.length}
                </span>
                <StatusBadge
                  status={overallStatus}
                  size="sm"
                  label={
                    overallStatus === 'healthy'
                      ? 'All Healthy'
                      : overallStatus === 'warning'
                        ? 'Some Elevated'
                        : overallStatus === 'critical'
                          ? 'Issues Detected'
                          : 'Unknown'
                  }
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span>
                  Thresholds: P95{' '}
                  <span className="font-medium text-status-degraded">
                    {DEFAULT_METRIC_THRESHOLDS.latency_p95.warning}ms
                  </span>
                  {' / '}5xx{' '}
                  <span className="font-medium text-status-degraded">
                    {DEFAULT_METRIC_THRESHOLDS.errors_5xx.warning}
                  </span>
                  {' / '}CPU{' '}
                  <span className="font-medium text-status-degraded">
                    {DEFAULT_METRIC_THRESHOLDS.saturation_cpu.warning}%
                  </span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm" role="grid">
                <thead>
                  <tr className="border-b border-dashboard-border bg-gray-50/50">
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left" style={{ width: '18%' }}>
                      Service
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left" style={{ width: '12%' }}>
                      Domain
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '10%' }}>
                      P95 Latency
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '10%' }}>
                      P99 Latency
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '10%' }}>
                      Traffic
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '8%' }}>
                      5xx Errors
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '8%' }}>
                      CPU
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '8%' }}>
                      Memory
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right" style={{ width: '8%' }}>
                      Queue
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center" style={{ width: '8%' }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashboard-border">
                  {allServices
                    .sort((a, b) => {
                      const tierDiff =
                        (DOMAIN_TIER_ORDER[a.domain_tier] ?? 99) -
                        (DOMAIN_TIER_ORDER[b.domain_tier] ?? 99);
                      if (tierDiff !== 0) return tierDiff;
                      return (a.name || '').localeCompare(b.name || '');
                    })
                    .map((service) => {
                      const signals = service.golden_signals || {};
                      const latencyP95Warning =
                        DEFAULT_METRIC_THRESHOLDS.latency_p95.warning;
                      const latencyP95Critical =
                        DEFAULT_METRIC_THRESHOLDS.latency_p95.critical;
                      const errors5xxWarning =
                        DEFAULT_METRIC_THRESHOLDS.errors_5xx.warning;
                      const errors5xxCritical =
                        DEFAULT_METRIC_THRESHOLDS.errors_5xx.critical;
                      const cpuWarning =
                        DEFAULT_METRIC_THRESHOLDS.saturation_cpu.warning;
                      const cpuCritical =
                        DEFAULT_METRIC_THRESHOLDS.saturation_cpu.critical;
                      const memWarning =
                        DEFAULT_METRIC_THRESHOLDS.saturation_mem.warning;
                      const memCritical =
                        DEFAULT_METRIC_THRESHOLDS.saturation_mem.critical;

                      const getColorClass = (value, warning, critical) => {
                        if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
                        if (critical != null && value >= critical) return 'text-severity-critical';
                        if (warning != null && value >= warning) return 'text-status-degraded';
                        return 'text-dashboard-text-secondary';
                      };

                      return (
                        <tr
                          key={service.service_id}
                          className="hover:bg-gray-50/50 transition-colors duration-150"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                  service.status === SERVICE_STATUS.HEALTHY
                                    ? 'bg-status-healthy'
                                    : service.status === SERVICE_STATUS.DEGRADED
                                      ? 'bg-status-degraded'
                                      : service.status === SERVICE_STATUS.DOWN
                                        ? 'bg-status-down animate-pulse'
                                        : 'bg-status-unknown'
                                }`}
                              />
                              <span className="text-sm font-medium text-dashboard-text-primary truncate">
                                {service.name || service.service_id}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm text-dashboard-text-secondary truncate">
                                {service.domain_name || '—'}
                              </span>
                              {service.domain_tier && (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-gray-100 text-dashboard-text-muted flex-shrink-0">
                                  {DOMAIN_TIER_LABELS[service.domain_tier] || service.domain_tier}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${getColorClass(signals.latency_p95, latencyP95Warning, latencyP95Critical)}`}
                            >
                              {signals.latency_p95 != null
                                ? `${formatNumber(signals.latency_p95, { decimals: 1 })} ms`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${getColorClass(signals.latency_p99, DEFAULT_METRIC_THRESHOLDS.latency_p99.warning, DEFAULT_METRIC_THRESHOLDS.latency_p99.critical)}`}
                            >
                              {signals.latency_p99 != null
                                ? `${formatNumber(signals.latency_p99, { decimals: 1 })} ms`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm text-dashboard-text-secondary">
                              {signals.traffic_rps != null
                                ? `${formatNumber(signals.traffic_rps, { decimals: 0 })} rps`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${getColorClass(signals.errors_5xx, errors5xxWarning, errors5xxCritical)}`}
                            >
                              {signals.errors_5xx != null
                                ? formatNumber(signals.errors_5xx, { decimals: 0 })
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${getColorClass(signals.saturation_cpu, cpuWarning, cpuCritical)}`}
                            >
                              {signals.saturation_cpu != null
                                ? formatPercentage(signals.saturation_cpu, 1)
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${getColorClass(signals.saturation_mem, memWarning, memCritical)}`}
                            >
                              {signals.saturation_mem != null
                                ? formatPercentage(signals.saturation_mem, 1)
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${getColorClass(signals.saturation_queue, DEFAULT_METRIC_THRESHOLDS.saturation_queue.warning, DEFAULT_METRIC_THRESHOLDS.saturation_queue.critical)}`}
                            >
                              {signals.saturation_queue != null
                                ? formatPercentage(signals.saturation_queue, 1)
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
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

            {/* Table Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span>
                  {allServices.length} service{allServices.length !== 1 ? 's' : ''} across{' '}
                  {domains?.length || 0} domain{(domains?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
                  Normal
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
                  Warning
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
                  Critical
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Page Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {domains?.length || 0} domain{(domains?.length || 0) !== 1 ? 's' : ''} monitored
          </span>
          <span>·</span>
          <span>
            {allServices.length} total services
          </span>
          <span>·</span>
          <span>
            4 golden signals: Latency, Traffic, Errors, Saturation
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span>
              Last refresh: {formatTimestamp(lastUpdated)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export { GoldenSignalsPage };
export default GoldenSignalsPage;