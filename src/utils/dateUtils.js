import { TIME_RANGES } from '../constants/metrics';

/**
 * Get a time range object with start and end dates based on a predefined range key.
 * @param {string} rangeKey - The time range key from TIME_RANGES (e.g., 'LAST_24H', 'LAST_7D', 'LAST_30D').
 * @param {Date} [referenceDate] - The reference date to calculate from. Defaults to now.
 * @returns {{ start: Date, end: Date, hours: number, label: string }} Time range object with start/end dates.
 */
const getTimeRange = (rangeKey, referenceDate) => {
  const end = referenceDate instanceof Date && !isNaN(referenceDate.getTime())
    ? new Date(referenceDate.getTime())
    : new Date();

  const range = TIME_RANGES[rangeKey];

  if (!range) {
    // Default to LAST_24H if an unknown key is provided
    const fallback = TIME_RANGES.LAST_24H;
    const start = new Date(end.getTime() - fallback.hours * 60 * 60 * 1000);
    return {
      start,
      end,
      hours: fallback.hours,
      label: fallback.label,
    };
  }

  const start = new Date(end.getTime() - range.hours * 60 * 60 * 1000);

  return {
    start,
    end,
    hours: range.hours,
    label: range.label,
  };
};

/**
 * Check if a given date or ISO timestamp falls within a specified time range.
 * @param {string|Date} dateValue - The date to check (ISO 8601 string or Date object).
 * @param {Date} rangeStart - The start of the range (inclusive).
 * @param {Date} rangeEnd - The end of the range (inclusive).
 * @returns {boolean} True if the date is within the range (inclusive on both ends).
 */
const isWithinRange = (dateValue, rangeStart, rangeEnd) => {
  if (!dateValue || !rangeStart || !rangeEnd) {
    return false;
  }

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  if (isNaN(date.getTime())) {
    return false;
  }

  const start = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
  const end = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false;
  }

  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
};

/**
 * Calculate Mean Time To Resolve (MTTR) in minutes from start and end timestamps.
 * MTTR measures the average time taken to resolve an incident after it has been detected.
 * @param {string|Date} startTime - The incident start time (ISO 8601 string or Date object).
 * @param {string|Date} endTime - The incident resolution time (ISO 8601 string or Date object).
 * @returns {number|null} MTTR in minutes, or null if inputs are invalid.
 */
const calculateMTTR = (startTime, endTime) => {
  if (!startTime || !endTime) {
    return null;
  }

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return null;
  }

  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) {
    return null;
  }

  return parseFloat((diffMs / (1000 * 60)).toFixed(2));
};

/**
 * Calculate Mean Time To Detect (MTTD) in minutes from the actual start of an issue
 * to when it was detected/acknowledged.
 * @param {string|Date} issueStartTime - The time the issue actually began (ISO 8601 string or Date object).
 * @param {string|Date} detectionTime - The time the issue was detected (ISO 8601 string or Date object).
 * @returns {number|null} MTTD in minutes, or null if inputs are invalid.
 */
const calculateMTTD = (issueStartTime, detectionTime) => {
  if (!issueStartTime || !detectionTime) {
    return null;
  }

  const issueStart = issueStartTime instanceof Date ? issueStartTime : new Date(issueStartTime);
  const detection = detectionTime instanceof Date ? detectionTime : new Date(detectionTime);

  if (isNaN(issueStart.getTime()) || isNaN(detection.getTime())) {
    return null;
  }

  const diffMs = detection.getTime() - issueStart.getTime();

  if (diffMs < 0) {
    return null;
  }

  return parseFloat((diffMs / (1000 * 60)).toFixed(2));
};

/**
 * Calculate Mean Time Between Failures (MTBF) in hours from an array of incident timestamps.
 * MTBF is the average time between consecutive failures.
 * @param {Array<string|Date>} incidentTimestamps - Array of incident start times, in any order.
 * @returns {number|null} MTBF in hours, or null if fewer than 2 incidents are provided.
 */
const calculateMTBF = (incidentTimestamps) => {
  if (!incidentTimestamps || !Array.isArray(incidentTimestamps) || incidentTimestamps.length < 2) {
    return null;
  }

  const validDates = incidentTimestamps
    .map((ts) => {
      const date = ts instanceof Date ? ts : new Date(ts);
      return isNaN(date.getTime()) ? null : date;
    })
    .filter((d) => d !== null);

  if (validDates.length < 2) {
    return null;
  }

  // Sort dates in ascending order
  validDates.sort((a, b) => a.getTime() - b.getTime());

  let totalDiffMs = 0;
  for (let i = 1; i < validDates.length; i++) {
    totalDiffMs += validDates[i].getTime() - validDates[i - 1].getTime();
  }

  const avgDiffMs = totalDiffMs / (validDates.length - 1);
  const avgDiffHours = avgDiffMs / (1000 * 60 * 60);

  return parseFloat(avgDiffHours.toFixed(2));
};

/**
 * Get a human-readable relative time string (e.g., "5 minutes ago", "2 days ago").
 * @param {string|Date} dateValue - The date to format relative to now (ISO 8601 string or Date object).
 * @returns {string} Relative time string, or '—' if the input is invalid.
 */
const getRelativeTime = (dateValue) => {
  if (!dateValue) {
    return '—';
  }

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  if (isNaN(date.getTime())) {
    return '—';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;
  const suffix = isFuture ? 'from now' : 'ago';

  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${suffix}`;
  }

  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${suffix}`;
  }

  if (days < 7) {
    return `${days} ${days === 1 ? 'day' : 'days'} ${suffix}`;
  }

  if (weeks < 5) {
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ${suffix}`;
  }

  if (months < 12) {
    return `${months} ${months === 1 ? 'month' : 'months'} ${suffix}`;
  }

  return `${years} ${years === 1 ? 'year' : 'years'} ${suffix}`;
};

/**
 * Format a date range as a human-readable string.
 * @param {string|Date} startDate - The start date (ISO 8601 string or Date object).
 * @param {string|Date} endDate - The end date (ISO 8601 string or Date object).
 * @param {Object} [options] - Formatting options.
 * @param {boolean} [options.includeTime=false] - Whether to include time in the formatted output.
 * @param {string} [options.separator=' — '] - The separator between start and end dates.
 * @returns {string} Formatted date range string.
 */
const formatDateRange = (startDate, endDate, options = {}) => {
  const { includeTime = false, separator = ' — ' } = options;

  if (!startDate && !endDate) {
    return '—';
  }

  const formatSingleDate = (dateValue) => {
    if (!dateValue) {
      return '—';
    }

    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

    if (isNaN(date.getTime())) {
      return '—';
    }

    const dateOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };

    if (includeTime) {
      dateOptions.hour = '2-digit';
      dateOptions.minute = '2-digit';
    }

    return date.toLocaleString('en-US', dateOptions);
  };

  const formattedStart = formatSingleDate(startDate);
  const formattedEnd = formatSingleDate(endDate);

  if (formattedStart === '—' && formattedEnd === '—') {
    return '—';
  }

  if (formattedStart === '—') {
    return formattedEnd;
  }

  if (formattedEnd === '—') {
    return formattedStart;
  }

  // If both dates are on the same day and time is not included, show a single date
  if (!includeTime) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);

    if (
      !isNaN(start.getTime()) &&
      !isNaN(end.getTime()) &&
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate()
    ) {
      return formattedStart;
    }
  }

  return `${formattedStart}${separator}${formattedEnd}`;
};

/**
 * Parse an ISO 8601 timestamp string into a Date object safely.
 * @param {string|Date} value - The value to parse.
 * @returns {Date|null} A valid Date object or null if parsing fails.
 */
const parseTimestamp = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Get the number of hours between two dates.
 * @param {string|Date} startDate - The start date (ISO 8601 string or Date object).
 * @param {string|Date} endDate - The end date (ISO 8601 string or Date object).
 * @returns {number|null} The number of hours between the two dates, or null if inputs are invalid.
 */
const getHoursBetween = (startDate, endDate) => {
  const start = parseTimestamp(startDate);
  const end = parseTimestamp(endDate);

  if (!start || !end) {
    return null;
  }

  const diffMs = Math.abs(end.getTime() - start.getTime());
  return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
};

/**
 * Get the number of minutes between two dates.
 * @param {string|Date} startDate - The start date (ISO 8601 string or Date object).
 * @param {string|Date} endDate - The end date (ISO 8601 string or Date object).
 * @returns {number|null} The number of minutes between the two dates, or null if inputs are invalid.
 */
const getMinutesBetween = (startDate, endDate) => {
  const start = parseTimestamp(startDate);
  const end = parseTimestamp(endDate);

  if (!start || !end) {
    return null;
  }

  const diffMs = Math.abs(end.getTime() - start.getTime());
  return parseFloat((diffMs / (1000 * 60)).toFixed(2));
};

/**
 * Generate an array of ISO timestamp strings at regular intervals between start and end.
 * Useful for creating time series x-axis labels.
 * @param {string|Date} startDate - The start date.
 * @param {string|Date} endDate - The end date.
 * @param {number} points - The number of points to generate (minimum 2).
 * @returns {string[]} Array of ISO timestamp strings.
 */
const generateTimePoints = (startDate, endDate, points) => {
  const start = parseTimestamp(startDate);
  const end = parseTimestamp(endDate);

  if (!start || !end || !points || points < 2) {
    return [];
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  const interval = (endMs - startMs) / (points - 1);

  const timestamps = [];
  for (let i = 0; i < points; i++) {
    timestamps.push(new Date(startMs + interval * i).toISOString());
  }

  return timestamps;
};

export {
  getTimeRange,
  isWithinRange,
  calculateMTTR,
  calculateMTTD,
  calculateMTBF,
  getRelativeTime,
  formatDateRange,
  parseTimestamp,
  getHoursBetween,
  getMinutesBetween,
  generateTimePoints,
};