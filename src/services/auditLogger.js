import { v4 as uuidv4 } from 'uuid';
import { getItem, setItem } from '../utils/storage';
import { exportToCSV, exportToJSON, prepareAuditLogsForExport } from '../utils/exportUtils';
import { parseTimestamp, isWithinRange } from '../utils/dateUtils';

const AUDIT_LOG_STORAGE_KEY = 'audit_logs';
const MAX_AUDIT_LOG_ENTRIES = 10000;

/**
 * Audit action constants for categorizing log entries.
 */
const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SESSION_VALIDATED: 'SESSION_VALIDATED',
  UPLOAD_DATA: 'UPLOAD_DATA',
  CONFIGURE_METRICS: 'CONFIGURE_METRICS',
  CONFIGURE_THRESHOLDS: 'CONFIGURE_THRESHOLDS',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_ROLES: 'MANAGE_ROLES',
  EXPORT_DATA: 'EXPORT_DATA',
  ANNOTATE: 'ANNOTATE',
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_METRICS: 'VIEW_METRICS',
  VIEW_ALERTS: 'VIEW_ALERTS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
});

/**
 * Audit log result/status constants.
 */
const AUDIT_RESULTS = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
  ERROR: 'ERROR',
});

/**
 * Retrieve all audit log entries from localStorage.
 * @returns {Object[]} Array of audit log entry objects, sorted by timestamp descending.
 */
const getAllLogs = () => {
  const logs = getItem(AUDIT_LOG_STORAGE_KEY, []);

  if (!Array.isArray(logs)) {
    return [];
  }

  return logs;
};

/**
 * Persist audit log entries to localStorage.
 * @param {Object[]} logs - Array of audit log entry objects.
 * @returns {boolean} True if persisted successfully.
 */
const persistLogs = (logs) => {
  if (!logs || !Array.isArray(logs)) {
    return false;
  }

  return setItem(AUDIT_LOG_STORAGE_KEY, logs);
};

/**
 * Log an auditable action. Creates an immutable audit log entry and persists it.
 * Entries are append-only — existing entries are never modified or deleted.
 *
 * @param {string} userId - The user ID performing the action.
 * @param {string} action - The action being performed (from AUDIT_ACTIONS).
 * @param {string} [resource=''] - The resource being acted upon (e.g., file name, config key).
 * @param {Object} [metadata={}] - Additional metadata/context for the action.
 * @param {string} [metadata.user_name] - The user's display name.
 * @param {string} [metadata.user_email] - The user's email address.
 * @param {string} [metadata.ip_address] - The user's IP address.
 * @param {string} [metadata.status] - The result status (from AUDIT_RESULTS). Defaults to 'SUCCESS'.
 * @param {string} [metadata.description] - Human-readable description of the action.
 * @param {Object} [metadata.details] - Arbitrary details object for additional context.
 * @returns {{ success: boolean, logEntry: Object|null, error: string|null }}
 *   Result object with the created log entry or an error message.
 */
const logAction = (userId, action, resource = '', metadata = {}) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      console.error('[auditLogger] Invalid userId provided to logAction');
      return {
        success: false,
        logEntry: null,
        error: 'userId is required and must be a non-empty string.',
      };
    }

    if (!action || typeof action !== 'string' || action.trim().length === 0) {
      console.error('[auditLogger] Invalid action provided to logAction');
      return {
        success: false,
        logEntry: null,
        error: 'action is required and must be a non-empty string.',
      };
    }

    const now = new Date();

    const logEntry = Object.freeze({
      id: `audit-${uuidv4()}`,
      timestamp: now.toISOString(),
      user_id: userId.trim(),
      user_name: metadata.user_name || '',
      user_email: metadata.user_email || '',
      action: action.trim(),
      resource_type: typeof resource === 'string' ? resource.trim() : '',
      resource_id: metadata.resource_id || '',
      description: metadata.description || `${action} performed on ${resource || 'N/A'}`,
      ip_address: metadata.ip_address || '',
      status: metadata.status || AUDIT_RESULTS.SUCCESS,
      details: metadata.details && typeof metadata.details === 'object' ? metadata.details : null,
      metadata: metadata.extra && typeof metadata.extra === 'object' ? metadata.extra : null,
    });

    const existingLogs = getAllLogs();

    // Prepend new entry (most recent first)
    const updatedLogs = [logEntry, ...existingLogs];

    // Enforce maximum log entries to prevent localStorage overflow
    const trimmedLogs = updatedLogs.length > MAX_AUDIT_LOG_ENTRIES
      ? updatedLogs.slice(0, MAX_AUDIT_LOG_ENTRIES)
      : updatedLogs;

    const persisted = persistLogs(trimmedLogs);

    if (!persisted) {
      console.error('[auditLogger] Failed to persist audit log entry');
      return {
        success: false,
        logEntry,
        error: 'Failed to persist audit log entry to storage.',
      };
    }

    return {
      success: true,
      logEntry,
      error: null,
    };
  } catch (e) {
    console.error('[auditLogger] Unexpected error in logAction:', e);
    return {
      success: false,
      logEntry: null,
      error: 'An unexpected error occurred while logging the action.',
    };
  }
};

/**
 * Retrieve audit log entries with optional filtering.
 *
 * @param {Object} [filters={}] - Filter criteria for log retrieval.
 * @param {string} [filters.userId] - Filter by user ID.
 * @param {string} [filters.action] - Filter by action type.
 * @param {string} [filters.resource] - Filter by resource type (partial match).
 * @param {string} [filters.status] - Filter by result status.
 * @param {string|Date} [filters.from] - Filter entries from this timestamp (inclusive).
 * @param {string|Date} [filters.to] - Filter entries up to this timestamp (inclusive).
 * @param {string} [filters.searchQuery] - Free-text search across description, user_name, user_email, and resource.
 * @param {number} [filters.limit] - Maximum number of entries to return.
 * @param {number} [filters.offset=0] - Number of entries to skip (for pagination).
 * @param {string} [filters.sortOrder='desc'] - Sort order by timestamp ('asc' or 'desc').
 * @returns {{ logs: Object[], total: number, filtered: number, error: string|null }}
 *   Result object with filtered logs, total count, and filtered count.
 */
const getLogs = (filters = {}) => {
  try {
    const allLogs = getAllLogs();

    if (!allLogs || allLogs.length === 0) {
      return {
        logs: [],
        total: 0,
        filtered: 0,
        error: null,
      };
    }

    const total = allLogs.length;
    let filteredLogs = [...allLogs];

    // Filter by userId
    if (filters.userId && typeof filters.userId === 'string' && filters.userId.trim().length > 0) {
      const targetUserId = filters.userId.trim().toLowerCase();
      filteredLogs = filteredLogs.filter(
        (log) => log.user_id && log.user_id.toLowerCase() === targetUserId,
      );
    }

    // Filter by action
    if (filters.action && typeof filters.action === 'string' && filters.action.trim().length > 0) {
      const targetAction = filters.action.trim().toUpperCase();
      filteredLogs = filteredLogs.filter(
        (log) => log.action && log.action.toUpperCase() === targetAction,
      );
    }

    // Filter by resource (partial match)
    if (filters.resource && typeof filters.resource === 'string' && filters.resource.trim().length > 0) {
      const targetResource = filters.resource.trim().toLowerCase();
      filteredLogs = filteredLogs.filter(
        (log) =>
          (log.resource_type && log.resource_type.toLowerCase().includes(targetResource)) ||
          (log.resource_id && log.resource_id.toLowerCase().includes(targetResource)),
      );
    }

    // Filter by status
    if (filters.status && typeof filters.status === 'string' && filters.status.trim().length > 0) {
      const targetStatus = filters.status.trim().toUpperCase();
      filteredLogs = filteredLogs.filter(
        (log) => log.status && log.status.toUpperCase() === targetStatus,
      );
    }

    // Filter by time range
    if (filters.from || filters.to) {
      const fromDate = filters.from ? parseTimestamp(filters.from) : null;
      const toDate = filters.to ? parseTimestamp(filters.to) : null;

      filteredLogs = filteredLogs.filter((log) => {
        if (!log.timestamp) {
          return false;
        }

        const logDate = parseTimestamp(log.timestamp);

        if (!logDate) {
          return false;
        }

        if (fromDate && logDate.getTime() < fromDate.getTime()) {
          return false;
        }

        if (toDate && logDate.getTime() > toDate.getTime()) {
          return false;
        }

        return true;
      });
    }

    // Free-text search
    if (filters.searchQuery && typeof filters.searchQuery === 'string' && filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.trim().toLowerCase();
      filteredLogs = filteredLogs.filter((log) => {
        const searchableFields = [
          log.description,
          log.user_name,
          log.user_email,
          log.user_id,
          log.resource_type,
          log.resource_id,
          log.action,
          log.status,
        ];

        return searchableFields.some(
          (field) => field && typeof field === 'string' && field.toLowerCase().includes(query),
        );
      });
    }

    const filtered = filteredLogs.length;

    // Sort by timestamp
    const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc';
    filteredLogs.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;

      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    // Apply pagination
    const offset = filters.offset != null && !isNaN(filters.offset) && filters.offset >= 0
      ? Math.floor(filters.offset)
      : 0;

    if (offset > 0) {
      filteredLogs = filteredLogs.slice(offset);
    }

    if (filters.limit != null && !isNaN(filters.limit) && filters.limit > 0) {
      filteredLogs = filteredLogs.slice(0, Math.floor(filters.limit));
    }

    return {
      logs: filteredLogs,
      total,
      filtered,
      error: null,
    };
  } catch (e) {
    console.error('[auditLogger] Unexpected error in getLogs:', e);
    return {
      logs: [],
      total: 0,
      filtered: 0,
      error: 'An unexpected error occurred while retrieving audit logs.',
    };
  }
};

/**
 * Export audit log entries in the specified format (CSV or JSON).
 *
 * @param {string} [format='csv'] - The export format ('csv' or 'json').
 * @param {Object} [filters={}] - Optional filters to apply before export (same as getLogs filters).
 * @param {Object} [options={}] - Export options.
 * @param {string} [options.fileName] - Custom file name for the export.
 * @param {string} [options.baseName='audit-logs'] - Base name for auto-generated file names.
 * @returns {{ success: boolean, recordCount: number, error: string|null }}
 *   Result object indicating export success and the number of records exported.
 */
const exportLogs = (format = 'csv', filters = {}, options = {}) => {
  try {
    const { logs } = getLogs(filters);

    if (!logs || logs.length === 0) {
      return {
        success: false,
        recordCount: 0,
        error: 'No audit log entries found matching the specified filters.',
      };
    }

    const baseName = options.baseName || 'audit-logs';
    const fileName = options.fileName || undefined;

    const normalizedFormat = (format || 'csv').toLowerCase().trim();

    if (normalizedFormat === 'json') {
      const success = exportToJSON(logs, {
        fileName,
        baseName,
        wrapWithMetadata: true,
        metadata: {
          export_type: 'audit_logs',
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        },
      });

      return {
        success,
        recordCount: logs.length,
        error: success ? null : 'Failed to export audit logs as JSON.',
      };
    }

    // Default to CSV
    const preparedLogs = prepareAuditLogsForExport(logs);

    const columnLabels = {
      id: 'Log ID',
      timestamp: 'Timestamp',
      user_id: 'User ID',
      user_name: 'User Name',
      user_email: 'User Email',
      action: 'Action',
      resource_type: 'Resource Type',
      resource_id: 'Resource ID',
      description: 'Description',
      ip_address: 'IP Address',
      status: 'Status',
      details: 'Details',
    };

    const columns = [
      'id',
      'timestamp',
      'user_id',
      'user_name',
      'user_email',
      'action',
      'resource_type',
      'resource_id',
      'description',
      'ip_address',
      'status',
      'details',
    ];

    const success = exportToCSV(preparedLogs, {
      fileName,
      baseName,
      columns,
      columnLabels,
    });

    return {
      success,
      recordCount: logs.length,
      error: success ? null : 'Failed to export audit logs as CSV.',
    };
  } catch (e) {
    console.error('[auditLogger] Unexpected error in exportLogs:', e);
    return {
      success: false,
      recordCount: 0,
      error: 'An unexpected error occurred while exporting audit logs.',
    };
  }
};

/**
 * Get a summary of audit log activity.
 * Returns counts by action type and recent activity stats.
 *
 * @param {Object} [filters={}] - Optional filters (same as getLogs filters).
 * @returns {{ totalEntries: number, byAction: Object, byStatus: Object, byUser: Object, error: string|null }}
 */
const getLogSummary = (filters = {}) => {
  try {
    const { logs, total, error } = getLogs(filters);

    if (error) {
      return {
        totalEntries: 0,
        byAction: {},
        byStatus: {},
        byUser: {},
        error,
      };
    }

    const byAction = {};
    const byStatus = {};
    const byUser = {};

    for (const log of logs) {
      // Count by action
      const action = log.action || 'UNKNOWN';
      byAction[action] = (byAction[action] || 0) + 1;

      // Count by status
      const status = log.status || 'UNKNOWN';
      byStatus[status] = (byStatus[status] || 0) + 1;

      // Count by user
      const userId = log.user_id || 'UNKNOWN';
      if (!byUser[userId]) {
        byUser[userId] = {
          count: 0,
          user_name: log.user_name || '',
          user_email: log.user_email || '',
        };
      }
      byUser[userId].count += 1;
    }

    return {
      totalEntries: logs.length,
      byAction,
      byStatus,
      byUser,
      error: null,
    };
  } catch (e) {
    console.error('[auditLogger] Unexpected error in getLogSummary:', e);
    return {
      totalEntries: 0,
      byAction: {},
      byStatus: {},
      byUser: {},
      error: 'An unexpected error occurred while generating audit log summary.',
    };
  }
};

/**
 * Get the most recent audit log entries.
 * Convenience wrapper around getLogs with a limit.
 *
 * @param {number} [count=10] - Number of recent entries to retrieve.
 * @returns {Object[]} Array of the most recent audit log entries.
 */
const getRecentLogs = (count = 10) => {
  const { logs } = getLogs({
    limit: count,
    sortOrder: 'desc',
  });

  return logs;
};

/**
 * Clear all audit logs from storage.
 * This should only be used in development/testing environments.
 * In production, audit logs are immutable and should never be cleared.
 *
 * @returns {boolean} True if cleared successfully.
 */
const clearLogs = () => {
  try {
    return persistLogs([]);
  } catch (e) {
    console.error('[auditLogger] Failed to clear audit logs:', e);
    return false;
  }
};

export {
  AUDIT_ACTIONS,
  AUDIT_RESULTS,
  AUDIT_LOG_STORAGE_KEY,
  MAX_AUDIT_LOG_ENTRIES,
  logAction,
  getLogs,
  exportLogs,
  getLogSummary,
  getRecentLogs,
  clearLogs,
};