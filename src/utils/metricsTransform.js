import {
  DOMAIN_TIERS,
  GOLDEN_SIGNAL_METRICS,
  getDefaultSLATarget,
  getDefaultSLOTarget,
  getServiceStatusFromAvailability,
  SERVICE_STATUS,
} from '../constants/metrics';

const METRIC_TO_SIGNAL_TYPE = Object.freeze(
  Object.entries(GOLDEN_SIGNAL_METRICS).reduce((result, [signalType, metrics]) => {
    for (const metric of metrics) {
      result[metric.key] = signalType;
    }

    return result;
  }, {}),
);

const SIGNAL_FIELDS = Object.freeze(Object.keys(METRIC_TO_SIGNAL_TYPE));

const parseNumericValue = (value) => {
  if (value == null || value === '') {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseTimestampMs = (timestamp) => {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const shouldUpdateSnapshot = (service, rowTimestampMs, rowIndex) => {
  const currentTimestampMs = service._latestTimestampMs;
  const currentRowIndex = service._latestRowIndex;

  if (rowTimestampMs != null) {
    if (currentTimestampMs == null) {
      return true;
    }

    return rowTimestampMs >= currentTimestampMs;
  }

  if (currentTimestampMs != null) {
    return false;
  }

  return rowIndex >= currentRowIndex;
};

const ensureTimeSeriesContainer = (timeSeriesByService, serviceId, signalType, metricKey) => {
  if (!timeSeriesByService[serviceId]) {
    timeSeriesByService[serviceId] = {};
  }

  if (!timeSeriesByService[serviceId][signalType]) {
    timeSeriesByService[serviceId][signalType] = {};
  }

  if (!timeSeriesByService[serviceId][signalType][metricKey]) {
    timeSeriesByService[serviceId][signalType][metricKey] = [];
  }

  return timeSeriesByService[serviceId][signalType][metricKey];
};

const finalizeGoldenSignalTimeSeries = (timeSeriesByService) => {
  return Object.entries(timeSeriesByService).reduce((serviceResult, [serviceId, serviceSignals]) => {
    const finalizedSignals = Object.entries(serviceSignals || {}).reduce(
      (signalResult, [signalType, metricSeries]) => {
        const finalizedMetrics = Object.entries(metricSeries || {}).reduce(
          (metricResult, [metricKey, points]) => {
            if (!Array.isArray(points) || points.length === 0) {
              return metricResult;
            }

            const sortedPoints = [...points].sort((a, b) => {
              const left = parseTimestampMs(a.timestamp) ?? Number.NEGATIVE_INFINITY;
              const right = parseTimestampMs(b.timestamp) ?? Number.NEGATIVE_INFINITY;
              return left - right;
            });

            const dedupedPoints = [];

            for (const point of sortedPoints) {
              const previousPoint = dedupedPoints[dedupedPoints.length - 1];

              if (previousPoint && previousPoint.timestamp === point.timestamp) {
                dedupedPoints[dedupedPoints.length - 1] = point;
              } else {
                dedupedPoints.push(point);
              }
            }

            if (dedupedPoints.length > 0) {
              metricResult[metricKey] = dedupedPoints;
            }

            return metricResult;
          },
          {},
        );

        if (Object.keys(finalizedMetrics).length > 0) {
          signalResult[signalType] = finalizedMetrics;
        }

        return signalResult;
      },
      {},
    );

    if (Object.keys(finalizedSignals).length > 0) {
      serviceResult[serviceId] = finalizedSignals;
    }

    return serviceResult;
  }, {});
};

const transformMetricsRowsToDashboardData = (rows = []) => {
  const domainMap = new Map();
  const timeSeriesByService = {};

  rows.forEach((row, rowIndex) => {
    if (!row?.domain_id || !row?.service_id) {
      return;
    }

    const domainId = String(row.domain_id).trim();
    const serviceId = String(row.service_id).trim();

    if (!domainId || !serviceId) {
      return;
    }

    if (!domainMap.has(domainId)) {
      domainMap.set(domainId, {
        domain_id: domainId,
        name: row.domain_name ? String(row.domain_name).trim() : domainId,
        tier: row.tier ? String(row.tier).trim() : DOMAIN_TIERS.SUPPORTING,
        services: new Map(),
      });
    }

    const domain = domainMap.get(domainId);

    if (row.domain_name) {
      domain.name = String(row.domain_name).trim() || domain.name;
    }

    if (row.tier) {
      domain.tier = String(row.tier).trim() || domain.tier;
    }

    if (!domain.services.has(serviceId)) {
      domain.services.set(serviceId, {
        service_id: serviceId,
        name: row.service_name ? String(row.service_name).trim() : serviceId,
        availability: 0,
        sla: getDefaultSLATarget(domain.tier),
        slo: getDefaultSLOTarget(domain.tier),
        error_budget: 100,
        status: SERVICE_STATUS.UNKNOWN,
        golden_signals: {},
        dependencies: [],
        _latestTimestampMs: null,
        _latestRowIndex: -1,
      });
    }

    const service = domain.services.get(serviceId);
    const rowTimestampMs = parseTimestampMs(row.timestamp);

    if (shouldUpdateSnapshot(service, rowTimestampMs, rowIndex)) {
      service._latestTimestampMs = rowTimestampMs;
      service._latestRowIndex = rowIndex;

      if (row.service_name) {
        service.name = String(row.service_name).trim() || service.name;
      }

      const availability = parseNumericValue(row.availability);

      if (availability != null) {
        service.availability = parseFloat(availability.toFixed(2));
        service.status = getServiceStatusFromAvailability(service.availability);
      }

      const sla = parseNumericValue(row.sla);
      if (sla != null) {
        service.sla = parseFloat(sla.toFixed(2));
      }

      const slo = parseNumericValue(row.slo);
      if (slo != null) {
        service.slo = parseFloat(slo.toFixed(2));
      }

      const errorBudget = parseNumericValue(row.error_budget);
      if (errorBudget != null) {
        service.error_budget = parseFloat(errorBudget.toFixed(2));
      }

      for (const field of SIGNAL_FIELDS) {
        const numericValue = parseNumericValue(row[field]);

        if (numericValue != null) {
          service.golden_signals[field] = parseFloat(numericValue.toFixed(2));
        }
      }
    }

    if (rowTimestampMs == null) {
      return;
    }

    for (const field of SIGNAL_FIELDS) {
      const numericValue = parseNumericValue(row[field]);

      if (numericValue == null) {
        continue;
      }

      const signalType = METRIC_TO_SIGNAL_TYPE[field];
      const series = ensureTimeSeriesContainer(timeSeriesByService, serviceId, signalType, field);

      series.push({
        timestamp: row.timestamp,
        value: parseFloat(numericValue.toFixed(2)),
      });
    }
  });

  const domains = Array.from(domainMap.values()).map((domain) => ({
    ...domain,
    services: Array.from(domain.services.values()).map(
      ({ _latestTimestampMs, _latestRowIndex, ...service }) => service,
    ),
  }));

  return {
    domains,
    golden_signal_time_series: finalizeGoldenSignalTimeSeries(timeSeriesByService),
  };
};

export { transformMetricsRowsToDashboardData };
