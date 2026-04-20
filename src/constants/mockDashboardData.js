import {
  GOLDEN_SIGNALS,
  SEVERITY_LEVELS,
  RCA_CATEGORIES,
  DOMAIN_TIERS,
  DEFAULT_DOMAINS,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  DEFAULT_METRIC_THRESHOLDS,
  SERVICE_STATUS,
} from './metrics';

// ─── Helper: generate ISO timestamps relative to now ───────────────────────
const now = new Date();
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d) => hoursAgo(d * 24);

// ─── Services by Domain ────────────────────────────────────────────────────

const MOCK_SERVICES = Object.freeze({
  'corporate-functions': [
    {
      service_id: 'svc-member-portal',
      name: 'Member Portal',
      availability: 99.97,
      sla: 99.99,
      slo: 99.95,
      error_budget: 72.50,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 142.30,
        latency_p99: 287.60,
        traffic_rps: 1245.00,
        errors_5xx: 3,
        errors_functional: 12,
        saturation_cpu: 42.18,
        saturation_mem: 58.34,
        saturation_queue: 18.90,
      },
      dependencies: ['svc-care-radius', 'svc-ecm', 'svc-corporate-website'],
    },
    {
      service_id: 'svc-care-radius',
      name: 'Care Radius',
      availability: 99.94,
      sla: 99.99,
      slo: 99.95,
      error_budget: 48.30,
      status: SERVICE_STATUS.DEGRADED,
      golden_signals: {
        latency_p95: 520.70,
        latency_p99: 1120.40,
        traffic_rps: 890.00,
        errors_5xx: 14,
        errors_functional: 38,
        saturation_cpu: 72.45,
        saturation_mem: 68.90,
        saturation_queue: 55.20,
      },
      dependencies: ['svc-member-portal', 'svc-ivr'],
    },
  ],
  'horizontal-shared-platforms': [
    {
      service_id: 'svc-api',
      name: 'API',
      availability: 99.98,
      sla: 99.99,
      slo: 99.95,
      error_budget: 82.10,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 98.50,
        latency_p99: 195.30,
        traffic_rps: 620.00,
        errors_5xx: 1,
        errors_functional: 5,
        saturation_cpu: 28.70,
        saturation_mem: 45.60,
        saturation_queue: 8.30,
      },
      dependencies: ['svc-nms', 'svc-ecm'],
    },
    {
      service_id: 'svc-nms',
      name: 'NMS',
      availability: 99.99,
      sla: 99.99,
      slo: 99.95,
      error_budget: 97.40,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 5.20,
        latency_p99: 14.80,
        traffic_rps: 1580.00,
        errors_5xx: 0,
        errors_functional: 0,
        saturation_cpu: 22.10,
        saturation_mem: 52.30,
        saturation_queue: 5.10,
      },
      dependencies: [],
    },
  ],
  'health-and-network': [
    {
      service_id: 'svc-corporate-website',
      name: 'Corporate Website',
      availability: 99.96,
      sla: 99.99,
      slo: 99.95,
      error_budget: 65.80,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 175.40,
        latency_p99: 340.20,
        traffic_rps: 980.00,
        errors_5xx: 5,
        errors_functional: 18,
        saturation_cpu: 48.30,
        saturation_mem: 55.70,
        saturation_queue: 22.60,
      },
      dependencies: ['svc-cpl'],
    },
    {
      service_id: 'svc-cpl',
      name: 'CPL',
      availability: 99.99,
      sla: 99.99,
      slo: 99.95,
      error_budget: 94.60,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 6.80,
        latency_p99: 18.40,
        traffic_rps: 2100.00,
        errors_5xx: 0,
        errors_functional: 2,
        saturation_cpu: 30.20,
        saturation_mem: 62.40,
        saturation_queue: 9.80,
      },
      dependencies: [],
    },
  ],
  'data-analytics': [
    {
      service_id: 'svc-ecm',
      name: 'ECM',
      availability: 99.95,
      sla: 99.95,
      slo: 99.90,
      error_budget: 55.40,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 210.60,
        latency_p99: 420.80,
        traffic_rps: 1560.00,
        errors_5xx: 8,
        errors_functional: 22,
        saturation_cpu: 55.80,
        saturation_mem: 63.20,
        saturation_queue: 30.10,
      },
      dependencies: ['svc-cdm'],
    },
    {
      service_id: 'svc-cdm',
      name: 'CDM',
      availability: 99.99,
      sla: 99.95,
      slo: 99.90,
      error_budget: 96.80,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 7.10,
        latency_p99: 19.60,
        traffic_rps: 4200.00,
        errors_5xx: 0,
        errors_functional: 0,
        saturation_cpu: 40.50,
        saturation_mem: 74.80,
        saturation_queue: 14.20,
      },
      dependencies: [],
    },
  ],
  'horizontal-integration': [
    {
      service_id: 'svc-cs',
      name: 'CS',
      availability: 99.92,
      sla: 99.95,
      slo: 99.90,
      error_budget: 38.20,
      status: SERVICE_STATUS.DEGRADED,
      golden_signals: {
        latency_p95: 380.90,
        latency_p99: 780.50,
        traffic_rps: 540.00,
        errors_5xx: 18,
        errors_functional: 42,
        saturation_cpu: 68.40,
        saturation_mem: 72.10,
        saturation_queue: 48.70,
      },
      dependencies: ['svc-dgs', 'svc-member-portal'],
    },
    {
      service_id: 'svc-dgs',
      name: 'DGS',
      availability: 99.98,
      sla: 99.95,
      slo: 99.90,
      error_budget: 88.50,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 9.30,
        latency_p99: 24.70,
        traffic_rps: 1120.00,
        errors_5xx: 0,
        errors_functional: 3,
        saturation_cpu: 26.80,
        saturation_mem: 48.90,
        saturation_queue: 7.60,
      },
      dependencies: [],
    },
  ],
  'market-facing': [
    {
      service_id: 'svc-hdh',
      name: 'HDH',
      availability: 99.96,
      sla: 99.95,
      slo: 99.90,
      error_budget: 70.30,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 165.20,
        latency_p99: 310.40,
        traffic_rps: 720.00,
        errors_5xx: 4,
        errors_functional: 10,
        saturation_cpu: 38.90,
        saturation_mem: 50.20,
        saturation_queue: 15.40,
      },
      dependencies: ['svc-icoe', 'svc-member-portal'],
    },
    {
      service_id: 'svc-icoe',
      name: 'ICOE',
      availability: 99.99,
      sla: 99.95,
      slo: 99.90,
      error_budget: 96.10,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 6.10,
        latency_p99: 16.20,
        traffic_rps: 1840.00,
        errors_5xx: 0,
        errors_functional: 1,
        saturation_cpu: 24.30,
        saturation_mem: 56.70,
        saturation_queue: 6.90,
      },
      dependencies: [],
    },
  ],
  'service-core-admin': [
    {
      service_id: 'svc-odm',
      name: 'ODM',
      availability: 99.88,
      sla: 99.90,
      slo: 99.50,
      error_budget: 24.60,
      status: SERVICE_STATUS.DEGRADED,
      golden_signals: {
        latency_p95: 620.40,
        latency_p99: 1450.80,
        traffic_rps: 280.00,
        errors_5xx: 22,
        errors_functional: 55,
        saturation_cpu: 78.20,
        saturation_mem: 82.40,
        saturation_queue: 62.30,
      },
      dependencies: ['svc-wam', 'svc-member-portal', 'svc-ecm'],
    },
    {
      service_id: 'svc-wam',
      name: 'WAM',
      availability: 99.97,
      sla: 99.90,
      slo: 99.50,
      error_budget: 85.70,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 12.80,
        latency_p99: 35.60,
        traffic_rps: 860.00,
        errors_5xx: 0,
        errors_functional: 4,
        saturation_cpu: 52.10,
        saturation_mem: 68.30,
        saturation_queue: 20.50,
      },
      dependencies: [],
    },
  ],
  'enrollment-billing': [
    {
      service_id: 'svc-ivr',
      name: 'IVR',
      availability: 99.93,
      sla: 99.90,
      slo: 99.50,
      error_budget: 42.80,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 88.60,
        latency_p99: 175.20,
        traffic_rps: 1820.00,
        errors_5xx: 6,
        errors_functional: 15,
        saturation_cpu: 34.50,
        saturation_mem: 42.80,
        saturation_queue: 38.90,
      },
      dependencies: ['svc-ecm'],
    },
  ],
  speciality: [
    {
      service_id: 'svc-salesforce-bpp',
      name: 'Salesforce BPP',
      availability: 99.91,
      sla: 99.90,
      slo: 99.50,
      error_budget: 35.40,
      status: SERVICE_STATUS.HEALTHY,
      golden_signals: {
        latency_p95: 145.20,
        latency_p99: 290.40,
        traffic_rps: 480.00,
        errors_5xx: 7,
        errors_functional: 19,
        saturation_cpu: 44.60,
        saturation_mem: 58.90,
        saturation_queue: 25.30,
      },
      dependencies: ['svc-member-portal'],
    },
  ],
});

// ─── Assembled Domain Data ─────────────────────────────────────────────────

const MOCK_DOMAINS = Object.freeze(
  DEFAULT_DOMAINS.map((domain) => ({
    domain_id: domain.id,
    name: domain.name,
    tier: domain.tier,
    services: MOCK_SERVICES[domain.id] ?? [],
  })),
);

// ─── Incidents ─────────────────────────────────────────────────────────────

const MOCK_INCIDENTS = Object.freeze([
  {
    incident_id: 'inc-20240901-001',
    service_id: 'svc-care-radius',
    domain_id: 'corporate-functions',
    severity: SEVERITY_LEVELS.P1,
    root_cause: RCA_CATEGORIES.CODE,
    title: 'Care Radius OOM crash during batch processing',
    description: 'Memory leak in batch processing caused OOM kill, resulting in 45-minute outage.',
    start_time: daysAgo(2),
    end_time: hoursAgo(45),
    mttr: 45.00,
    mttd: 8.00,
    mtbf: 720.00,
    status: 'resolved',
    evidence_links: [
      'https://confluence.example.com/are/inc-20240901-001',
      'https://jira.example.com/browse/INC-4521',
    ],
  },
  {
    incident_id: 'inc-20240828-002',
    service_id: 'svc-cs',
    domain_id: 'horizontal-integration',
    severity: SEVERITY_LEVELS.P2,
    root_cause: RCA_CATEGORIES.INFRA,
    title: 'CS latency spike due to network partition',
    description: 'Network partition between AZ-1 and AZ-2 caused elevated latency and intermittent 5xx errors.',
    start_time: daysAgo(5),
    end_time: daysAgo(4.9),
    mttr: 32.00,
    mttd: 5.00,
    mtbf: 480.00,
    status: 'resolved',
    evidence_links: [
      'https://confluence.example.com/are/inc-20240828-002',
    ],
  },
  {
    incident_id: 'inc-20240825-003',
    service_id: 'svc-odm',
    domain_id: 'service-core-admin',
    severity: SEVERITY_LEVELS.P2,
    root_cause: RCA_CATEGORIES.DATA,
    title: 'ODM returning stale data after ETL failure',
    description: 'ETL pipeline failure caused database to serve data 12 hours stale.',
    start_time: daysAgo(8),
    end_time: daysAgo(7.8),
    mttr: 58.00,
    mttd: 120.00,
    mtbf: 360.00,
    status: 'resolved',
    evidence_links: [
      'https://confluence.example.com/are/inc-20240825-003',
      'https://jira.example.com/browse/INC-4498',
    ],
  },
  {
    incident_id: 'inc-20240820-004',
    service_id: 'svc-ecm',
    domain_id: 'data-analytics',
    severity: SEVERITY_LEVELS.P3,
    root_cause: RCA_CATEGORIES.CONFIG,
    title: 'ECM rate limiting misconfiguration',
    description: 'Rate limiter threshold was set too low after config change, causing legitimate requests to be throttled.',
    start_time: daysAgo(13),
    end_time: daysAgo(12.9),
    mttr: 18.00,
    mttd: 12.00,
    mtbf: 1200.00,
    status: 'resolved',
    evidence_links: [
      'https://jira.example.com/browse/INC-4472',
    ],
  },
  {
    incident_id: 'inc-20240815-005',
    service_id: 'svc-api',
    domain_id: 'horizontal-shared-platforms',
    severity: SEVERITY_LEVELS.P1,
    root_cause: RCA_CATEGORIES.INFRA,
    title: 'API complete outage due to certificate expiry',
    description: 'TLS certificate expired on load balancer, causing complete service unavailability for 22 minutes.',
    start_time: daysAgo(18),
    end_time: daysAgo(17.98),
    mttr: 22.00,
    mttd: 3.00,
    mtbf: 2160.00,
    status: 'resolved',
    evidence_links: [
      'https://confluence.example.com/are/inc-20240815-005',
      'https://jira.example.com/browse/INC-4450',
    ],
  },
  {
    incident_id: 'inc-20240810-006',
    service_id: 'svc-hdh',
    domain_id: 'market-facing',
    severity: SEVERITY_LEVELS.P3,
    root_cause: RCA_CATEGORIES.CODE,
    title: 'HDH intermittent 500 errors on report generation',
    description: 'Null pointer exception in template rendering for edge-case records.',
    start_time: daysAgo(23),
    end_time: daysAgo(22.9),
    mttr: 25.00,
    mttd: 45.00,
    mtbf: 960.00,
    status: 'resolved',
    evidence_links: [
      'https://jira.example.com/browse/INC-4430',
    ],
  },
  {
    incident_id: 'inc-20240805-007',
    service_id: 'svc-member-portal',
    domain_id: 'corporate-functions',
    severity: SEVERITY_LEVELS.P2,
    root_cause: RCA_CATEGORIES.INFRA,
    title: 'Member Portal degraded performance during DB failover',
    description: 'Planned DB failover took longer than expected, causing 15 minutes of elevated latency.',
    start_time: daysAgo(28),
    end_time: daysAgo(27.99),
    mttr: 15.00,
    mttd: 2.00,
    mtbf: 1440.00,
    status: 'resolved',
    evidence_links: [
      'https://confluence.example.com/are/inc-20240805-007',
    ],
  },
  {
    incident_id: 'inc-20240801-008',
    service_id: 'svc-ivr',
    domain_id: 'enrollment-billing',
    severity: SEVERITY_LEVELS.P4,
    root_cause: RCA_CATEGORIES.CONFIG,
    title: 'IVR delayed due to queue consumer scaling issue',
    description: 'Auto-scaling policy for queue consumers was not triggered, causing processing delays.',
    start_time: daysAgo(32),
    end_time: daysAgo(31.9),
    mttr: 40.00,
    mttd: 60.00,
    mtbf: 720.00,
    status: 'resolved',
    evidence_links: [],
  },
  {
    incident_id: 'inc-20240912-009',
    service_id: 'svc-odm',
    domain_id: 'service-core-admin',
    severity: SEVERITY_LEVELS.P3,
    root_cause: RCA_CATEGORIES.CODE,
    title: 'ODM timeout on large dataset queries',
    description: 'Unoptimized SQL query caused timeouts when generating reports for domains with >10k records.',
    start_time: hoursAgo(6),
    end_time: hoursAgo(4),
    mttr: 120.00,
    mttd: 30.00,
    mtbf: 240.00,
    status: 'resolved',
    evidence_links: [
      'https://jira.example.com/browse/INC-4560',
    ],
  },
  {
    incident_id: 'inc-20240912-010',
    service_id: 'svc-cs',
    domain_id: 'horizontal-integration',
    severity: SEVERITY_LEVELS.P2,
    root_cause: RCA_CATEGORIES.DATA,
    title: 'CS returning incorrect configuration data',
    description: 'Stale cache serving outdated configuration after upstream data refresh. Impacted downstream lookups.',
    start_time: hoursAgo(18),
    end_time: hoursAgo(14),
    mttr: 240.00,
    mttd: 90.00,
    mtbf: 336.00,
    status: 'resolved',
    evidence_links: [
      'https://confluence.example.com/are/inc-20240912-010',
      'https://jira.example.com/browse/INC-4558',
    ],
  },
]);

// ─── Golden Signal Time Series (last 24 hours, hourly) ────────────────────

const generateTimeSeries = (baseValue, variance, points, unit) => {
  const series = [];
  for (let i = points - 1; i >= 0; i--) {
    const jitter = (Math.sin(i * 0.7) + Math.cos(i * 1.3)) * variance;
    const value = parseFloat((baseValue + jitter).toFixed(2));
    series.push({
      timestamp: hoursAgo(i),
      value: unit === '%' ? Math.min(100.00, Math.max(0.00, value)) : Math.max(0.00, value),
    });
  }
  return series;
};

const MOCK_GOLDEN_SIGNAL_TIME_SERIES = Object.freeze({
  'svc-member-portal': {
    [GOLDEN_SIGNALS.LATENCY]: {
      latency_p95: generateTimeSeries(142.30, 25.00, 24, 'ms'),
      latency_p99: generateTimeSeries(287.60, 45.00, 24, 'ms'),
    },
    [GOLDEN_SIGNALS.TRAFFIC]: {
      traffic_rps: generateTimeSeries(1245.00, 180.00, 24, 'rps'),
    },
    [GOLDEN_SIGNALS.ERRORS]: {
      errors_5xx: generateTimeSeries(3.00, 2.50, 24, 'count'),
      errors_functional: generateTimeSeries(12.00, 6.00, 24, 'count'),
    },
    [GOLDEN_SIGNALS.SATURATION]: {
      saturation_cpu: generateTimeSeries(42.18, 8.00, 24, '%'),
      saturation_mem: generateTimeSeries(58.34, 5.00, 24, '%'),
      saturation_queue: generateTimeSeries(18.90, 7.00, 24, '%'),
    },
  },
  'svc-care-radius': {
    [GOLDEN_SIGNALS.LATENCY]: {
      latency_p95: generateTimeSeries(520.70, 80.00, 24, 'ms'),
      latency_p99: generateTimeSeries(1120.40, 150.00, 24, 'ms'),
    },
    [GOLDEN_SIGNALS.TRAFFIC]: {
      traffic_rps: generateTimeSeries(890.00, 120.00, 24, 'rps'),
    },
    [GOLDEN_SIGNALS.ERRORS]: {
      errors_5xx: generateTimeSeries(14.00, 8.00, 24, 'count'),
      errors_functional: generateTimeSeries(38.00, 12.00, 24, 'count'),
    },
    [GOLDEN_SIGNALS.SATURATION]: {
      saturation_cpu: generateTimeSeries(72.45, 10.00, 24, '%'),
      saturation_mem: generateTimeSeries(68.90, 6.00, 24, '%'),
      saturation_queue: generateTimeSeries(55.20, 12.00, 24, '%'),
    },
  },
  'svc-cs': {
    [GOLDEN_SIGNALS.LATENCY]: {
      latency_p95: generateTimeSeries(380.90, 60.00, 24, 'ms'),
      latency_p99: generateTimeSeries(780.50, 100.00, 24, 'ms'),
    },
    [GOLDEN_SIGNALS.TRAFFIC]: {
      traffic_rps: generateTimeSeries(540.00, 80.00, 24, 'rps'),
    },
    [GOLDEN_SIGNALS.ERRORS]: {
      errors_5xx: generateTimeSeries(18.00, 10.00, 24, 'count'),
      errors_functional: generateTimeSeries(42.00, 15.00, 24, 'count'),
    },
    [GOLDEN_SIGNALS.SATURATION]: {
      saturation_cpu: generateTimeSeries(68.40, 9.00, 24, '%'),
      saturation_mem: generateTimeSeries(72.10, 5.00, 24, '%'),
      saturation_queue: generateTimeSeries(48.70, 10.00, 24, '%'),
    },
  },
  'svc-odm': {
    [GOLDEN_SIGNALS.LATENCY]: {
      latency_p95: generateTimeSeries(620.40, 90.00, 24, 'ms'),
      latency_p99: generateTimeSeries(1450.80, 200.00, 24, 'ms'),
    },
    [GOLDEN_SIGNALS.TRAFFIC]: {
      traffic_rps: generateTimeSeries(280.00, 50.00, 24, 'rps'),
    },
    [GOLDEN_SIGNALS.ERRORS]: {
      errors_5xx: generateTimeSeries(22.00, 12.00, 24, 'count'),
      errors_functional: generateTimeSeries(55.00, 18.00, 24, 'count'),
    },
    [GOLDEN_SIGNALS.SATURATION]: {
      saturation_cpu: generateTimeSeries(78.20, 8.00, 24, '%'),
      saturation_mem: generateTimeSeries(82.40, 4.00, 24, '%'),
      saturation_queue: generateTimeSeries(62.30, 10.00, 24, '%'),
    },
  },
  'svc-ecm': {
    [GOLDEN_SIGNALS.LATENCY]: {
      latency_p95: generateTimeSeries(210.60, 35.00, 24, 'ms'),
      latency_p99: generateTimeSeries(420.80, 55.00, 24, 'ms'),
    },
    [GOLDEN_SIGNALS.TRAFFIC]: {
      traffic_rps: generateTimeSeries(1560.00, 200.00, 24, 'rps'),
    },
    [GOLDEN_SIGNALS.ERRORS]: {
      errors_5xx: generateTimeSeries(8.00, 4.00, 24, 'count'),
      errors_functional: generateTimeSeries(22.00, 8.00, 24, 'count'),
    },
    [GOLDEN_SIGNALS.SATURATION]: {
      saturation_cpu: generateTimeSeries(55.80, 10.00, 24, '%'),
      saturation_mem: generateTimeSeries(63.20, 5.00, 24, '%'),
      saturation_queue: generateTimeSeries(30.10, 8.00, 24, '%'),
    },
  },
});

// ─── Service Dependency Graph ──────────────────────────────────────────────

const MOCK_DEPENDENCY_NODES = Object.freeze([
  { id: 'svc-member-portal', label: 'Member Portal', domain: 'corporate-functions', tier: DOMAIN_TIERS.CRITICAL, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-care-radius', label: 'Care Radius', domain: 'corporate-functions', tier: DOMAIN_TIERS.CRITICAL, status: SERVICE_STATUS.DEGRADED },
  { id: 'svc-api', label: 'API', domain: 'horizontal-shared-platforms', tier: DOMAIN_TIERS.CRITICAL, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-nms', label: 'NMS', domain: 'horizontal-shared-platforms', tier: DOMAIN_TIERS.CRITICAL, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-corporate-website', label: 'Corporate Website', domain: 'health-and-network', tier: DOMAIN_TIERS.CRITICAL, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-cpl', label: 'CPL', domain: 'health-and-network', tier: DOMAIN_TIERS.CRITICAL, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-ecm', label: 'ECM', domain: 'data-analytics', tier: DOMAIN_TIERS.CORE, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-cdm', label: 'CDM', domain: 'data-analytics', tier: DOMAIN_TIERS.CORE, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-cs', label: 'CS', domain: 'horizontal-integration', tier: DOMAIN_TIERS.CORE, status: SERVICE_STATUS.DEGRADED },
  { id: 'svc-dgs', label: 'DGS', domain: 'horizontal-integration', tier: DOMAIN_TIERS.CORE, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-hdh', label: 'HDH', domain: 'market-facing', tier: DOMAIN_TIERS.CORE, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-icoe', label: 'ICOE', domain: 'market-facing', tier: DOMAIN_TIERS.CORE, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-odm', label: 'ODM', domain: 'service-core-admin', tier: DOMAIN_TIERS.SUPPORTING, status: SERVICE_STATUS.DEGRADED },
  { id: 'svc-wam', label: 'WAM', domain: 'service-core-admin', tier: DOMAIN_TIERS.SUPPORTING, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-ivr', label: 'IVR', domain: 'enrollment-billing', tier: DOMAIN_TIERS.SUPPORTING, status: SERVICE_STATUS.HEALTHY },
  { id: 'svc-salesforce-bpp', label: 'Salesforce BPP', domain: 'speciality', tier: DOMAIN_TIERS.SUPPORTING, status: SERVICE_STATUS.HEALTHY },
]);

const MOCK_DEPENDENCY_EDGES = Object.freeze([
  { source: 'svc-member-portal', target: 'svc-care-radius', type: 'api' },
  { source: 'svc-member-portal', target: 'svc-ecm', type: 'api' },
  { source: 'svc-member-portal', target: 'svc-corporate-website', type: 'api' },
  { source: 'svc-care-radius', target: 'svc-ivr', type: 'api' },
  { source: 'svc-api', target: 'svc-nms', type: 'api' },
  { source: 'svc-api', target: 'svc-ecm', type: 'api' },
  { source: 'svc-corporate-website', target: 'svc-cpl', type: 'api' },
  { source: 'svc-ecm', target: 'svc-cdm', type: 'database' },
  { source: 'svc-cs', target: 'svc-dgs', type: 'api' },
  { source: 'svc-cs', target: 'svc-member-portal', type: 'api' },
  { source: 'svc-hdh', target: 'svc-icoe', type: 'api' },
  { source: 'svc-hdh', target: 'svc-member-portal', type: 'api' },
  { source: 'svc-odm', target: 'svc-wam', type: 'api' },
  { source: 'svc-odm', target: 'svc-member-portal', type: 'api' },
  { source: 'svc-odm', target: 'svc-ecm', type: 'api' },
  { source: 'svc-ivr', target: 'svc-ecm', type: 'api' },
  { source: 'svc-salesforce-bpp', target: 'svc-member-portal', type: 'api' },
]);

// ─── Deployment Events ─────────────────────────────────────────────────────

const MOCK_DEPLOYMENT_EVENTS = Object.freeze([
  {
    deployment_id: 'dep-001',
    service_id: 'svc-care-radius',
    domain_id: 'corporate-functions',
    version: 'v2.14.3',
    timestamp: daysAgo(2.5),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'hotfix',
    description: 'Memory leak fix in batch processing module',
    rollback: false,
    related_incident_id: 'inc-20240901-001',
  },
  {
    deployment_id: 'dep-002',
    service_id: 'svc-care-radius',
    domain_id: 'corporate-functions',
    version: 'v2.14.2',
    timestamp: daysAgo(3),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'feature',
    description: 'Added batch processing parallelism for Care Radius',
    rollback: false,
    related_incident_id: null,
  },
  {
    deployment_id: 'dep-003',
    service_id: 'svc-cs',
    domain_id: 'horizontal-integration',
    version: 'v1.8.1',
    timestamp: daysAgo(5.5),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'hotfix',
    description: 'Cache invalidation fix for configuration data',
    rollback: false,
    related_incident_id: 'inc-20240912-010',
  },
  {
    deployment_id: 'dep-004',
    service_id: 'svc-api',
    domain_id: 'horizontal-shared-platforms',
    version: 'v3.2.0',
    timestamp: daysAgo(10),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'feature',
    description: 'Platform scaling support with bulk processing',
    rollback: false,
    related_incident_id: null,
  },
  {
    deployment_id: 'dep-005',
    service_id: 'svc-ecm',
    domain_id: 'data-analytics',
    version: 'v4.1.7',
    timestamp: daysAgo(13.5),
    deployer: 'ci-pipeline',
    status: 'rolled_back',
    change_type: 'config',
    description: 'Rate limiter threshold adjustment',
    rollback: true,
    related_incident_id: 'inc-20240820-004',
  },
  {
    deployment_id: 'dep-006',
    service_id: 'svc-odm',
    domain_id: 'service-core-admin',
    version: 'v2.5.4',
    timestamp: hoursAgo(8),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'hotfix',
    description: 'SQL query optimization for large dataset reports',
    rollback: false,
    related_incident_id: 'inc-20240912-009',
  },
  {
    deployment_id: 'dep-007',
    service_id: 'svc-hdh',
    domain_id: 'market-facing',
    version: 'v1.12.0',
    timestamp: daysAgo(15),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'feature',
    description: 'New template engine with improved null handling',
    rollback: false,
    related_incident_id: null,
  },
  {
    deployment_id: 'dep-008',
    service_id: 'svc-ivr',
    domain_id: 'enrollment-billing',
    version: 'v1.4.2',
    timestamp: daysAgo(20),
    deployer: 'ci-pipeline',
    status: 'success',
    change_type: 'config',
    description: 'Auto-scaling policy update for queue consumers',
    rollback: false,
    related_incident_id: 'inc-20240801-008',
  },
]);

// ─── SLA Compliance Records (last 12 months) ──────────────────────────────

const generateMonthlyCompliance = (domainId, tier, baseAvailability) => {
  const records = [];
  const target = DEFAULT_SLA_TARGETS[tier] ?? 99.90;
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = date.toISOString().slice(0, 7);
    const variance = (Math.sin(i * 1.2) + Math.cos(i * 0.8)) * 0.04;
    const availability = parseFloat(Math.min(100.00, baseAvailability + variance).toFixed(2));
    const compliant = availability >= target;
    records.push({
      domain_id: domainId,
      month: monthStr,
      availability,
      sla_target: target,
      compliant,
      breach_minutes: compliant ? 0.00 : parseFloat(((target - availability) * 43800 / 100).toFixed(2)),
    });
  }
  return records;
};

const MOCK_SLA_COMPLIANCE = Object.freeze([
  ...generateMonthlyCompliance('corporate-functions', DOMAIN_TIERS.CRITICAL, 99.97),
  ...generateMonthlyCompliance('horizontal-shared-platforms', DOMAIN_TIERS.CRITICAL, 99.98),
  ...generateMonthlyCompliance('health-and-network', DOMAIN_TIERS.CRITICAL, 99.96),
  ...generateMonthlyCompliance('data-analytics', DOMAIN_TIERS.CORE, 99.95),
  ...generateMonthlyCompliance('horizontal-integration', DOMAIN_TIERS.CORE, 99.92),
  ...generateMonthlyCompliance('market-facing', DOMAIN_TIERS.CORE, 99.96),
  ...generateMonthlyCompliance('service-core-admin', DOMAIN_TIERS.SUPPORTING, 99.88),
  ...generateMonthlyCompliance('enrollment-billing', DOMAIN_TIERS.SUPPORTING, 99.93),
  ...generateMonthlyCompliance('speciality', DOMAIN_TIERS.SUPPORTING, 99.91),
]);

// ─── Metric Thresholds Configuration ──────────────────────────────────────

const MOCK_METRIC_THRESHOLDS = Object.freeze(
  Object.entries(DEFAULT_METRIC_THRESHOLDS).map(([metric, thresholds]) => ({
    metric,
    domain_id: null,
    service_id: null,
    warning: thresholds.warning,
    critical: thresholds.critical,
  })),
);

// ─── Incident Aggregation Summaries ────────────────────────────────────────

const MOCK_INCIDENT_SUMMARY = Object.freeze({
  total_incidents: MOCK_INCIDENTS.length,
  by_severity: {
    [SEVERITY_LEVELS.P1]: MOCK_INCIDENTS.filter((i) => i.severity === SEVERITY_LEVELS.P1).length,
    [SEVERITY_LEVELS.P2]: MOCK_INCIDENTS.filter((i) => i.severity === SEVERITY_LEVELS.P2).length,
    [SEVERITY_LEVELS.P3]: MOCK_INCIDENTS.filter((i) => i.severity === SEVERITY_LEVELS.P3).length,
    [SEVERITY_LEVELS.P4]: MOCK_INCIDENTS.filter((i) => i.severity === SEVERITY_LEVELS.P4).length,
  },
  by_root_cause: {
    [RCA_CATEGORIES.CODE]: MOCK_INCIDENTS.filter((i) => i.root_cause === RCA_CATEGORIES.CODE).length,
    [RCA_CATEGORIES.INFRA]: MOCK_INCIDENTS.filter((i) => i.root_cause === RCA_CATEGORIES.INFRA).length,
    [RCA_CATEGORIES.DATA]: MOCK_INCIDENTS.filter((i) => i.root_cause === RCA_CATEGORIES.DATA).length,
    [RCA_CATEGORIES.CONFIG]: MOCK_INCIDENTS.filter((i) => i.root_cause === RCA_CATEGORIES.CONFIG).length,
  },
  avg_mttr: parseFloat(
    (MOCK_INCIDENTS.reduce((sum, i) => sum + i.mttr, 0) / MOCK_INCIDENTS.length).toFixed(2),
  ),
  avg_mttd: parseFloat(
    (MOCK_INCIDENTS.reduce((sum, i) => sum + i.mttd, 0) / MOCK_INCIDENTS.length).toFixed(2),
  ),
  avg_mtbf: parseFloat(
    (MOCK_INCIDENTS.reduce((sum, i) => sum + i.mtbf, 0) / MOCK_INCIDENTS.length).toFixed(2),
  ),
});

// ─── Change Failure Rate ───────────────────────────────────────────────────

const MOCK_CHANGE_FAILURE_RATE = Object.freeze({
  total_deployments: MOCK_DEPLOYMENT_EVENTS.length,
  failed_deployments: MOCK_DEPLOYMENT_EVENTS.filter((d) => d.rollback).length,
  change_failure_rate: parseFloat(
    (
      (MOCK_DEPLOYMENT_EVENTS.filter((d) => d.rollback).length /
        MOCK_DEPLOYMENT_EVENTS.length) *
      100
    ).toFixed(2),
  ),
  deployments_with_incidents: MOCK_DEPLOYMENT_EVENTS.filter(
    (d) => d.related_incident_id !== null,
  ).length,
});

// ─── Confluence / SOP Links ────────────────────────────────────────────────

const MOCK_CONFLUENCE_LINKS = Object.freeze([
  {
    title: 'SOP: Incident Response Playbook',
    url: 'https://confluence.example.com/are/sop-playbook',
    category: 'SOP',
  },
  {
    title: 'Runbook: Member Portal Recovery',
    url: 'https://confluence.example.com/are/runbook-member-portal',
    category: 'Runbook',
  },
  {
    title: 'Runbook: Database Failover Procedures',
    url: 'https://confluence.example.com/are/runbook-db-failover',
    category: 'Runbook',
  },
  {
    title: 'SOP: Certificate Renewal Process',
    url: 'https://confluence.example.com/are/sop-cert-renewal',
    category: 'SOP',
  },
  {
    title: 'Architecture: Service Dependency Overview',
    url: 'https://confluence.example.com/are/architecture-deps',
    category: 'Architecture',
  },
]);

// ─── Full Dashboard Data (matches localStorage schema) ─────────────────────

const MOCK_DASHBOARD_DATA = Object.freeze({
  schema_version: 1,
  last_updated: now.toISOString(),
  domains: MOCK_DOMAINS,
  incidents: MOCK_INCIDENTS,
  deployment_events: MOCK_DEPLOYMENT_EVENTS,
  sla_compliance: MOCK_SLA_COMPLIANCE,
  golden_signal_time_series: MOCK_GOLDEN_SIGNAL_TIME_SERIES,
  dependency_graph: {
    nodes: MOCK_DEPENDENCY_NODES,
    edges: MOCK_DEPENDENCY_EDGES,
  },
  incident_summary: MOCK_INCIDENT_SUMMARY,
  change_failure_rate: MOCK_CHANGE_FAILURE_RATE,
  config: {
    thresholds: MOCK_METRIC_THRESHOLDS,
    confluence_links: MOCK_CONFLUENCE_LINKS,
  },
});

/**
 * Get all mock services as a flat array across all domains.
 * @returns {Object[]} Array of service objects.
 */
const getAllMockServices = () => {
  return MOCK_DOMAINS.flatMap((domain) =>
    domain.services.map((service) => ({
      ...service,
      domain_id: domain.domain_id,
      domain_name: domain.name,
      domain_tier: domain.tier,
    })),
  );
};

/**
 * Get mock services filtered by domain id.
 * @param {string} domainId - The domain id to filter by.
 * @returns {Object[]} Array of service objects for the domain.
 */
const getMockServicesByDomain = (domainId) => {
  if (!domainId) {
    return [];
  }

  const domain = MOCK_DOMAINS.find((d) => d.domain_id === domainId);
  return domain ? [...domain.services] : [];
};

/**
 * Get a single mock service by its service id.
 * @param {string} serviceId - The service id to look up.
 * @returns {Object|null} The service object or null.
 */
const getMockServiceById = (serviceId) => {
  if (!serviceId) {
    return null;
  }

  for (const domain of MOCK_DOMAINS) {
    const service = domain.services.find((s) => s.service_id === serviceId);
    if (service) {
      return {
        ...service,
        domain_id: domain.domain_id,
        domain_name: domain.name,
        domain_tier: domain.tier,
      };
    }
  }

  return null;
};

/**
 * Get mock incidents filtered by domain id.
 * @param {string} domainId - The domain id to filter by.
 * @returns {Object[]} Array of incident objects.
 */
const getMockIncidentsByDomain = (domainId) => {
  if (!domainId) {
    return [];
  }

  return MOCK_INCIDENTS.filter((i) => i.domain_id === domainId);
};

/**
 * Get mock incidents filtered by severity level.
 * @param {string} severity - The severity level (e.g., 'P1', 'P2').
 * @returns {Object[]} Array of incident objects.
 */
const getMockIncidentsBySeverity = (severity) => {
  if (!severity) {
    return [];
  }

  return MOCK_INCIDENTS.filter((i) => i.severity === severity);
};

/**
 * Get mock SLA compliance records for a specific domain.
 * @param {string} domainId - The domain id to filter by.
 * @returns {Object[]} Array of monthly compliance records.
 */
const getMockSLAComplianceByDomain = (domainId) => {
  if (!domainId) {
    return [];
  }

  return MOCK_SLA_COMPLIANCE.filter((r) => r.domain_id === domainId);
};

/**
 * Get mock deployment events filtered by service id.
 * @param {string} serviceId - The service id to filter by.
 * @returns {Object[]} Array of deployment event objects.
 */
const getMockDeploymentsByService = (serviceId) => {
  if (!serviceId) {
    return [];
  }

  return MOCK_DEPLOYMENT_EVENTS.filter((d) => d.service_id === serviceId);
};

/**
 * Get golden signal time series data for a specific service.
 * @param {string} serviceId - The service id.
 * @returns {Object|null} The golden signal time series object or null.
 */
const getMockGoldenSignalTimeSeries = (serviceId) => {
  if (!serviceId) {
    return null;
  }

  return MOCK_GOLDEN_SIGNAL_TIME_SERIES[serviceId] ?? null;
};

export {
  MOCK_SERVICES,
  MOCK_DOMAINS,
  MOCK_INCIDENTS,
  MOCK_GOLDEN_SIGNAL_TIME_SERIES,
  MOCK_DEPENDENCY_NODES,
  MOCK_DEPENDENCY_EDGES,
  MOCK_DEPLOYMENT_EVENTS,
  MOCK_SLA_COMPLIANCE,
  MOCK_METRIC_THRESHOLDS,
  MOCK_INCIDENT_SUMMARY,
  MOCK_CHANGE_FAILURE_RATE,
  MOCK_CONFLUENCE_LINKS,
  MOCK_DASHBOARD_DATA,
  getAllMockServices,
  getMockServicesByDomain,
  getMockServiceById,
  getMockIncidentsByDomain,
  getMockIncidentsBySeverity,
  getMockSLAComplianceByDomain,
  getMockDeploymentsByService,
  getMockGoldenSignalTimeSeries,
};