import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { usePermissions } from '../hooks/usePermissions';
import { FilterBar } from '../components/shared/FilterBar';
import { DependencyMap } from '../components/dependency/DependencyMap';
import { DependencyDetails } from '../components/dependency/DependencyDetails';
import { MetricCard } from '../components/shared/MetricCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_SLA_TARGETS,
  SERVICE_STATUS,
} from '../constants/metrics';
import { formatTimestamp, formatPercentage, formatNumber } from '../utils/formatters';
import { getRelativeTime } from '../utils/dateUtils';

/**
 * DependencyMapPage - Service dependency map page with full-width DependencyMap
 * visualization and DependencyDetails side panel. Includes search for services
 * and incident overlay toggle for blast radius.
 *
 * Features:
 * - FilterBar with domain and time range filters
 * - Full-width interactive D3.js force-directed dependency map
 * - DependencyDetails side panel for selected service node
 * - Service search input to find and highlight specific services
 * - Incident overlay toggle to highlight blast radius for degraded/down services
 * - Overall dependency graph summary metric cards
 * - Last updated timestamp display
 * - Refresh button to reload dashboard data
 * - Loading and error states
 * - Responsive layout with collapsible side panel
 *
 * User Stories: SCRUM-7090 (Service Dependency Map)
 *
 * @returns {React.ReactNode}
 */
const DependencyMapPage = () => {
  const {
    domains,
    dashboardData,
    dependencyGraph,
    isLoading,
    error,
    lastUpdated,
    refresh,
    setFilters,
  } = useDashboard();
  const { canViewMetrics } = usePermissions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [incidentOverlayEnabled, setIncidentOverlayEnabled] = useState(false);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

  /**
   * Handle filter changes from the FilterBar.
   * @param {Object} filters - The updated filter values.
   */
  const handleFilterChange = useCallback(
    (filters) => {
      if (filters && typeof filters === 'object') {
        setFilters(filters);
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
   * Handle search input change.
   */
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  /**
   * Handle search clear.
   */
  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  /**
   * Toggle the incident overlay for blast radius highlighting.
   */
  const handleIncidentOverlayToggle = useCallback(() => {
    setIncidentOverlayEnabled((prev) => !prev);
  }, []);

  /**
   * Handle service node selection from the dependency map or search results.
   * @param {string} serviceId - The service ID to select.
   */
  const handleServiceSelect = useCallback((serviceId) => {
    setSelectedServiceId(serviceId);
    setIsDetailPanelOpen(true);
  }, []);

  /**
   * Handle closing the detail panel.
   */
  const handleDetailClose = useCallback(() => {
    setSelectedServiceId(null);
    setIsDetailPanelOpen(false);
  }, []);

  /**
   * Build a service lookup map from domains for enriching node data.
   */
  const serviceLookup = useMemo(() => {
    const map = new Map();

    if (!domains || !Array.isArray(domains)) {
      return map;
    }

    for (const domain of domains) {
      for (const service of domain.services || []) {
        map.set(service.service_id, {
          ...service,
          domain_id: domain.domain_id,
          domain_name: domain.name,
          domain_tier: domain.tier,
        });
      }
    }

    return map;
  }, [domains]);

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
   * Build service options for the FilterBar service selector.
   */
  const serviceOptions = useMemo(() => {
    return allServices.map((service) => ({
      value: service.service_id,
      label: service.name,
      domainId: service.domain_id,
      domain_id: service.domain_id,
      tier: DOMAIN_TIER_LABELS[service.domain_tier] || service.domain_tier,
    }));
  }, [allServices]);

  /**
   * Filter services by search query for the search results dropdown.
   */
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const query = searchQuery.trim().toLowerCase();

    return allServices
      .filter(
        (service) =>
          (service.name && service.name.toLowerCase().includes(query)) ||
          (service.service_id && service.service_id.toLowerCase().includes(query)) ||
          (service.domain_name && service.domain_name.toLowerCase().includes(query)),
      )
      .slice(0, 10);
  }, [allServices, searchQuery]);

  /**
   * Get the selected service object enriched with domain metadata.
   */
  const selectedService = useMemo(() => {
    if (!selectedServiceId) return null;

    const service = serviceLookup.get(selectedServiceId);
    if (!service) return null;

    // Enrich with golden signals if available
    return {
      ...service,
      golden_signals: service.golden_signals || {},
    };
  }, [selectedServiceId, serviceLookup]);

  /**
   * Compute blast radius for the selected service.
   */
  const blastRadius = useMemo(() => {
    if (!selectedServiceId || !dependencyGraph || !dependencyGraph.edges) {
      return { upstream: new Set(), downstream: new Set() };
    }

    const edges = dependencyGraph.edges || [];
    const downstream = new Set();
    const upstream = new Set();

    // BFS downstream (services that depend on the target)
    const downQueue = [selectedServiceId];
    const downVisited = new Set([selectedServiceId]);

    while (downQueue.length > 0) {
      const current = downQueue.shift();

      for (const edge of edges) {
        const sourceId =
          typeof edge.source === 'object' ? edge.source.id : edge.source;
        const targetId =
          typeof edge.target === 'object' ? edge.target.id : edge.target;

        if (targetId === current && !downVisited.has(sourceId)) {
          downstream.add(sourceId);
          downVisited.add(sourceId);
          downQueue.push(sourceId);
        }
      }
    }

    // BFS upstream (services that the target depends on)
    const upQueue = [selectedServiceId];
    const upVisited = new Set([selectedServiceId]);

    while (upQueue.length > 0) {
      const current = upQueue.shift();

      for (const edge of edges) {
        const sourceId =
          typeof edge.source === 'object' ? edge.source.id : edge.source;
        const targetId =
          typeof edge.target === 'object' ? edge.target.id : edge.target;

        if (sourceId === current && !upVisited.has(targetId)) {
          upstream.add(targetId);
          upVisited.add(targetId);
          upQueue.push(targetId);
        }
      }
    }

    return { upstream, downstream };
  }, [selectedServiceId, dependencyGraph]);

  /**
   * Determine the incident overlay service ID.
   * When incident overlay is enabled, find the first degraded/down service to highlight.
   */
  const incidentHighlightServiceId = useMemo(() => {
    if (!incidentOverlayEnabled) return null;

    // If a service is already selected and it's degraded/down, use it
    if (selectedService) {
      if (
        selectedService.status === SERVICE_STATUS.DEGRADED ||
        selectedService.status === SERVICE_STATUS.DOWN
      ) {
        return selectedServiceId;
      }
    }

    // Otherwise, find the first degraded/down service in the graph
    if (!dependencyGraph || !dependencyGraph.nodes) return null;

    const degradedNode = dependencyGraph.nodes.find(
      (node) =>
        node.status === SERVICE_STATUS.DOWN || node.status === SERVICE_STATUS.DEGRADED,
    );

    return degradedNode ? degradedNode.id : null;
  }, [incidentOverlayEnabled, selectedService, selectedServiceId, dependencyGraph]);

  /**
   * Compute overall dependency graph summary.
   */
  const graphSummary = useMemo(() => {
    if (!dependencyGraph || !dependencyGraph.nodes) {
      return {
        totalNodes: 0,
        totalEdges: 0,
        healthyNodes: 0,
        degradedNodes: 0,
        downNodes: 0,
        totalDomains: 0,
        avgDependencies: 0,
      };
    }

    const nodes = dependencyGraph.nodes || [];
    const edges = dependencyGraph.edges || [];

    const healthyNodes = nodes.filter((n) => n.status === SERVICE_STATUS.HEALTHY).length;
    const degradedNodes = nodes.filter((n) => n.status === SERVICE_STATUS.DEGRADED).length;
    const downNodes = nodes.filter((n) => n.status === SERVICE_STATUS.DOWN).length;

    const domainSet = new Set();
    for (const node of nodes) {
      if (node.domain) {
        domainSet.add(node.domain);
      }
    }

    const avgDependencies =
      nodes.length > 0
        ? parseFloat((edges.length / nodes.length).toFixed(1))
        : 0;

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      healthyNodes,
      degradedNodes,
      downNodes,
      totalDomains: domainSet.size,
      avgDependencies,
    };
  }, [dependencyGraph]);

  /**
   * Determine the overall graph health status.
   */
  const overallStatus = useMemo(() => {
    if (graphSummary.totalNodes === 0) return 'unknown';
    if (graphSummary.downNodes > 0) return 'critical';
    if (graphSummary.degradedNodes > 0) return 'warning';
    return 'healthy';
  }, [graphSummary]);

  /**
   * Count of degraded/down services for the incident overlay badge.
   */
  const incidentServiceCount = useMemo(() => {
    return graphSummary.degradedNodes + graphSummary.downNodes;
  }, [graphSummary]);

  // Permission check
  if (!canViewMetrics) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="no-access"
          title="Metrics Access Required"
          description="You do not have permission to view the service dependency map. Contact an administrator for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <LoadingSpinner message="Loading dependency map…" size="lg" />
      </div>
    );
  }

  // Error state
  if (error && !domains?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen-content">
        <EmptyState
          preset="error"
          title="Failed to load dependency map"
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
              Service Dependency Map
            </h1>
            <p className="text-sm text-dashboard-text-muted mt-0.5">
              Visualize service dependencies, blast radius, and health status across all domains
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

          {/* Incident Overlay Toggle */}
          <button
            onClick={handleIncidentOverlayToggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors duration-150 ${
              incidentOverlayEnabled
                ? 'bg-red-50 text-severity-critical border-red-200 ring-2 ring-red-500/20'
                : 'bg-white text-dashboard-text-secondary border-dashboard-border hover:bg-gray-50 hover:text-dashboard-text-primary'
            }`}
            aria-pressed={incidentOverlayEnabled}
            aria-label={
              incidentOverlayEnabled
                ? 'Disable incident overlay'
                : 'Enable incident overlay'
            }
            title="Toggle incident blast radius overlay"
          >
            <svg
              className={`w-4 h-4 ${incidentOverlayEnabled ? 'text-severity-critical' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            Incident Overlay
            {incidentServiceCount > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                  incidentOverlayEnabled
                    ? 'bg-severity-critical text-white'
                    : 'bg-gray-100 text-dashboard-text-muted'
                }`}
              >
                {incidentServiceCount}
              </span>
            )}
          </button>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors duration-150 ${
              isRefreshing
                ? 'bg-gray-50 text-dashboard-text-muted border-dashboard-border cursor-not-allowed'
                : 'bg-white text-dashboard-text-secondary border-dashboard-border hover:bg-gray-50 hover:text-dashboard-text-primary'
            }`}
            aria-label="Refresh dependency map data"
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
        showService={false}
        showEnvironment={false}
        showTimeRange={true}
        showSeverity={false}
        showRootCause={false}
        showSearch={false}
        showReset={true}
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
      <section aria-label="Dependency Map Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Total Services"
            value={graphSummary.totalNodes}
            unit="count"
            size="md"
            subtitle={`${graphSummary.totalDomains} domains`}
          />
          <MetricCard
            title="Dependencies"
            value={graphSummary.totalEdges}
            unit="count"
            size="md"
            subtitle={`Avg ${graphSummary.avgDependencies} per service`}
          />
          <MetricCard
            title="Healthy"
            value={graphSummary.healthyNodes}
            unit="count"
            size="md"
            status="healthy"
          />
          <MetricCard
            title="Degraded"
            value={graphSummary.degradedNodes}
            unit="count"
            size="md"
            status={graphSummary.degradedNodes > 0 ? 'warning' : 'healthy'}
            trend={{
              direction: graphSummary.degradedNodes > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
          <MetricCard
            title="Down"
            value={graphSummary.downNodes}
            unit="count"
            size="md"
            status={graphSummary.downNodes > 0 ? 'critical' : 'healthy'}
            trend={{
              direction: graphSummary.downNodes > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
        </div>
      </section>

      {/* Service Search Bar */}
      <section aria-label="Service Search">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-4 h-4 text-dashboard-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search services by name, ID, or domain…"
            className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
            aria-label="Search services in dependency map"
          />
          {searchQuery.length > 0 && (
            <button
              onClick={handleSearchClear}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-dashboard-text-muted hover:text-dashboard-text-secondary transition-colors duration-150"
              aria-label="Clear search"
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
          )}

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-40 top-full left-0 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-dashboard-border rounded-lg shadow-panel py-1 animate-fade-in scrollbar-thin">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted bg-gray-50/50">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.map((service) => {
                const isSelected = service.service_id === selectedServiceId;

                return (
                  <button
                    key={service.service_id}
                    onClick={() => {
                      handleServiceSelect(service.service_id);
                      setSearchQuery('');
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors duration-150 ${
                      isSelected
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
                    }`}
                  >
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
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-dashboard-text-primary truncate block">
                        {service.name}
                      </span>
                      <span className="text-[10px] text-dashboard-text-muted truncate block">
                        {service.domain_name}
                        {service.domain_tier && (
                          <span className="ml-1">
                            · {DOMAIN_TIER_LABELS[service.domain_tier] || service.domain_tier}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {service.availability != null && (
                        <span
                          className={`text-xs font-medium ${
                            service.availability >= (DEFAULT_SLA_TARGETS[service.domain_tier] ?? 99.9)
                              ? 'text-status-healthy'
                              : 'text-severity-critical'
                          }`}
                        >
                          {formatPercentage(service.availability, 2)}
                        </span>
                      )}
                      <StatusBadge
                        status={service.status || 'unknown'}
                        size="sm"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Main Content: Map + Detail Panel */}
      <section aria-label="Dependency Map Visualization">
        <div className="flex gap-6">
          {/* Dependency Map (full width or reduced when panel is open) */}
          <div
            className={`flex-1 min-w-0 transition-all duration-300 ${
              isDetailPanelOpen && selectedService ? 'lg:mr-0' : ''
            }`}
          >
            <DependencyMap
              compact={false}
              height={600}
              highlightIncidentServiceId={incidentHighlightServiceId}
            />
          </div>

          {/* Detail Side Panel */}
          {isDetailPanelOpen && selectedService && (
            <div className="hidden lg:block w-88 flex-shrink-0 animate-fade-in">
              <div className="sticky top-20">
                <DependencyDetails
                  service={selectedService}
                  upstreamIds={blastRadius.upstream}
                  downstreamIds={blastRadius.downstream}
                  onClose={handleDetailClose}
                  onNodeSelect={handleServiceSelect}
                  compact={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Mobile Detail Panel (below the map on smaller screens) */}
        {isDetailPanelOpen && selectedService && (
          <div className="lg:hidden mt-6 animate-fade-in">
            <DependencyDetails
              service={selectedService}
              upstreamIds={blastRadius.upstream}
              downstreamIds={blastRadius.downstream}
              onClose={handleDetailClose}
              onNodeSelect={handleServiceSelect}
              compact={true}
            />
          </div>
        )}
      </section>

      {/* Service Health Summary Table */}
      {allServices.length > 0 && (
        <section aria-label="Service Health Summary">
          <div className="dashboard-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">
                  Service Health & Dependencies
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
                        ? 'Some Degraded'
                        : overallStatus === 'critical'
                          ? 'Service Disruption'
                          : 'Unknown'
                  }
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
                  {graphSummary.healthyNodes} Healthy
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
                  {graphSummary.degradedNodes} Degraded
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-status-down animate-pulse" />
                  {graphSummary.downNodes} Down
                </span>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm" role="grid">
                <thead>
                  <tr className="border-b border-dashboard-border bg-gray-50/50">
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                      style={{ width: '22%' }}
                    >
                      Service
                    </th>
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                      style={{ width: '14%' }}
                    >
                      Domain
                    </th>
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right"
                      style={{ width: '12%' }}
                    >
                      Availability
                    </th>
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-right"
                      style={{ width: '12%' }}
                    >
                      Error Budget
                    </th>
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                      style={{ width: '10%' }}
                    >
                      Dependencies
                    </th>
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                      style={{ width: '10%' }}
                    >
                      Status
                    </th>
                    <th
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                      style={{ width: '10%' }}
                    >
                      Action
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
                      const slaTarget =
                        DEFAULT_SLA_TARGETS[service.domain_tier] ?? 99.9;
                      const isSelected =
                        service.service_id === selectedServiceId;
                      const depCount = service.dependencies
                        ? service.dependencies.length
                        : 0;

                      return (
                        <tr
                          key={service.service_id}
                          className={`transition-colors duration-150 ${
                            isSelected
                              ? 'bg-brand-50/50'
                              : 'hover:bg-gray-50/50'
                          }`}
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
                                  {DOMAIN_TIER_LABELS[service.domain_tier] ||
                                    service.domain_tier}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-semibold ${
                                service.availability != null &&
                                service.availability >= slaTarget
                                  ? 'text-status-healthy'
                                  : service.availability != null &&
                                      service.availability >= slaTarget - 0.1
                                    ? 'text-status-degraded'
                                    : 'text-severity-critical'
                              }`}
                            >
                              {service.availability != null
                                ? formatPercentage(service.availability, 2)
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-medium ${
                                service.error_budget != null &&
                                service.error_budget <= 10
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
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-dashboard-text-secondary">
                              {depCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge
                              status={service.status || 'unknown'}
                              size="sm"
                              showDot={true}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() =>
                                handleServiceSelect(service.service_id)
                              }
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
                                isSelected
                                  ? 'bg-brand-100 text-brand-700'
                                  : 'text-brand-600 hover:bg-brand-50 hover:text-brand-700'
                              }`}
                              aria-label={`View details for ${service.name}`}
                            >
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
                                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {isSelected ? 'Selected' : 'View'}
                            </button>
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
                <span>·</span>
                <span>
                  {graphSummary.totalEdges} dependency link{graphSummary.totalEdges !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                {selectedServiceId && (
                  <span>
                    Selected:{' '}
                    <span className="font-medium text-dashboard-text-secondary">
                      {selectedService?.name || selectedServiceId}
                    </span>
                  </span>
                )}
                <span>Click a service to view its dependencies</span>
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
            {graphSummary.totalNodes} services · {graphSummary.totalEdges} dependencies
          </span>
          {incidentOverlayEnabled && (
            <>
              <span>·</span>
              <span className="text-severity-critical font-medium">
                Incident overlay active
              </span>
            </>
          )}
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

export { DependencyMapPage };
export default DependencyMapPage;