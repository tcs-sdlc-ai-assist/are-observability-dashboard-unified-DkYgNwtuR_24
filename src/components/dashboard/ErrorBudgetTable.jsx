import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { StatusBadge } from '../shared/StatusBadge';
import { TrendArrow } from '../shared/TrendArrow';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatPercentage, formatNumber } from '../../utils/formatters';
import { calculateTrendDirection } from '../../utils/chartHelpers';

/**
 * ErrorBudgetTable - Table view of error budgets across all services with
 * columns for service, SLO target, budget remaining %, burn rate, status
 * (healthy/warning/breached), and trend arrow.
 *
 * Features:
 * - Sortable table of all services with error budget data
 * - Service name, domain, tier, SLO target, budget remaining %, burn rate
 * - Status badges for budget health (healthy/warning/breached)
 * - Trend arrows indicating budget consumption direction
 * - Color-coded budget remaining values based on thresholds
 * - Budget progress bars for visual representation
 * - Toggleable filter for breached/at-risk services only
 * - Responsive layout with compact and full modes
 * - Loading and empty states
 * - Search/filter support
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {number} [props.limit=0] - Maximum number of services to display. 0 for all.
 * @param {boolean} [props.showBreachedOnly=false] - If true, only shows breached/at-risk services.
 * @param {boolean} [props.showSearch=true] - Whether to show the search input.
 * @param {boolean} [props.showPagination=true] - Whether to show pagination controls.
 * @returns {React.ReactNode}
 */
const ErrorBudgetTable = ({
  className = '',
  compact = false,
  limit = 0,
  showBreachedOnly = false,
  showSearch = true,
  showPagination = true,
}) => {
  const { filteredDomains: domains, isLoading, error } = useDashboard();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('error_budget');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterMode, setFilterMode] = useState(showBreachedOnly ? 'at-risk' : 'all');
  const pageSize = compact ? 5 : 10;

  /**
   * Generate simulated burn-down values for trend calculation.
   * @param {number} currentBudget - The current error budget percentage.
   * @param {string} serviceId - The service ID for deterministic jitter.
   * @returns {number[]} Array of budget values for trend calculation.
   */
  const generateBudgetTrendValues = useCallback((currentBudget, serviceId) => {
    const points = 7;
    const values = [];
    const hash = (serviceId || '')
      .split('')
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);

    const startBudget = Math.min(100, currentBudget + (100 - currentBudget) * 0.4 + (hash % 8));

    for (let i = 0; i < points; i++) {
      const progress = i / (points - 1);
      const jitter = (Math.sin(i * 0.9 + hash * 0.1) + Math.cos(i * 1.2)) * 1.2;
      const baseValue = startBudget - (startBudget - currentBudget) * progress;
      const value = parseFloat(
        Math.max(0, Math.min(100, baseValue + jitter)).toFixed(2),
      );
      values.push(value);
    }

    if (values.length > 0) {
      values[values.length - 1] = currentBudget;
    }

    return values;
  }, []);

  /**
   * Flatten all services from domains with error budget data computed.
   */
  const allServices = useMemo(() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return [];
    }

    return domains.flatMap((domain) =>
      (domain.services || []).map((service) => {
        const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;
        const sloTarget =
          service.slo != null ? service.slo : (DEFAULT_SLO_TARGETS[tier] ?? 99.5);
        const errorBudget =
          service.error_budget != null ? service.error_budget : 100;

        // Determine budget status
        let budgetStatus = 'healthy';
        if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL) {
          budgetStatus = 'critical';
        } else if (errorBudget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING) {
          budgetStatus = 'warning';
        }

        // Calculate burn rate (simulated: budget consumed per day over 30-day window)
        const budgetConsumed = 100 - errorBudget;
        const burnRate = parseFloat((budgetConsumed / 30).toFixed(2));

        // Calculate trend from simulated burn-down data
        const budgetValues = generateBudgetTrendValues(errorBudget, service.service_id);
        const trendResult = calculateTrendDirection(budgetValues, { threshold: 3 });

        // Get budget status label
        let budgetStatusLabel = 'Healthy';
        if (budgetStatus === 'critical') {
          budgetStatusLabel = 'Breached';
        } else if (budgetStatus === 'warning') {
          budgetStatusLabel = 'At Risk';
        }

        return {
          id: service.service_id,
          service_id: service.service_id,
          name: service.name,
          domain_id: domain.domain_id,
          domain_name: domain.name,
          domain_tier: tier,
          availability: service.availability,
          slo_target: sloTarget,
          error_budget: errorBudget,
          budget_status: budgetStatus,
          budget_status_label: budgetStatusLabel,
          burn_rate: burnRate,
          trend_direction: trendResult.direction,
          trend_change: Math.abs(trendResult.changePercent),
          status: service.status,
        };
      }),
    );
  }, [domains, generateBudgetTrendValues]);

  /**
   * Filter services based on filter mode and search query.
   */
  const filteredServices = useMemo(() => {
    let services = [...allServices];

    // Apply filter mode
    if (filterMode === 'at-risk') {
      services = services.filter(
        (s) => s.budget_status === 'warning' || s.budget_status === 'critical',
      );
    } else if (filterMode === 'breached') {
      services = services.filter((s) => s.budget_status === 'critical');
    }

    // Apply search query
    if (searchQuery && searchQuery.trim().length > 0) {
      const query = searchQuery.trim().toLowerCase();
      services = services.filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes(query)) ||
          (s.domain_name && s.domain_name.toLowerCase().includes(query)) ||
          (s.service_id && s.service_id.toLowerCase().includes(query)),
      );
    }

    return services;
  }, [allServices, filterMode, searchQuery]);

  /**
   * Sort filtered services by the current sort key and direction.
   */
  const sortedServices = useMemo(() => {
    if (!sortKey || filteredServices.length === 0) {
      return filteredServices;
    }

    const sorted = [...filteredServices];

    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
      if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Apply limit if specified
    if (limit > 0 && sorted.length > limit) {
      return sorted.slice(0, limit);
    }

    return sorted;
  }, [filteredServices, sortKey, sortDirection, limit]);

  /**
   * Compute pagination values.
   */
  const totalRows = sortedServices.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);

  const paginatedServices = useMemo(() => {
    if (!showPagination) {
      return sortedServices;
    }

    return sortedServices.slice(startIndex, endIndex);
  }, [sortedServices, startIndex, endIndex, showPagination]);

  /**
   * Summary counts for the header.
   */
  const summary = useMemo(() => {
    if (!allServices || allServices.length === 0) {
      return { total: 0, healthy: 0, warning: 0, critical: 0 };
    }

    return {
      total: allServices.length,
      healthy: allServices.filter((s) => s.budget_status === 'healthy').length,
      warning: allServices.filter((s) => s.budget_status === 'warning').length,
      critical: allServices.filter((s) => s.budget_status === 'critical').length,
    };
  }, [allServices]);

  /**
   * Handle column header click for sorting.
   */
  const handleSort = useCallback(
    (columnKey) => {
      if (sortKey === columnKey) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(columnKey);
        setSortDirection('asc');
      }
      setCurrentPage(1);
    },
    [sortKey],
  );

  /**
   * Handle search input change.
   */
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  /**
   * Handle search clear.
   */
  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  /**
   * Handle filter mode change.
   */
  const handleFilterModeChange = useCallback((mode) => {
    setFilterMode(mode);
    setCurrentPage(1);
  }, []);

  /**
   * Handle page change.
   */
  const handlePageChange = useCallback(
    (page) => {
      if (page < 1 || page > totalPages) {
        return;
      }
      setCurrentPage(page);
    },
    [totalPages],
  );

  /**
   * Get the budget color class based on the budget value.
   * @param {number} budget - The error budget percentage.
   * @returns {string} Tailwind text color class.
   */
  const getBudgetColorClass = useCallback((budget) => {
    if (budget == null || isNaN(budget)) return 'text-dashboard-text-muted';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL)
      return 'text-severity-critical';
    if (budget <= DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING)
      return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Get the progress bar color class based on budget status.
   * @param {string} budgetStatus - The budget status.
   * @returns {string} Tailwind background color class.
   */
  const getProgressBarColorClass = useCallback((budgetStatus) => {
    switch (budgetStatus) {
      case 'critical':
        return 'bg-severity-critical';
      case 'warning':
        return 'bg-status-degraded';
      case 'healthy':
      default:
        return 'bg-status-healthy';
    }
  }, []);

  /**
   * Get the burn rate color class.
   * @param {number} burnRate - The burn rate percentage per day.
   * @returns {string} Tailwind text color class.
   */
  const getBurnRateColorClass = useCallback((burnRate) => {
    if (burnRate == null || isNaN(burnRate)) return 'text-dashboard-text-muted';
    if (burnRate > 3) return 'text-severity-critical';
    if (burnRate > 1.5) return 'text-status-degraded';
    return 'text-dashboard-text-secondary';
  }, []);

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
   * Render pagination page buttons.
   */
  const renderPageButtons = useCallback(() => {
    const buttons = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, safeCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      buttons.push(
        <button
          key="page-1"
          onClick={() => handlePageChange(1)}
          className="flex items-center justify-center w-8 h-8 text-sm rounded-lg text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary transition-colors duration-150"
          aria-label="Go to page 1"
        >
          1
        </button>,
      );

      if (startPage > 2) {
        buttons.push(
          <span
            key="ellipsis-start"
            className="flex items-center justify-center w-8 h-8 text-sm text-dashboard-text-muted"
          >
            …
          </span>,
        );
      }
    }

    for (let page = startPage; page <= endPage; page++) {
      const isActive = page === safeCurrentPage;

      buttons.push(
        <button
          key={`page-${page}`}
          onClick={() => handlePageChange(page)}
          className={`flex items-center justify-center w-8 h-8 text-sm rounded-lg transition-colors duration-150 ${
            isActive
              ? 'bg-brand-600 text-white font-medium'
              : 'text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary'
          }`}
          aria-label={`Go to page ${page}`}
          aria-current={isActive ? 'page' : undefined}
        >
          {page}
        </button>,
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        buttons.push(
          <span
            key="ellipsis-end"
            className="flex items-center justify-center w-8 h-8 text-sm text-dashboard-text-muted"
          >
            …
          </span>,
        );
      }

      buttons.push(
        <button
          key={`page-${totalPages}`}
          onClick={() => handlePageChange(totalPages)}
          className="flex items-center justify-center w-8 h-8 text-sm rounded-lg text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary transition-colors duration-150"
          aria-label={`Go to page ${totalPages}`}
        >
          {totalPages}
        </button>,
      );
    }

    return buttons;
  }, [safeCurrentPage, totalPages, handlePageChange]);

  /**
   * Render the filter mode toggle buttons.
   */
  function renderFilterToggle() {
    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => handleFilterModeChange('all')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            filterMode === 'all'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={filterMode === 'all'}
          aria-label="Show all services"
        >
          All
        </button>
        <button
          onClick={() => handleFilterModeChange('at-risk')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            filterMode === 'at-risk'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={filterMode === 'at-risk'}
          aria-label="Show at-risk and breached services"
        >
          At Risk
        </button>
        <button
          onClick={() => handleFilterModeChange('breached')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            filterMode === 'breached'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={filterMode === 'breached'}
          aria-label="Show breached services only"
        >
          Breached
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading error budget data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load error budget data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state — no domains at all
  if (!domains || domains.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No error budget data"
          description="No domain or service data is available. Upload metrics data to populate the error budget table."
          size="md"
        />
      </div>
    );
  }

  const hasData = paginatedServices && paginatedServices.length > 0;

  // Column definitions
  const columns = [
    {
      key: 'name',
      label: 'Service',
      sortable: true,
      align: 'left',
      width: compact ? '28%' : '22%',
    },
    {
      key: 'domain_name',
      label: 'Domain',
      sortable: true,
      align: 'left',
      width: compact ? '18%' : '14%',
    },
    {
      key: 'slo_target',
      label: 'SLO Target',
      sortable: true,
      align: 'right',
      width: '10%',
    },
    {
      key: 'error_budget',
      label: 'Budget Remaining',
      sortable: true,
      align: 'right',
      width: compact ? '18%' : '16%',
    },
    {
      key: 'burn_rate',
      label: 'Burn Rate',
      sortable: true,
      align: 'right',
      width: '10%',
    },
    {
      key: 'budget_status',
      label: 'Status',
      sortable: true,
      align: 'center',
      width: '12%',
    },
    {
      key: 'trend_direction',
      label: 'Trend',
      sortable: false,
      align: 'center',
      width: '8%',
    },
  ];

  // In compact mode, remove some columns
  const visibleColumns = compact
    ? columns.filter((col) => !['domain_name', 'slo_target'].includes(col.key))
    : columns;

  return (
    <div className={`${className}`}>
      <div className="dashboard-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-sm font-semibold text-dashboard-text-primary">
              Error Budget Summary
            </h3>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
              {filteredServices.length}
            </span>
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              {summary.critical > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-down animate-pulse" />
                  {summary.critical} breached
                </span>
              )}
              {summary.warning > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-degraded" />
                  {summary.warning} at risk
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-healthy" />
                {summary.healthy} healthy
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {renderFilterToggle()}

            {showSearch && (
              <div className="relative">
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
                  placeholder="Search services…"
                  className="w-48 lg:w-64 pl-9 pr-8 py-1.5 text-sm bg-gray-50 border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
                  aria-label="Search error budget table"
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
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="border-b border-dashboard-border bg-gray-50/50">
                {visibleColumns.map((col) => {
                  const isSorted = sortKey === col.key;
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';

                  return (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted ${alignClass}`}
                      style={col.width ? { width: col.width } : undefined}
                      scope="col"
                    >
                      {col.sortable ? (
                        <button
                          onClick={() => handleSort(col.key)}
                          className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                            isSorted ? 'text-brand-600' : ''
                          }`}
                          aria-sort={
                            isSorted
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          aria-label={`Sort by ${col.label}`}
                        >
                          <span>{col.label}</span>
                          {renderSortIcon(col.key)}
                        </button>
                      ) : (
                        <span>{col.label}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-dashboard-border">
              {hasData ? (
                paginatedServices.map((service) => (
                  <tr
                    key={service.service_id}
                    className="hover:bg-gray-50/50 transition-colors duration-150"
                  >
                    {/* Service Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                            service.budget_status === 'healthy'
                              ? 'bg-status-healthy'
                              : service.budget_status === 'warning'
                                ? 'bg-status-degraded'
                                : 'bg-status-down animate-pulse'
                          }`}
                        />
                        <span className="text-sm font-medium text-dashboard-text-primary truncate">
                          {service.name || '—'}
                        </span>
                      </div>
                    </td>

                    {/* Domain (hidden in compact) */}
                    {!compact && (
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
                    )}

                    {/* SLO Target (hidden in compact) */}
                    {!compact && (
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-dashboard-text-muted">
                          {service.slo_target != null
                            ? formatPercentage(service.slo_target, 2)
                            : '—'}
                        </span>
                      </td>
                    )}

                    {/* Budget Remaining */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${getProgressBarColorClass(service.budget_status)}`}
                            style={{
                              width: `${Math.max(0, Math.min(100, service.error_budget))}%`,
                            }}
                            title={`${formatPercentage(service.error_budget, 1)} remaining`}
                          />
                        </div>
                        <span
                          className={`text-sm font-semibold ${getBudgetColorClass(service.error_budget)}`}
                        >
                          {service.error_budget != null
                            ? formatPercentage(service.error_budget, 1)
                            : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Burn Rate */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-medium ${getBurnRateColorClass(service.burn_rate)}`}
                      >
                        {service.burn_rate != null ? `${service.burn_rate}%/day` : '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        status={
                          service.budget_status === 'critical'
                            ? 'critical'
                            : service.budget_status === 'warning'
                              ? 'warning'
                              : 'healthy'
                        }
                        size="sm"
                        label={service.budget_status_label}
                      />
                    </td>

                    {/* Trend */}
                    <td className="px-4 py-3 text-center">
                      <TrendArrow
                        direction={service.trend_direction || 'stable'}
                        invertColor={true}
                        size="sm"
                        showValue={false}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={visibleColumns.length}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <svg
                        className="w-10 h-10 text-dashboard-text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                        />
                      </svg>
                      <p className="text-sm text-dashboard-text-muted">
                        {searchQuery.length > 0
                          ? 'No services match your search.'
                          : filterMode !== 'all'
                            ? `No ${filterMode === 'breached' ? 'breached' : 'at-risk'} services found.`
                            : 'No error budget data available.'}
                      </p>
                      {searchQuery.length > 0 && (
                        <button
                          onClick={handleSearchClear}
                          className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {showPagination && hasData && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                Showing {startIndex + 1}–{endIndex} of {totalRows}
                {filteredServices.length !== allServices.length && (
                  <span className="ml-1">(filtered from {allServices.length})</span>
                )}
              </span>
              <span>
                Thresholds: Warning{' '}
                <span className="font-medium text-status-degraded">
                  {DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING}%
                </span>
                {' / '}Critical{' '}
                <span className="font-medium text-severity-critical">
                  {DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL}%
                </span>
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(safeCurrentPage - 1)}
                  disabled={safeCurrentPage <= 1}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 ${
                    safeCurrentPage <= 1
                      ? 'text-dashboard-text-muted cursor-not-allowed opacity-50'
                      : 'text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary'
                  }`}
                  aria-label="Previous page"
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
                      d="M15.75 19.5L8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>

                {renderPageButtons()}

                <button
                  onClick={() => handlePageChange(safeCurrentPage + 1)}
                  disabled={safeCurrentPage >= totalPages}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 ${
                    safeCurrentPage >= totalPages
                      ? 'text-dashboard-text-muted cursor-not-allowed opacity-50'
                      : 'text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary'
                  }`}
                  aria-label="Next page"
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
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { ErrorBudgetTable };
export default ErrorBudgetTable;