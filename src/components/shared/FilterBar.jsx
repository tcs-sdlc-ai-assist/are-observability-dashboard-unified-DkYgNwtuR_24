import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useFilters } from '../../hooks/useFilters';

/**
 * FilterDropdown - Internal dropdown component for individual filter selections.
 *
 * @param {Object} props
 * @param {string} props.label - The dropdown label text.
 * @param {string|null} props.value - The currently selected value.
 * @param {Object[]} props.options - Array of { value, label } option objects.
 * @param {Function} props.onChange - Callback when selection changes.
 * @param {string} [props.placeholder='All'] - Placeholder text when no value is selected.
 * @param {string} [props.className=''] - Additional CSS classes.
 * @returns {React.ReactNode}
 */
const FilterDropdown = ({ label, value, options, onChange, placeholder = 'All', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = useMemo(() => {
    if (!value) {
      return null;
    }

    return options.find((opt) => opt.value === value) || null;
  }, [value, options]);

  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (optionValue) => {
      onChange(optionValue === value ? null : optionValue);
      setIsOpen(false);
    },
    [onChange, value],
  );

  const handleClear = useCallback(
    (e) => {
      e.stopPropagation();
      onChange(null);
      setIsOpen(false);
    },
    [onChange],
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Label */}
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-1">
        {label}
      </label>

      {/* Trigger button */}
      <button
        onClick={toggleOpen}
        className={`flex items-center justify-between gap-2 w-full min-w-[140px] px-3 py-1.5 text-sm bg-white border rounded-lg transition-colors duration-150 ${isOpen
            ? 'border-brand-500 ring-2 ring-brand-500/20'
            : 'border-dashboard-border hover:border-gray-300'
          } ${value ? 'text-dashboard-text-primary' : 'text-dashboard-text-muted'}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`${label} filter`}
      >
        <span className="truncate">{displayLabel}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && (
            <span
              onClick={handleClear}
              className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-gray-200 text-dashboard-text-muted hover:text-dashboard-text-secondary transition-colors duration-150"
              role="button"
              aria-label={`Clear ${label} filter`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''
              }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-40 top-full left-0 mt-1 w-full min-w-[180px] max-h-60 overflow-y-auto bg-white border border-dashboard-border rounded-lg shadow-panel py-1 animate-fade-in scrollbar-thin">
          {/* "All" option to clear */}
          <button
            onClick={() => handleSelect(null)}
            className={`flex items-center w-full px-3 py-1.5 text-sm text-left transition-colors duration-150 ${!value
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
              }`}
            role="option"
            aria-selected={!value}
          >
            {placeholder}
          </button>

          {/* Options */}
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`flex items-center w-full px-3 py-1.5 text-sm text-left transition-colors duration-150 ${value === option.value
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
                }`}
              role="option"
              aria-selected={value === option.value}
            >
              <span className="truncate">{option.label}</span>
              {option.tier && (
                <span className="ml-auto text-[10px] text-dashboard-text-muted font-medium flex-shrink-0">
                  {option.tier}
                </span>
              )}
            </button>
          ))}

          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-dashboard-text-muted">No options available</div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * FilterBar - Reusable dashboard filter bar component with dropdowns for domain,
 * service/application, environment, time range, severity, and root cause.
 *
 * Features:
 * - Domain filter dropdown with tier indicators
 * - Service/application filter (filtered by selected domain)
 * - Environment filter
 * - Time range filter
 * - Severity filter
 * - Root cause filter
 * - Active filter count badge
 * - Reset all filters button
 * - Search input
 * - Responsive layout (wraps on smaller screens)
 * - Persists filter state via useFilters hook (localStorage)
 *
 * @param {Object} props
 * @param {Function} [props.onChange] - Callback fired when any filter changes. Receives the full filters object.
 * @param {boolean} [props.showDomain=true] - Whether to show the domain filter.
 * @param {boolean} [props.showService=false] - Whether to show the service/application filter.
 * @param {boolean} [props.showEnvironment=false] - Whether to show the environment filter.
 * @param {boolean} [props.showTimeRange=true] - Whether to show the time range filter.
 * @param {boolean} [props.showSeverity=false] - Whether to show the severity filter.
 * @param {boolean} [props.showRootCause=false] - Whether to show the root cause filter.
 * @param {boolean} [props.showSearch=false] - Whether to show the search input.
 * @param {boolean} [props.showReset=true] - Whether to show the reset button.
 * @param {Object[]} [props.serviceOptions] - Custom service options array. If omitted, no service options are shown.
 * @param {Object} [props.initialFilters] - Initial filter overrides passed to useFilters.
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @returns {React.ReactNode}
 */
const FilterBar = ({
  onChange,
  showDomain = true,
  showService = false,
  showEnvironment = false,
  showTimeRange = true,
  showSeverity = false,
  showRootCause = false,
  showSearch = false,
  showReset = true,
  serviceOptions: externalServiceOptions,
  initialFilters,
  storageKey,
  className = '',
}) => {
  const {
    filters,
    setDomainId,
    setServiceId,
    setTier,
    setSeverity,
    setRootCause,
    setEnvironment,
    setTimeRangeKey,
    setSearchQuery,
    resetFilters,
    hasActiveFilters,
    activeFilterCount,
    domainOptions,
    tierOptions,
    severityOptions,
    rootCauseOptions,
    environmentOptions,
    timeRangeOptions,
  } = useFilters(initialFilters, storageKey);

  // Notify parent of filter changes
  const prevFiltersRef = useRef(filters);

  useEffect(() => {
    if (onChange && typeof onChange === 'function') {
      // Only fire if filters actually changed
      const prev = prevFiltersRef.current;
      const changed = Object.keys(filters).some((key) => filters[key] !== prev[key]);

      if (changed) {
        onChange(filters);
      }
    }

    prevFiltersRef.current = filters;
  }, [filters, onChange]);

  // Service options — use external if provided, otherwise empty
  const serviceOpts = useMemo(() => {
    if (externalServiceOptions && Array.isArray(externalServiceOptions)) {
      // If a domain is selected, filter service options by domain
      if (filters.domainId) {
        return externalServiceOptions.filter(
          (opt) => opt.domainId === filters.domainId || opt.domain_id === filters.domainId,
        );
      }

      return externalServiceOptions;
    }

    return [];
  }, [externalServiceOptions, filters.domainId]);

  /**
   * Handle domain change — also clears service selection.
   */
  const handleDomainChange = useCallback(
    (domainId) => {
      setDomainId(domainId);
    },
    [setDomainId],
  );

  /**
   * Handle service change.
   */
  const handleServiceChange = useCallback(
    (serviceId) => {
      setServiceId(serviceId);
    },
    [setServiceId],
  );

  /**
   * Handle environment change.
   */
  const handleEnvironmentChange = useCallback(
    (environment) => {
      setEnvironment(environment);
    },
    [setEnvironment],
  );

  /**
   * Handle time range change.
   */
  const handleTimeRangeChange = useCallback(
    (timeRangeKey) => {
      if (timeRangeKey) {
        setTimeRangeKey(timeRangeKey);
      }
    },
    [setTimeRangeKey],
  );

  /**
   * Handle severity change.
   */
  const handleSeverityChange = useCallback(
    (severity) => {
      setSeverity(severity);
    },
    [setSeverity],
  );

  /**
   * Handle root cause change.
   */
  const handleRootCauseChange = useCallback(
    (rootCause) => {
      setRootCause(rootCause);
    },
    [setRootCause],
  );

  /**
   * Handle search input change.
   */
  const handleSearchChange = useCallback(
    (e) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  /**
   * Handle reset all filters.
   */
  const handleReset = useCallback(() => {
    resetFilters();
  }, [resetFilters]);

  // Determine if any filter dropdowns are visible
  const hasVisibleFilters =
    showDomain ||
    showService ||
    showEnvironment ||
    showTimeRange ||
    showSeverity ||
    showRootCause ||
    showSearch;

  if (!hasVisibleFilters) {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap items-end gap-3 ${className}`}
      role="toolbar"
      aria-label="Dashboard filters"
    >
      {/* Domain filter */}
      {showDomain && (
        <FilterDropdown
          label="Domain"
          value={filters.domainId}
          options={domainOptions}
          onChange={handleDomainChange}
          placeholder="All Domains"
        />
      )}

      {/* Service / Application filter */}
      {showService && (
        <FilterDropdown
          label="Application"
          value={filters.serviceId}
          options={serviceOpts}
          onChange={handleServiceChange}
          placeholder="All Services"
        />
      )}

      {/* Environment filter */}
      {showEnvironment && (
        <FilterDropdown
          label="Environment"
          value={filters.environment}
          options={environmentOptions}
          onChange={handleEnvironmentChange}
          placeholder="All Environments"
        />
      )}

      {/* Time Range filter */}
      {showTimeRange && (
        <FilterDropdown
          label="Time Range"
          value={filters.timeRangeKey}
          options={timeRangeOptions}
          onChange={handleTimeRangeChange}
          placeholder="Last 30 Days"
        />
      )}

      {/* Severity filter */}
      {showSeverity && (
        <FilterDropdown
          label="Severity"
          value={filters.severity}
          options={severityOptions}
          onChange={handleSeverityChange}
          placeholder="All Severities"
        />
      )}

      {/* Root Cause filter */}
      {showRootCause && (
        <FilterDropdown
          label="Root Cause"
          value={filters.rootCause}
          options={rootCauseOptions}
          onChange={handleRootCauseChange}
          placeholder="All Causes"
        />
      )}

      {/* Search input */}
      {showSearch && (
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-1">
            Search
          </label>
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
              value={filters.searchQuery || ''}
              onChange={handleSearchChange}
              placeholder="Search…"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
              aria-label="Search filter"
            />
          </div>
        </div>
      )}

      {/* Reset button + active filter count */}
      {showReset && (
        <div className="flex items-center gap-2 self-end pb-0.5">
          {hasActiveFilters && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold">
              {activeFilterCount}
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={!hasActiveFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150 ${hasActiveFilters
                ? 'text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary'
                : 'text-dashboard-text-muted cursor-not-allowed opacity-50'
              }`}
            aria-label="Reset all filters"
            title="Reset all filters"
          >
            <svg
              className="w-4 h-4"
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
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      )}
    </div>
  );
};

export { FilterBar };
export default FilterBar;