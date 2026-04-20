import { getItem, setItem, hasItem } from '../utils/storage';
import {
  MOCK_DASHBOARD_DATA,
  MOCK_DOMAINS,
  MOCK_INCIDENTS,
  MOCK_DEPLOYMENT_EVENTS,
  MOCK_SLA_COMPLIANCE,
  MOCK_GOLDEN_SIGNAL_TIME_SERIES,
  MOCK_DEPENDENCY_NODES,
  MOCK_DEPENDENCY_EDGES,
  MOCK_INCIDENT_SUMMARY,
  MOCK_CHANGE_FAILURE_RATE,
  MOCK_CONFLUENCE_LINKS,
  MOCK_METRIC_THRESHOLDS,
  getAllMockServices,
  getMockServicesByDomain,
  getMockServiceById,
  getMockIncidentsByDomain,
  getMockIncidentsBySeverity,
  getMockSLAComplianceByDomain,
  getMockDeploymentsByService,
  getMockGoldenSignalTimeSeries,
} from '../constants/mockDashboardData';
import {
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_METRICS,
  SEVERITY_LEVELS,
  SEVERITY_ORDER,
  RCA_CATEGORIES,
  DOMAIN_TIER_ORDER,
  DEFAULT_DOMAINS,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  DEFAULT_METRIC_THRESHOLDS,
  TIME_RANGES,
  getDefaultSLATarget,
  getDefaultSLOTarget,
  getMetricThreshold,
} from '../constants/metrics';
import { validateCSVSchema, validateMetricThresholds } from '../utils/validators';
import { parseTimestamp, isWithinRange, getTimeRange } from '../utils/dateUtils';
import { transformMetricsRowsToDashboardData } from '../utils/metricsTransform';

const DASHBOARD_DATA_STORAGE_KEY = 'dashboard_data';
const DASHBOARD_DATA_BACKUP_KEY = 'dashboard_data_backup';
const METRIC_THRESHOLDS_STORAGE_KEY = 'metric_thresholds';
const UPLOADED_DATA_STORAGE_KEY = 'uploaded_data';
const SCHEMA_VERSION = 1;

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Deep-merge two objects. Arrays are concatenated (not replaced).
 * @param {Object} target - The base object.
 * @param {Object} source - The object to merge in.
 * @returns {Object} The merged object.
 */
const deepMerge = (target, source) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }

  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return { ...source };
  }

  const result = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      result[key] = [...targetVal, ...sourceVal];
    } else if (
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
};

/**
 * Deduplicate an array of objects by a given key.
 * Later entries override earlier ones with the same key value.
 * @param {Object[]} arr - The array to deduplicate.
 * @param {string} key - The property key to deduplicate by.
 * @returns {Object[]} Deduplicated array.
 */
const deduplicateByKey = (arr, key) => {
  if (!arr || !Array.isArray(arr) || !key) {
    return arr || [];
  }

  const map = new Map();

  for (const item of arr) {
    if (item && item[key] != null) {
      map.set(item[key], item);
    }
  }

  return Array.from(map.values());
};

/**
 * Get the stored uploaded data from localStorage.
 * @returns {Object|null} The uploaded data object or null.
 */
const getStoredUploadedData = () => {
  return getItem(UPLOADED_DATA_STORAGE_KEY, null);
};

/**
 * Persist uploaded data to localStorage.
 * @param {Object} data - The uploaded data to persist.
 * @returns {boolean} True if persisted successfully.
 */
const persistUploadedData = (data) => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return setItem(UPLOADED_DATA_STORAGE_KEY, data);
};

/**
 * Get the stored metric thresholds from localStorage.
 * @returns {Object|null} The thresholds object or null.
 */
const getStoredThresholds = () => {
  return getItem(METRIC_THRESHOLDS_STORAGE_KEY, null);
};

/**
 * Persist metric thresholds to localStorage.
 * @param {Object} thresholds - The thresholds to persist.
 * @returns {boolean} True if persisted successfully.
 */
const persistThresholds = (thresholds) => {
  if (!thresholds || typeof thresholds !== 'object') {
    return false;
  }

  return setItem(METRIC_THRESHOLDS_STORAGE_KEY, thresholds);
};

/**
 * Create a backup of the current dashboard data in localStorage.
 * @returns {boolean} True if backup was created successfully.
 */
const backupDashboardData = () => {
  try {
    const currentData = getItem(DASHBOARD_DATA_STORAGE_KEY, null);

    if (currentData) {
      return setItem(DASHBOARD_DATA_BACKUP_KEY, currentData);
    }

    return true;
  } catch (_e) {
    return false;
  }
};

/**
 * Restore dashboard data from backup.
 * @returns {boolean} True if restore was successful.
 */
const restoreFromBackup = () => {
  try {
    const backupData = getItem(DASHBOARD_DATA_BACKUP_KEY, null);

    if (backupData) {
      return setItem(DASHBOARD_DATA_STORAGE_KEY, backupData);
    }

    return false;
  } catch (_e) {
    return false;
  }
};

// ─── Merge Logic ───────────────────────────────────────────────────────────

/**
 * Merge uploaded domains/services into the base mock data.
 * Uploaded data takes precedence for matching IDs; new entries are appended.
 * @param {Object[]} baseDomains - The base domain array (from mock data).
 * @param {Object[]} uploadedDomains - The uploaded domain array.
 * @returns {Object[]} Merged domain array.
 */
const mergeDomains = (baseDomains, uploadedDomains) => {
  if (!uploadedDomains || !Array.isArray(uploadedDomains) || uploadedDomains.length === 0) {
    return baseDomains || [];
  }

  if (!baseDomains || !Array.isArray(baseDomains) || baseDomains.length === 0) {
    return uploadedDomains;
  }

  const domainMap = new Map();

  for (const domain of baseDomains) {
    if (domain && domain.domain_id) {
      domainMap.set(domain.domain_id, { ...domain });
    }
  }

  for (const uploadedDomain of uploadedDomains) {
    if (!uploadedDomain || !uploadedDomain.domain_id) {
      continue;
    }

    const existing = domainMap.get(uploadedDomain.domain_id);

    if (existing) {
      // Merge services within the domain
      const mergedServices = deduplicateByKey(
        [...(existing.services || []), ...(uploadedDomain.services || [])],
        'service_id',
      );

      domainMap.set(uploadedDomain.domain_id, {
        ...existing,
        ...uploadedDomain,
        services: mergedServices,
      });
    } else {
      domainMap.set(uploadedDomain.domain_id, { ...uploadedDomain });
    }
  }

  return Array.from(domainMap.values());
};

/**
 * Merge uploaded incidents into the base incident array.
 * @param {Object[]} baseIncidents - The base incident array.
 * @param {Object[]} uploadedIncidents - The uploaded incident array.
 * @returns {Object[]} Merged and deduplicated incident array.
 */
const mergeIncidents = (baseIncidents, uploadedIncidents) => {
  if (!uploadedIncidents || !Array.isArray(uploadedIncidents) || uploadedIncidents.length === 0) {
    return baseIncidents || [];
  }

  if (!baseIncidents || !Array.isArray(baseIncidents) || baseIncidents.length === 0) {
    return uploadedIncidents;
  }

  return deduplicateByKey([...baseIncidents, ...uploadedIncidents], 'incident_id');
};

/**
 * Merge uploaded deployment events into the base deployment array.
 * @param {Object[]} baseDeployments - The base deployment array.
 * @param {Object[]} uploadedDeployments - The uploaded deployment array.
 * @returns {Object[]} Merged and deduplicated deployment array.
 */
const mergeDeployments = (baseDeployments, uploadedDeployments) => {
  if (
    !uploadedDeployments ||
    !Array.isArray(uploadedDeployments) ||
    uploadedDeployments.length === 0
  ) {
    return baseDeployments || [];
  }

  if (!baseDeployments || !Array.isArray(baseDeployments) || baseDeployments.length === 0) {
    return uploadedDeployments;
  }

  return deduplicateByKey([...baseDeployments, ...uploadedDeployments], 'deployment_id');
};

/**
 * Merge uploaded SLA compliance records into the base array.
 * @param {Object[]} baseCompliance - The base compliance array.
 * @param {Object[]} uploadedCompliance - The uploaded compliance array.
 * @returns {Object[]} Merged compliance array.
 */
const mergeCompliance = (baseCompliance, uploadedCompliance) => {
  if (
    !uploadedCompliance ||
    !Array.isArray(uploadedCompliance) ||
    uploadedCompliance.length === 0
  ) {
    return baseCompliance || [];
  }

  if (!baseCompliance || !Array.isArray(baseCompliance) || baseCompliance.length === 0) {
    return uploadedCompliance;
  }

  // Deduplicate by composite key: domain_id + month
  const map = new Map();

  for (const record of baseCompliance) {
    if (record && record.domain_id && record.month) {
      map.set(`${record.domain_id}::${record.month}`, record);
    }
  }

  for (const record of uploadedCompliance) {
    if (record && record.domain_id && record.month) {
      map.set(`${record.domain_id}::${record.month}`, record);
    }
  }

  return Array.from(map.values());
};

// ─── Core Data Access Methods ──────────────────────────────────────────────

/**
 * Get the full dashboard data object, merging mock data with any uploaded data.
 * This is the primary data access method for all dashboard views.
 *
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 *   Result object with the merged dashboard data.
 */
const getDashboardData = async () => {
  try {
    // Start with mock data as the base
    const baseData = { ...MOCK_DASHBOARD_DATA };

    // Check for stored/uploaded data
    const storedData = getItem(DASHBOARD_DATA_STORAGE_KEY, null);
    const uploadedData = getStoredUploadedData();

    let mergedData = { ...baseData };

    // Merge stored dashboard data if present
    if (storedData && typeof storedData === 'object') {
      mergedData = {
        ...mergedData,
        domains: mergeDomains(mergedData.domains, storedData.domains),
        incidents: mergeIncidents(mergedData.incidents, storedData.incidents),
        deployment_events: mergeDeployments(
          mergedData.deployment_events,
          storedData.deployment_events,
        ),
        sla_compliance: mergeCompliance(mergedData.sla_compliance, storedData.sla_compliance),
      };

      if (storedData.golden_signal_time_series) {
        mergedData.golden_signal_time_series = deepMerge(
          mergedData.golden_signal_time_series,
          storedData.golden_signal_time_series,
        );
      }

      if (storedData.dependency_graph) {
        mergedData.dependency_graph = {
          nodes: deduplicateByKey(
            [
              ...(mergedData.dependency_graph?.nodes || []),
              ...(storedData.dependency_graph?.nodes || []),
            ],
            'id',
          ),
          edges: [
            ...(mergedData.dependency_graph?.edges || []),
            ...(storedData.dependency_graph?.edges || []),
          ],
        };
      }
    }

    // Merge uploaded interim data if present
    if (uploadedData && typeof uploadedData === 'object') {
      if (uploadedData.domains) {
        mergedData.domains = mergeDomains(mergedData.domains, uploadedData.domains);
      }

      if (uploadedData.incidents) {
        mergedData.incidents = mergeIncidents(mergedData.incidents, uploadedData.incidents);
      }

      if (uploadedData.deployment_events) {
        mergedData.deployment_events = mergeDeployments(
          mergedData.deployment_events,
          uploadedData.deployment_events,
        );
      }

      if (uploadedData.sla_compliance) {
        mergedData.sla_compliance = mergeCompliance(
          mergedData.sla_compliance,
          uploadedData.sla_compliance,
        );
      }

      if (uploadedData.golden_signal_time_series) {
        mergedData.golden_signal_time_series = deepMerge(
          mergedData.golden_signal_time_series,
          uploadedData.golden_signal_time_series,
        );
      }
    }

    // Apply custom thresholds if stored
    const customThresholds = getStoredThresholds();

    if (customThresholds && typeof customThresholds === 'object') {
      mergedData.config = {
        ...mergedData.config,
        thresholds: customThresholds,
      };
    }

    // Recompute summaries
    mergedData.incident_summary = computeIncidentSummary(mergedData.incidents);
    mergedData.change_failure_rate = computeChangeFailureRate(mergedData.deployment_events);
    mergedData.last_updated = new Date().toISOString();
    mergedData.schema_version = SCHEMA_VERSION;

    return {
      status: 'success',
      data: mergedData,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get dashboard data:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load dashboard data.',
    };
  }
};

/**
 * Get incident trends and analytics for a given time range.
 *
 * @param {string} [timeRangeKey='LAST_30D'] - The time range key from TIME_RANGES.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 *   Result with incident trend data including severity breakdown, RCA distribution,
 *   MTTR/MTTD/MTBF trends, and timeline data.
 */
const getIncidentTrends = async (timeRangeKey = 'LAST_30D') => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    const incidents = dashboardData.incidents || [];
    const { start, end } = getTimeRange(timeRangeKey);

    // Filter incidents within the time range
    const filteredIncidents = incidents.filter((inc) => {
      if (!inc.start_time) {
        return false;
      }

      return isWithinRange(inc.start_time, start, end);
    });

    // Severity breakdown
    const bySeverity = {};

    for (const level of Object.values(SEVERITY_LEVELS)) {
      bySeverity[level] = filteredIncidents.filter((i) => i.severity === level).length;
    }

    // RCA distribution
    const byRootCause = {};

    for (const category of Object.values(RCA_CATEGORIES)) {
      byRootCause[category] = filteredIncidents.filter((i) => i.root_cause === category).length;
    }

    // Domain breakdown
    const byDomain = {};

    for (const inc of filteredIncidents) {
      const domainId = inc.domain_id || 'unknown';

      if (!byDomain[domainId]) {
        byDomain[domainId] = 0;
      }

      byDomain[domainId] += 1;
    }

    // MTTR/MTTD/MTBF averages
    const resolvedIncidents = filteredIncidents.filter(
      (i) => i.mttr != null && !isNaN(i.mttr),
    );

    const avgMTTR =
      resolvedIncidents.length > 0
        ? parseFloat(
            (
              resolvedIncidents.reduce((sum, i) => sum + i.mttr, 0) / resolvedIncidents.length
            ).toFixed(2),
          )
        : 0;

    const detectedIncidents = filteredIncidents.filter(
      (i) => i.mttd != null && !isNaN(i.mttd),
    );

    const avgMTTD =
      detectedIncidents.length > 0
        ? parseFloat(
            (
              detectedIncidents.reduce((sum, i) => sum + i.mttd, 0) / detectedIncidents.length
            ).toFixed(2),
          )
        : 0;

    const mtbfIncidents = filteredIncidents.filter(
      (i) => i.mtbf != null && !isNaN(i.mtbf),
    );

    const avgMTBF =
      mtbfIncidents.length > 0
        ? parseFloat(
            (
              mtbfIncidents.reduce((sum, i) => sum + i.mtbf, 0) / mtbfIncidents.length
            ).toFixed(2),
          )
        : 0;

    // Timeline data (incidents sorted by start_time)
    const timeline = [...filteredIncidents].sort((a, b) => {
      const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
      const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;

      return dateA - dateB;
    });

    return {
      status: 'success',
      data: {
        total_incidents: filteredIncidents.length,
        time_range: { key: timeRangeKey, start: start.toISOString(), end: end.toISOString() },
        by_severity: bySeverity,
        by_root_cause: byRootCause,
        by_domain: byDomain,
        avg_mttr: avgMTTR,
        avg_mttd: avgMTTD,
        avg_mtbf: avgMTBF,
        timeline,
        incidents: filteredIncidents,
      },
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get incident trends:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to compute incident trends.',
    };
  }
};

/**
 * Get the service dependency map (nodes and edges) for visualization.
 *
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.domainId] - Filter nodes/edges by domain.
 * @param {string} [filters.tier] - Filter nodes by domain tier.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 *   Result with dependency graph nodes and edges.
 */
const getServiceDependencyMap = async (filters = {}) => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    let nodes = dashboardData.dependency_graph?.nodes || [];
    let edges = dashboardData.dependency_graph?.edges || [];

    // Apply domain filter
    if (filters.domainId) {
      nodes = nodes.filter((node) => node.domain === filters.domainId);
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));
    }

    // Apply tier filter
    if (filters.tier) {
      nodes = nodes.filter((node) => node.tier === filters.tier);
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));
    }

    return {
      status: 'success',
      data: {
        nodes,
        edges,
        total_nodes: nodes.length,
        total_edges: edges.length,
      },
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get service dependency map:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load service dependency map.',
    };
  }
};

/**
 * Upload interim data (parsed from CSV/Excel) and merge it into the dashboard state.
 * Validates the data against the appropriate schema before persisting.
 *
 * @param {Object} data - The parsed data to upload.
 * @param {string} data.type - The data type ('metrics', 'incidents', 'deployments').
 * @param {Object[]} data.rows - The parsed row objects.
 * @param {Object} [options] - Upload options.
 * @param {string} [options.mode='merge'] - Upload mode: 'merge' (append/update) or 'replace' (overwrite).
 * @returns {Promise<{ status: string, rowsImported: number, errors: Object[], warnings: Object[] }>}
 *   Upload result with row count and any validation errors.
 */
const uploadInterimData = async (data, options = {}) => {
  try {
    const { mode = 'merge' } = options;

    if (!data || typeof data !== 'object') {
      return {
        status: 'error',
        rowsImported: 0,
        errors: [{ row: null, error: 'No data provided for upload.' }],
        warnings: [],
      };
    }

    if (!data.type || typeof data.type !== 'string') {
      return {
        status: 'error',
        rowsImported: 0,
        errors: [{ row: null, error: 'Data type is required (metrics, incidents, or deployments).' }],
        warnings: [],
      };
    }

    if (!data.rows || !Array.isArray(data.rows) || data.rows.length === 0) {
      return {
        status: 'error',
        rowsImported: 0,
        errors: [{ row: null, error: 'No data rows provided.' }],
        warnings: [],
      };
    }

    const schemaType = data.type.toLowerCase().trim();

    // Validate against schema
    const validationResult = validateCSVSchema(data.rows, schemaType);

    if (!validationResult.valid) {
      return {
        status: 'error',
        rowsImported: 0,
        errors: validationResult.errors.map((err) => ({
          row: err.details?.row || null,
          error: err.message,
        })),
        warnings: validationResult.warnings.map((w) => ({
          row: w.details?.row || null,
          error: w.message,
        })),
      };
    }

    // Create backup before modifying data
    backupDashboardData();

    // Get existing uploaded data
    const existingUploaded = getStoredUploadedData() || {};

    let transformedData;
    let rowsImported = 0;

    try {
      switch (schemaType) {
        case 'metrics':
          transformedData = transformMetricsUpload(data.rows);
          if (mode === 'replace') {
            existingUploaded.domains = transformedData.domains;
            existingUploaded.golden_signal_time_series = transformedData.golden_signal_time_series;
          } else {
            existingUploaded.domains = mergeDomains(
              existingUploaded.domains || [],
              transformedData.domains,
            );
            existingUploaded.golden_signal_time_series = deepMerge(
              existingUploaded.golden_signal_time_series || {},
              transformedData.golden_signal_time_series,
            );
          }
          rowsImported = data.rows.length;
          break;

        case 'incidents':
          transformedData = transformIncidentsUpload(data.rows);
          if (mode === 'replace') {
            existingUploaded.incidents = transformedData.incidents;
          } else {
            existingUploaded.incidents = mergeIncidents(
              existingUploaded.incidents || [],
              transformedData.incidents,
            );
          }
          rowsImported = transformedData.incidents.length;
          break;

        case 'deployments':
          transformedData = transformDeploymentsUpload(data.rows);
          if (mode === 'replace') {
            existingUploaded.deployment_events = transformedData.deployment_events;
          } else {
            existingUploaded.deployment_events = mergeDeployments(
              existingUploaded.deployment_events || [],
              transformedData.deployment_events,
            );
          }
          rowsImported = transformedData.deployment_events.length;
          break;

        default:
          return {
            status: 'error',
            rowsImported: 0,
            errors: [
              {
                row: null,
                error: `Unsupported data type: "${schemaType}". Supported types: metrics, incidents, deployments.`,
              },
            ],
            warnings: [],
          };
      }
    } catch (transformError) {
      console.error('[dataService] Data transformation failed:', transformError);
      restoreFromBackup();
      return {
        status: 'error',
        rowsImported: 0,
        errors: [{ row: null, error: 'Failed to transform uploaded data.' }],
        warnings: [],
      };
    }

    // Persist the merged uploaded data
    const persisted = persistUploadedData(existingUploaded);

    if (!persisted) {
      restoreFromBackup();
      return {
        status: 'error',
        rowsImported: 0,
        errors: [{ row: null, error: 'Failed to save uploaded data to storage.' }],
        warnings: [],
      };
    }

    return {
      status: 'success',
      rowsImported,
      errors: [],
      warnings: validationResult.warnings.map((w) => ({
        row: w.details?.row || null,
        error: w.message,
      })),
    };
  } catch (e) {
    console.error('[dataService] Upload failed:', e);
    restoreFromBackup();
    return {
      status: 'error',
      rowsImported: 0,
      errors: [{ row: null, error: 'An unexpected error occurred during upload.' }],
      warnings: [],
    };
  }
};

/**
 * Update metric threshold configuration.
 * Validates the thresholds before persisting.
 *
 * @param {Object} config - Threshold configuration object keyed by metric name.
 * @returns {Promise<{ status: string, error: string|null, validationErrors: Object[] }>}
 *   Result indicating success or failure with validation details.
 */
const updateMetricThresholds = async (config) => {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {
        status: 'error',
        error: 'Threshold configuration must be a non-null object.',
        validationErrors: [],
      };
    }

    // Validate thresholds
    const validationResult = validateMetricThresholds(config);

    if (!validationResult.valid) {
      return {
        status: 'error',
        error: 'Threshold validation failed.',
        validationErrors: validationResult.errors,
      };
    }

    // Merge with existing thresholds
    const existingThresholds = getStoredThresholds() || {};
    const mergedThresholds = { ...existingThresholds };

    for (const [metricKey, thresholdConfig] of Object.entries(config)) {
      mergedThresholds[metricKey] = {
        ...(mergedThresholds[metricKey] || {}),
        ...thresholdConfig,
      };
    }

    const persisted = persistThresholds(mergedThresholds);

    if (!persisted) {
      return {
        status: 'error',
        error: 'Failed to save threshold configuration to storage.',
        validationErrors: [],
      };
    }

    return {
      status: 'success',
      error: null,
      validationErrors: [],
    };
  } catch (e) {
    console.error('[dataService] Failed to update metric thresholds:', e);
    return {
      status: 'error',
      error: 'An unexpected error occurred while updating thresholds.',
      validationErrors: [],
    };
  }
};

/**
 * Get error budget data for all services, grouped by domain.
 *
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.domainId] - Filter by domain ID.
 * @param {string} [filters.tier] - Filter by domain tier.
 * @param {boolean} [filters.breachedOnly=false] - Only return services with breached error budgets.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 *   Result with error budget data per service and domain.
 */
const getErrorBudgets = async (filters = {}) => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    let domains = dashboardData.domains || [];

    // Apply domain filter
    if (filters.domainId) {
      domains = domains.filter((d) => d.domain_id === filters.domainId);
    }

    // Apply tier filter
    if (filters.tier) {
      domains = domains.filter((d) => d.tier === filters.tier);
    }

    const customThresholds = getStoredThresholds() || {};
    const errorBudgetThreshold = customThresholds.error_budget || DEFAULT_METRIC_THRESHOLDS.error_budget;

    const domainBudgets = domains.map((domain) => {
      const services = (domain.services || []).map((service) => {
        const errorBudget = service.error_budget != null ? service.error_budget : 100;
        const sloTarget = service.slo != null ? service.slo : getDefaultSLOTarget(domain.tier);

        let budgetStatus = 'healthy';

        if (errorBudget <= (errorBudgetThreshold.critical || DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL)) {
          budgetStatus = 'critical';
        } else if (errorBudget <= (errorBudgetThreshold.warning || DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING)) {
          budgetStatus = 'warning';
        }

        return {
          service_id: service.service_id,
          name: service.name,
          availability: service.availability,
          slo: sloTarget,
          error_budget: errorBudget,
          budget_status: budgetStatus,
          status: service.status,
        };
      });

      const filteredServices = filters.breachedOnly
        ? services.filter((s) => s.budget_status !== 'healthy')
        : services;

      const domainBudgetAvg =
        filteredServices.length > 0
          ? parseFloat(
              (
                filteredServices.reduce((sum, s) => sum + s.error_budget, 0) /
                filteredServices.length
              ).toFixed(2),
            )
          : 100;

      return {
        domain_id: domain.domain_id,
        name: domain.name,
        tier: domain.tier,
        avg_error_budget: domainBudgetAvg,
        services: filteredServices,
        total_services: filteredServices.length,
        breached_services: filteredServices.filter((s) => s.budget_status === 'critical').length,
        warning_services: filteredServices.filter((s) => s.budget_status === 'warning').length,
      };
    });

    // Filter out domains with no services after filtering
    const nonEmptyDomains = filters.breachedOnly
      ? domainBudgets.filter((d) => d.total_services > 0)
      : domainBudgets;

    return {
      status: 'success',
      data: {
        domains: nonEmptyDomains,
        total_services: nonEmptyDomains.reduce((sum, d) => sum + d.total_services, 0),
        total_breached: nonEmptyDomains.reduce((sum, d) => sum + d.breached_services, 0),
        total_warning: nonEmptyDomains.reduce((sum, d) => sum + d.warning_services, 0),
        thresholds: {
          warning: errorBudgetThreshold.warning || DEFAULT_ERROR_BUDGET_THRESHOLDS.WARNING,
          critical: errorBudgetThreshold.critical || DEFAULT_ERROR_BUDGET_THRESHOLDS.CRITICAL,
        },
      },
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get error budgets:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to compute error budget data.',
    };
  }
};

/**
 * Get golden signal metrics for services, with optional filtering.
 *
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.domainId] - Filter by domain ID.
 * @param {string} [filters.serviceId] - Filter by service ID.
 * @param {string} [filters.signalType] - Filter by golden signal type (LATENCY, TRAFFIC, ERRORS, SATURATION).
 * @param {string} [filters.timeRangeKey='LAST_24H'] - Time range for time series data.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 *   Result with golden signal data including current values and time series.
 */
const getGoldenSignals = async (filters = {}) => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    let domains = dashboardData.domains || [];
    const timeSeriesData = dashboardData.golden_signal_time_series || {};

    // Apply domain filter
    if (filters.domainId) {
      domains = domains.filter((d) => d.domain_id === filters.domainId);
    }

    // Build service-level golden signal data
    const serviceSignals = [];

    for (const domain of domains) {
      for (const service of domain.services || []) {
        // Apply service filter
        if (filters.serviceId && service.service_id !== filters.serviceId) {
          continue;
        }

        const signals = service.golden_signals || {};
        let signalData = {};

        if (filters.signalType) {
          const signalMetrics = GOLDEN_SIGNAL_METRICS[filters.signalType];

          if (signalMetrics) {
            for (const metric of signalMetrics) {
              signalData[metric.key] = {
                value: signals[metric.key] != null ? signals[metric.key] : null,
                label: metric.label,
                unit: metric.unit,
              };
            }
          }
        } else {
          // Include all golden signals
          for (const [signalType, metrics] of Object.entries(GOLDEN_SIGNAL_METRICS)) {
            for (const metric of metrics) {
              signalData[metric.key] = {
                value: signals[metric.key] != null ? signals[metric.key] : null,
                label: metric.label,
                unit: metric.unit,
                signal_type: signalType,
              };
            }
          }
        }

        // Get time series for this service if available
        let timeSeries = null;
        const serviceTimeSeries = timeSeriesData[service.service_id];

        if (serviceTimeSeries) {
          if (filters.signalType) {
            timeSeries = serviceTimeSeries[filters.signalType] || null;
          } else {
            timeSeries = serviceTimeSeries;
          }
        }

        serviceSignals.push({
          service_id: service.service_id,
          name: service.name,
          domain_id: domain.domain_id,
          domain_name: domain.name,
          domain_tier: domain.tier,
          status: service.status,
          availability: service.availability,
          signals: signalData,
          time_series: timeSeries,
        });
      }
    }

    return {
      status: 'success',
      data: {
        services: serviceSignals,
        total_services: serviceSignals.length,
        signal_types: filters.signalType
          ? [filters.signalType]
          : Object.keys(GOLDEN_SIGNAL_METRICS),
      },
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get golden signals:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load golden signal data.',
    };
  }
};

/**
 * Get compliance reports including SLA compliance, availability trends, and breach analysis.
 *
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.domainId] - Filter by domain ID.
 * @param {string} [filters.tier] - Filter by domain tier.
 * @param {number} [filters.months=12] - Number of months of compliance data to return.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 *   Result with compliance report data.
 */
const getComplianceReports = async (filters = {}) => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    let complianceRecords = dashboardData.sla_compliance || [];
    let domains = dashboardData.domains || [];
    const confluenceLinks = dashboardData.config?.confluence_links || [];

    // Apply domain filter
    if (filters.domainId) {
      complianceRecords = complianceRecords.filter((r) => r.domain_id === filters.domainId);
      domains = domains.filter((d) => d.domain_id === filters.domainId);
    }

    // Apply tier filter
    if (filters.tier) {
      const domainsInTier = domains
        .filter((d) => d.tier === filters.tier)
        .map((d) => d.domain_id);
      complianceRecords = complianceRecords.filter((r) => domainsInTier.includes(r.domain_id));
      domains = domains.filter((d) => d.tier === filters.tier);
    }

    // Limit months
    const monthsLimit = filters.months != null && !isNaN(filters.months) ? filters.months : 12;

    // Sort records by month descending and take the most recent N months per domain
    const recordsByDomain = {};

    for (const record of complianceRecords) {
      if (!recordsByDomain[record.domain_id]) {
        recordsByDomain[record.domain_id] = [];
      }

      recordsByDomain[record.domain_id].push(record);
    }

    for (const domainId of Object.keys(recordsByDomain)) {
      recordsByDomain[domainId] = recordsByDomain[domainId]
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
        .slice(0, monthsLimit);
    }

    // Build domain compliance summaries
    const domainCompliance = domains.map((domain) => {
      const records = recordsByDomain[domain.domain_id] || [];
      const slaTarget = getDefaultSLATarget(domain.tier);

      const totalMonths = records.length;
      const compliantMonths = records.filter((r) => r.compliant).length;
      const breachMonths = totalMonths - compliantMonths;

      const avgAvailability =
        totalMonths > 0
          ? parseFloat(
              (records.reduce((sum, r) => sum + (r.availability || 0), 0) / totalMonths).toFixed(2),
            )
          : 0;

      const totalBreachMinutes = records.reduce(
        (sum, r) => sum + (r.breach_minutes || 0),
        0,
      );

      return {
        domain_id: domain.domain_id,
        name: domain.name,
        tier: domain.tier,
        sla_target: slaTarget,
        avg_availability: avgAvailability,
        total_months: totalMonths,
        compliant_months: compliantMonths,
        breach_months: breachMonths,
        compliance_rate:
          totalMonths > 0
            ? parseFloat(((compliantMonths / totalMonths) * 100).toFixed(2))
            : 100,
        total_breach_minutes: parseFloat(totalBreachMinutes.toFixed(2)),
        monthly_records: records.sort((a, b) => (a.month || '').localeCompare(b.month || '')),
      };
    });

    // Sort by tier order then by name
    domainCompliance.sort((a, b) => {
      const tierDiff = (DOMAIN_TIER_ORDER[a.tier] ?? 99) - (DOMAIN_TIER_ORDER[b.tier] ?? 99);

      if (tierDiff !== 0) {
        return tierDiff;
      }

      return (a.name || '').localeCompare(b.name || '');
    });

    // Overall compliance summary
    const allRecords = Object.values(recordsByDomain).flat();
    const overallCompliant = allRecords.filter((r) => r.compliant).length;
    const overallTotal = allRecords.length;

    return {
      status: 'success',
      data: {
        domains: domainCompliance,
        overall: {
          total_records: overallTotal,
          compliant_records: overallCompliant,
          compliance_rate:
            overallTotal > 0
              ? parseFloat(((overallCompliant / overallTotal) * 100).toFixed(2))
              : 100,
        },
        confluence_links: confluenceLinks,
        months_included: monthsLimit,
      },
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get compliance reports:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to generate compliance reports.',
    };
  }
};

// ─── Data Transformation Helpers ───────────────────────────────────────────

/**
 * Transform uploaded metrics rows into domain/service structure.
 * @param {Object[]} rows - Parsed metric row objects.
 * @returns {{ domains: Object[] }} Transformed domain data.
 */
const transformMetricsUpload = (rows) => {
  return transformMetricsRowsToDashboardData(rows);
};

/**
 * Transform uploaded incident rows into incident array.
 * @param {Object[]} rows - Parsed incident row objects.
 * @returns {{ incidents: Object[] }} Transformed incident data.
 */
const transformIncidentsUpload = (rows) => {
  const incidents = [];

  for (const row of rows) {
    if (!row.incident_id || !row.service_id || !row.domain_id) {
      continue;
    }

    const incident = {
      incident_id: row.incident_id.trim(),
      service_id: row.service_id.trim(),
      domain_id: row.domain_id.trim(),
      severity: row.severity ? row.severity.toUpperCase().trim() : SEVERITY_LEVELS.P4,
      root_cause: row.root_cause ? row.root_cause.trim() : RCA_CATEGORIES.CODE,
      title: row.title ? row.title.trim() : '',
      description: row.description ? row.description.trim() : '',
      start_time: row.start_time || new Date().toISOString(),
      end_time: row.end_time || null,
      mttr: row.mttr != null && !isNaN(parseFloat(row.mttr)) ? parseFloat(row.mttr) : null,
      mttd: row.mttd != null && !isNaN(parseFloat(row.mttd)) ? parseFloat(row.mttd) : null,
      mtbf: row.mtbf != null && !isNaN(parseFloat(row.mtbf)) ? parseFloat(row.mtbf) : null,
      status: row.status ? row.status.trim() : 'open',
      evidence_links: row.evidence_links
        ? row.evidence_links
            .split(';')
            .map((link) => link.trim())
            .filter((link) => link.length > 0)
        : [],
    };

    incidents.push(incident);
  }

  return { incidents };
};

/**
 * Transform uploaded deployment rows into deployment event array.
 * @param {Object[]} rows - Parsed deployment row objects.
 * @returns {{ deployment_events: Object[] }} Transformed deployment data.
 */
const transformDeploymentsUpload = (rows) => {
  const deploymentEvents = [];

  for (const row of rows) {
    if (!row.deployment_id || !row.service_id || !row.domain_id) {
      continue;
    }

    const deployment = {
      deployment_id: row.deployment_id.trim(),
      service_id: row.service_id.trim(),
      domain_id: row.domain_id.trim(),
      version: row.version ? row.version.trim() : '',
      timestamp: row.timestamp || new Date().toISOString(),
      deployer: row.deployer ? row.deployer.trim() : 'unknown',
      status: row.status ? row.status.trim() : 'unknown',
      change_type: row.change_type ? row.change_type.trim() : 'unknown',
      description: row.description ? row.description.trim() : '',
      rollback:
        row.rollback === true ||
        row.rollback === 'true' ||
        row.rollback === '1' ||
        row.rollback === 'yes',
      related_incident_id: row.related_incident_id ? row.related_incident_id.trim() : null,
    };

    deploymentEvents.push(deployment);
  }

  return { deployment_events: deploymentEvents };
};

// ─── Aggregation Helpers ───────────────────────────────────────────────────

/**
 * Compute incident summary from an array of incidents.
 * @param {Object[]} incidents - Array of incident objects.
 * @returns {Object} Incident summary object.
 */
const computeIncidentSummary = (incidents) => {
  if (!incidents || !Array.isArray(incidents) || incidents.length === 0) {
    return {
      total_incidents: 0,
      by_severity: {
        [SEVERITY_LEVELS.P1]: 0,
        [SEVERITY_LEVELS.P2]: 0,
        [SEVERITY_LEVELS.P3]: 0,
        [SEVERITY_LEVELS.P4]: 0,
      },
      by_root_cause: {
        [RCA_CATEGORIES.CODE]: 0,
        [RCA_CATEGORIES.INFRA]: 0,
        [RCA_CATEGORIES.DATA]: 0,
        [RCA_CATEGORIES.CONFIG]: 0,
      },
      avg_mttr: 0,
      avg_mttd: 0,
      avg_mtbf: 0,
    };
  }

  const bySeverity = {};

  for (const level of Object.values(SEVERITY_LEVELS)) {
    bySeverity[level] = incidents.filter((i) => i.severity === level).length;
  }

  const byRootCause = {};

  for (const category of Object.values(RCA_CATEGORIES)) {
    byRootCause[category] = incidents.filter((i) => i.root_cause === category).length;
  }

  const mttrValues = incidents.filter((i) => i.mttr != null && !isNaN(i.mttr));
  const mttdValues = incidents.filter((i) => i.mttd != null && !isNaN(i.mttd));
  const mtbfValues = incidents.filter((i) => i.mtbf != null && !isNaN(i.mtbf));

  return {
    total_incidents: incidents.length,
    by_severity: bySeverity,
    by_root_cause: byRootCause,
    avg_mttr:
      mttrValues.length > 0
        ? parseFloat(
            (mttrValues.reduce((sum, i) => sum + i.mttr, 0) / mttrValues.length).toFixed(2),
          )
        : 0,
    avg_mttd:
      mttdValues.length > 0
        ? parseFloat(
            (mttdValues.reduce((sum, i) => sum + i.mttd, 0) / mttdValues.length).toFixed(2),
          )
        : 0,
    avg_mtbf:
      mtbfValues.length > 0
        ? parseFloat(
            (mtbfValues.reduce((sum, i) => sum + i.mtbf, 0) / mtbfValues.length).toFixed(2),
          )
        : 0,
  };
};

/**
 * Compute change failure rate from deployment events.
 * @param {Object[]} deployments - Array of deployment event objects.
 * @returns {Object} Change failure rate summary.
 */
const computeChangeFailureRate = (deployments) => {
  if (!deployments || !Array.isArray(deployments) || deployments.length === 0) {
    return {
      total_deployments: 0,
      failed_deployments: 0,
      change_failure_rate: 0,
      deployments_with_incidents: 0,
    };
  }

  const failedDeployments = deployments.filter((d) => d.rollback === true);
  const deploymentsWithIncidents = deployments.filter(
    (d) => d.related_incident_id != null && d.related_incident_id !== '',
  );

  return {
    total_deployments: deployments.length,
    failed_deployments: failedDeployments.length,
    change_failure_rate: parseFloat(
      ((failedDeployments.length / deployments.length) * 100).toFixed(2),
    ),
    deployments_with_incidents: deploymentsWithIncidents.length,
  };
};

// ─── Convenience Accessors ─────────────────────────────────────────────────

/**
 * Get all services as a flat array with domain metadata.
 * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
 */
const getAllServices = async () => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    const services = (dashboardData.domains || []).flatMap((domain) =>
      (domain.services || []).map((service) => ({
        ...service,
        domain_id: domain.domain_id,
        domain_name: domain.name,
        domain_tier: domain.tier,
      })),
    );

    return {
      status: 'success',
      data: services,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get all services:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load services.',
    };
  }
};

/**
 * Get a single service by ID with domain metadata.
 * @param {string} serviceId - The service ID to look up.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 */
const getServiceById = async (serviceId) => {
  try {
    if (!serviceId) {
      return {
        status: 'error',
        data: null,
        error: 'Service ID is required.',
      };
    }

    const { data: services, error } = await getAllServices();

    if (error || !services) {
      return {
        status: 'error',
        data: null,
        error: error || 'No services available.',
      };
    }

    const service = services.find((s) => s.service_id === serviceId);

    if (!service) {
      return {
        status: 'error',
        data: null,
        error: `Service "${serviceId}" not found.`,
      };
    }

    return {
      status: 'success',
      data: service,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get service by ID:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load service.',
    };
  }
};

/**
 * Get services filtered by domain ID.
 * @param {string} domainId - The domain ID to filter by.
 * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
 */
const getServicesByDomain = async (domainId) => {
  try {
    if (!domainId) {
      return {
        status: 'error',
        data: null,
        error: 'Domain ID is required.',
      };
    }

    const { data: services, error } = await getAllServices();

    if (error || !services) {
      return {
        status: 'error',
        data: null,
        error: error || 'No services available.',
      };
    }

    const filtered = services.filter((s) => s.domain_id === domainId);

    return {
      status: 'success',
      data: filtered,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get services by domain:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load services for domain.',
    };
  }
};

/**
 * Get incidents filtered by various criteria.
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.domainId] - Filter by domain ID.
 * @param {string} [filters.serviceId] - Filter by service ID.
 * @param {string} [filters.severity] - Filter by severity level.
 * @param {string} [filters.rootCause] - Filter by root cause category.
 * @param {string} [filters.status] - Filter by incident status.
 * @param {string} [filters.timeRangeKey] - Filter by time range.
 * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
 */
const getIncidents = async (filters = {}) => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    let incidents = dashboardData.incidents || [];

    if (filters.domainId) {
      incidents = incidents.filter((i) => i.domain_id === filters.domainId);
    }

    if (filters.serviceId) {
      incidents = incidents.filter((i) => i.service_id === filters.serviceId);
    }

    if (filters.severity) {
      incidents = incidents.filter((i) => i.severity === filters.severity);
    }

    if (filters.rootCause) {
      incidents = incidents.filter((i) => i.root_cause === filters.rootCause);
    }

    if (filters.status) {
      incidents = incidents.filter((i) => i.status === filters.status);
    }

    if (filters.timeRangeKey) {
      const { start, end } = getTimeRange(filters.timeRangeKey);
      incidents = incidents.filter(
        (i) => i.start_time && isWithinRange(i.start_time, start, end),
      );
    }

    // Sort by severity order then by start_time descending
    incidents.sort((a, b) => {
      const severityDiff =
        (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);

      if (severityDiff !== 0) {
        return severityDiff;
      }

      const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
      const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;

      return dateB - dateA;
    });

    return {
      status: 'success',
      data: incidents,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get incidents:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load incidents.',
    };
  }
};

/**
 * Get deployment events with optional filtering.
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.domainId] - Filter by domain ID.
 * @param {string} [filters.serviceId] - Filter by service ID.
 * @param {string} [filters.timeRangeKey] - Filter by time range.
 * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
 */
const getDeployments = async (filters = {}) => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    let deployments = dashboardData.deployment_events || [];

    if (filters.domainId) {
      deployments = deployments.filter((d) => d.domain_id === filters.domainId);
    }

    if (filters.serviceId) {
      deployments = deployments.filter((d) => d.service_id === filters.serviceId);
    }

    if (filters.timeRangeKey) {
      const { start, end } = getTimeRange(filters.timeRangeKey);
      deployments = deployments.filter(
        (d) => d.timestamp && isWithinRange(d.timestamp, start, end),
      );
    }

    // Sort by timestamp descending
    deployments.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;

      return dateB - dateA;
    });

    return {
      status: 'success',
      data: deployments,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get deployments:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load deployment events.',
    };
  }
};

/**
 * Get the current metric thresholds configuration.
 * Returns custom thresholds merged with defaults.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 */
const getMetricThresholds = async () => {
  try {
    const customThresholds = getStoredThresholds() || {};
    const mergedThresholds = { ...DEFAULT_METRIC_THRESHOLDS };

    for (const [key, value] of Object.entries(customThresholds)) {
      if (value && typeof value === 'object') {
        mergedThresholds[key] = {
          ...(mergedThresholds[key] || {}),
          ...value,
        };
      }
    }

    return {
      status: 'success',
      data: mergedThresholds,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get metric thresholds:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load metric thresholds.',
    };
  }
};

/**
 * Get confluence/SOP links from the dashboard configuration.
 * @returns {Promise<{ status: string, data: Object[]|null, error: string|null }>}
 */
const getConfluenceLinks = async () => {
  try {
    const { data: dashboardData, error } = await getDashboardData();

    if (error || !dashboardData) {
      return {
        status: 'error',
        data: null,
        error: error || 'No dashboard data available.',
      };
    }

    const links = dashboardData.config?.confluence_links || [];

    return {
      status: 'success',
      data: links,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get confluence links:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to load confluence links.',
    };
  }
};

/**
 * Get the change failure rate data.
 * @param {Object} [filters] - Optional filters.
 * @param {string} [filters.timeRangeKey] - Filter deployments by time range.
 * @returns {Promise<{ status: string, data: Object|null, error: string|null }>}
 */
const getChangeFailureRate = async (filters = {}) => {
  try {
    const { data: deployments, error } = await getDeployments(filters);

    if (error || !deployments) {
      return {
        status: 'error',
        data: null,
        error: error || 'No deployment data available.',
      };
    }

    const summary = computeChangeFailureRate(deployments);

    return {
      status: 'success',
      data: summary,
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to get change failure rate:', e);
    return {
      status: 'error',
      data: null,
      error: 'Failed to compute change failure rate.',
    };
  }
};

/**
 * Save the full dashboard data to localStorage.
 * Creates a backup before writing.
 * @param {Object} data - The dashboard data object to persist.
 * @returns {Promise<{ status: string, error: string|null }>}
 */
const saveDashboardData = async (data) => {
  try {
    if (!data || typeof data !== 'object') {
      return {
        status: 'error',
        error: 'Invalid data provided for save.',
      };
    }

    backupDashboardData();

    const persisted = setItem(DASHBOARD_DATA_STORAGE_KEY, {
      ...data,
      schema_version: SCHEMA_VERSION,
      last_updated: new Date().toISOString(),
    });

    if (!persisted) {
      return {
        status: 'error',
        error: 'Failed to save dashboard data to storage.',
      };
    }

    return {
      status: 'success',
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to save dashboard data:', e);
    return {
      status: 'error',
      error: 'An unexpected error occurred while saving dashboard data.',
    };
  }
};

/**
 * Clear all uploaded/custom data and reset to mock defaults.
 * @returns {Promise<{ status: string, error: string|null }>}
 */
const resetToDefaults = async () => {
  try {
    const keys = [
      DASHBOARD_DATA_STORAGE_KEY,
      DASHBOARD_DATA_BACKUP_KEY,
      METRIC_THRESHOLDS_STORAGE_KEY,
      UPLOADED_DATA_STORAGE_KEY,
    ];

    for (const key of keys) {
      setItem(key, null);
    }

    return {
      status: 'success',
      error: null,
    };
  } catch (e) {
    console.error('[dataService] Failed to reset to defaults:', e);
    return {
      status: 'error',
      error: 'Failed to reset dashboard data.',
    };
  }
};

export {
  DASHBOARD_DATA_STORAGE_KEY,
  DASHBOARD_DATA_BACKUP_KEY,
  METRIC_THRESHOLDS_STORAGE_KEY,
  UPLOADED_DATA_STORAGE_KEY,
  SCHEMA_VERSION,
  getDashboardData,
  getIncidentTrends,
  getServiceDependencyMap,
  uploadInterimData,
  updateMetricThresholds,
  getErrorBudgets,
  getGoldenSignals,
  getComplianceReports,
  getAllServices,
  getServiceById,
  getServicesByDomain,
  getIncidents,
  getDeployments,
  getMetricThresholds,
  getConfluenceLinks,
  getChangeFailureRate,
  saveDashboardData,
  resetToDefaults,
  backupDashboardData,
  restoreFromBackup,
};
