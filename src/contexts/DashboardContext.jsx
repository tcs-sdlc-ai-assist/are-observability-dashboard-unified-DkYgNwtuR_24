import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import {
  getDashboardData,
  getIncidentTrends,
  getServiceDependencyMap,
  getErrorBudgets,
  getGoldenSignals,
  getComplianceReports,
  uploadInterimData,
  updateMetricThresholds,
  getAllServices,
  getServiceById,
  getServicesByDomain,
  getIncidents,
  getDeployments,
  getMetricThresholds,
  getConfluenceLinks,
  getChangeFailureRate,
} from '../services/dataService';
import { TIME_RANGES } from '../constants/metrics';
import { getTimeRange, isWithinRange } from '../utils/dateUtils';

const DashboardContext = createContext(null);

// ─── Action Types ──────────────────────────────────────────────────────────

const ACTION_TYPES = Object.freeze({
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_DASHBOARD_DATA: 'SET_DASHBOARD_DATA',
  SET_FILTERS: 'SET_FILTERS',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESET_FILTERS: 'RESET_FILTERS',
});

// ─── Default Filters ───────────────────────────────────────────────────────

const DEFAULT_FILTERS = Object.freeze({
  domainId: null,
  serviceId: null,
  tier: null,
  severity: null,
  rootCause: null,
  status: null,
  timeRangeKey: 'LAST_30D',
  searchQuery: '',
});

// ─── Initial State ─────────────────────────────────────────────────────────

const initialState = {
  dashboardData: null,
  isLoading: true,
  error: null,
  filters: { ...DEFAULT_FILTERS },
  lastUpdated: null,
};

// ─── Reducer ───────────────────────────────────────────────────────────────

const dashboardReducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    case ACTION_TYPES.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    case ACTION_TYPES.SET_DASHBOARD_DATA:
      return {
        ...state,
        dashboardData: action.payload,
        isLoading: false,
        error: null,
        lastUpdated: new Date().toISOString(),
      };

    case ACTION_TYPES.SET_FILTERS:
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload,
        },
      };

    case ACTION_TYPES.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    case ACTION_TYPES.RESET_FILTERS:
      return {
        ...state,
        filters: { ...DEFAULT_FILTERS },
      };

    default:
      return state;
  }
};

// ─── Provider Component ────────────────────────────────────────────────────

const DashboardProvider = ({ children }) => {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  /**
   * Load dashboard data from the data service.
   * Called on mount and when a manual refresh is triggered.
   */
  const loadDashboardData = useCallback(async () => {
    dispatch({ type: ACTION_TYPES.SET_LOADING, payload: true });

    try {
      const result = await getDashboardData();

      if (result.status === 'success' && result.data) {
        dispatch({ type: ACTION_TYPES.SET_DASHBOARD_DATA, payload: result.data });
      } else {
        dispatch({
          type: ACTION_TYPES.SET_ERROR,
          payload: result.error || 'Failed to load dashboard data.',
        });
      }
    } catch (e) {
      console.error('[DashboardContext] Failed to load dashboard data:', e);
      dispatch({
        type: ACTION_TYPES.SET_ERROR,
        payload: 'An unexpected error occurred while loading dashboard data.',
      });
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  /**
   * Refresh dashboard data by re-fetching from the data service.
   * @returns {Promise<void>}
   */
  const refresh = useCallback(async () => {
    await loadDashboardData();
  }, [loadDashboardData]);

  /**
   * Set the dashboard data directly.
   * Useful for optimistic updates or when data is already available.
   * @param {Object} data - The dashboard data object.
   */
  const setDashboardData = useCallback((data) => {
    if (!data || typeof data !== 'object') {
      return;
    }

    dispatch({ type: ACTION_TYPES.SET_DASHBOARD_DATA, payload: data });
  }, []);

  /**
   * Update one or more filter values.
   * @param {Object} filterUpdates - An object with filter keys and their new values.
   */
  const setFilters = useCallback((filterUpdates) => {
    if (!filterUpdates || typeof filterUpdates !== 'object') {
      return;
    }

    dispatch({ type: ACTION_TYPES.SET_FILTERS, payload: filterUpdates });
  }, []);

  /**
   * Reset all filters to their default values.
   */
  const resetFilters = useCallback(() => {
    dispatch({ type: ACTION_TYPES.RESET_FILTERS });
  }, []);

  /**
   * Clear the current error state.
   */
  const clearError = useCallback(() => {
    dispatch({ type: ACTION_TYPES.CLEAR_ERROR });
  }, []);

  /**
   * Upload interim data and refresh the dashboard.
   * @param {Object} data - The parsed data to upload.
   * @param {string} data.type - The data type ('metrics', 'incidents', 'deployments').
   * @param {Object[]} data.rows - The parsed row objects.
   * @param {Object} [options] - Upload options.
   * @returns {Promise<{ status: string, rowsImported: number, errors: Object[], warnings: Object[] }>}
   */
  const uploadData = useCallback(
    async (data, options = {}) => {
      try {
        const result = await uploadInterimData(data, options);

        if (result.status === 'success') {
          // Refresh dashboard data after successful upload
          await loadDashboardData();
        }

        return result;
      } catch (e) {
        console.error('[DashboardContext] Upload failed:', e);
        return {
          status: 'error',
          rowsImported: 0,
          errors: [{ row: null, error: 'An unexpected error occurred during upload.' }],
          warnings: [],
        };
      }
    },
    [loadDashboardData],
  );

  /**
   * Update metric thresholds and refresh the dashboard.
   * @param {Object} config - Threshold configuration object.
   * @returns {Promise<{ status: string, error: string|null, validationErrors: Object[] }>}
   */
  const updateThresholds = useCallback(
    async (config) => {
      try {
        const result = await updateMetricThresholds(config);

        if (result.status === 'success') {
          await loadDashboardData();
        }

        return result;
      } catch (e) {
        console.error('[DashboardContext] Threshold update failed:', e);
        return {
          status: 'error',
          error: 'An unexpected error occurred while updating thresholds.',
          validationErrors: [],
        };
      }
    },
    [loadDashboardData],
  );

  /**
   * Fetch incident trends with the current time range filter.
   * @param {string} [timeRangeKey] - Override the current filter's time range key.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchIncidentTrends = useCallback(
    async (timeRangeKey) => {
      try {
        const rangeKey = timeRangeKey || state.filters.timeRangeKey || 'LAST_30D';
        return await getIncidentTrends(rangeKey);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch incident trends:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load incident trends.',
        };
      }
    },
    [state.filters.timeRangeKey],
  );

  /**
   * Fetch the service dependency map with optional filters.
   * @param {Object} [filters] - Optional filters for the dependency map.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchServiceDependencyMap = useCallback(
    async (filters) => {
      try {
        const mapFilters = filters || {};

        if (!mapFilters.domainId && state.filters.domainId) {
          mapFilters.domainId = state.filters.domainId;
        }

        if (!mapFilters.tier && state.filters.tier) {
          mapFilters.tier = state.filters.tier;
        }

        return await getServiceDependencyMap(mapFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch dependency map:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load service dependency map.',
        };
      }
    },
    [state.filters.domainId, state.filters.tier],
  );

  /**
   * Fetch error budget data with optional filters.
   * @param {Object} [filters] - Optional filters for error budgets.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchErrorBudgets = useCallback(
    async (filters) => {
      try {
        const budgetFilters = filters || {};

        if (!budgetFilters.domainId && state.filters.domainId) {
          budgetFilters.domainId = state.filters.domainId;
        }

        if (!budgetFilters.tier && state.filters.tier) {
          budgetFilters.tier = state.filters.tier;
        }

        return await getErrorBudgets(budgetFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch error budgets:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load error budget data.',
        };
      }
    },
    [state.filters.domainId, state.filters.tier],
  );

  /**
   * Fetch golden signal data with optional filters.
   * @param {Object} [filters] - Optional filters for golden signals.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchGoldenSignals = useCallback(
    async (filters) => {
      try {
        const signalFilters = filters || {};

        if (!signalFilters.domainId && state.filters.domainId) {
          signalFilters.domainId = state.filters.domainId;
        }

        if (!signalFilters.serviceId && state.filters.serviceId) {
          signalFilters.serviceId = state.filters.serviceId;
        }

        return await getGoldenSignals(signalFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch golden signals:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load golden signal data.',
        };
      }
    },
    [state.filters.domainId, state.filters.serviceId],
  );

  /**
   * Fetch compliance reports with optional filters.
   * @param {Object} [filters] - Optional filters for compliance reports.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchComplianceReports = useCallback(
    async (filters) => {
      try {
        const complianceFilters = filters || {};

        if (!complianceFilters.domainId && state.filters.domainId) {
          complianceFilters.domainId = state.filters.domainId;
        }

        if (!complianceFilters.tier && state.filters.tier) {
          complianceFilters.tier = state.filters.tier;
        }

        return await getComplianceReports(complianceFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch compliance reports:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load compliance reports.',
        };
      }
    },
    [state.filters.domainId, state.filters.tier],
  );

  /**
   * Fetch incidents with the current filters applied.
   * @param {Object} [additionalFilters] - Additional filters to merge with current state filters.
   * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
   */
  const fetchIncidents = useCallback(
    async (additionalFilters) => {
      try {
        const incidentFilters = { ...additionalFilters };

        if (!incidentFilters.domainId && state.filters.domainId) {
          incidentFilters.domainId = state.filters.domainId;
        }

        if (!incidentFilters.serviceId && state.filters.serviceId) {
          incidentFilters.serviceId = state.filters.serviceId;
        }

        if (!incidentFilters.severity && state.filters.severity) {
          incidentFilters.severity = state.filters.severity;
        }

        if (!incidentFilters.rootCause && state.filters.rootCause) {
          incidentFilters.rootCause = state.filters.rootCause;
        }

        if (!incidentFilters.status && state.filters.status) {
          incidentFilters.status = state.filters.status;
        }

        if (!incidentFilters.timeRangeKey && state.filters.timeRangeKey) {
          incidentFilters.timeRangeKey = state.filters.timeRangeKey;
        }

        return await getIncidents(incidentFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch incidents:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load incidents.',
        };
      }
    },
    [
      state.filters.domainId,
      state.filters.serviceId,
      state.filters.severity,
      state.filters.rootCause,
      state.filters.status,
      state.filters.timeRangeKey,
    ],
  );

  /**
   * Fetch deployments with the current filters applied.
   * @param {Object} [additionalFilters] - Additional filters to merge with current state filters.
   * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
   */
  const fetchDeployments = useCallback(
    async (additionalFilters) => {
      try {
        const deploymentFilters = { ...additionalFilters };

        if (!deploymentFilters.domainId && state.filters.domainId) {
          deploymentFilters.domainId = state.filters.domainId;
        }

        if (!deploymentFilters.serviceId && state.filters.serviceId) {
          deploymentFilters.serviceId = state.filters.serviceId;
        }

        if (!deploymentFilters.timeRangeKey && state.filters.timeRangeKey) {
          deploymentFilters.timeRangeKey = state.filters.timeRangeKey;
        }

        return await getDeployments(deploymentFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch deployments:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to load deployment events.',
        };
      }
    },
    [state.filters.domainId, state.filters.serviceId, state.filters.timeRangeKey],
  );

  /**
   * Fetch all services as a flat array.
   * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
   */
  const fetchAllServices = useCallback(async () => {
    try {
      return await getAllServices();
    } catch (e) {
      console.error('[DashboardContext] Failed to fetch all services:', e);
      return {
        status: 'error',
        data: null,
        error: 'Failed to load services.',
      };
    }
  }, []);

  /**
   * Fetch a single service by ID.
   * @param {string} serviceId - The service ID.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchServiceById = useCallback(async (serviceId) => {
    try {
      return await getServiceById(serviceId);
    } catch (e) {
      console.error('[DashboardContext] Failed to fetch service:', e);
      return {
        status: 'error',
        data: null,
        error: 'Failed to load service.',
      };
    }
  }, []);

  /**
   * Fetch the change failure rate data.
   * @param {Object} [filters] - Optional filters.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchChangeFailureRate = useCallback(
    async (filters) => {
      try {
        const cfrFilters = filters || {};

        if (!cfrFilters.timeRangeKey && state.filters.timeRangeKey) {
          cfrFilters.timeRangeKey = state.filters.timeRangeKey;
        }

        return await getChangeFailureRate(cfrFilters);
      } catch (e) {
        console.error('[DashboardContext] Failed to fetch change failure rate:', e);
        return {
          status: 'error',
          data: null,
          error: 'Failed to compute change failure rate.',
        };
      }
    },
    [state.filters.timeRangeKey],
  );

  /**
   * Fetch confluence/SOP links.
   * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
   */
  const fetchConfluenceLinks = useCallback(async () => {
    try {
      return await getConfluenceLinks();
    } catch (e) {
      console.error('[DashboardContext] Failed to fetch confluence links:', e);
      return {
        status: 'error',
        data: null,
        error: 'Failed to load confluence links.',
      };
    }
  }, []);

  /**
   * Fetch the current metric thresholds configuration.
   * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
   */
  const fetchMetricThresholds = useCallback(async () => {
    try {
      return await getMetricThresholds();
    } catch (e) {
      console.error('[DashboardContext] Failed to fetch metric thresholds:', e);
      return {
        status: 'error',
        data: null,
        error: 'Failed to load metric thresholds.',
      };
    }
  }, []);

  // ─── Derived Data ──────────────────────────────────────────────────────

  const filterDomains = useCallback((domains = [], filters = {}) => {
    if (!Array.isArray(domains) || domains.length === 0) {
      return [];
    }

    let filtered = domains;

    if (filters.domainId) {
      filtered = filtered.filter((domain) => domain.domain_id === filters.domainId);
    }

    if (filters.tier) {
      filtered = filtered.filter((domain) => domain.tier === filters.tier);
    }

    if (filters.serviceId) {
      filtered = filtered
        .map((domain) => ({
          ...domain,
          services: (domain.services || []).filter(
            (service) => service.service_id === filters.serviceId,
          ),
        }))
        .filter((domain) => (domain.services || []).length > 0);
    }

    return filtered;
  }, []);

  const getFilteredServiceIds = useCallback((domains = [], filters = {}) => {
    const serviceIds = new Set();

    if (!Array.isArray(domains) || domains.length === 0) {
      return serviceIds;
    }

    for (const domain of domains) {
      for (const service of domain.services || []) {
        if (filters.serviceId && service.service_id !== filters.serviceId) {
          continue;
        }
        serviceIds.add(service.service_id);
      }
    }

    return serviceIds;
  }, []);

  const filterGoldenSignalTimeSeries = useCallback(
    (timeSeries = {}, domains = [], filters = {}) => {
      if (!timeSeries || typeof timeSeries !== 'object') {
        return {};
      }

      const allowedServiceIds = getFilteredServiceIds(domains, filters);
      const { timeRangeKey } = filters || {};
      let timeFilter = null;

      if (timeRangeKey) {
        const { start, end } = getTimeRange(timeRangeKey);
        timeFilter = (point) => point && point.timestamp && isWithinRange(point.timestamp, start, end);
      }

      return Object.entries(timeSeries).reduce((result, [serviceId, serviceSeries]) => {
        if (filters.serviceId && serviceId !== filters.serviceId) {
          return result;
        }

        if (allowedServiceIds.size > 0 && !allowedServiceIds.has(serviceId)) {
          return result;
        }

        const filteredSeries = {};

        for (const [signalType, series] of Object.entries(serviceSeries || {})) {
          if (!Array.isArray(series) || series.length === 0) {
            continue;
          }

          filteredSeries[signalType] = timeFilter
            ? series.filter(timeFilter)
            : series;
        }

        if (Object.keys(filteredSeries).length > 0) {
          result[serviceId] = filteredSeries;
        }

        return result;
      }, {});
    },
    [getFilteredServiceIds],
  );

  const filterIncidents = useCallback((incidents = [], filters = {}) => {
    if (!Array.isArray(incidents) || incidents.length === 0) {
      return [];
    }

    let filtered = incidents;

    if (filters.domainId) {
      filtered = filtered.filter((incident) => incident.domain_id === filters.domainId);
    }

    if (filters.serviceId) {
      filtered = filtered.filter((incident) => incident.service_id === filters.serviceId);
    }

    if (filters.severity) {
      filtered = filtered.filter((incident) => incident.severity === filters.severity);
    }

    if (filters.rootCause) {
      filtered = filtered.filter((incident) => incident.root_cause === filters.rootCause);
    }

    if (filters.status) {
      filtered = filtered.filter((incident) => incident.status === filters.status);
    }

    if (filters.timeRangeKey) {
      const { start, end } = getTimeRange(filters.timeRangeKey);
      filtered = filtered.filter(
        (incident) => incident.start_time && isWithinRange(incident.start_time, start, end),
      );
    }

    return filtered;
  }, []);

  const filterDeployments = useCallback((deployments = [], filters = {}) => {
    if (!Array.isArray(deployments) || deployments.length === 0) {
      return [];
    }

    let filtered = deployments;

    if (filters.domainId) {
      filtered = filtered.filter((deployment) => deployment.domain_id === filters.domainId);
    }

    if (filters.serviceId) {
      filtered = filtered.filter((deployment) => deployment.service_id === filters.serviceId);
    }

    if (filters.timeRangeKey) {
      const { start, end } = getTimeRange(filters.timeRangeKey);
      filtered = filtered.filter(
        (deployment) => deployment.timestamp && isWithinRange(deployment.timestamp, start, end),
      );
    }

    return filtered;
  }, []);

  const domains = useMemo(() => {
    if (!state.dashboardData || !state.dashboardData.domains) {
      return [];
    }

    return state.dashboardData.domains;
  }, [state.dashboardData]);

  const filteredDomains = useMemo(
    () => filterDomains(state.dashboardData?.domains || [], state.filters),
    [filterDomains, state.dashboardData, state.filters],
  );

  const filteredIncidents = useMemo(
    () => filterIncidents(state.dashboardData?.incidents || [], state.filters),
    [filterIncidents, state.dashboardData, state.filters],
  );

  const filteredDeployments = useMemo(
    () => filterDeployments(state.dashboardData?.deployment_events || [], state.filters),
    [filterDeployments, state.dashboardData, state.filters],
  );

  const filteredDashboardData = useMemo(() => {
    if (!state.dashboardData) {
      return null;
    }

    return {
      ...state.dashboardData,
      domains: filteredDomains,
      incidents: filteredIncidents,
      deployment_events: filteredDeployments,
      golden_signal_time_series: filterGoldenSignalTimeSeries(
        state.dashboardData?.golden_signal_time_series || {},
        state.dashboardData?.domains || [],
        state.filters,
      ),
    };
  }, [state.dashboardData, filteredDomains, filteredIncidents, filteredDeployments, filterGoldenSignalTimeSeries, state.filters]);

  const incidentSummary = useMemo(() => {
    if (!state.dashboardData || !state.dashboardData.incident_summary) {
      return null;
    }

    return state.dashboardData.incident_summary;
  }, [state.dashboardData]);

  const changeFailureRate = useMemo(() => {
    if (!state.dashboardData || !state.dashboardData.change_failure_rate) {
      return null;
    }

    return state.dashboardData.change_failure_rate;
  }, [state.dashboardData]);

  const dependencyGraph = useMemo(() => {
    if (!state.dashboardData || !state.dashboardData.dependency_graph) {
      return { nodes: [], edges: [] };
    }

    return state.dashboardData.dependency_graph;
  }, [state.dashboardData]);

  // ─── Context Value ─────────────────────────────────────────────────────

  const contextValue = useMemo(
    () => ({
      // State
      dashboardData: state.dashboardData,
      filteredDashboardData,
      isLoading: state.isLoading,
      error: state.error,
      filters: state.filters,
      lastUpdated: state.lastUpdated,

      // Derived data
      domains,
      filteredDomains,
      filteredIncidents,
      filteredDeployments,
      incidentSummary,
      changeFailureRate,
      dependencyGraph,

      // Core actions
      setDashboardData,
      refresh,
      setFilters,
      resetFilters,
      clearError,

      // Data mutation
      uploadData,
      updateThresholds,

      // Data fetching
      fetchIncidentTrends,
      fetchServiceDependencyMap,
      fetchErrorBudgets,
      fetchGoldenSignals,
      fetchComplianceReports,
      fetchIncidents,
      fetchDeployments,
      fetchAllServices,
      fetchServiceById,
      fetchChangeFailureRate,
      fetchConfluenceLinks,
      fetchMetricThresholds,
    }),
    [
      state.dashboardData,
      state.isLoading,
      state.error,
      state.filters,
      state.lastUpdated,
      domains,
      incidentSummary,
      changeFailureRate,
      dependencyGraph,
      setDashboardData,
      refresh,
      setFilters,
      resetFilters,
      clearError,
      uploadData,
      updateThresholds,
      filteredDashboardData,
      filteredDomains,
      filteredIncidents,
      filteredDeployments,
      fetchIncidentTrends,
      fetchServiceDependencyMap,
      fetchErrorBudgets,
      fetchGoldenSignals,
      fetchComplianceReports,
      fetchIncidents,
      fetchDeployments,
      fetchAllServices,
      fetchServiceById,
      fetchChangeFailureRate,
      fetchConfluenceLinks,
      fetchMetricThresholds,
    ],
  );

  return <DashboardContext.Provider value={contextValue}>{children}</DashboardContext.Provider>;
};

/**
 * Custom hook to access the dashboard context.
 * Must be used within a DashboardProvider.
 * @returns {Object} The dashboard context value.
 */
const useDashboard = () => {
  const context = useContext(DashboardContext);

  if (!context) {
    throw new Error(
      'useDashboard must be used within a DashboardProvider. Wrap your component tree with <DashboardProvider>.',
    );
  }

  return context;
};

export { DashboardContext, DashboardProvider, useDashboard };