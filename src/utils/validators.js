import {
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_METRICS,
  SEVERITY_LEVELS,
  RCA_CATEGORIES,
  DOMAIN_TIERS,
  DEFAULT_METRIC_THRESHOLDS,
  getAllGoldenSignalMetricKeys,
} from '../constants/metrics';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_FILE_TYPES = Object.freeze({
  CSV: {
    extensions: ['.csv'],
    mimeTypes: ['text/csv', 'application/vnd.ms-excel'],
  },
  EXCEL: {
    extensions: ['.xlsx', '.xls'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
  },
});

const ALL_ALLOWED_EXTENSIONS = Object.freeze(
  Object.values(ALLOWED_FILE_TYPES).flatMap((type) => type.extensions),
);

const ALL_ALLOWED_MIME_TYPES = Object.freeze(
  Object.values(ALLOWED_FILE_TYPES).flatMap((type) => type.mimeTypes),
);

/**
 * Create a structured validation error object.
 * @param {string} field - The field or context where the error occurred.
 * @param {string} message - Human-readable error message.
 * @param {string} [code='VALIDATION_ERROR'] - Machine-readable error code.
 * @param {*} [details=null] - Additional error details or context.
 * @returns {{ field: string, message: string, code: string, details: *|null }}
 */
const createValidationError = (field, message, code = 'VALIDATION_ERROR', details = null) => {
  return {
    field,
    message,
    code,
    details,
  };
};

/**
 * Create a structured validation result object.
 * @param {boolean} valid - Whether validation passed.
 * @param {Object[]} [errors=[]] - Array of validation error objects.
 * @param {Object[]} [warnings=[]] - Array of validation warning objects.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[] }}
 */
const createValidationResult = (valid, errors = [], warnings = []) => {
  return {
    valid,
    errors,
    warnings,
  };
};

/**
 * Validate that a file does not exceed the maximum allowed size (10 MB).
 * @param {File|{ size: number, name?: string }} file - The file or file-like object to validate.
 * @param {number} [maxSizeBytes=MAX_FILE_SIZE_BYTES] - Maximum allowed size in bytes.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[] }} Validation result.
 */
const validateFileSize = (file, maxSizeBytes = MAX_FILE_SIZE_BYTES) => {
  const errors = [];

  if (!file) {
    errors.push(createValidationError('file', 'No file provided.', 'FILE_MISSING'));
    return createValidationResult(false, errors);
  }

  if (file.size == null || isNaN(file.size)) {
    errors.push(
      createValidationError('file.size', 'Unable to determine file size.', 'FILE_SIZE_UNKNOWN'),
    );
    return createValidationResult(false, errors);
  }

  if (file.size === 0) {
    errors.push(createValidationError('file.size', 'File is empty (0 bytes).', 'FILE_EMPTY'));
    return createValidationResult(false, errors);
  }

  if (file.size > maxSizeBytes) {
    const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    const fileMB = (file.size / (1024 * 1024)).toFixed(2);
    errors.push(
      createValidationError(
        'file.size',
        `File size (${fileMB} MB) exceeds the maximum allowed size of ${maxMB} MB.`,
        'FILE_TOO_LARGE',
        { maxSizeBytes, actualSizeBytes: file.size },
      ),
    );
    return createValidationResult(false, errors);
  }

  return createValidationResult(true);
};

/**
 * Validate that a file has an allowed type (CSV or Excel).
 * Checks both file extension and MIME type when available.
 * @param {File|{ name: string, type?: string }} file - The file or file-like object to validate.
 * @param {string[]} [allowedExtensions=ALL_ALLOWED_EXTENSIONS] - Allowed file extensions.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[] }} Validation result.
 */
const validateFileType = (file, allowedExtensions = ALL_ALLOWED_EXTENSIONS) => {
  const errors = [];
  const warnings = [];

  if (!file) {
    errors.push(createValidationError('file', 'No file provided.', 'FILE_MISSING'));
    return createValidationResult(false, errors);
  }

  if (!file.name || typeof file.name !== 'string') {
    errors.push(
      createValidationError('file.name', 'File name is missing or invalid.', 'FILE_NAME_MISSING'),
    );
    return createValidationResult(false, errors);
  }

  const fileName = file.name.toLowerCase();
  const lastDotIndex = fileName.lastIndexOf('.');
  const extension = lastDotIndex >= 0 ? fileName.slice(lastDotIndex) : '';

  if (!extension) {
    errors.push(
      createValidationError(
        'file.type',
        'File has no extension. Allowed types: ' + allowedExtensions.join(', '),
        'FILE_NO_EXTENSION',
        { allowedExtensions },
      ),
    );
    return createValidationResult(false, errors);
  }

  const isExtensionAllowed = allowedExtensions.some(
    (ext) => ext.toLowerCase() === extension,
  );

  if (!isExtensionAllowed) {
    errors.push(
      createValidationError(
        'file.type',
        `File type "${extension}" is not supported. Allowed types: ${allowedExtensions.join(', ')}`,
        'FILE_TYPE_NOT_ALLOWED',
        { extension, allowedExtensions },
      ),
    );
    return createValidationResult(false, errors);
  }

  // Warn if MIME type is present but does not match expected types
  if (file.type && typeof file.type === 'string' && file.type.length > 0) {
    const isMatchingMime = ALL_ALLOWED_MIME_TYPES.some(
      (mime) => mime.toLowerCase() === file.type.toLowerCase(),
    );

    if (!isMatchingMime) {
      warnings.push(
        createValidationError(
          'file.type',
          `File MIME type "${file.type}" does not match expected types for "${extension}" files. The file will still be processed based on its extension.`,
          'FILE_MIME_MISMATCH',
          { mimeType: file.type, extension },
        ),
      );
    }
  }

  return createValidationResult(true, [], warnings);
};

/**
 * Known CSV schema definitions for different upload types.
 * Each schema defines required columns, optional columns, and per-column validators.
 */
const CSV_SCHEMAS = Object.freeze({
  metrics: {
    requiredColumns: [
      'domain_id',
      'service_id',
      'timestamp',
      'availability',
    ],
    optionalColumns: [
      'latency_p95',
      'latency_p99',
      'traffic_rps',
      'errors_5xx',
      'errors_functional',
      'saturation_cpu',
      'saturation_mem',
      'saturation_queue',
    ],
    columnValidators: {
      domain_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'domain_id must be a non-empty string.';
        }
        return null;
      },
      service_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'service_id must be a non-empty string.';
        }
        return null;
      },
      timestamp: (value) => {
        if (!value) {
          return 'timestamp is required.';
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `Invalid timestamp: "${value}". Expected ISO 8601 format.`;
        }
        return null;
      },
      availability: (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) {
          return `availability must be a number, got "${value}".`;
        }
        if (num < 0 || num > 100) {
          return `availability must be between 0 and 100, got ${num}.`;
        }
        return null;
      },
      latency_p95: (value) => validateNumericColumn(value, 'latency_p95', 0),
      latency_p99: (value) => validateNumericColumn(value, 'latency_p99', 0),
      traffic_rps: (value) => validateNumericColumn(value, 'traffic_rps', 0),
      errors_5xx: (value) => validateNonNegativeIntColumn(value, 'errors_5xx'),
      errors_functional: (value) => validateNonNegativeIntColumn(value, 'errors_functional'),
      saturation_cpu: (value) => validatePercentageColumn(value, 'saturation_cpu'),
      saturation_mem: (value) => validatePercentageColumn(value, 'saturation_mem'),
      saturation_queue: (value) => validatePercentageColumn(value, 'saturation_queue'),
    },
  },
  incidents: {
    requiredColumns: [
      'incident_id',
      'service_id',
      'domain_id',
      'severity',
      'root_cause',
      'title',
      'start_time',
      'status',
    ],
    optionalColumns: [
      'description',
      'end_time',
      'mttr',
      'mttd',
      'mtbf',
      'evidence_links',
    ],
    columnValidators: {
      incident_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'incident_id must be a non-empty string.';
        }
        return null;
      },
      service_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'service_id must be a non-empty string.';
        }
        return null;
      },
      domain_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'domain_id must be a non-empty string.';
        }
        return null;
      },
      severity: (value) => {
        const validSeverities = Object.values(SEVERITY_LEVELS);
        if (!value || !validSeverities.includes(value.toUpperCase())) {
          return `severity must be one of: ${validSeverities.join(', ')}. Got "${value}".`;
        }
        return null;
      },
      root_cause: (value) => {
        const validCategories = Object.values(RCA_CATEGORIES);
        if (!value || !validCategories.includes(value)) {
          return `root_cause must be one of: ${validCategories.join(', ')}. Got "${value}".`;
        }
        return null;
      },
      title: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'title must be a non-empty string.';
        }
        return null;
      },
      start_time: (value) => {
        if (!value) {
          return 'start_time is required.';
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `Invalid start_time: "${value}". Expected ISO 8601 format.`;
        }
        return null;
      },
      end_time: (value) => {
        if (!value || value.trim().length === 0) {
          return null; // optional
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `Invalid end_time: "${value}". Expected ISO 8601 format.`;
        }
        return null;
      },
      status: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'status must be a non-empty string.';
        }
        return null;
      },
      mttr: (value) => validateNumericColumn(value, 'mttr', 0),
      mttd: (value) => validateNumericColumn(value, 'mttd', 0),
      mtbf: (value) => validateNumericColumn(value, 'mtbf', 0),
    },
  },
  deployments: {
    requiredColumns: [
      'deployment_id',
      'service_id',
      'domain_id',
      'version',
      'timestamp',
      'status',
    ],
    optionalColumns: [
      'deployer',
      'change_type',
      'description',
      'rollback',
      'related_incident_id',
    ],
    columnValidators: {
      deployment_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'deployment_id must be a non-empty string.';
        }
        return null;
      },
      service_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'service_id must be a non-empty string.';
        }
        return null;
      },
      domain_id: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'domain_id must be a non-empty string.';
        }
        return null;
      },
      version: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'version must be a non-empty string.';
        }
        return null;
      },
      timestamp: (value) => {
        if (!value) {
          return 'timestamp is required.';
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `Invalid timestamp: "${value}". Expected ISO 8601 format.`;
        }
        return null;
      },
      status: (value) => {
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return 'status must be a non-empty string.';
        }
        return null;
      },
    },
  },
});

/**
 * Validate a numeric column value with an optional minimum bound.
 * Returns null if the value is empty (treated as optional) or valid.
 * @param {*} value - The value to validate.
 * @param {string} columnName - The column name for error messages.
 * @param {number|null} [min=null] - Minimum allowed value (inclusive).
 * @returns {string|null} Error message or null if valid.
 */
const validateNumericColumn = (value, columnName, min = null) => {
  if (value == null || (typeof value === 'string' && value.trim().length === 0)) {
    return null; // treat empty as optional
  }

  const num = parseFloat(value);
  if (isNaN(num)) {
    return `${columnName} must be a number, got "${value}".`;
  }

  if (min != null && num < min) {
    return `${columnName} must be >= ${min}, got ${num}.`;
  }

  return null;
};

/**
 * Validate a non-negative integer column value.
 * Returns null if the value is empty (treated as optional) or valid.
 * @param {*} value - The value to validate.
 * @param {string} columnName - The column name for error messages.
 * @returns {string|null} Error message or null if valid.
 */
const validateNonNegativeIntColumn = (value, columnName) => {
  if (value == null || (typeof value === 'string' && value.trim().length === 0)) {
    return null;
  }

  const num = parseFloat(value);
  if (isNaN(num)) {
    return `${columnName} must be a number, got "${value}".`;
  }

  if (num < 0) {
    return `${columnName} must be >= 0, got ${num}.`;
  }

  if (!Number.isInteger(num)) {
    return `${columnName} must be an integer, got ${num}.`;
  }

  return null;
};

/**
 * Validate a percentage column value (0–100).
 * Returns null if the value is empty (treated as optional) or valid.
 * @param {*} value - The value to validate.
 * @param {string} columnName - The column name for error messages.
 * @returns {string|null} Error message or null if valid.
 */
const validatePercentageColumn = (value, columnName) => {
  if (value == null || (typeof value === 'string' && value.trim().length === 0)) {
    return null;
  }

  const num = parseFloat(value);
  if (isNaN(num)) {
    return `${columnName} must be a number, got "${value}".`;
  }

  if (num < 0 || num > 100) {
    return `${columnName} must be between 0 and 100, got ${num}.`;
  }

  return null;
};

/**
 * Validate parsed CSV/Excel data against a known schema.
 * Checks for required columns, unknown columns, and per-row/per-cell validation.
 * @param {Object[]} rows - Array of row objects (parsed from CSV/Excel). Each row is a key-value object.
 * @param {string} schemaType - The schema type key (e.g., 'metrics', 'incidents', 'deployments').
 * @param {Object} [options] - Validation options.
 * @param {number} [options.maxErrors=100] - Maximum number of row-level errors to collect before stopping.
 * @param {boolean} [options.strictColumns=false] - If true, unknown columns produce errors instead of warnings.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[] }} Validation result.
 */
const validateCSVSchema = (rows, schemaType, options = {}) => {
  const { maxErrors = 100, strictColumns = false } = options;
  const errors = [];
  const warnings = [];

  if (!rows || !Array.isArray(rows)) {
    errors.push(
      createValidationError('data', 'Parsed data is not an array or is null.', 'DATA_INVALID'),
    );
    return createValidationResult(false, errors);
  }

  if (rows.length === 0) {
    errors.push(
      createValidationError('data', 'File contains no data rows.', 'DATA_EMPTY'),
    );
    return createValidationResult(false, errors);
  }

  const schema = CSV_SCHEMAS[schemaType];
  if (!schema) {
    const validTypes = Object.keys(CSV_SCHEMAS).join(', ');
    errors.push(
      createValidationError(
        'schemaType',
        `Unknown schema type "${schemaType}". Valid types: ${validTypes}`,
        'SCHEMA_UNKNOWN',
        { schemaType, validTypes: Object.keys(CSV_SCHEMAS) },
      ),
    );
    return createValidationResult(false, errors);
  }

  // Validate column headers from the first row
  const firstRow = rows[0];
  const presentColumns = Object.keys(firstRow);
  const allKnownColumns = [...schema.requiredColumns, ...(schema.optionalColumns || [])];

  // Check for missing required columns
  const missingRequired = schema.requiredColumns.filter(
    (col) => !presentColumns.includes(col),
  );

  if (missingRequired.length > 0) {
    errors.push(
      createValidationError(
        'columns',
        `Missing required columns: ${missingRequired.join(', ')}`,
        'COLUMNS_MISSING_REQUIRED',
        { missingColumns: missingRequired, requiredColumns: schema.requiredColumns },
      ),
    );
  }

  // Check for unknown columns
  const unknownColumns = presentColumns.filter((col) => !allKnownColumns.includes(col));

  if (unknownColumns.length > 0) {
    const entry = createValidationError(
      'columns',
      `Unknown columns found: ${unknownColumns.join(', ')}. These columns will be ignored.`,
      'COLUMNS_UNKNOWN',
      { unknownColumns },
    );

    if (strictColumns) {
      errors.push(entry);
    } else {
      warnings.push(entry);
    }
  }

  // If required columns are missing, we cannot validate rows meaningfully
  if (missingRequired.length > 0) {
    return createValidationResult(false, errors, warnings);
  }

  // Validate each row
  let errorCount = 0;
  const columnsToValidate = presentColumns.filter((col) => allKnownColumns.includes(col));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    if (errorCount >= maxErrors) {
      warnings.push(
        createValidationError(
          'data',
          `Validation stopped after ${maxErrors} errors. There may be additional errors in remaining rows.`,
          'MAX_ERRORS_REACHED',
          { maxErrors, totalRows: rows.length, lastRowChecked: rowIndex },
        ),
      );
      break;
    }

    const row = rows[rowIndex];
    const rowNumber = rowIndex + 1; // 1-based for user-facing messages (header is row 0 in most parsers)

    for (const col of columnsToValidate) {
      const validator = schema.columnValidators[col];
      if (!validator) {
        continue;
      }

      const value = row[col];
      const errorMessage = validator(value);

      if (errorMessage) {
        errors.push(
          createValidationError(
            `row[${rowNumber}].${col}`,
            `Row ${rowNumber}: ${errorMessage}`,
            'ROW_VALIDATION_ERROR',
            { row: rowNumber, column: col, value },
          ),
        );
        errorCount++;

        if (errorCount >= maxErrors) {
          break;
        }
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
};

/**
 * Validate metric threshold configuration values.
 * Ensures warning and critical thresholds are valid numbers and logically consistent.
 * @param {Object} thresholds - Object keyed by metric name with { warning, critical } values.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[] }} Validation result.
 */
const validateMetricThresholds = (thresholds) => {
  const errors = [];
  const warnings = [];

  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    errors.push(
      createValidationError(
        'thresholds',
        'Thresholds must be a non-null object.',
        'THRESHOLDS_INVALID',
      ),
    );
    return createValidationResult(false, errors);
  }

  const knownMetrics = Object.keys(DEFAULT_METRIC_THRESHOLDS);
  const providedMetrics = Object.keys(thresholds);

  // Warn about unknown metric keys
  const unknownMetrics = providedMetrics.filter((key) => !knownMetrics.includes(key));
  if (unknownMetrics.length > 0) {
    warnings.push(
      createValidationError(
        'thresholds',
        `Unknown metric keys: ${unknownMetrics.join(', ')}. These will be ignored.`,
        'THRESHOLDS_UNKNOWN_METRICS',
        { unknownMetrics },
      ),
    );
  }

  // Metrics where lower values are worse (e.g., availability, error_budget)
  // For these, warning > critical (warning threshold is higher than critical)
  const lowerIsBadMetrics = ['availability', 'error_budget'];

  // Metrics where higher values are worse (e.g., latency, saturation, errors)
  // For these, warning < critical (warning threshold is lower than critical)
  const higherIsBadMetrics = [
    'latency_p95',
    'latency_p99',
    'errors_5xx',
    'errors_functional',
    'saturation_cpu',
    'saturation_mem',
    'saturation_queue',
  ];

  for (const metricKey of providedMetrics) {
    if (unknownMetrics.includes(metricKey)) {
      continue;
    }

    const config = thresholds[metricKey];

    if (!config || typeof config !== 'object') {
      errors.push(
        createValidationError(
          `thresholds.${metricKey}`,
          `Threshold for "${metricKey}" must be an object with "warning" and "critical" properties.`,
          'THRESHOLD_INVALID_FORMAT',
          { metricKey },
        ),
      );
      continue;
    }

    const { warning, critical } = config;

    // Both null is valid (no threshold configured)
    if (warning == null && critical == null) {
      continue;
    }

    // Validate warning value
    if (warning != null) {
      if (typeof warning !== 'number' || isNaN(warning)) {
        errors.push(
          createValidationError(
            `thresholds.${metricKey}.warning`,
            `Warning threshold for "${metricKey}" must be a number, got "${warning}".`,
            'THRESHOLD_WARNING_INVALID',
            { metricKey, value: warning },
          ),
        );
        continue;
      }

      if (warning < 0) {
        errors.push(
          createValidationError(
            `thresholds.${metricKey}.warning`,
            `Warning threshold for "${metricKey}" must be >= 0, got ${warning}.`,
            'THRESHOLD_WARNING_NEGATIVE',
            { metricKey, value: warning },
          ),
        );
      }
    }

    // Validate critical value
    if (critical != null) {
      if (typeof critical !== 'number' || isNaN(critical)) {
        errors.push(
          createValidationError(
            `thresholds.${metricKey}.critical`,
            `Critical threshold for "${metricKey}" must be a number, got "${critical}".`,
            'THRESHOLD_CRITICAL_INVALID',
            { metricKey, value: critical },
          ),
        );
        continue;
      }

      if (critical < 0) {
        errors.push(
          createValidationError(
            `thresholds.${metricKey}.critical`,
            `Critical threshold for "${metricKey}" must be >= 0, got ${critical}.`,
            'THRESHOLD_CRITICAL_NEGATIVE',
            { metricKey, value: critical },
          ),
        );
      }
    }

    // Validate logical consistency between warning and critical
    if (warning != null && critical != null && !isNaN(warning) && !isNaN(critical)) {
      if (lowerIsBadMetrics.includes(metricKey)) {
        // For availability/error_budget: warning should be > critical
        // (e.g., warn at 99.9%, critical at 99.5%)
        if (warning <= critical) {
          errors.push(
            createValidationError(
              `thresholds.${metricKey}`,
              `For "${metricKey}", warning (${warning}) must be greater than critical (${critical}) because lower values indicate worse health.`,
              'THRESHOLD_ORDER_INVALID',
              { metricKey, warning, critical, direction: 'lower_is_bad' },
            ),
          );
        }
      } else if (higherIsBadMetrics.includes(metricKey)) {
        // For latency/errors/saturation: warning should be < critical
        // (e.g., warn at 500ms, critical at 1000ms)
        if (warning >= critical) {
          errors.push(
            createValidationError(
              `thresholds.${metricKey}`,
              `For "${metricKey}", warning (${warning}) must be less than critical (${critical}) because higher values indicate worse health.`,
              'THRESHOLD_ORDER_INVALID',
              { metricKey, warning, critical, direction: 'higher_is_bad' },
            ),
          );
        }
      }
    }

    // Validate percentage-based metrics are within 0-100
    const percentageMetrics = [
      'availability',
      'saturation_cpu',
      'saturation_mem',
      'saturation_queue',
      'error_budget',
    ];

    if (percentageMetrics.includes(metricKey)) {
      if (warning != null && !isNaN(warning) && (warning < 0 || warning > 100)) {
        errors.push(
          createValidationError(
            `thresholds.${metricKey}.warning`,
            `Warning threshold for "${metricKey}" must be between 0 and 100, got ${warning}.`,
            'THRESHOLD_PERCENTAGE_OUT_OF_RANGE',
            { metricKey, value: warning },
          ),
        );
      }

      if (critical != null && !isNaN(critical) && (critical < 0 || critical > 100)) {
        errors.push(
          createValidationError(
            `thresholds.${metricKey}.critical`,
            `Critical threshold for "${metricKey}" must be between 0 and 100, got ${critical}.`,
            'THRESHOLD_PERCENTAGE_OUT_OF_RANGE',
            { metricKey, value: critical },
          ),
        );
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
};

/**
 * Perform a combined file validation (size + type) in a single call.
 * @param {File} file - The file to validate.
 * @param {Object} [options] - Validation options.
 * @param {number} [options.maxSizeBytes=MAX_FILE_SIZE_BYTES] - Maximum file size in bytes.
 * @param {string[]} [options.allowedExtensions=ALL_ALLOWED_EXTENSIONS] - Allowed file extensions.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[] }} Combined validation result.
 */
const validateFile = (file, options = {}) => {
  const { maxSizeBytes = MAX_FILE_SIZE_BYTES, allowedExtensions = ALL_ALLOWED_EXTENSIONS } = options;

  const sizeResult = validateFileSize(file, maxSizeBytes);
  const typeResult = validateFileType(file, allowedExtensions);

  const allErrors = [...sizeResult.errors, ...typeResult.errors];
  const allWarnings = [...sizeResult.warnings, ...typeResult.warnings];

  return createValidationResult(allErrors.length === 0, allErrors, allWarnings);
};

export {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_FILE_TYPES,
  ALL_ALLOWED_EXTENSIONS,
  ALL_ALLOWED_MIME_TYPES,
  CSV_SCHEMAS,
  createValidationError,
  createValidationResult,
  validateFileSize,
  validateFileType,
  validateFile,
  validateCSVSchema,
  validateMetricThresholds,
};