const GOLDEN_SIGNALS = Object.freeze({
  LATENCY: 'LATENCY',
  TRAFFIC: 'TRAFFIC',
  ERRORS: 'ERRORS',
  SATURATION: 'SATURATION',
});

const GOLDEN_SIGNAL_LABELS = Object.freeze({
  [GOLDEN_SIGNALS.LATENCY]: 'Latency',
  [GOLDEN_SIGNALS.TRAFFIC]: 'Traffic',
  [GOLDEN_SIGNALS.ERRORS]: 'Errors',
  [GOLDEN_SIGNALS.SATURATION]: 'Saturation',
});

const GOLDEN_SIGNAL_METRICS = Object.freeze({
  [GOLDEN_SIGNALS.LATENCY]: [
    { key: 'latency_p95', label: 'P95 Latency (ms)', unit: 'ms' },
    { key: 'latency_p99', label: 'P99 Latency (ms)', unit: 'ms' },
  ],
  [GOLDEN_SIGNALS.TRAFFIC]: [
    { key: 'traffic_rps', label: 'Requests Per Second', unit: 'rps' },
  ],
  [GOLDEN_SIGNALS.ERRORS]: [
    { key: 'errors_5xx', label: '5xx Errors', unit: 'count' },
    { key: 'errors_functional', label: 'Functional Errors', unit: 'count' },
  ],
  [GOLDEN_SIGNALS.SATURATION]: [
    { key: 'saturation_cpu', label: 'CPU Utilization', unit: '%' },
    { key: 'saturation_mem', label: 'Memory Utilization', unit: '%' },
    { key: 'saturation_queue', label: 'Queue Saturation', unit: '%' },
  ],
});

const SEVERITY_LEVELS = Object.freeze({
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
});

const SEVERITY_LABELS = Object.freeze({
  [SEVERITY_LEVELS.P1]: 'Critical',
  [SEVERITY_LEVELS.P2]: 'High',
  [SEVERITY_LEVELS.P3]: 'Medium',
  [SEVERITY_LEVELS.P4]: 'Low',
});

const SEVERITY_COLORS = Object.freeze({
  [SEVERITY_LEVELS.P1]: '#dc2626',
  [SEVERITY_LEVELS.P2]: '#ea580c',
  [SEVERITY_LEVELS.P3]: '#ca8a04',
  [SEVERITY_LEVELS.P4]: '#2563eb',
});

const SEVERITY_ORDER = Object.freeze({
  [SEVERITY_LEVELS.P1]: 0,
  [SEVERITY_LEVELS.P2]: 1,
  [SEVERITY_LEVELS.P3]: 2,
  [SEVERITY_LEVELS.P4]: 3,
});

const RCA_CATEGORIES = Object.freeze({
  CODE: 'Code',
  INFRA: 'Infra',
  DATA: 'Data',
  CONFIG: 'Config',
});

const RCA_CATEGORY_LABELS = Object.freeze({
  [RCA_CATEGORIES.CODE]: 'Code Defect',
  [RCA_CATEGORIES.INFRA]: 'Infrastructure',
  [RCA_CATEGORIES.DATA]: 'Data Issue',
  [RCA_CATEGORIES.CONFIG]: 'Configuration',
});

const RCA_CATEGORY_COLORS = Object.freeze({
  [RCA_CATEGORIES.CODE]: '#6366f1',
  [RCA_CATEGORIES.INFRA]: '#ea580c',
  [RCA_CATEGORIES.DATA]: '#ca8a04',
  [RCA_CATEGORIES.CONFIG]: '#16a34a',
});

const DOMAIN_TIERS = Object.freeze({
  CRITICAL: 'Critical',
  CORE: 'Core',
  SUPPORTING: 'Supporting',
});

const DOMAIN_TIER_LABELS = Object.freeze({
  [DOMAIN_TIERS.CRITICAL]: 'Critical',
  [DOMAIN_TIERS.CORE]: 'Core',
  [DOMAIN_TIERS.SUPPORTING]: 'Supporting',
});

const DOMAIN_TIER_ORDER = Object.freeze({
  [DOMAIN_TIERS.CRITICAL]: 0,
  [DOMAIN_TIERS.CORE]: 1,
  [DOMAIN_TIERS.SUPPORTING]: 2,
});

const DEFAULT_DOMAINS = Object.freeze([
  { id: 'claims', name: 'Claims', tier: DOMAIN_TIERS.CRITICAL },
  { id: 'enrollment', name: 'Enrollment', tier: DOMAIN_TIERS.CRITICAL },
  { id: 'provider', name: 'Provider', tier: DOMAIN_TIERS.CRITICAL },
  { id: 'member', name: 'Member', tier: DOMAIN_TIERS.CORE },
  { id: 'pharmacy', name: 'Pharmacy', tier: DOMAIN_TIERS.CORE },
  { id: 'billing', name: 'Billing', tier: DOMAIN_TIERS.CORE },
  { id: 'reporting', name: 'Reporting', tier: DOMAIN_TIERS.SUPPORTING },
  { id: 'notifications', name: 'Notifications', tier: DOMAIN_TIERS.SUPPORTING },
]);

const DEFAULT_SLA_TARGETS = Object.freeze({
  [DOMAIN_TIERS.CRITICAL]: 99.99,
  [DOMAIN_TIERS.CORE]: 99.95,
  [DOMAIN_TIERS.SUPPORTING]: 99.9,
});

const DEFAULT_SLO_TARGETS = Object.freeze({
  [DOMAIN_TIERS.CRITICAL]: 99.95,
  [DOMAIN_TIERS.CORE]: 99.9,
  [DOMAIN_TIERS.SUPPORTING]: 99.5,
});

const DEFAULT_ERROR_BUDGET_THRESHOLDS = Object.freeze({
  WARNING: 25,
  CRITICAL: 10,
});

const DEFAULT_METRIC_THRESHOLDS = Object.freeze({
  availability: { warning: 99.9, critical: 99.5 },
  latency_p95: { warning: 500, critical: 1000 },
  latency_p99: { warning: 1000, critical: 2000 },
  traffic_rps: { warning: null, critical: null },
  errors_5xx: { warning: 10, critical: 50 },
  errors_functional: { warning: 20, critical: 100 },
  saturation_cpu: { warning: 70, critical: 90 },
  saturation_mem: { warning: 75, critical: 90 },
  saturation_queue: { warning: 60, critical: 85 },
  error_budget: { warning: 25, critical: 10 },
});

const ENVIRONMENTS = Object.freeze({
  PRODUCTION: 'Production',
  STAGING: 'Staging',
  QA: 'QA',
  DEVELOPMENT: 'Development',
});

const ENVIRONMENT_OPTIONS = Object.freeze(
  Object.entries(ENVIRONMENTS).map(([key, label]) => ({
    value: key,
    label,
  })),
);

const TIME_RANGES = Object.freeze({
  LAST_1H: { key: 'LAST_1H', label: 'Last 1 Hour', hours: 1 },
  LAST_6H: { key: 'LAST_6H', label: 'Last 6 Hours', hours: 6 },
  LAST_24H: { key: 'LAST_24H', label: 'Last 24 Hours', hours: 24 },
  LAST_7D: { key: 'LAST_7D', label: 'Last 7 Days', hours: 168 },
  LAST_30D: { key: 'LAST_30D', label: 'Last 30 Days', hours: 720 },
  LAST_90D: { key: 'LAST_90D', label: 'Last 90 Days', hours: 2160 },
});

const METRIC_UNITS = Object.freeze({
  MILLISECONDS: 'ms',
  PERCENTAGE: '%',
  COUNT: 'count',
  REQUESTS_PER_SECOND: 'rps',
  SECONDS: 's',
  MINUTES: 'min',
  HOURS: 'hr',
});

const SERVICE_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
  UNKNOWN: 'unknown',
  MAINTENANCE: 'maintenance',
});

const SERVICE_STATUS_LABELS = Object.freeze({
  [SERVICE_STATUS.HEALTHY]: 'Healthy',
  [SERVICE_STATUS.DEGRADED]: 'Degraded',
  [SERVICE_STATUS.DOWN]: 'Down',
  [SERVICE_STATUS.UNKNOWN]: 'Unknown',
  [SERVICE_STATUS.MAINTENANCE]: 'Maintenance',
});

const SERVICE_STATUS_COLORS = Object.freeze({
  [SERVICE_STATUS.HEALTHY]: '#16a34a',
  [SERVICE_STATUS.DEGRADED]: '#ca8a04',
  [SERVICE_STATUS.DOWN]: '#dc2626',
  [SERVICE_STATUS.UNKNOWN]: '#6b7280',
  [SERVICE_STATUS.MAINTENANCE]: '#7c3aed',
});

/**
 * Get the default SLA target for a given domain tier.
 * @param {string} tier - The domain tier.
 * @returns {number} The default SLA target percentage.
 */
const getDefaultSLATarget = (tier) => {
  return DEFAULT_SLA_TARGETS[tier] ?? DEFAULT_SLA_TARGETS[DOMAIN_TIERS.SUPPORTING];
};

/**
 * Get the default SLO target for a given domain tier.
 * @param {string} tier - The domain tier.
 * @returns {number} The default SLO target percentage.
 */
const getDefaultSLOTarget = (tier) => {
  return DEFAULT_SLO_TARGETS[tier] ?? DEFAULT_SLO_TARGETS[DOMAIN_TIERS.SUPPORTING];
};

/**
 * Get threshold values for a specific metric.
 * @param {string} metricKey - The metric key (e.g., 'latency_p95', 'saturation_cpu').
 * @returns {{ warning: number|null, critical: number|null }} The threshold values.
 */
const getMetricThreshold = (metricKey) => {
  return DEFAULT_METRIC_THRESHOLDS[metricKey] ?? { warning: null, critical: null };
};

/**
 * Determine the service status based on availability and thresholds.
 * @param {number} availability - The current availability percentage.
 * @param {{ warning: number, critical: number }} thresholds - The threshold config.
 * @returns {string} The service status key.
 */
const getServiceStatusFromAvailability = (availability, thresholds) => {
  if (availability == null || isNaN(availability)) {
    return SERVICE_STATUS.UNKNOWN;
  }

  const { warning, critical } = thresholds || DEFAULT_METRIC_THRESHOLDS.availability;

  if (availability < critical) {
    return SERVICE_STATUS.DOWN;
  }
  if (availability < warning) {
    return SERVICE_STATUS.DEGRADED;
  }
  return SERVICE_STATUS.HEALTHY;
};

/**
 * Get all golden signal metric keys as a flat array.
 * @returns {string[]} Array of metric key strings.
 */
const getAllGoldenSignalMetricKeys = () => {
  return Object.values(GOLDEN_SIGNAL_METRICS)
    .flat()
    .map((metric) => metric.key);
};

export {
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_LABELS,
  GOLDEN_SIGNAL_METRICS,
  SEVERITY_LEVELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
  RCA_CATEGORIES,
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_COLORS,
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_DOMAINS,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  DEFAULT_METRIC_THRESHOLDS,
  ENVIRONMENTS,
  ENVIRONMENT_OPTIONS,
  TIME_RANGES,
  METRIC_UNITS,
  SERVICE_STATUS,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_COLORS,
  getDefaultSLATarget,
  getDefaultSLOTarget,
  getMetricThreshold,
  getServiceStatusFromAvailability,
  getAllGoldenSignalMetricKeys,
};