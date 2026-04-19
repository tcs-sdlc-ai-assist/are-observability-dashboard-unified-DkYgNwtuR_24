/**
 * Format a number as a percentage string with specified decimal places.
 * @param {number} value - The numeric value to format.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} Formatted percentage string (e.g., "99.95%").
 */
const formatPercentage = (value, decimals = 2) => {
  if (value == null || isNaN(value)) {
    return '—';
  }

  return `${parseFloat(value).toFixed(decimals)}%`;
};

/**
 * Format a duration in milliseconds to a human-readable string.
 * Automatically selects the most appropriate unit (ms, s, min, hr, d).
 * @param {number} ms - Duration in milliseconds.
 * @param {Object} [options] - Formatting options.
 * @param {boolean} [options.short=false] - Use short unit labels (e.g., "ms" vs "milliseconds").
 * @param {number} [options.decimals=2] - Number of decimal places.
 * @returns {string} Human-readable duration string.
 */
const formatDuration = (ms, options = {}) => {
  const { short = false, decimals = 2 } = options;

  if (ms == null || isNaN(ms)) {
    return '—';
  }

  const absMs = Math.abs(ms);

  if (absMs < 1000) {
    return `${parseFloat(ms).toFixed(decimals)}${short ? 'ms' : ' ms'}`;
  }

  const seconds = ms / 1000;
  if (absMs < 60 * 1000) {
    return `${parseFloat(seconds).toFixed(decimals)}${short ? 's' : ' sec'}`;
  }

  const minutes = seconds / 60;
  if (absMs < 60 * 60 * 1000) {
    return `${parseFloat(minutes).toFixed(decimals)}${short ? 'min' : ' min'}`;
  }

  const hours = minutes / 60;
  if (absMs < 24 * 60 * 60 * 1000) {
    return `${parseFloat(hours).toFixed(decimals)}${short ? 'hr' : ' hr'}`;
  }

  const days = hours / 24;
  return `${parseFloat(days).toFixed(decimals)}${short ? 'd' : ' days'}`;
};

/**
 * Format an ISO timestamp or Date object to a localized display string.
 * @param {string|Date} timestamp - ISO 8601 string or Date object.
 * @param {Object} [options] - Formatting options.
 * @param {boolean} [options.includeTime=true] - Whether to include time portion.
 * @param {boolean} [options.includeSeconds=false] - Whether to include seconds.
 * @param {boolean} [options.relative=false] - Return relative time (e.g., "2 hours ago").
 * @returns {string} Formatted timestamp string.
 */
const formatTimestamp = (timestamp, options = {}) => {
  const { includeTime = true, includeSeconds = false, relative = false } = options;

  if (!timestamp) {
    return '—';
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (isNaN(date.getTime())) {
    return '—';
  }

  if (relative) {
    return formatRelativeTime(date);
  }

  const dateOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  if (includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    if (includeSeconds) {
      dateOptions.second = '2-digit';
    }
  }

  return date.toLocaleString('en-US', dateOptions);
};

/**
 * Format a Date object as a relative time string (e.g., "5 minutes ago").
 * @param {Date} date - The date to format relative to now.
 * @returns {string} Relative time string.
 */
const formatRelativeTime = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
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

  if (seconds < 60) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${suffix}`;
  }

  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${suffix}`;
  }

  if (days < 30) {
    return `${days} ${days === 1 ? 'day' : 'days'} ${suffix}`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} ${months === 1 ? 'month' : 'months'} ${suffix}`;
  }

  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'year' : 'years'} ${suffix}`;
};

/**
 * Format a number with locale-aware thousand separators and optional decimal places.
 * @param {number} value - The number to format.
 * @param {Object} [options] - Formatting options.
 * @param {number} [options.decimals] - Fixed number of decimal places. If undefined, uses the number's natural precision.
 * @param {string} [options.unit] - Optional unit suffix (e.g., "rps", "ms").
 * @param {boolean} [options.compact=false] - Use compact notation (e.g., "1.2K", "3.4M").
 * @returns {string} Formatted number string.
 */
const formatNumber = (value, options = {}) => {
  const { decimals, unit, compact = false } = options;

  if (value == null || isNaN(value)) {
    return '—';
  }

  const localeOptions = {};

  if (decimals != null) {
    localeOptions.minimumFractionDigits = decimals;
    localeOptions.maximumFractionDigits = decimals;
  }

  if (compact) {
    localeOptions.notation = 'compact';
    localeOptions.compactDisplay = 'short';
  }

  const formatted = parseFloat(value).toLocaleString('en-US', localeOptions);

  if (unit) {
    return `${formatted} ${unit}`;
  }

  return formatted;
};

/**
 * Truncate text to a specified maximum length, appending an ellipsis if truncated.
 * @param {string} text - The text to truncate.
 * @param {number} [maxLength=50] - Maximum character length before truncation.
 * @param {string} [ellipsis='…'] - The ellipsis string to append.
 * @returns {string} Truncated text or original if within limit.
 */
const truncateText = (text, maxLength = 50, ellipsis = '…') => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}${ellipsis}`;
};

export {
  formatPercentage,
  formatDuration,
  formatTimestamp,
  formatRelativeTime,
  formatNumber,
  truncateText,
};