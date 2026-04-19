import {
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_METRICS,
  SEVERITY_LEVELS,
  SEVERITY_COLORS,
  SERVICE_STATUS,
  SERVICE_STATUS_COLORS,
  DEFAULT_METRIC_THRESHOLDS,
  DOMAIN_TIERS,
  getMetricThreshold,
} from '../constants/metrics';

import { formatPercentage, formatNumber, formatDuration } from './formatters';
import { parseTimestamp } from './dateUtils';

/**
 * Default color palette for chart series.
 * Designed for accessibility and visual distinction across multiple series.
 */
const DEFAULT_CHART_COLORS = Object.freeze([
  '#6366f1', // indigo-500
  '#ec4899', // pink-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ef4444', // red-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#a855f7', // purple-500
]);

/**
 * Status-based color mapping for chart elements.
 */
const STATUS_CHART_COLORS = Object.freeze({
  healthy: '#16a34a',
  degraded: '#ca8a04',
  down: '#dc2626',
  unknown: '#6b7280',
  maintenance: '#7c3aed',
});

/**
 * Severity-based color mapping for chart elements.
 */
const SEVERITY_CHART_COLORS = Object.freeze({
  P1: '#dc2626',
  P2: '#ea580c',
  P3: '#ca8a04',
  P4: '#2563eb',
});

/**
 * Generate an array of chart colors for a given number of series.
 * Cycles through the default palette if more series than colors are needed.
 * @param {number} count - The number of colors to generate.
 * @param {Object} [options] - Options for color generation.
 * @param {string[]} [options.palette] - Custom color palette to use instead of the default.
 * @param {number} [options.opacity=1] - Opacity value (0-1) to apply. Returns rgba strings when < 1.
 * @returns {string[]} Array of color strings.
 */
const generateChartColors = (count, options = {}) => {
  const { palette = DEFAULT_CHART_COLORS, opacity = 1 } = options;

  if (!count || count <= 0) {
    return [];
  }

  const colors = [];

  for (let i = 0; i < count; i++) {
    const baseColor = palette[i % palette.length];

    if (opacity < 1) {
      const hex = baseColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      colors.push(`rgba(${r}, ${g}, ${b}, ${opacity})`);
    } else {
      colors.push(baseColor);
    }
  }

  return colors;
};

/**
 * Format an axis label based on the metric unit type.
 * Suitable for Recharts tickFormatter props.
 * @param {number|string} value - The axis value to format.
 * @param {string} unit - The unit type (e.g., 'ms', '%', 'count', 'rps', 's', 'min', 'hr').
 * @param {Object} [options] - Formatting options.
 * @param {boolean} [options.compact=false] - Use compact notation for large numbers.
 * @param {number} [options.decimals] - Number of decimal places.
 * @returns {string} Formatted axis label string.
 */
const formatAxisLabel = (value, unit, options = {}) => {
  const { compact = false, decimals } = options;

  if (value == null || isNaN(value)) {
    return '';
  }

  const numValue = parseFloat(value);

  switch (unit) {
    case '%':
      return formatPercentage(numValue, decimals != null ? decimals : 1);

    case 'ms':
      if (compact && Math.abs(numValue) >= 1000) {
        return formatNumber(numValue / 1000, { decimals: decimals != null ? decimals : 1, unit: 's' });
      }
      return formatNumber(numValue, { decimals: decimals != null ? decimals : 0, unit: 'ms' });

    case 's':
      return formatNumber(numValue, { decimals: decimals != null ? decimals : 1, unit: 's' });

    case 'min':
      return formatNumber(numValue, { decimals: decimals != null ? decimals : 1, unit: 'min' });

    case 'hr':
      return formatNumber(numValue, { decimals: decimals != null ? decimals : 1, unit: 'hr' });

    case 'rps':
      return formatNumber(numValue, { decimals: decimals != null ? decimals : 0, compact, unit: 'rps' });

    case 'count':
      return formatNumber(numValue, { decimals: decimals != null ? decimals : 0, compact });

    default:
      return formatNumber(numValue, { decimals, compact });
  }
};

/**
 * Format a timestamp value for chart axis display.
 * Automatically selects an appropriate format based on the time span.
 * @param {string|Date|number} timestamp - The timestamp to format.
 * @param {Object} [options] - Formatting options.
 * @param {number} [options.spanHours] - The total time span of the chart in hours, used to determine format.
 * @returns {string} Formatted time label.
 */
const formatTimeAxisLabel = (timestamp, options = {}) => {
  const { spanHours } = options;

  if (!timestamp) {
    return '';
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (isNaN(date.getTime())) {
    return '';
  }

  // For spans <= 24 hours, show time only (HH:MM)
  if (spanHours != null && spanHours <= 24) {
    return date.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // For spans <= 7 days, show day + time
  if (spanHours != null && spanHours <= 168) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // For spans <= 90 days, show month + day
  if (spanHours != null && spanHours <= 2160) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  // For longer spans, show month + year
  return date.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Trend direction constants.
 */
const TREND_DIRECTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  STABLE: 'stable',
});

/**
 * Calculate the trend direction from a time series of numeric values.
 * Compares the average of the recent window against the average of the earlier window.
 * @param {number[]} values - Array of numeric values in chronological order.
 * @param {Object} [options] - Options for trend calculation.
 * @param {number} [options.threshold=5] - Percentage change threshold to consider a trend as up or down.
 * @param {number} [options.windowSize] - Number of recent points to compare against earlier points. Defaults to half the array length.
 * @returns {{ direction: string, changePercent: number, recentAvg: number, previousAvg: number }}
 *   Trend result with direction ('up', 'down', 'stable'), percentage change, and averages.
 */
const calculateTrendDirection = (values, options = {}) => {
  const { threshold = 5 } = options;

  const defaultResult = {
    direction: TREND_DIRECTION.STABLE,
    changePercent: 0,
    recentAvg: 0,
    previousAvg: 0,
  };

  if (!values || !Array.isArray(values) || values.length < 2) {
    return defaultResult;
  }

  // Filter out non-numeric values
  const numericValues = values.filter((v) => v != null && !isNaN(v)).map(Number);

  if (numericValues.length < 2) {
    return defaultResult;
  }

  const windowSize = options.windowSize != null
    ? Math.min(options.windowSize, Math.floor(numericValues.length / 2))
    : Math.floor(numericValues.length / 2);

  if (windowSize < 1) {
    return defaultResult;
  }

  const recentWindow = numericValues.slice(-windowSize);
  const previousWindow = numericValues.slice(0, windowSize);

  const recentAvg = recentWindow.reduce((sum, v) => sum + v, 0) / recentWindow.length;
  const previousAvg = previousWindow.reduce((sum, v) => sum + v, 0) / previousWindow.length;

  // Avoid division by zero
  if (previousAvg === 0) {
    if (recentAvg === 0) {
      return {
        direction: TREND_DIRECTION.STABLE,
        changePercent: 0,
        recentAvg: parseFloat(recentAvg.toFixed(2)),
        previousAvg: parseFloat(previousAvg.toFixed(2)),
      };
    }

    return {
      direction: recentAvg > 0 ? TREND_DIRECTION.UP : TREND_DIRECTION.DOWN,
      changePercent: 100,
      recentAvg: parseFloat(recentAvg.toFixed(2)),
      previousAvg: parseFloat(previousAvg.toFixed(2)),
    };
  }

  const changePercent = parseFloat((((recentAvg - previousAvg) / Math.abs(previousAvg)) * 100).toFixed(2));

  let direction = TREND_DIRECTION.STABLE;
  if (changePercent > threshold) {
    direction = TREND_DIRECTION.UP;
  } else if (changePercent < -threshold) {
    direction = TREND_DIRECTION.DOWN;
  }

  return {
    direction,
    changePercent,
    recentAvg: parseFloat(recentAvg.toFixed(2)),
    previousAvg: parseFloat(previousAvg.toFixed(2)),
  };
};

/**
 * Get the breach threshold configuration for a specific metric.
 * Returns warning and critical threshold values along with reference line configurations
 * suitable for Recharts ReferenceLine components.
 * @param {string} metricKey - The metric key (e.g., 'latency_p95', 'saturation_cpu', 'availability').
 * @param {Object} [customThresholds] - Optional custom thresholds to override defaults.
 * @returns {{ warning: number|null, critical: number|null, referenceLines: Object[] }}
 *   Threshold values and an array of reference line config objects for Recharts.
 */
const getBreachThreshold = (metricKey, customThresholds) => {
  if (!metricKey) {
    return {
      warning: null,
      critical: null,
      referenceLines: [],
    };
  }

  const defaults = getMetricThreshold(metricKey);
  const overrides = customThresholds && customThresholds[metricKey]
    ? customThresholds[metricKey]
    : {};

  const warning = overrides.warning != null ? overrides.warning : defaults.warning;
  const critical = overrides.critical != null ? overrides.critical : defaults.critical;

  const referenceLines = [];

  if (warning != null) {
    referenceLines.push({
      y: warning,
      label: 'Warning',
      stroke: '#ca8a04',
      strokeDasharray: '6 4',
      strokeWidth: 1.5,
      ifOverflow: 'extendDomain',
    });
  }

  if (critical != null) {
    referenceLines.push({
      y: critical,
      label: 'Critical',
      stroke: '#dc2626',
      strokeDasharray: '4 3',
      strokeWidth: 1.5,
      ifOverflow: 'extendDomain',
    });
  }

  return {
    warning,
    critical,
    referenceLines,
  };
};

/**
 * Build time series data formatted for Recharts consumption from raw golden signal data.
 * Merges multiple metric series into a single array of data points keyed by timestamp.
 * @param {Object} rawTimeSeries - Raw time series object where keys are metric names and values
 *   are arrays of { timestamp, value } objects.
 * @param {Object} [options] - Build options.
 * @param {string[]} [options.metricKeys] - Specific metric keys to include. If omitted, all keys are included.
 * @param {Date|string} [options.startTime] - Filter data points after this time (inclusive).
 * @param {Date|string} [options.endTime] - Filter data points before this time (inclusive).
 * @param {boolean} [options.sortByTime=true] - Whether to sort the output by timestamp ascending.
 * @returns {Object[]} Array of data point objects suitable for Recharts, each with a 'timestamp' key
 *   and one key per metric (e.g., { timestamp: '...', latency_p95: 142.3, latency_p99: 287.6 }).
 */
const buildTimeSeriesData = (rawTimeSeries, options = {}) => {
  const { metricKeys, startTime, endTime, sortByTime = true } = options;

  if (!rawTimeSeries || typeof rawTimeSeries !== 'object') {
    return [];
  }

  const keysToProcess = metricKeys && Array.isArray(metricKeys) && metricKeys.length > 0
    ? metricKeys.filter((key) => rawTimeSeries[key] != null)
    : Object.keys(rawTimeSeries);

  if (keysToProcess.length === 0) {
    return [];
  }

  const parsedStart = startTime ? parseTimestamp(startTime) : null;
  const parsedEnd = endTime ? parseTimestamp(endTime) : null;

  // Use a map keyed by timestamp string to merge multiple metrics
  const dataMap = new Map();

  for (const metricKey of keysToProcess) {
    const series = rawTimeSeries[metricKey];

    if (!Array.isArray(series)) {
      continue;
    }

    for (const point of series) {
      if (!point || point.timestamp == null) {
        continue;
      }

      const pointDate = parseTimestamp(point.timestamp);

      if (!pointDate) {
        continue;
      }

      // Apply time range filter
      if (parsedStart && pointDate.getTime() < parsedStart.getTime()) {
        continue;
      }

      if (parsedEnd && pointDate.getTime() > parsedEnd.getTime()) {
        continue;
      }

      const tsKey = point.timestamp;

      if (!dataMap.has(tsKey)) {
        dataMap.set(tsKey, {
          timestamp: tsKey,
          _epochMs: pointDate.getTime(),
        });
      }

      const entry = dataMap.get(tsKey);
      entry[metricKey] = point.value != null ? point.value : null;
    }
  }

  let result = Array.from(dataMap.values());

  if (sortByTime) {
    result.sort((a, b) => a._epochMs - b._epochMs);
  }

  // Remove the internal _epochMs field from the output
  return result.map(({ _epochMs, ...rest }) => rest);
};

/**
 * Build time series data from a golden signal time series object that is nested by signal type.
 * Flattens the nested structure (signal -> metric -> series) into Recharts-compatible data.
 * @param {Object} goldenSignalData - Object keyed by golden signal type (e.g., LATENCY, TRAFFIC),
 *   where each value is an object keyed by metric name with arrays of { timestamp, value }.
 * @param {Object} [options] - Build options (same as buildTimeSeriesData options).
 * @returns {Object[]} Array of merged data point objects for Recharts.
 */
const buildGoldenSignalChartData = (goldenSignalData, options = {}) => {
  if (!goldenSignalData || typeof goldenSignalData !== 'object') {
    return [];
  }

  // Flatten the nested structure into a single metric -> series map
  const flattenedSeries = {};

  for (const signalType of Object.keys(goldenSignalData)) {
    const signalMetrics = goldenSignalData[signalType];

    if (!signalMetrics || typeof signalMetrics !== 'object') {
      continue;
    }

    for (const metricKey of Object.keys(signalMetrics)) {
      flattenedSeries[metricKey] = signalMetrics[metricKey];
    }
  }

  return buildTimeSeriesData(flattenedSeries, options);
};

/**
 * Calculate the Y-axis domain (min/max) for a set of values with optional padding.
 * Useful for setting Recharts YAxis domain to avoid clipping.
 * @param {number[]} values - Array of numeric values.
 * @param {Object} [options] - Domain options.
 * @param {number} [options.paddingPercent=10] - Percentage of range to add as padding on each side.
 * @param {number} [options.minValue] - Force a minimum domain value.
 * @param {number} [options.maxValue] - Force a maximum domain value.
 * @param {boolean} [options.includeZero=false] - Whether to always include zero in the domain.
 * @returns {[number, number]} Tuple of [min, max] for the Y-axis domain.
 */
const calculateYAxisDomain = (values, options = {}) => {
  const { paddingPercent = 10, minValue, maxValue, includeZero = false } = options;

  if (!values || !Array.isArray(values) || values.length === 0) {
    return [0, 100];
  }

  const numericValues = values.filter((v) => v != null && !isNaN(v)).map(Number);

  if (numericValues.length === 0) {
    return [0, 100];
  }

  let min = Math.min(...numericValues);
  let max = Math.max(...numericValues);

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  const range = max - min;
  const padding = range * (paddingPercent / 100);

  let domainMin = min - padding;
  let domainMax = max + padding;

  if (minValue != null) {
    domainMin = Math.min(domainMin, minValue);
  }

  if (maxValue != null) {
    domainMax = Math.max(domainMax, maxValue);
  }

  // Avoid identical min/max
  if (domainMin === domainMax) {
    domainMin = domainMin - 1;
    domainMax = domainMax + 1;
  }

  return [parseFloat(domainMin.toFixed(2)), parseFloat(domainMax.toFixed(2))];
};

/**
 * Get the unit string for a given metric key.
 * @param {string} metricKey - The metric key (e.g., 'latency_p95', 'saturation_cpu').
 * @returns {string} The unit string (e.g., 'ms', '%', 'count', 'rps').
 */
const getMetricUnit = (metricKey) => {
  if (!metricKey || typeof metricKey !== 'string') {
    return '';
  }

  const allMetrics = Object.values(GOLDEN_SIGNAL_METRICS).flat();
  const metric = allMetrics.find((m) => m.key === metricKey);

  if (metric) {
    return metric.unit;
  }

  // Fallback heuristics based on key naming
  if (metricKey.startsWith('latency')) {
    return 'ms';
  }

  if (metricKey.startsWith('saturation') || metricKey === 'availability' || metricKey === 'error_budget') {
    return '%';
  }

  if (metricKey.startsWith('errors')) {
    return 'count';
  }

  if (metricKey.startsWith('traffic')) {
    return 'rps';
  }

  return '';
};

export {
  DEFAULT_CHART_COLORS,
  STATUS_CHART_COLORS,
  SEVERITY_CHART_COLORS,
  TREND_DIRECTION,
  generateChartColors,
  formatAxisLabel,
  formatTimeAxisLabel,
  calculateTrendDirection,
  getBreachThreshold,
  buildTimeSeriesData,
  buildGoldenSignalChartData,
  calculateYAxisDomain,
  getMetricUnit,
};