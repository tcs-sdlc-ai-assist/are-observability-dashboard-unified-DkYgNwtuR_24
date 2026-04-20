import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import {
  DOMAIN_TIERS,
  SEVERITY_LEVELS,
  RCA_CATEGORIES,
  TIME_RANGES,
  ENVIRONMENTS,
  DEFAULT_DOMAINS,
} from '../constants/metrics';

const FILTERS_STORAGE_KEY = 'dashboard_filters';

/**
 * Default filter values for the dashboard.
 */
const DEFAULT_FILTERS = Object.freeze({
  domainId: null,
  serviceId: null,
  tier: null,
  severity: null,
  rootCause: null,
  status: null,
  environment: null,
  timeRangeKey: 'LAST_30D',
  searchQuery: '',
});

/**
 * Custom hook for managing dashboard filter state.
 * Persists filter preferences to localStorage and provides setter functions
 * for each filter dimension.
 *
 * @param {Object} [initialOverrides] - Optional initial filter overrides to merge with defaults.
 * @returns {{
 *   filters: Object,
 *   setDomainId: (domainId: string|null) => void,
 *   setServiceId: (serviceId: string|null) => void,
 *   setTier: (tier: string|null) => void,
 *   setSeverity: (severity: string|null) => void,
 *   setRootCause: (rootCause: string|null) => void,
 *   setStatus: (status: string|null) => void,
 *   setEnvironment: (environment: string|null) => void,
 *   setTimeRangeKey: (timeRangeKey: string) => void,
 *   setSearchQuery: (searchQuery: string) => void,
 *   setFilters: (updates: Object) => void,
 *   resetFilters: () => void,
 *   hasActiveFilters: boolean,
 *   activeFilterCount: number,
 *   timeRange: Object|null,
 *   domainOptions: Object[],
 *   tierOptions: Object[],
 *   severityOptions: Object[],
 *   rootCauseOptions: Object[],
 *   environmentOptions: Object[],
 *   timeRangeOptions: Object[],
 * }}
 */
const useFilters = (initialOverrides, storageKey) => {
  const resolvedKey = storageKey || FILTERS_STORAGE_KEY;

  const defaultState = useMemo(() => {
    if (initialOverrides && typeof initialOverrides === 'object') {
      return { ...DEFAULT_FILTERS, ...initialOverrides };
    }
    return { ...DEFAULT_FILTERS };
  }, [initialOverrides]);

  const [filters, setStoredFilters, removeStoredFilters] = useLocalStorage(
    resolvedKey,
    defaultState,
  );

  // Ensure filters always has all expected keys (handles stale localStorage data)
  const normalizedFilters = useMemo(() => {
    if (!filters || typeof filters !== 'object') {
      return { ...defaultState };
    }

    return {
      ...defaultState,
      ...filters,
    };
  }, [filters, defaultState]);

  /**
   * Update one or more filter values at once.
   * @param {Object} updates - An object with filter keys and their new values.
   */
  const setFilters = useCallback(
    (updates) => {
      if (!updates || typeof updates !== 'object') {
        return;
      }

      setStoredFilters((prev) => {
        const current = prev && typeof prev === 'object' ? prev : { ...defaultState };
        return {
          ...current,
          ...updates,
        };
      });
    },
    [setStoredFilters, defaultState],
  );

  /**
   * Set the domain ID filter. Clears serviceId when domain changes.
   * @param {string|null} domainId - The domain ID to filter by, or null to clear.
   */
  const setDomainId = useCallback(
    (domainId) => {
      setFilters({
        domainId: domainId || null,
        serviceId: null, // Reset service when domain changes
      });
    },
    [setFilters],
  );

  /**
   * Set the service ID filter.
   * @param {string|null} serviceId - The service ID to filter by, or null to clear.
   */
  const setServiceId = useCallback(
    (serviceId) => {
      setFilters({ serviceId: serviceId || null });
    },
    [setFilters],
  );

  /**
   * Set the domain tier filter.
   * @param {string|null} tier - The tier to filter by, or null to clear.
   */
  const setTier = useCallback(
    (tier) => {
      setFilters({ tier: tier || null });
    },
    [setFilters],
  );

  /**
   * Set the severity filter.
   * @param {string|null} severity - The severity level to filter by, or null to clear.
   */
  const setSeverity = useCallback(
    (severity) => {
      setFilters({ severity: severity || null });
    },
    [setFilters],
  );

  /**
   * Set the root cause filter.
   * @param {string|null} rootCause - The root cause category to filter by, or null to clear.
   */
  const setRootCause = useCallback(
    (rootCause) => {
      setFilters({ rootCause: rootCause || null });
    },
    [setFilters],
  );

  /**
   * Set the status filter.
   * @param {string|null} status - The status to filter by, or null to clear.
   */
  const setStatus = useCallback(
    (status) => {
      setFilters({ status: status || null });
    },
    [setFilters],
  );

  /**
   * Set the environment filter.
   * @param {string|null} environment - The environment to filter by, or null to clear.
   */
  const setEnvironment = useCallback(
    (environment) => {
      setFilters({ environment: environment || null });
    },
    [setFilters],
  );

  /**
   * Set the time range key filter.
   * @param {string} timeRangeKey - The time range key from TIME_RANGES.
   */
  const setTimeRangeKey = useCallback(
    (timeRangeKey) => {
      if (!timeRangeKey || typeof timeRangeKey !== 'string') {
        return;
      }

      // Validate that the key exists in TIME_RANGES
      if (!TIME_RANGES[timeRangeKey]) {
        return;
      }

      setFilters({ timeRangeKey });
    },
    [setFilters],
  );

  /**
   * Set the search query filter.
   * @param {string} searchQuery - The search query string.
   */
  const setSearchQuery = useCallback(
    (searchQuery) => {
      setFilters({ searchQuery: typeof searchQuery === 'string' ? searchQuery : '' });
    },
    [setFilters],
  );

  /**
   * Reset all filters to their default values.
   */
  const resetFilters = useCallback(() => {
    setStoredFilters({ ...defaultState });
  }, [setStoredFilters, defaultState]);

  // ─── Derived State ───────────────────────────────────────────────────

  /**
   * Whether any filter is actively set (non-default).
   */
  const hasActiveFilters = useMemo(() => {
    const f = normalizedFilters;

    return (
      f.domainId !== null ||
      f.serviceId !== null ||
      f.tier !== null ||
      f.severity !== null ||
      f.rootCause !== null ||
      f.status !== null ||
      f.environment !== null ||
      f.timeRangeKey !== DEFAULT_FILTERS.timeRangeKey ||
      (f.searchQuery && f.searchQuery.trim().length > 0)
    );
  }, [normalizedFilters]);

  /**
   * Count of actively set filters (non-default values).
   */
  const activeFilterCount = useMemo(() => {
    const f = normalizedFilters;
    let count = 0;

    if (f.domainId !== null) count++;
    if (f.serviceId !== null) count++;
    if (f.tier !== null) count++;
    if (f.severity !== null) count++;
    if (f.rootCause !== null) count++;
    if (f.status !== null) count++;
    if (f.environment !== null) count++;
    if (f.timeRangeKey !== DEFAULT_FILTERS.timeRangeKey) count++;
    if (f.searchQuery && f.searchQuery.trim().length > 0) count++;

    return count;
  }, [normalizedFilters]);

  /**
   * The resolved time range object for the current timeRangeKey.
   */
  const timeRange = useMemo(() => {
    const key = normalizedFilters.timeRangeKey || DEFAULT_FILTERS.timeRangeKey;
    return TIME_RANGES[key] || TIME_RANGES.LAST_30D;
  }, [normalizedFilters.timeRangeKey]);

  // ─── Filter Options ──────────────────────────────────────────────────

  /**
   * Domain options for filter dropdowns.
   */
  const domainOptions = useMemo(() => {
    return DEFAULT_DOMAINS.map((domain) => ({
      value: domain.id,
      label: domain.name,
      tier: domain.tier,
    }));
  }, []);

  /**
   * Tier options for filter dropdowns.
   */
  const tierOptions = useMemo(() => {
    return Object.values(DOMAIN_TIERS).map((tier) => ({
      value: tier,
      label: tier,
    }));
  }, []);

  /**
   * Severity options for filter dropdowns.
   */
  const severityOptions = useMemo(() => {
    return Object.values(SEVERITY_LEVELS).map((level) => ({
      value: level,
      label: level,
    }));
  }, []);

  /**
   * Root cause options for filter dropdowns.
   */
  const rootCauseOptions = useMemo(() => {
    return Object.values(RCA_CATEGORIES).map((category) => ({
      value: category,
      label: category,
    }));
  }, []);

  /**
   * Environment options for filter dropdowns.
   */
  const environmentOptions = useMemo(() => {
    return Object.entries(ENVIRONMENTS).map(([key, label]) => ({
      value: key,
      label,
    }));
  }, []);

  /**
   * Time range options for filter dropdowns.
   */
  const timeRangeOptions = useMemo(() => {
    return Object.values(TIME_RANGES).map((range) => ({
      value: range.key,
      label: range.label,
      hours: range.hours,
    }));
  }, []);

  return {
    // Current filter state
    filters: normalizedFilters,

    // Individual setters
    setDomainId,
    setServiceId,
    setTier,
    setSeverity,
    setRootCause,
    setStatus,
    setEnvironment,
    setTimeRangeKey,
    setSearchQuery,

    // Bulk operations
    setFilters,
    resetFilters,

    // Derived state
    hasActiveFilters,
    activeFilterCount,
    timeRange,

    // Filter options for dropdowns
    domainOptions,
    tierOptions,
    severityOptions,
    rootCauseOptions,
    environmentOptions,
    timeRangeOptions,
  };
};

export { useFilters, DEFAULT_FILTERS, FILTERS_STORAGE_KEY };
export default useFilters;