import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

/**
 * DataTable - Reusable sortable data table component with column definitions,
 * pagination, search, and optional row click handler.
 *
 * Features:
 * - Sortable columns (click header to toggle asc/desc)
 * - Built-in search/filter across all string fields
 * - Pagination with configurable page size
 * - Custom cell renderers via column definitions
 * - Optional row click handler
 * - Empty state display
 * - Loading state display
 * - Responsive horizontal scroll on small screens
 * - Keyboard accessible
 *
 * Column Definition Shape:
 * {
 *   key: string,           // The data field key
 *   label: string,         // The column header label
 *   sortable?: boolean,    // Whether the column is sortable (default: true)
 *   render?: (value, row, rowIndex) => ReactNode, // Custom cell renderer
 *   className?: string,    // Additional CSS classes for the cell
 *   headerClassName?: string, // Additional CSS classes for the header cell
 *   width?: string,        // CSS width (e.g., '120px', '20%')
 *   align?: 'left'|'center'|'right', // Text alignment (default: 'left')
 *   searchable?: boolean,  // Whether this column is included in search (default: true)
 * }
 *
 * @param {Object} props
 * @param {Object[]} props.columns - Array of column definition objects.
 * @param {Object[]} props.data - Array of row data objects.
 * @param {Function} [props.onRowClick] - Optional callback when a row is clicked. Receives (row, rowIndex).
 * @param {string} [props.rowKey='id'] - The unique key field on each row object for React keys.
 * @param {boolean} [props.showSearch=true] - Whether to show the search input.
 * @param {boolean} [props.showPagination=true] - Whether to show pagination controls.
 * @param {number} [props.pageSize=10] - Number of rows per page.
 * @param {number[]} [props.pageSizeOptions=[5, 10, 25, 50]] - Available page size options.
 * @param {boolean} [props.isLoading=false] - Whether the table is in a loading state.
 * @param {string} [props.emptyMessage='No data available.'] - Message to display when there are no rows.
 * @param {string} [props.searchPlaceholder='Search…'] - Placeholder text for the search input.
 * @param {string} [props.defaultSortKey] - The column key to sort by initially.
 * @param {'asc'|'desc'} [props.defaultSortDirection='asc'] - The initial sort direction.
 * @param {string} [props.className=''] - Additional CSS classes for the table container.
 * @param {string} [props.title] - Optional title displayed above the table.
 * @param {React.ReactNode} [props.actions] - Optional action buttons rendered in the header area.
 * @returns {React.ReactNode}
 */
const DataTable = ({
  columns,
  data,
  onRowClick,
  rowKey = 'id',
  showSearch = true,
  showPagination = true,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [5, 10, 25, 50],
  isLoading = false,
  emptyMessage = 'No data available.',
  searchPlaceholder = 'Search…',
  defaultSortKey,
  defaultSortDirection = 'asc',
  className = '',
  title,
  actions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState(defaultSortKey || null);
  const [sortDirection, setSortDirection] = useState(defaultSortDirection);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const searchInputRef = useRef(null);

  // Reset to page 1 when data, search, sort, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDirection, pageSize]);

  // Reset to page 1 when data reference changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  /**
   * Normalize columns to ensure all expected properties exist.
   */
  const normalizedColumns = useMemo(() => {
    if (!columns || !Array.isArray(columns)) {
      return [];
    }

    return columns.map((col) => ({
      key: col.key || '',
      label: col.label || col.key || '',
      sortable: col.sortable !== false,
      render: col.render || null,
      className: col.className || '',
      headerClassName: col.headerClassName || '',
      width: col.width || undefined,
      align: col.align || 'left',
      searchable: col.searchable !== false,
    }));
  }, [columns]);

  /**
   * Searchable column keys for filtering.
   */
  const searchableKeys = useMemo(() => {
    return normalizedColumns.filter((col) => col.searchable).map((col) => col.key);
  }, [normalizedColumns]);

  /**
   * Filter data by search query across searchable columns.
   */
  const filteredData = useMemo(() => {
    if (!data || !Array.isArray(data)) {
      return [];
    }

    if (!searchQuery || searchQuery.trim().length === 0) {
      return data;
    }

    const query = searchQuery.trim().toLowerCase();

    return data.filter((row) => {
      if (!row || typeof row !== 'object') {
        return false;
      }

      return searchableKeys.some((key) => {
        const value = row[key];

        if (value == null) {
          return false;
        }

        const stringValue = String(value).toLowerCase();
        return stringValue.includes(query);
      });
    });
  }, [data, searchQuery, searchableKeys]);

  /**
   * Sort filtered data by the current sort key and direction.
   */
  const sortedData = useMemo(() => {
    if (!sortKey || !filteredData || filteredData.length === 0) {
      return filteredData;
    }

    const sorted = [...filteredData];

    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
      if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

      // Numeric comparison
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortKey, sortDirection]);

  /**
   * Compute pagination values.
   */
  const totalRows = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);

  /**
   * Paginated data slice for the current page.
   */
  const paginatedData = useMemo(() => {
    if (!showPagination) {
      return sortedData;
    }

    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, startIndex, endIndex, showPagination]);

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
    },
    [sortKey],
  );

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
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
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
   * Handle page size change.
   */
  const handlePageSizeChange = useCallback((e) => {
    const newSize = parseInt(e.target.value, 10);

    if (!isNaN(newSize) && newSize > 0) {
      setPageSize(newSize);
    }
  }, []);

  /**
   * Handle row click.
   */
  const handleRowClick = useCallback(
    (row, rowIndex) => {
      if (onRowClick && typeof onRowClick === 'function') {
        onRowClick(row, rowIndex);
      }
    },
    [onRowClick],
  );

  /**
   * Handle row keyboard interaction for accessibility.
   */
  const handleRowKeyDown = useCallback(
    (event, row, rowIndex) => {
      if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onRowClick(row, rowIndex);
      }
    },
    [onRowClick],
  );

  const isClickable = typeof onRowClick === 'function';

  /**
   * Get the alignment class for a column.
   */
  const getAlignClass = (align) => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  /**
   * Render the sort indicator icon for a column header.
   */
  const renderSortIcon = (columnKey) => {
    if (sortKey !== columnKey) {
      return (
        <svg
          className="w-3.5 h-3.5 text-dashboard-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
    );
  };

  /**
   * Render the pagination page buttons.
   */
  const renderPageButtons = () => {
    const buttons = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, safeCurrentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // First page + ellipsis
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

    // Page number buttons
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

    // Last page + ellipsis
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
  };

  /**
   * Render loading state.
   */
  if (isLoading) {
    return (
      <div className={`dashboard-card ${className}`}>
        {/* Header */}
        {(title || actions || showSearch) && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            {title && (
              <h3 className="text-sm font-semibold text-dashboard-text-primary">{title}</h3>
            )}
          </div>
        )}

        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-sm text-dashboard-text-secondary">Loading data…</p>
          </div>
        </div>
      </div>
    );
  }

  const hasData = paginatedData && paginatedData.length > 0;

  return (
    <div className={`dashboard-card overflow-hidden ${className}`}>
      {/* Header: Title, Actions, Search */}
      {(title || actions || showSearch) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-dashboard-text-primary">{title}</h3>
            )}
            {totalRows > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {totalRows}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {actions && <div className="flex items-center gap-2">{actions}</div>}

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
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder={searchPlaceholder}
                  className="w-48 lg:w-64 pl-9 pr-8 py-1.5 text-sm bg-gray-50 border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
                  aria-label="Search table"
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
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm" role="grid">
          {/* Table Head */}
          <thead>
            <tr className="border-b border-dashboard-border bg-gray-50/50">
              {normalizedColumns.map((col) => {
                const isSorted = sortKey === col.key;
                const alignClass = getAlignClass(col.align);

                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted ${alignClass} ${col.headerClassName}`}
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

          {/* Table Body */}
          <tbody className="divide-y divide-dashboard-border">
            {hasData ? (
              paginatedData.map((row, rowIndex) => {
                const actualIndex = startIndex + rowIndex;
                const key = row[rowKey] != null ? String(row[rowKey]) : `row-${actualIndex}`;

                return (
                  <tr
                    key={key}
                    onClick={isClickable ? () => handleRowClick(row, actualIndex) : undefined}
                    onKeyDown={
                      isClickable ? (e) => handleRowKeyDown(e, row, actualIndex) : undefined
                    }
                    className={`transition-colors duration-150 ${
                      isClickable
                        ? 'cursor-pointer hover:bg-brand-50/50 focus-within:bg-brand-50/50'
                        : 'hover:bg-gray-50/50'
                    }`}
                    role={isClickable ? 'row' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    aria-label={
                      isClickable
                        ? `Row ${actualIndex + 1}: ${row[normalizedColumns[0]?.key] || ''}`
                        : undefined
                    }
                  >
                    {normalizedColumns.map((col) => {
                      const cellValue = row[col.key];
                      const alignClass = getAlignClass(col.align);

                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-sm text-dashboard-text-secondary ${alignClass} ${col.className}`}
                          style={col.width ? { width: col.width } : undefined}
                        >
                          {col.render
                            ? col.render(cellValue, row, actualIndex)
                            : cellValue != null
                              ? String(cellValue)
                              : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={normalizedColumns.length}
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
                    <p className="text-sm text-dashboard-text-muted">{emptyMessage}</p>
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
          {/* Rows info + page size selector */}
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Showing {startIndex + 1}–{endIndex} of {totalRows}
              {data && filteredData.length !== data.length && (
                <span className="ml-1">(filtered from {data.length})</span>
              )}
            </span>

            {pageSizeOptions && pageSizeOptions.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  className="px-1.5 py-0.5 text-xs bg-white border border-dashboard-border rounded text-dashboard-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors duration-150"
                  aria-label="Rows per page"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              {/* Previous button */}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              {/* Page buttons */}
              {renderPageButtons()}

              {/* Next button */}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { DataTable };
export default DataTable;