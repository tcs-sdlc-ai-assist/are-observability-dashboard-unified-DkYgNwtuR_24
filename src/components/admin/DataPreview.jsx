import { useState, useCallback, useMemo } from 'react';
import { StatusBadge } from '../shared/StatusBadge';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { formatNumber } from '../../utils/formatters';

/**
 * Schema field mapping labels for display.
 */
const SCHEMA_FIELD_LABELS = Object.freeze({
  metrics: {
    domain_id: 'Domain ID',
    service_id: 'Service ID',
    service_name: 'Service Name',
    domain_name: 'Domain Name',
    tier: 'Tier',
    timestamp: 'Timestamp',
    availability: 'Availability (%)',
    sla: 'SLA Target (%)',
    slo: 'SLO Target (%)',
    error_budget: 'Error Budget (%)',
    latency_p95: 'P95 Latency (ms)',
    latency_p99: 'P99 Latency (ms)',
    traffic_rps: 'Traffic (rps)',
    errors_5xx: '5xx Errors',
    errors_functional: 'Functional Errors',
    saturation_cpu: 'CPU (%)',
    saturation_mem: 'Memory (%)',
    saturation_queue: 'Queue (%)',
  },
  incidents: {
    incident_id: 'Incident ID',
    service_id: 'Service ID',
    domain_id: 'Domain ID',
    severity: 'Severity',
    root_cause: 'Root Cause',
    title: 'Title',
    description: 'Description',
    start_time: 'Start Time',
    end_time: 'End Time',
    mttr: 'MTTR (min)',
    mttd: 'MTTD (min)',
    mtbf: 'MTBF (hr)',
    status: 'Status',
    evidence_links: 'Evidence Links',
  },
  deployments: {
    deployment_id: 'Deployment ID',
    service_id: 'Service ID',
    domain_id: 'Domain ID',
    version: 'Version',
    timestamp: 'Timestamp',
    deployer: 'Deployer',
    status: 'Status',
    change_type: 'Change Type',
    description: 'Description',
    rollback: 'Rollback',
    related_incident_id: 'Related Incident',
  },
});

/**
 * Maximum number of preview rows to display per page.
 */
const DEFAULT_PAGE_SIZE = 25;

/**
 * Maximum number of columns to display before horizontal scroll.
 */
const MAX_VISIBLE_COLUMNS = 10;

/**
 * DataPreview - Preview table component showing parsed CSV/Excel data before
 * admin commits upload. Displays validation errors inline, allows row-level
 * exclusion, and shows data mapping to dashboard schema.
 *
 * Features:
 * - Tabular preview of parsed rows with column headers
 * - Inline validation error highlighting per cell
 * - Row-level exclusion checkboxes to skip invalid rows
 * - Schema mapping display showing source column → dashboard field
 * - Validation error/warning summary panel
 * - Pagination for large datasets
 * - Row count and excluded row count display
 * - Column type indicators (required vs optional)
 * - Responsive horizontal scroll for wide tables
 * - Empty state when no data is available
 * - Loading state during parsing
 * - Compact mode support
 *
 * @param {Object} props
 * @param {Object[]} [props.rows=[]] - Array of parsed row objects to preview.
 * @param {Object[]} [props.columns=[]] - Array of column definition objects with key and label.
 * @param {string} [props.schemaType='metrics'] - The schema type for field label mapping ('metrics', 'incidents', 'deployments').
 * @param {Object[]} [props.errors=[]] - Array of validation error objects with row, field, message, and code.
 * @param {Object[]} [props.warnings=[]] - Array of validation warning objects with row, field, message, and code.
 * @param {Object} [props.meta=null] - Parse metadata (fields, totalRows, etc.).
 * @param {Set} [props.excludedRows] - Set of row indices to exclude from upload.
 * @param {Function} [props.onExcludeRow] - Callback when a row is toggled for exclusion. Receives (rowIndex, excluded).
 * @param {Function} [props.onExcludeAll] - Callback to exclude/include all rows. Receives (excludeAll: boolean).
 * @param {boolean} [props.isLoading=false] - Whether data is still being parsed.
 * @param {boolean} [props.showSchemaMapping=true] - Whether to show the schema mapping panel.
 * @param {boolean} [props.showExcludeControls=true] - Whether to show row exclusion checkboxes.
 * @param {boolean} [props.showPagination=true] - Whether to show pagination controls.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {number} [props.pageSize=DEFAULT_PAGE_SIZE] - Number of rows per page.
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @returns {React.ReactNode}
 */
const DataPreview = ({
  rows = [],
  columns: propColumns,
  schemaType = 'metrics',
  errors = [],
  warnings = [],
  meta = null,
  excludedRows,
  onExcludeRow,
  onExcludeAll,
  isLoading = false,
  showSchemaMapping = true,
  showExcludeControls = true,
  showPagination = true,
  compact = false,
  pageSize = DEFAULT_PAGE_SIZE,
  className = '',
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [isSchemaMappingExpanded, setIsSchemaMappingExpanded] = useState(false);

  /**
   * Resolve the excluded rows set, defaulting to an empty set.
   */
  const resolvedExcludedRows = useMemo(() => {
    if (excludedRows instanceof Set) {
      return excludedRows;
    }
    return new Set();
  }, [excludedRows]);

  /**
   * Resolve column definitions from props or derive from the first row.
   */
  const resolvedColumns = useMemo(() => {
    if (propColumns && Array.isArray(propColumns) && propColumns.length > 0) {
      return propColumns.slice(0, MAX_VISIBLE_COLUMNS);
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    const keys = Object.keys(rows[0]);
    const schemaLabels = SCHEMA_FIELD_LABELS[schemaType] || {};
    const maxCols = Math.min(keys.length, MAX_VISIBLE_COLUMNS);

    return keys.slice(0, maxCols).map((key) => ({
      key,
      label: schemaLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }, [propColumns, rows, schemaType]);

  /**
   * Total column count from the first row (for display purposes).
   */
  const totalColumnCount = useMemo(() => {
    if (!rows || rows.length === 0) return 0;
    return Object.keys(rows[0]).length;
  }, [rows]);

  /**
   * Build an error lookup map keyed by "rowIndex::fieldName" for fast cell-level error checking.
   */
  const errorLookup = useMemo(() => {
    const map = new Map();

    if (!errors || !Array.isArray(errors)) return map;

    for (const err of errors) {
      if (err.row != null && err.field) {
        const key = `${err.row}::${err.field}`;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(err);
      }
    }

    return map;
  }, [errors]);

  /**
   * Build a row-level error lookup map keyed by row index.
   */
  const rowErrorLookup = useMemo(() => {
    const map = new Map();

    if (!errors || !Array.isArray(errors)) return map;

    for (const err of errors) {
      if (err.row != null) {
        if (!map.has(err.row)) {
          map.set(err.row, []);
        }
        map.get(err.row).push(err);
      }
    }

    return map;
  }, [errors]);

  /**
   * Compute schema mapping data for the mapping panel.
   */
  const schemaMapping = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    const schemaLabels = SCHEMA_FIELD_LABELS[schemaType] || {};
    const allKeys = Object.keys(rows[0]);

    return allKeys.map((key) => {
      const isMapped = Boolean(schemaLabels[key]);
      const dashboardField = schemaLabels[key] || null;

      return {
        sourceColumn: key,
        dashboardField,
        isMapped,
        isRequired: isRequiredField(key, schemaType),
      };
    });
  }, [rows, schemaType]);

  /**
   * Compute pagination values.
   */
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);

  /**
   * Paginated rows for the current page.
   */
  const paginatedRows = useMemo(() => {
    if (!showPagination) {
      return rows;
    }
    return rows.slice(startIndex, endIndex);
  }, [rows, startIndex, endIndex, showPagination]);

  /**
   * Summary statistics.
   */
  const summary = useMemo(() => {
    const totalErrors = errors ? errors.length : 0;
    const totalWarnings = warnings ? warnings.length : 0;
    const excludedCount = resolvedExcludedRows.size;
    const includedCount = totalRows - excludedCount;
    const rowsWithErrors = new Set(
      (errors || []).filter((e) => e.row != null).map((e) => e.row),
    ).size;

    return {
      totalRows,
      totalErrors,
      totalWarnings,
      excludedCount,
      includedCount,
      rowsWithErrors,
      totalColumns: totalColumnCount,
      visibleColumns: resolvedColumns.length,
    };
  }, [totalRows, errors, warnings, resolvedExcludedRows, totalColumnCount, resolvedColumns]);

  /**
   * Whether all visible rows are excluded.
   */
  const allExcluded = useMemo(() => {
    if (totalRows === 0) return false;
    return resolvedExcludedRows.size >= totalRows;
  }, [totalRows, resolvedExcludedRows]);

  /**
   * Handle row exclusion toggle.
   */
  const handleExcludeRow = useCallback(
    (rowIndex, excluded) => {
      if (onExcludeRow && typeof onExcludeRow === 'function') {
        onExcludeRow(rowIndex, excluded);
      }
    },
    [onExcludeRow],
  );

  /**
   * Handle exclude all toggle.
   */
  const handleExcludeAll = useCallback(
    (excludeAll) => {
      if (onExcludeAll && typeof onExcludeAll === 'function') {
        onExcludeAll(excludeAll);
      }
    },
    [onExcludeAll],
  );

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
   * Toggle schema mapping panel.
   */
  const toggleSchemaMapping = useCallback(() => {
    setIsSchemaMappingExpanded((prev) => !prev);
  }, []);

  /**
   * Check if a cell has validation errors.
   * @param {number} rowIndex - The 1-based row index.
   * @param {string} fieldKey - The field/column key.
   * @returns {Object[]|null} Array of error objects or null.
   */
  const getCellErrors = useCallback(
    (rowIndex, fieldKey) => {
      const key = `${rowIndex}::${fieldKey}`;
      return errorLookup.has(key) ? errorLookup.get(key) : null;
    },
    [errorLookup],
  );

  /**
   * Check if a row has any validation errors.
   * @param {number} rowIndex - The 1-based row index.
   * @returns {boolean}
   */
  const rowHasErrors = useCallback(
    (rowIndex) => {
      return rowErrorLookup.has(rowIndex);
    },
    [rowErrorLookup],
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

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Parsing and validating data…" size="md" />
      </div>
    );
  }

  // Empty state — no rows
  if (!rows || rows.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No data to preview"
          description="Upload a CSV or Excel file to preview the parsed data before committing."
          size="sm"
          compact
        />
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
          <span>
            <span className="font-semibold text-dashboard-text-primary">
              {formatNumber(summary.totalRows, { decimals: 0 })}
            </span>{' '}
            rows
          </span>
          <span>·</span>
          <span>
            {summary.totalColumns} column{summary.totalColumns !== 1 ? 's' : ''}
            {summary.visibleColumns < summary.totalColumns && (
              <span className="ml-1">
                ({summary.visibleColumns} shown)
              </span>
            )}
          </span>
          {summary.excludedCount > 0 && (
            <>
              <span>·</span>
              <span className="text-status-degraded font-medium">
                {summary.excludedCount} excluded
              </span>
            </>
          )}
          {summary.rowsWithErrors > 0 && (
            <>
              <span>·</span>
              <span className="text-severity-critical font-medium">
                {summary.rowsWithErrors} row{summary.rowsWithErrors !== 1 ? 's' : ''} with errors
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Schema Mapping Toggle */}
          {showSchemaMapping && schemaMapping.length > 0 && (
            <button
              onClick={toggleSchemaMapping}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors duration-150 ${
                isSchemaMappingExpanded
                  ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                  : 'bg-gray-50 text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary'
              }`}
              aria-expanded={isSchemaMappingExpanded}
              aria-label="Toggle schema mapping view"
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
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
              Schema Mapping
            </button>
          )}
        </div>
      </div>

      {/* Validation Errors/Warnings Summary */}
      {(summary.totalErrors > 0 || summary.totalWarnings > 0) && (
        <div className="flex flex-col gap-2 mb-3">
          {/* Errors */}
          {summary.totalErrors > 0 && (
            <div className="px-3 py-2 rounded-lg bg-red-50/50 border border-red-200">
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="w-3.5 h-3.5 text-severity-critical flex-shrink-0"
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
                <span className="text-xs font-medium text-red-800">
                  {summary.totalErrors} validation error{summary.totalErrors !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto scrollbar-thin">
                {errors.slice(0, 8).map((error, idx) => (
                  <p key={idx} className="text-[10px] text-red-700">
                    {error.row != null && (
                      <span className="font-semibold">Row {error.row}: </span>
                    )}
                    {error.field && (
                      <span className="font-medium">[{error.field}] </span>
                    )}
                    {error.message}
                  </p>
                ))}
                {errors.length > 8 && (
                  <p className="text-[10px] text-red-600 italic">
                    …and {errors.length - 8} more errors
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Warnings */}
          {summary.totalWarnings > 0 && (
            <div className="px-3 py-2 rounded-lg bg-yellow-50/50 border border-yellow-200">
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="w-3.5 h-3.5 text-status-degraded flex-shrink-0"
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
                <span className="text-xs font-medium text-yellow-800">
                  {summary.totalWarnings} warning{summary.totalWarnings !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 max-h-20 overflow-y-auto scrollbar-thin">
                {warnings.slice(0, 5).map((warning, idx) => (
                  <p key={idx} className="text-[10px] text-yellow-700">
                    {warning.row != null && (
                      <span className="font-medium">Row {warning.row}: </span>
                    )}
                    {warning.message}
                  </p>
                ))}
                {warnings.length > 5 && (
                  <p className="text-[10px] text-yellow-600 italic">
                    …and {warnings.length - 5} more warnings
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schema Mapping Panel */}
      {showSchemaMapping && isSchemaMappingExpanded && schemaMapping.length > 0 && (
        <div className="mb-3 border border-dashboard-border rounded-lg overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50/50 border-b border-dashboard-border">
            <div className="flex items-center gap-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
                Schema Mapping
              </h5>
              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {schemaMapping.length}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-dashboard-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-healthy" />
                Mapped
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-unknown" />
                Unmapped
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-severity-critical" />
                Required
              </span>
            </div>
          </div>
          <div className="px-3 py-2 max-h-48 overflow-y-auto scrollbar-thin">
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {schemaMapping.map((mapping) => (
                <div
                  key={mapping.sourceColumn}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${
                    mapping.isMapped
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-dashboard-border bg-gray-50/30'
                  }`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      mapping.isMapped ? 'bg-status-healthy' : 'bg-status-unknown'
                    }`}
                  />
                  <span className="font-mono text-[10px] text-dashboard-text-secondary truncate flex-1">
                    {mapping.sourceColumn}
                  </span>
                  <svg
                    className="w-3 h-3 text-dashboard-text-muted flex-shrink-0"
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
                  <span
                    className={`text-[10px] truncate flex-1 ${
                      mapping.isMapped
                        ? 'text-dashboard-text-primary font-medium'
                        : 'text-dashboard-text-muted italic'
                    }`}
                  >
                    {mapping.dashboardField || 'Not mapped'}
                  </span>
                  {mapping.isRequired && (
                    <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold leading-3 bg-red-50 text-red-700 flex-shrink-0">
                      REQ
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="border border-dashboard-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin" style={{ maxHeight: compact ? '320px' : '440px' }}>
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="border-b border-dashboard-border bg-gray-50/50">
                {/* Row number column */}
                <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center w-10 sticky left-0 bg-gray-50/50 z-10">
                  #
                </th>

                {/* Exclude checkbox column */}
                {showExcludeControls && (
                  <th className="px-2 py-2 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allExcluded}
                      onChange={(e) => handleExcludeAll(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-dashboard-border text-brand-600 focus:ring-brand-500 focus:ring-2 cursor-pointer"
                      aria-label={allExcluded ? 'Include all rows' : 'Exclude all rows'}
                      title={allExcluded ? 'Include all rows' : 'Exclude all rows'}
                    />
                  </th>
                )}

                {/* Status column */}
                <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center w-14">
                  Status
                </th>

                {/* Data columns */}
                {resolvedColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left whitespace-nowrap"
                    scope="col"
                    title={col.label || col.key}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[120px]">{col.label || col.key}</span>
                      {isRequiredField(col.key, schemaType) && (
                        <span className="text-severity-critical text-[8px]">*</span>
                      )}
                    </div>
                  </th>
                ))}

                {/* Overflow indicator */}
                {totalColumnCount > resolvedColumns.length && (
                  <th className="px-3 py-2 text-[10px] font-semibold text-dashboard-text-muted text-center">
                    +{totalColumnCount - resolvedColumns.length} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dashboard-border">
              {paginatedRows.map((row, pageRowIdx) => {
                const actualRowIndex = startIndex + pageRowIdx;
                const rowNumber = actualRowIndex + 1;
                const isExcluded = resolvedExcludedRows.has(actualRowIndex);
                const hasErrors = rowHasErrors(rowNumber);

                return (
                  <tr
                    key={`row-${actualRowIndex}`}
                    className={`transition-colors duration-150 ${
                      isExcluded
                        ? 'bg-gray-100/50 opacity-50'
                        : hasErrors
                          ? 'bg-red-50/30 hover:bg-red-50/50'
                          : 'hover:bg-gray-50/50'
                    }`}
                  >
                    {/* Row number */}
                    <td className="px-2 py-2 text-xs text-dashboard-text-muted text-center sticky left-0 bg-inherit z-10">
                      {rowNumber}
                    </td>

                    {/* Exclude checkbox */}
                    {showExcludeControls && (
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          onChange={(e) => handleExcludeRow(actualRowIndex, e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-dashboard-border text-brand-600 focus:ring-brand-500 focus:ring-2 cursor-pointer"
                          aria-label={`${isExcluded ? 'Include' : 'Exclude'} row ${rowNumber}`}
                        />
                      </td>
                    )}

                    {/* Status indicator */}
                    <td className="px-2 py-2 text-center">
                      {isExcluded ? (
                        <StatusBadge status="unknown" size="sm" label="Skip" />
                      ) : hasErrors ? (
                        <StatusBadge status="critical" size="sm" label="Error" />
                      ) : (
                        <StatusBadge status="healthy" size="sm" label="OK" />
                      )}
                    </td>

                    {/* Data cells */}
                    {resolvedColumns.map((col) => {
                      const cellValue = row[col.key];
                      const cellErrors = getCellErrors(rowNumber, col.key);
                      const hasCellError = cellErrors && cellErrors.length > 0;

                      return (
                        <td
                          key={col.key}
                          className={`px-3 py-2 ${
                            hasCellError && !isExcluded
                              ? 'bg-red-50/50'
                              : ''
                          }`}
                          title={
                            hasCellError
                              ? cellErrors.map((e) => e.message).join('; ')
                              : cellValue != null
                                ? String(cellValue)
                                : undefined
                          }
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            {hasCellError && !isExcluded && (
                              <svg
                                className="w-3 h-3 text-severity-critical flex-shrink-0"
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
                            )}
                            {cellValue == null || cellValue === '' ? (
                              <span className="text-dashboard-text-muted text-xs">—</span>
                            ) : (
                              <span
                                className={`text-sm truncate block max-w-[180px] ${
                                  hasCellError && !isExcluded
                                    ? 'text-severity-critical font-medium'
                                    : isExcluded
                                      ? 'text-dashboard-text-muted'
                                      : 'text-dashboard-text-secondary'
                                }`}
                              >
                                {String(cellValue).length > 50
                                  ? `${String(cellValue).slice(0, 50)}…`
                                  : String(cellValue)}
                              </span>
                            )}
                          </div>
                          {hasCellError && !isExcluded && (
                            <p className="text-[9px] text-severity-critical mt-0.5 leading-tight truncate max-w-[180px]">
                              {cellErrors[0].message}
                            </p>
                          )}
                        </td>
                      );
                    })}

                    {/* Overflow placeholder */}
                    {totalColumnCount > resolvedColumns.length && (
                      <td className="px-3 py-2 text-xs text-dashboard-text-muted text-center">
                        …
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {showPagination && totalRows > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span>
                Showing {startIndex + 1}–{endIndex} of{' '}
                {formatNumber(totalRows, { decimals: 0 })} rows
              </span>
              {summary.excludedCount > 0 && (
                <span className="text-status-degraded font-medium">
                  ({summary.excludedCount} excluded)
                </span>
              )}
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
              Schema:{' '}
              <span className="font-medium text-dashboard-text-secondary">
                {schemaType.charAt(0).toUpperCase() + schemaType.slice(1)}
              </span>
            </span>
            {meta && meta.fields && (
              <span>
                {meta.fields.length} field{meta.fields.length !== 1 ? 's' : ''} detected
              </span>
            )}
            {meta && meta.delimiter && (
              <span>
                Delimiter:{' '}
                <span className="font-mono text-[10px]">
                  {meta.delimiter === ',' ? 'comma' : meta.delimiter === '\t' ? 'tab' : meta.delimiter}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Ready to upload:{' '}
              <span className="font-semibold text-dashboard-text-primary">
                {formatNumber(summary.includedCount, { decimals: 0 })}
              </span>{' '}
              row{summary.includedCount !== 1 ? 's' : ''}
            </span>
            {summary.totalErrors > 0 && (
              <span className="text-severity-critical font-medium">
                {summary.totalErrors} error{summary.totalErrors !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Check if a field is required for a given schema type.
 * @param {string} fieldKey - The field key to check.
 * @param {string} schemaType - The schema type ('metrics', 'incidents', 'deployments').
 * @returns {boolean} True if the field is required.
 */
function isRequiredField(fieldKey, schemaType) {
  const requiredFields = {
    metrics: ['domain_id', 'service_id', 'timestamp', 'availability'],
    incidents: [
      'incident_id',
      'service_id',
      'domain_id',
      'severity',
      'root_cause',
      'title',
      'start_time',
      'status',
    ],
    deployments: [
      'deployment_id',
      'service_id',
      'domain_id',
      'version',
      'timestamp',
      'status',
    ],
  };

  const fields = requiredFields[schemaType];
  if (!fields) return false;
  return fields.includes(fieldKey);
}

export { DataPreview, SCHEMA_FIELD_LABELS, DEFAULT_PAGE_SIZE };
export default DataPreview;