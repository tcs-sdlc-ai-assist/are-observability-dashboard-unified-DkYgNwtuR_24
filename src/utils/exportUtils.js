import { formatTimestamp } from './formatters';

/**
 * Trigger a browser download of a Blob as a file.
 * @param {Blob} blob - The Blob to download.
 * @param {string} fileName - The file name for the download.
 */
const triggerDownload = (blob, fileName) => {
  if (!blob || !fileName) {
    console.error('[exportUtils] Invalid blob or fileName provided to triggerDownload');
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
};

/**
 * Escape a value for safe inclusion in a CSV cell.
 * Wraps the value in double quotes if it contains commas, double quotes, or newlines.
 * Double quotes within the value are escaped by doubling them.
 * @param {*} value - The value to escape.
 * @returns {string} The CSV-safe string representation.
 */
const escapeCSVValue = (value) => {
  if (value == null) {
    return '';
  }

  const stringValue = String(value);

  // If the value contains a comma, double quote, or newline, wrap in quotes
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

/**
 * Convert an array of objects to a CSV string.
 * @param {Object[]} data - Array of row objects.
 * @param {Object} [options] - CSV generation options.
 * @param {string[]} [options.columns] - Specific columns to include (in order). If omitted, all keys from the first row are used.
 * @param {Object} [options.columnLabels] - Map of column keys to human-readable header labels.
 * @param {boolean} [options.includeHeader=true] - Whether to include the header row.
 * @param {string} [options.delimiter=','] - The column delimiter character.
 * @param {string} [options.lineEnding='\r\n'] - The line ending sequence.
 * @returns {string} The CSV string.
 */
const convertToCSVString = (data, options = {}) => {
  const {
    columns,
    columnLabels = {},
    includeHeader = true,
    delimiter = ',',
    lineEnding = '\r\n',
  } = options;

  if (!data || !Array.isArray(data) || data.length === 0) {
    return '';
  }

  // Determine columns from the first row if not explicitly provided
  const columnKeys = columns && Array.isArray(columns) && columns.length > 0
    ? columns
    : Object.keys(data[0]);

  if (columnKeys.length === 0) {
    return '';
  }

  const rows = [];

  // Header row
  if (includeHeader) {
    const headerRow = columnKeys
      .map((key) => escapeCSVValue(columnLabels[key] || key))
      .join(delimiter);
    rows.push(headerRow);
  }

  // Data rows
  for (const row of data) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    const dataRow = columnKeys
      .map((key) => {
        const value = row[key];

        // Handle arrays by joining with semicolons
        if (Array.isArray(value)) {
          return escapeCSVValue(value.join('; '));
        }

        // Handle objects by serializing to JSON
        if (value !== null && typeof value === 'object') {
          return escapeCSVValue(JSON.stringify(value));
        }

        return escapeCSVValue(value);
      })
      .join(delimiter);

    rows.push(dataRow);
  }

  return rows.join(lineEnding);
};

/**
 * Generate a timestamped file name for exports.
 * @param {string} baseName - The base name for the file (e.g., 'audit-logs', 'incidents-report').
 * @param {string} extension - The file extension without the dot (e.g., 'csv', 'json').
 * @returns {string} The generated file name (e.g., 'audit-logs_2024-09-12T14-30-00.csv').
 */
const generateExportFileName = (baseName, extension) => {
  if (!baseName || typeof baseName !== 'string') {
    baseName = 'export';
  }

  if (!extension || typeof extension !== 'string') {
    extension = 'csv';
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // Sanitize base name: replace spaces and special chars with hyphens
  const sanitizedName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${sanitizedName}_${timestamp}.${extension}`;
};

/**
 * Export an array of data objects as a downloadable CSV file.
 * @param {Object[]} data - Array of row objects to export.
 * @param {Object} [options] - Export options.
 * @param {string} [options.fileName] - Custom file name. If omitted, a timestamped name is generated.
 * @param {string} [options.baseName='export'] - Base name for auto-generated file names.
 * @param {string[]} [options.columns] - Specific columns to include (in order).
 * @param {Object} [options.columnLabels] - Map of column keys to human-readable header labels.
 * @param {boolean} [options.includeHeader=true] - Whether to include the header row.
 * @param {string} [options.delimiter=','] - The column delimiter character.
 * @returns {boolean} True if the export was initiated successfully.
 */
const exportToCSV = (data, options = {}) => {
  const {
    fileName,
    baseName = 'export',
    columns,
    columnLabels,
    includeHeader = true,
    delimiter = ',',
  } = options;

  if (!data || !Array.isArray(data) || data.length === 0) {
    console.warn('[exportUtils] No data provided for CSV export');
    return false;
  }

  try {
    const csvString = convertToCSVString(data, {
      columns,
      columnLabels,
      includeHeader,
      delimiter,
    });

    if (!csvString) {
      console.warn('[exportUtils] Generated CSV string is empty');
      return false;
    }

    // Add BOM for Excel compatibility with UTF-8
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });

    const exportFileName = fileName || generateExportFileName(baseName, 'csv');

    triggerDownload(blob, exportFileName);

    return true;
  } catch (e) {
    console.error('[exportUtils] Failed to export CSV:', e);
    return false;
  }
};

/**
 * Export an array of data objects (or any serializable value) as a downloadable JSON file.
 * @param {*} data - The data to export. Typically an array of objects or a single object.
 * @param {Object} [options] - Export options.
 * @param {string} [options.fileName] - Custom file name. If omitted, a timestamped name is generated.
 * @param {string} [options.baseName='export'] - Base name for auto-generated file names.
 * @param {number} [options.indent=2] - Number of spaces for JSON indentation. Use 0 for minified output.
 * @param {Object} [options.metadata] - Optional metadata to include in the exported JSON wrapper.
 * @param {boolean} [options.wrapWithMetadata=false] - If true, wraps data in an object with metadata and export timestamp.
 * @returns {boolean} True if the export was initiated successfully.
 */
const exportToJSON = (data, options = {}) => {
  const {
    fileName,
    baseName = 'export',
    indent = 2,
    metadata,
    wrapWithMetadata = false,
  } = options;

  if (data == null) {
    console.warn('[exportUtils] No data provided for JSON export');
    return false;
  }

  try {
    let exportData = data;

    if (wrapWithMetadata) {
      exportData = {
        exported_at: new Date().toISOString(),
        record_count: Array.isArray(data) ? data.length : 1,
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
        data,
      };
    }

    const jsonString = JSON.stringify(exportData, null, indent || undefined);

    if (!jsonString) {
      console.warn('[exportUtils] Generated JSON string is empty');
      return false;
    }

    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });

    const exportFileName = fileName || generateExportFileName(baseName, 'json');

    triggerDownload(blob, exportFileName);

    return true;
  } catch (e) {
    console.error('[exportUtils] Failed to export JSON:', e);
    return false;
  }
};

/**
 * Prepare audit log entries for export by flattening nested fields.
 * @param {Object[]} auditLogs - Array of audit log objects.
 * @returns {Object[]} Flattened audit log objects suitable for CSV/JSON export.
 */
const prepareAuditLogsForExport = (auditLogs) => {
  if (!auditLogs || !Array.isArray(auditLogs) || auditLogs.length === 0) {
    return [];
  }

  return auditLogs.map((log) => {
    const flattened = {
      id: log.id ?? '',
      timestamp: log.timestamp ?? '',
      user_id: log.user_id ?? '',
      user_name: log.user_name ?? '',
      user_email: log.user_email ?? '',
      action: log.action ?? '',
      resource_type: log.resource_type ?? '',
      resource_id: log.resource_id ?? '',
      description: log.description ?? '',
      ip_address: log.ip_address ?? '',
      status: log.status ?? '',
    };

    // Flatten details/metadata if present
    if (log.details && typeof log.details === 'object') {
      flattened.details = JSON.stringify(log.details);
    } else {
      flattened.details = log.details ?? '';
    }

    if (log.metadata && typeof log.metadata === 'object') {
      flattened.metadata = JSON.stringify(log.metadata);
    }

    return flattened;
  });
};

/**
 * Prepare incident data for export by flattening nested fields.
 * @param {Object[]} incidents - Array of incident objects.
 * @returns {Object[]} Flattened incident objects suitable for CSV/JSON export.
 */
const prepareIncidentsForExport = (incidents) => {
  if (!incidents || !Array.isArray(incidents) || incidents.length === 0) {
    return [];
  }

  return incidents.map((incident) => ({
    incident_id: incident.incident_id ?? '',
    service_id: incident.service_id ?? '',
    domain_id: incident.domain_id ?? '',
    severity: incident.severity ?? '',
    root_cause: incident.root_cause ?? '',
    title: incident.title ?? '',
    description: incident.description ?? '',
    start_time: incident.start_time ?? '',
    end_time: incident.end_time ?? '',
    mttr: incident.mttr ?? '',
    mttd: incident.mttd ?? '',
    mtbf: incident.mtbf ?? '',
    status: incident.status ?? '',
    evidence_links: Array.isArray(incident.evidence_links)
      ? incident.evidence_links.join('; ')
      : incident.evidence_links ?? '',
  }));
};

/**
 * Prepare service metrics data for export by flattening golden signals.
 * @param {Object[]} services - Array of service objects with nested golden_signals.
 * @returns {Object[]} Flattened service objects suitable for CSV/JSON export.
 */
const prepareServicesForExport = (services) => {
  if (!services || !Array.isArray(services) || services.length === 0) {
    return [];
  }

  return services.map((service) => {
    const signals = service.golden_signals || {};

    return {
      service_id: service.service_id ?? '',
      name: service.name ?? '',
      domain_id: service.domain_id ?? '',
      domain_name: service.domain_name ?? '',
      domain_tier: service.domain_tier ?? '',
      availability: service.availability ?? '',
      sla: service.sla ?? '',
      slo: service.slo ?? '',
      error_budget: service.error_budget ?? '',
      status: service.status ?? '',
      latency_p95: signals.latency_p95 ?? '',
      latency_p99: signals.latency_p99 ?? '',
      traffic_rps: signals.traffic_rps ?? '',
      errors_5xx: signals.errors_5xx ?? '',
      errors_functional: signals.errors_functional ?? '',
      saturation_cpu: signals.saturation_cpu ?? '',
      saturation_mem: signals.saturation_mem ?? '',
      saturation_queue: signals.saturation_queue ?? '',
      dependencies: Array.isArray(service.dependencies)
        ? service.dependencies.join('; ')
        : service.dependencies ?? '',
    };
  });
};

export {
  triggerDownload,
  escapeCSVValue,
  convertToCSVString,
  generateExportFileName,
  exportToCSV,
  exportToJSON,
  prepareAuditLogsForExport,
  prepareIncidentsForExport,
  prepareServicesForExport,
};