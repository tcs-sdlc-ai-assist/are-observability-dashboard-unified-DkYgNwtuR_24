import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../shared/ToastNotification';
import { StatusBadge } from '../shared/StatusBadge';
import { MetricCard } from '../shared/MetricCard';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { RoleGate } from '../auth/RoleGate';
import { PERMISSIONS } from '../../constants/roles';
import {
  getLogs,
  exportLogs,
  getLogSummary,
  AUDIT_ACTIONS,
  AUDIT_RESULTS,
} from '../../services/auditLogger';
import { formatTimestamp, formatNumber } from '../../utils/formatters';
import { getRelativeTime } from '../../utils/dateUtils';

/**
 * Action label mapping for display.
 */
const ACTION_LABELS = Object.freeze({
  [AUDIT_ACTIONS.LOGIN]: 'Login',
  [AUDIT_ACTIONS.LOGOUT]: 'Logout',
  [AUDIT_ACTIONS.SESSION_VALIDATED]: 'Session Validated',
  [AUDIT_ACTIONS.UPLOAD_DATA]: 'Upload Data',
  [AUDIT_ACTIONS.CONFIGURE_METRICS]: 'Configure Metrics',
  [AUDIT_ACTIONS.CONFIGURE_THRESHOLDS]: 'Configure Thresholds',
  [AUDIT_ACTIONS.MANAGE_USERS]: 'Manage Users',
  [AUDIT_ACTIONS.MANAGE_ROLES]: 'Manage Roles',
  [AUDIT_ACTIONS.EXPORT_DATA]: 'Export Data',
  [AUDIT_ACTIONS.ANNOTATE]: 'Annotate',
  [AUDIT_ACTIONS.VIEW_DASHBOARD]: 'View Dashboard',
  [AUDIT_ACTIONS.VIEW_METRICS]: 'View Metrics',
  [AUDIT_ACTIONS.VIEW_ALERTS]: 'View Alerts',
  [AUDIT_ACTIONS.VIEW_AUDIT_LOGS]: 'View Audit Logs',
});

/**
 * Result status badge mapping.
 */
const RESULT_STATUS_MAP = Object.freeze({
  [AUDIT_RESULTS.SUCCESS]: 'healthy',
  [AUDIT_RESULTS.FAILURE]: 'critical',
  [AUDIT_RESULTS.DENIED]: 'warning',
  [AUDIT_RESULTS.ERROR]: 'critical',
});

/**
 * Default page size for the audit log table.
 */
const DEFAULT_PAGE_SIZE = 15;

/**
 * AuditLogViewer - Admin-only audit log viewer with filterable/sortable table
 * of all logged actions. Columns: timestamp, user, action, resource, metadata.
 * Export to CSV/JSON button. Uses auditLogger service.
 *
 * Features:
 * - Filterable/sortable table of all audit log entries
 * - Columns: timestamp, user, action, resource, status, description
 * - Filter by action type, result status, user, and free-text search
 * - Sort by timestamp, user, action, or status
 * - Expandable rows to show full details and metadata
 * - Export to CSV and JSON formats
 * - Summary metric cards (total entries, by action, by status)
 * - Pagination with configurable page size
 * - Gated by VIEW_AUDIT_LOGS permission
 * - Loading and empty states
 * - Responsive layout with compact mode support
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {boolean} [props.showExport=true] - Whether to show the export buttons.
 * @param {number} [props.pageSize=DEFAULT_PAGE_SIZE] - Number of rows per page.
 * @returns {React.ReactNode}
 */
const AuditLogViewer = ({
  className = '',
  compact = false,
  showMetricCards = true,
  showExport = true,
  pageSize = DEFAULT_PAGE_SIZE,
}) => {
  const { currentUser } = useAuth();
  const { canViewAudit, canExport } = usePermissions();
  const { success: toastSuccess, error: toastError } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterUserId, setFilterUserId] = useState(null);
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const [summary, setSummary] = useState(null);

  /**
   * Load audit logs and summary data.
   */
  const loadLogs = useCallback(() => {
    setIsLoading(true);

    try {
      const filters = {
        sortOrder: sortDirection,
      };

      if (searchQuery && searchQuery.trim().length > 0) {
        filters.searchQuery = searchQuery.trim();
      }

      if (filterAction) {
        filters.action = filterAction;
      }

      if (filterStatus) {
        filters.status = filterStatus;
      }

      if (filterUserId) {
        filters.userId = filterUserId;
      }

      const result = getLogs(filters);

      if (result.error) {
        toastError(result.error);
        setLogs([]);
        setTotalLogs(0);
        setFilteredCount(0);
      } else {
        setLogs(result.logs || []);
        setTotalLogs(result.total);
        setFilteredCount(result.filtered);
      }

      // Load summary
      const summaryResult = getLogSummary();
      if (!summaryResult.error) {
        setSummary(summaryResult);
      }
    } catch (e) {
      console.error('[AuditLogViewer] Failed to load logs:', e);
      toastError('Failed to load audit logs.');
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filterAction, filterStatus, filterUserId, sortDirection, toastError]);

  /**
   * Load logs on mount and when filters change.
   */
  useEffect(() => {
    if (canViewAudit) {
      loadLogs();
    }
  }, [canViewAudit, loadLogs]);

  /**
   * Sort logs by the current sort key and direction.
   */
  const sortedLogs = useMemo(() => {
    if (!logs || logs.length === 0) {
      return [];
    }

    const sorted = [...logs];

    sorted.sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
      if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

      if (sortKey === 'timestamp') {
        const dateA = new Date(aVal).getTime();
        const dateB = new Date(bVal).getTime();
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [logs, sortKey, sortDirection]);

  /**
   * Compute pagination values.
   */
  const totalRows = sortedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);

  /**
   * Paginated logs for the current page.
   */
  const paginatedLogs = useMemo(() => {
    return sortedLogs.slice(startIndex, endIndex);
  }, [sortedLogs, startIndex, endIndex]);

  /**
   * Unique action options for the filter dropdown.
   */
  const actionOptions = useMemo(() => {
    return Object.values(AUDIT_ACTIONS).map((action) => ({
      value: action,
      label: ACTION_LABELS[action] || action,
    }));
  }, []);

  /**
   * Unique status options for the filter dropdown.
   */
  const statusOptions = useMemo(() => {
    return Object.values(AUDIT_RESULTS).map((status) => ({
      value: status,
      label: status,
    }));
  }, []);

  /**
   * Unique user options derived from loaded logs.
   */
  const userOptions = useMemo(() => {
    if (!summary || !summary.byUser) return [];

    return Object.entries(summary.byUser).map(([userId, info]) => ({
      value: userId,
      label: info.user_name || info.user_email || userId,
    }));
  }, [summary]);

  /**
   * Whether any filter is active.
   */
  const hasActiveFilters = useMemo(() => {
    return (
      filterAction !== null ||
      filterStatus !== null ||
      filterUserId !== null ||
      (searchQuery && searchQuery.trim().length > 0)
    );
  }, [filterAction, filterStatus, filterUserId, searchQuery]);

  /**
   * Handle column header click for sorting.
   */
  const handleSort = useCallback(
    (columnKey) => {
      if (sortKey === columnKey) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(columnKey);
        setSortDirection('desc');
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
   * Handle action filter change.
   */
  const handleActionFilterChange = useCallback((e) => {
    const val = e.target.value;
    setFilterAction(val === '' ? null : val);
    setCurrentPage(1);
  }, []);

  /**
   * Handle status filter change.
   */
  const handleStatusFilterChange = useCallback((e) => {
    const val = e.target.value;
    setFilterStatus(val === '' ? null : val);
    setCurrentPage(1);
  }, []);

  /**
   * Handle user filter change.
   */
  const handleUserFilterChange = useCallback((e) => {
    const val = e.target.value;
    setFilterUserId(val === '' ? null : val);
    setCurrentPage(1);
  }, []);

  /**
   * Reset all filters.
   */
  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterAction(null);
    setFilterStatus(null);
    setFilterUserId(null);
    setCurrentPage(1);
  }, []);

  /**
   * Handle page change.
   */
  const handlePageChange = useCallback(
    (page) => {
      if (page < 1 || page > totalPages) return;
      setCurrentPage(page);
    },
    [totalPages],
  );

  /**
   * Toggle expanded state of a row.
   */
  const toggleRow = useCallback((logId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  }, []);

  /**
   * Handle export.
   */
  const handleExport = useCallback(
    (format) => {
      if (!canExport) {
        toastError('You do not have permission to export data.');
        return;
      }

      setIsExporting(true);

      try {
        const filters = {};

        if (searchQuery && searchQuery.trim().length > 0) {
          filters.searchQuery = searchQuery.trim();
        }

        if (filterAction) {
          filters.action = filterAction;
        }

        if (filterStatus) {
          filters.status = filterStatus;
        }

        if (filterUserId) {
          filters.userId = filterUserId;
        }

        const result = exportLogs(format, filters, {
          baseName: 'audit-logs',
        });

        if (result.success) {
          toastSuccess(
            `Exported ${result.recordCount} audit log entries as ${format.toUpperCase()}.`,
          );
        } else {
          toastError(result.error || 'Failed to export audit logs.');
        }
      } catch (e) {
        console.error('[AuditLogViewer] Export failed:', e);
        toastError('An unexpected error occurred during export.');
      } finally {
        setIsExporting(false);
      }
    },
    [canExport, searchQuery, filterAction, filterStatus, filterUserId, toastSuccess, toastError],
  );

  /**
   * Handle refresh.
   */
  const handleRefresh = useCallback(() => {
    loadLogs();
  }, [loadLogs]);

  /**
   * Get the action badge color class.
   */
  const getActionBadgeClass = useCallback((action) => {
    if (!action) return 'bg-gray-100 text-gray-700';

    switch (action) {
      case AUDIT_ACTIONS.LOGIN:
      case AUDIT_ACTIONS.LOGOUT:
      case AUDIT_ACTIONS.SESSION_VALIDATED:
        return 'bg-blue-50 text-blue-800';
      case AUDIT_ACTIONS.UPLOAD_DATA:
        return 'bg-brand-50 text-brand-800';
      case AUDIT_ACTIONS.CONFIGURE_METRICS:
      case AUDIT_ACTIONS.CONFIGURE_THRESHOLDS:
        return 'bg-purple-50 text-purple-800';
      case AUDIT_ACTIONS.MANAGE_USERS:
      case AUDIT_ACTIONS.MANAGE_ROLES:
        return 'bg-orange-50 text-orange-800';
      case AUDIT_ACTIONS.EXPORT_DATA:
        return 'bg-green-50 text-green-800';
      case AUDIT_ACTIONS.ANNOTATE:
        return 'bg-yellow-50 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
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

  // Permission check
  if (!canViewAudit) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-access"
          title="Audit Log Access Required"
          description="You do not have permission to view audit logs. Contact an Admin for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading audit logs…" size="md" />
      </div>
    );
  }

  const hasData = paginatedLogs && paginatedLogs.length > 0;

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            Audit Logs
          </h3>
          <StatusBadge
            status="healthy"
            size="sm"
            label={`${formatNumber(totalLogs, { decimals: 0 })} Entries`}
          />
        </div>
        <div className="flex items-center gap-3">
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 transition-colors duration-150"
            aria-label="Refresh audit logs"
          >
            <svg
              className="w-3.5 h-3.5"
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
            Refresh
          </button>

          {/* Export buttons */}
          {showExport && canExport && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleExport('csv')}
                disabled={isExporting || totalRows === 0}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
                  isExporting || totalRows === 0
                    ? 'bg-gray-100 text-dashboard-text-muted cursor-not-allowed'
                    : 'bg-white border border-dashboard-border text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
                }`}
                aria-label="Export as CSV"
              >
                {isExporting ? (
                  <div className="w-3 h-3 border-2 border-dashboard-text-muted/30 border-t-dashboard-text-muted rounded-full animate-spin" />
                ) : (
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
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                )}
                CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                disabled={isExporting || totalRows === 0}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
                  isExporting || totalRows === 0
                    ? 'bg-gray-100 text-dashboard-text-muted cursor-not-allowed'
                    : 'bg-white border border-dashboard-border text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
                }`}
                aria-label="Export as JSON"
              >
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Metric Cards */}
      {showMetricCards && summary && (
        <div
          className={`grid gap-4 mb-6 ${
            compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          <MetricCard
            title="Total Entries"
            value={summary.totalEntries}
            unit="count"
            size={compact ? 'sm' : 'md'}
          />
          <MetricCard
            title="Unique Users"
            value={Object.keys(summary.byUser || {}).length}
            unit="count"
            size={compact ? 'sm' : 'md'}
          />
          <MetricCard
            title="Successful"
            value={summary.byStatus?.[AUDIT_RESULTS.SUCCESS] || 0}
            unit="count"
            size={compact ? 'sm' : 'md'}
            status="healthy"
          />
          <MetricCard
            title="Failures / Denied"
            value={
              (summary.byStatus?.[AUDIT_RESULTS.FAILURE] || 0) +
              (summary.byStatus?.[AUDIT_RESULTS.DENIED] || 0) +
              (summary.byStatus?.[AUDIT_RESULTS.ERROR] || 0)
            }
            unit="count"
            size={compact ? 'sm' : 'md'}
            status={
              (summary.byStatus?.[AUDIT_RESULTS.FAILURE] || 0) +
                (summary.byStatus?.[AUDIT_RESULTS.DENIED] || 0) +
                (summary.byStatus?.[AUDIT_RESULTS.ERROR] || 0) >
              0
                ? 'warning'
                : 'healthy'
            }
          />
        </div>
      )}

      {/* Filters and Table */}
      <div className="dashboard-card overflow-hidden">
        {/* Header with Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <h4 className="text-sm font-semibold text-dashboard-text-primary">
              Log Entries
            </h4>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
              {totalRows}
            </span>
            {hasActiveFilters && (
              <span className="text-xs text-dashboard-text-muted">
                (filtered from {totalLogs})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Action filter */}
            <select
              value={filterAction || ''}
              onChange={handleActionFilterChange}
              className="px-2 py-1.5 text-xs bg-white border border-dashboard-border rounded-lg text-dashboard-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
              aria-label="Filter by action"
            >
              <option value="">All Actions</option>
              {actionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={filterStatus || ''}
              onChange={handleStatusFilterChange}
              className="px-2 py-1.5 text-xs bg-white border border-dashboard-border rounded-lg text-dashboard-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* User filter */}
            {userOptions.length > 0 && (
              <select
                value={filterUserId || ''}
                onChange={handleUserFilterChange}
                className="px-2 py-1.5 text-xs bg-white border border-dashboard-border rounded-lg text-dashboard-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
                aria-label="Filter by user"
              >
                <option value="">All Users</option>
                {userOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {/* Search input */}
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
                placeholder="Search logs…"
                className="w-48 lg:w-64 pl-9 pr-8 py-1.5 text-sm bg-gray-50 border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
                aria-label="Search audit logs"
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

            {/* Reset filters */}
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary rounded-lg transition-colors duration-150"
                aria-label="Reset all filters"
              >
                <svg
                  className="w-3.5 h-3.5"
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
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="border-b border-dashboard-border bg-gray-50/50">
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                  style={{ width: compact ? '18%' : '16%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSort('timestamp')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'timestamp' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'timestamp'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by timestamp"
                  >
                    <span>Timestamp</span>
                    {renderSortIcon('timestamp')}
                  </button>
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                  style={{ width: compact ? '16%' : '14%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSort('user_name')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'user_name' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'user_name'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by user"
                  >
                    <span>User</span>
                    {renderSortIcon('user_name')}
                  </button>
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                  style={{ width: '12%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSort('action')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'action' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'action'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by action"
                  >
                    <span>Action</span>
                    {renderSortIcon('action')}
                  </button>
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                  style={{ width: compact ? '14%' : '12%' }}
                  scope="col"
                >
                  Resource
                </th>
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                  style={{ width: '10%' }}
                  scope="col"
                >
                  <button
                    onClick={() => handleSort('status')}
                    className={`inline-flex items-center gap-1 group transition-colors duration-150 hover:text-dashboard-text-secondary ${
                      sortKey === 'status' ? 'text-brand-600' : ''
                    }`}
                    aria-sort={
                      sortKey === 'status'
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    aria-label="Sort by status"
                  >
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </button>
                </th>
                {!compact && (
                  <th
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                    style={{ width: '28%' }}
                    scope="col"
                  >
                    Description
                  </th>
                )}
                <th
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center"
                  style={{ width: '6%' }}
                  scope="col"
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashboard-border">
              {hasData ? (
                paginatedLogs.map((log) => {
                  const isExpanded = expandedRows[log.id] || false;
                  const statusBadgeStatus =
                    RESULT_STATUS_MAP[log.status] || 'unknown';

                  return (
                    <tr key={log.id} className="group">
                      <td colSpan={compact ? 6 : 7} className="p-0">
                        {/* Main Row */}
                        <div
                          className="flex items-center hover:bg-gray-50/50 transition-colors duration-150 cursor-pointer"
                          onClick={() => toggleRow(log.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleRow(log.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={`Audit log entry: ${ACTION_LABELS[log.action] || log.action} by ${log.user_name || log.user_id}`}
                        >
                          {/* Timestamp */}
                          <div
                            className="px-4 py-3"
                            style={{ width: compact ? '18%' : '16%' }}
                          >
                            <span
                              className="text-xs text-dashboard-text-secondary"
                              title={
                                log.timestamp
                                  ? formatTimestamp(log.timestamp, {
                                      includeSeconds: true,
                                    })
                                  : '—'
                              }
                            >
                              {log.timestamp
                                ? getRelativeTime(log.timestamp)
                                : '—'}
                            </span>
                          </div>

                          {/* User */}
                          <div
                            className="px-4 py-3"
                            style={{ width: compact ? '16%' : '14%' }}
                          >
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-dashboard-text-primary truncate block max-w-[140px]">
                                {log.user_name || log.user_id || '—'}
                              </span>
                              {log.user_email && (
                                <span className="text-[10px] text-dashboard-text-muted truncate block max-w-[140px]">
                                  {log.user_email}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action */}
                          <div
                            className="px-4 py-3"
                            style={{ width: '12%' }}
                          >
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 ${getActionBadgeClass(log.action)}`}
                            >
                              {ACTION_LABELS[log.action] || log.action || '—'}
                            </span>
                          </div>

                          {/* Resource */}
                          <div
                            className="px-4 py-3"
                            style={{ width: compact ? '14%' : '12%' }}
                          >
                            <span className="text-sm text-dashboard-text-secondary truncate block max-w-[120px]">
                              {log.resource_type || '—'}
                            </span>
                            {log.resource_id && (
                              <span className="text-[10px] text-dashboard-text-muted font-mono truncate block max-w-[120px]">
                                {log.resource_id}
                              </span>
                            )}
                          </div>

                          {/* Status */}
                          <div
                            className="px-4 py-3 text-center"
                            style={{ width: '10%' }}
                          >
                            <StatusBadge
                              status={statusBadgeStatus}
                              size="sm"
                              label={log.status || 'Unknown'}
                            />
                          </div>

                          {/* Description (hidden in compact) */}
                          {!compact && (
                            <div
                              className="px-4 py-3"
                              style={{ width: '28%' }}
                            >
                              <span className="text-xs text-dashboard-text-muted truncate block max-w-[280px]">
                                {log.description || '—'}
                              </span>
                            </div>
                          )}

                          {/* Expand/Collapse */}
                          <div
                            className="px-4 py-3 text-center"
                            style={{ width: '6%' }}
                          >
                            <svg
                              className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-200 mx-auto ${
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
                          </div>
                        </div>

                        {/* Expanded Detail */}
                        {isExpanded && (
                          <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                            <div className="px-4 py-3">
                              <div
                                className={`grid gap-4 ${
                                  compact
                                    ? 'grid-cols-1'
                                    : 'grid-cols-1 md:grid-cols-2'
                                }`}
                              >
                                {/* Left column: Entry details */}
                                <div className="space-y-2">
                                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                    Entry Details
                                  </h6>
                                  <div className="flex flex-col gap-1.5 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        Log ID:
                                      </span>
                                      <span className="font-mono text-[10px] text-dashboard-text-secondary truncate">
                                        {log.id || '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        Timestamp:
                                      </span>
                                      <span className="text-dashboard-text-secondary">
                                        {log.timestamp
                                          ? formatTimestamp(log.timestamp, {
                                              includeSeconds: true,
                                            })
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        User ID:
                                      </span>
                                      <span className="font-mono text-[10px] text-dashboard-text-secondary">
                                        {log.user_id || '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        User Name:
                                      </span>
                                      <span className="text-dashboard-text-secondary">
                                        {log.user_name || '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        Email:
                                      </span>
                                      <span className="text-dashboard-text-secondary">
                                        {log.user_email || '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        Action:
                                      </span>
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-4 ${getActionBadgeClass(log.action)}`}
                                      >
                                        {ACTION_LABELS[log.action] ||
                                          log.action ||
                                          '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        Resource:
                                      </span>
                                      <span className="text-dashboard-text-secondary">
                                        {log.resource_type || '—'}
                                        {log.resource_id && (
                                          <span className="ml-1 font-mono text-[10px]">
                                            ({log.resource_id})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                        Status:
                                      </span>
                                      <StatusBadge
                                        status={statusBadgeStatus}
                                        size="sm"
                                        label={log.status || 'Unknown'}
                                      />
                                    </div>
                                    {log.ip_address && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-dashboard-text-muted w-20 flex-shrink-0">
                                          IP Address:
                                        </span>
                                        <span className="font-mono text-[10px] text-dashboard-text-secondary">
                                          {log.ip_address}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Right column: Description and metadata */}
                                <div className="space-y-2">
                                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                    Description & Metadata
                                  </h6>
                                  {log.description && (
                                    <p className="text-xs text-dashboard-text-secondary leading-relaxed">
                                      {log.description}
                                    </p>
                                  )}
                                  {log.details &&
                                    typeof log.details === 'object' && (
                                      <div className="mt-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                          Details
                                        </span>
                                        <pre className="mt-1 px-3 py-2 bg-white rounded-lg border border-dashboard-border text-[10px] text-dashboard-text-secondary font-mono overflow-x-auto scrollbar-thin max-h-40">
                                          {JSON.stringify(
                                            log.details,
                                            null,
                                            2,
                                          )}
                                        </pre>
                                      </div>
                                    )}
                                  {log.metadata &&
                                    typeof log.metadata === 'object' && (
                                      <div className="mt-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                          Metadata
                                        </span>
                                        <pre className="mt-1 px-3 py-2 bg-white rounded-lg border border-dashboard-border text-[10px] text-dashboard-text-secondary font-mono overflow-x-auto scrollbar-thin max-h-40">
                                          {JSON.stringify(
                                            log.metadata,
                                            null,
                                            2,
                                          )}
                                        </pre>
                                      </div>
                                    )}
                                  {!log.description &&
                                    !log.details &&
                                    !log.metadata && (
                                      <p className="text-xs text-dashboard-text-muted italic">
                                        No additional details available.
                                      </p>
                                    )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={compact ? 6 : 7}
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
                          d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
                        />
                      </svg>
                      <p className="text-sm text-dashboard-text-muted">
                        {hasActiveFilters
                          ? 'No audit log entries match your filters.'
                          : 'No audit log entries found.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150"
                        >
                          Reset filters
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
        {hasData && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                Showing {startIndex + 1}–{endIndex} of {totalRows}
                {hasActiveFilters && (
                  <span className="ml-1">(filtered from {totalLogs})</span>
                )}
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

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              {totalLogs} total audit log{totalLogs !== 1 ? ' entries' : ' entry'}
            </span>
            {summary && summary.byAction && (
              <>
                <span>·</span>
                <span>
                  {Object.keys(summary.byAction).length} action type
                  {Object.keys(summary.byAction).length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>Audit logs are immutable and append-only</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { AuditLogViewer, ACTION_LABELS, RESULT_STATUS_MAP };
export default AuditLogViewer;