import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  validateFile,
  validateCSVSchema,
  ALLOWED_FILE_TYPES,
  ALL_ALLOWED_EXTENSIONS,
} from '../utils/validators';
import {
  SEVERITY_LEVELS,
  RCA_CATEGORIES,
} from '../constants/metrics';
import { transformMetricsRowsToDashboardData } from '../utils/metricsTransform';

/**
 * Determine the file type category from a file name.
 * @param {string} fileName - The file name to inspect.
 * @returns {'csv'|'excel'|null} The file type category or null if unsupported.
 */
const getFileCategory = (fileName) => {
  if (!fileName || typeof fileName !== 'string') {
    return null;
  }

  const lowerName = fileName.toLowerCase();
  const lastDotIndex = lowerName.lastIndexOf('.');
  const extension = lastDotIndex >= 0 ? lowerName.slice(lastDotIndex) : '';

  if (ALLOWED_FILE_TYPES.CSV.extensions.includes(extension)) {
    return 'csv';
  }

  if (ALLOWED_FILE_TYPES.EXCEL.extensions.includes(extension)) {
    return 'excel';
  }

  return null;
};

/**
 * Read a File object as an ArrayBuffer.
 * @param {File} file - The file to read.
 * @returns {Promise<ArrayBuffer>} The file contents as an ArrayBuffer.
 */
const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      resolve(event.target.result);
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file "${file.name}".`));
    };

    reader.readAsArrayBuffer(file);
  });
};

/**
 * Read a File object as a text string.
 * @param {File} file - The file to read.
 * @returns {Promise<string>} The file contents as a string.
 */
const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      resolve(event.target.result);
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file "${file.name}".`));
    };

    reader.readAsText(file);
  });
};

/**
 * Parse a CSV file using Papa Parse.
 * @param {File} file - The CSV file to parse.
 * @returns {Promise<{ rows: Object[], errors: Object[], meta: Object }>}
 *   Parsed result with row objects, parse errors, and metadata.
 */
const parseCSVFile = async (file) => {
  const text = await readFileAsText(file);

  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      trimHeaders: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const rows = results.data || [];
        const errors = (results.errors || []).map((err) => ({
          row: err.row != null ? err.row + 1 : null,
          message: err.message || 'Unknown parse error',
          type: err.type || 'unknown',
          code: err.code || 'PARSE_ERROR',
        }));

        resolve({
          rows,
          errors,
          meta: {
            delimiter: results.meta?.delimiter || ',',
            linebreak: results.meta?.linebreak || '\n',
            fields: results.meta?.fields || [],
            totalRows: rows.length,
          },
        });
      },
      error: (err) => {
        resolve({
          rows: [],
          errors: [
            {
              row: null,
              message: err.message || 'Failed to parse CSV file.',
              type: 'critical',
              code: 'PARSE_FAILURE',
            },
          ],
          meta: {
            delimiter: ',',
            linebreak: '\n',
            fields: [],
            totalRows: 0,
          },
        });
      },
    });
  });
};

/**
 * Parse an Excel file (.xlsx/.xls) using the XLSX library.
 * Reads the first sheet and converts it to an array of row objects.
 * @param {File} file - The Excel file to parse.
 * @returns {Promise<{ rows: Object[], errors: Object[], meta: Object }>}
 *   Parsed result with row objects, parse errors, and metadata.
 */
const parseExcelFile = async (file) => {
  try {
    const buffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        rows: [],
        errors: [
          {
            row: null,
            message: 'Excel file contains no sheets.',
            type: 'critical',
            code: 'EXCEL_NO_SHEETS',
          },
        ],
        meta: {
          sheetName: null,
          fields: [],
          totalRows: 0,
        },
      };
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    if (!worksheet) {
      return {
        rows: [],
        errors: [
          {
            row: null,
            message: `Sheet "${firstSheetName}" could not be read.`,
            type: 'critical',
            code: 'EXCEL_SHEET_UNREADABLE',
          },
        ],
        meta: {
          sheetName: firstSheetName,
          fields: [],
          totalRows: 0,
        },
      };
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd"T"hh:mm:ss',
    });

    // Trim header keys
    const trimmedRows = rows.map((row) => {
      const trimmed = {};

      for (const [key, value] of Object.entries(row)) {
        const trimmedKey = key.trim();
        trimmed[trimmedKey] = typeof value === 'string' ? value.trim() : value;
      }

      return trimmed;
    });

    const fields = trimmedRows.length > 0 ? Object.keys(trimmedRows[0]) : [];

    return {
      rows: trimmedRows,
      errors: [],
      meta: {
        sheetName: firstSheetName,
        fields,
        totalRows: trimmedRows.length,
      },
    };
  } catch (e) {
    console.error('[csvAdapter] Failed to parse Excel file:', e);
    return {
      rows: [],
      errors: [
        {
          row: null,
          message: `Failed to parse Excel file: ${e.message || 'Unknown error'}`,
          type: 'critical',
          code: 'EXCEL_PARSE_FAILURE',
        },
      ],
      meta: {
        sheetName: null,
        fields: [],
        totalRows: 0,
      },
    };
  }
};

/**
 * Parse a CSV or Excel file into structured row data.
 * Validates the file (size, type) before parsing.
 *
 * @param {File} file - The file to parse.
 * @returns {Promise<{ success: boolean, rows: Object[], errors: Object[], warnings: Object[], meta: Object }>}
 *   Parse result with rows, errors, warnings, and metadata.
 */
const parse = async (file) => {
  try {
    if (!file) {
      return {
        success: false,
        rows: [],
        errors: [{ row: null, message: 'No file provided.' }],
        warnings: [],
        meta: { totalRows: 0 },
      };
    }

    // Validate file size and type
    const fileValidation = validateFile(file);

    if (!fileValidation.valid) {
      return {
        success: false,
        rows: [],
        errors: fileValidation.errors.map((err) => ({
          row: null,
          message: err.message,
          code: err.code,
        })),
        warnings: fileValidation.warnings.map((w) => ({
          row: null,
          message: w.message,
          code: w.code,
        })),
        meta: { totalRows: 0, fileName: file.name },
      };
    }

    const fileCategory = getFileCategory(file.name);

    if (!fileCategory) {
      return {
        success: false,
        rows: [],
        errors: [
          {
            row: null,
            message: `Unsupported file type. Allowed types: ${ALL_ALLOWED_EXTENSIONS.join(', ')}`,
            code: 'FILE_TYPE_UNSUPPORTED',
          },
        ],
        warnings: [],
        meta: { totalRows: 0, fileName: file.name },
      };
    }

    let parseResult;

    if (fileCategory === 'csv') {
      parseResult = await parseCSVFile(file);
    } else {
      parseResult = await parseExcelFile(file);
    }

    const hasParseErrors = parseResult.errors.some((err) => err.type === 'critical');

    if (hasParseErrors) {
      return {
        success: false,
        rows: [],
        errors: parseResult.errors.map((err) => ({
          row: err.row,
          message: err.message,
          code: err.code || 'PARSE_ERROR',
        })),
        warnings: [],
        meta: {
          ...parseResult.meta,
          fileName: file.name,
          fileCategory,
        },
      };
    }

    if (parseResult.rows.length === 0) {
      return {
        success: false,
        rows: [],
        errors: [
          {
            row: null,
            message: 'File contains no data rows.',
            code: 'DATA_EMPTY',
          },
        ],
        warnings: parseResult.errors.map((err) => ({
          row: err.row,
          message: err.message,
          code: err.code || 'PARSE_WARNING',
        })),
        meta: {
          ...parseResult.meta,
          fileName: file.name,
          fileCategory,
        },
      };
    }

    // Non-critical parse errors become warnings
    const warnings = parseResult.errors
      .filter((err) => err.type !== 'critical')
      .map((err) => ({
        row: err.row,
        message: err.message,
        code: err.code || 'PARSE_WARNING',
      }));

    // Add file validation warnings
    if (fileValidation.warnings && fileValidation.warnings.length > 0) {
      for (const w of fileValidation.warnings) {
        warnings.push({
          row: null,
          message: w.message,
          code: w.code,
        });
      }
    }

    return {
      success: true,
      rows: parseResult.rows,
      errors: [],
      warnings,
      meta: {
        ...parseResult.meta,
        fileName: file.name,
        fileCategory,
      },
    };
  } catch (e) {
    console.error('[csvAdapter] Unexpected error during parse:', e);
    return {
      success: false,
      rows: [],
      errors: [
        {
          row: null,
          message: `An unexpected error occurred while parsing the file: ${e.message || 'Unknown error'}`,
          code: 'PARSE_UNEXPECTED_ERROR',
        },
      ],
      warnings: [],
      meta: { totalRows: 0, fileName: file ? file.name : '' },
    };
  }
};

/**
 * Validate parsed row data against a known schema type.
 * Delegates to the validateCSVSchema utility for column and row-level validation.
 *
 * @param {Object[]} rows - Array of parsed row objects.
 * @param {string} schemaType - The schema type key ('metrics', 'incidents', 'deployments').
 * @param {Object} [options] - Validation options.
 * @param {number} [options.maxErrors=100] - Maximum number of row-level errors to collect.
 * @param {boolean} [options.strictColumns=false] - If true, unknown columns produce errors.
 * @returns {{ valid: boolean, errors: Object[], warnings: Object[], rowCount: number }}
 *   Validation result with errors, warnings, and the total row count.
 */
const validate = (rows, schemaType, options = {}) => {
  try {
    if (!rows || !Array.isArray(rows)) {
      return {
        valid: false,
        errors: [{ row: null, message: 'No data rows provided for validation.' }],
        warnings: [],
        rowCount: 0,
      };
    }

    if (rows.length === 0) {
      return {
        valid: false,
        errors: [{ row: null, message: 'Data contains no rows.' }],
        warnings: [],
        rowCount: 0,
      };
    }

    if (!schemaType || typeof schemaType !== 'string') {
      return {
        valid: false,
        errors: [
          {
            row: null,
            message: 'Schema type is required. Valid types: metrics, incidents, deployments.',
          },
        ],
        warnings: [],
        rowCount: rows.length,
      };
    }

    const normalizedSchema = schemaType.toLowerCase().trim();

    const result = validateCSVSchema(rows, normalizedSchema, {
      maxErrors: options.maxErrors || 100,
      strictColumns: options.strictColumns || false,
    });

    return {
      valid: result.valid,
      errors: result.errors.map((err) => ({
        row: err.details?.row || null,
        field: err.field || null,
        message: err.message,
        code: err.code || 'VALIDATION_ERROR',
      })),
      warnings: result.warnings.map((w) => ({
        row: w.details?.row || null,
        field: w.field || null,
        message: w.message,
        code: w.code || 'VALIDATION_WARNING',
      })),
      rowCount: rows.length,
    };
  } catch (e) {
    console.error('[csvAdapter] Unexpected error during validation:', e);
    return {
      valid: false,
      errors: [
        {
          row: null,
          message: `An unexpected error occurred during validation: ${e.message || 'Unknown error'}`,
          code: 'VALIDATION_UNEXPECTED_ERROR',
        },
      ],
      warnings: [],
      rowCount: rows ? rows.length : 0,
    };
  }
};

/**
 * Transform validated metrics rows into dashboard domain/service structure.
 * @param {Object[]} rows - Validated metric row objects.
 * @returns {{ domains: Object[] }} Transformed domain data.
 */
const transformMetricsToDashboard = (rows) => {
  return transformMetricsRowsToDashboardData(rows);
};

/**
 * Transform validated incident rows into incident array.
 * @param {Object[]} rows - Validated incident row objects.
 * @returns {{ incidents: Object[] }} Transformed incident data.
 */
const transformIncidentsToDashboard = (rows) => {
  const incidents = [];

  for (const row of rows) {
    if (!row.incident_id || !row.service_id || !row.domain_id) {
      continue;
    }

    const incident = {
      incident_id: String(row.incident_id).trim(),
      service_id: String(row.service_id).trim(),
      domain_id: String(row.domain_id).trim(),
      severity: row.severity
        ? String(row.severity).toUpperCase().trim()
        : SEVERITY_LEVELS.P4,
      root_cause: row.root_cause
        ? String(row.root_cause).trim()
        : RCA_CATEGORIES.CODE,
      title: row.title ? String(row.title).trim() : '',
      description: row.description ? String(row.description).trim() : '',
      start_time: row.start_time || new Date().toISOString(),
      end_time: row.end_time && String(row.end_time).trim().length > 0
        ? String(row.end_time).trim()
        : null,
      mttr: row.mttr != null && !isNaN(parseFloat(row.mttr))
        ? parseFloat(parseFloat(row.mttr).toFixed(2))
        : null,
      mttd: row.mttd != null && !isNaN(parseFloat(row.mttd))
        ? parseFloat(parseFloat(row.mttd).toFixed(2))
        : null,
      mtbf: row.mtbf != null && !isNaN(parseFloat(row.mtbf))
        ? parseFloat(parseFloat(row.mtbf).toFixed(2))
        : null,
      status: row.status ? String(row.status).trim() : 'open',
      evidence_links: row.evidence_links
        ? String(row.evidence_links)
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
 * Transform validated deployment rows into deployment event array.
 * @param {Object[]} rows - Validated deployment row objects.
 * @returns {{ deployment_events: Object[] }} Transformed deployment data.
 */
const transformDeploymentsToDashboard = (rows) => {
  const deploymentEvents = [];

  for (const row of rows) {
    if (!row.deployment_id || !row.service_id || !row.domain_id) {
      continue;
    }

    const deployment = {
      deployment_id: String(row.deployment_id).trim(),
      service_id: String(row.service_id).trim(),
      domain_id: String(row.domain_id).trim(),
      version: row.version ? String(row.version).trim() : '',
      timestamp: row.timestamp || new Date().toISOString(),
      deployer: row.deployer ? String(row.deployer).trim() : 'unknown',
      status: row.status ? String(row.status).trim() : 'unknown',
      change_type: row.change_type ? String(row.change_type).trim() : 'unknown',
      description: row.description ? String(row.description).trim() : '',
      rollback:
        row.rollback === true ||
        row.rollback === 'true' ||
        row.rollback === '1' ||
        row.rollback === 'yes',
      related_incident_id: row.related_incident_id
        ? String(row.related_incident_id).trim()
        : null,
    };

    deploymentEvents.push(deployment);
  }

  return { deployment_events: deploymentEvents };
};

/**
 * Transform validated parsed data into dashboard-compatible data structures.
 * Routes to the appropriate transformer based on the schema type.
 *
 * @param {Object[]} rows - Array of validated row objects.
 * @param {string} schemaType - The schema type key ('metrics', 'incidents', 'deployments').
 * @returns {{ success: boolean, data: Object|null, type: string, rowCount: number, error: string|null }}
 *   Transformation result with the dashboard-compatible data object.
 */
const toDashboardData = (rows, schemaType) => {
  try {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return {
        success: false,
        data: null,
        type: schemaType || '',
        rowCount: 0,
        error: 'No data rows provided for transformation.',
      };
    }

    if (!schemaType || typeof schemaType !== 'string') {
      return {
        success: false,
        data: null,
        type: '',
        rowCount: rows.length,
        error: 'Schema type is required. Valid types: metrics, incidents, deployments.',
      };
    }

    const normalizedType = schemaType.toLowerCase().trim();
    let transformedData;

    switch (normalizedType) {
      case 'metrics':
        transformedData = transformMetricsToDashboard(rows);
        break;

      case 'incidents':
        transformedData = transformIncidentsToDashboard(rows);
        break;

      case 'deployments':
        transformedData = transformDeploymentsToDashboard(rows);
        break;

      default:
        return {
          success: false,
          data: null,
          type: normalizedType,
          rowCount: rows.length,
          error: `Unsupported schema type: "${normalizedType}". Valid types: metrics, incidents, deployments.`,
        };
    }

    return {
      success: true,
      data: transformedData,
      type: normalizedType,
      rowCount: rows.length,
      error: null,
    };
  } catch (e) {
    console.error('[csvAdapter] Unexpected error during transformation:', e);
    return {
      success: false,
      data: null,
      type: schemaType || '',
      rowCount: rows ? rows.length : 0,
      error: `An unexpected error occurred during data transformation: ${e.message || 'Unknown error'}`,
    };
  }
};

/**
 * Convenience method: parse, validate, and transform a file in a single call.
 * Combines parse → validate → toDashboardData into one pipeline.
 *
 * @param {File} file - The file to process.
 * @param {string} schemaType - The schema type key ('metrics', 'incidents', 'deployments').
 * @param {Object} [options] - Processing options.
 * @param {number} [options.maxErrors=100] - Maximum number of validation errors to collect.
 * @param {boolean} [options.strictColumns=false] - If true, unknown columns produce errors.
 * @returns {Promise<{ success: boolean, data: Object|null, type: string, rowCount: number, errors: Object[], warnings: Object[] }>}
 *   Full pipeline result with transformed data, errors, and warnings.
 */
const processFile = async (file, schemaType, options = {}) => {
  try {
    // Step 1: Parse
    const parseResult = await parse(file);

    if (!parseResult.success) {
      return {
        success: false,
        data: null,
        type: schemaType || '',
        rowCount: 0,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
      };
    }

    // Step 2: Validate
    const validationResult = validate(parseResult.rows, schemaType, options);

    if (!validationResult.valid) {
      return {
        success: false,
        data: null,
        type: schemaType || '',
        rowCount: parseResult.rows.length,
        errors: validationResult.errors,
        warnings: [
          ...parseResult.warnings,
          ...validationResult.warnings,
        ],
      };
    }

    // Step 3: Transform
    const transformResult = toDashboardData(parseResult.rows, schemaType);

    if (!transformResult.success) {
      return {
        success: false,
        data: null,
        type: schemaType || '',
        rowCount: parseResult.rows.length,
        errors: [{ row: null, message: transformResult.error, code: 'TRANSFORM_ERROR' }],
        warnings: [
          ...parseResult.warnings,
          ...validationResult.warnings,
        ],
      };
    }

    return {
      success: true,
      data: transformResult.data,
      type: transformResult.type,
      rowCount: transformResult.rowCount,
      errors: [],
      warnings: [
        ...parseResult.warnings,
        ...validationResult.warnings,
      ],
    };
  } catch (e) {
    console.error('[csvAdapter] Unexpected error in processFile:', e);
    return {
      success: false,
      data: null,
      type: schemaType || '',
      rowCount: 0,
      errors: [
        {
          row: null,
          message: `An unexpected error occurred: ${e.message || 'Unknown error'}`,
          code: 'PROCESS_UNEXPECTED_ERROR',
        },
      ],
      warnings: [],
    };
  }
};

export {
  parse,
  validate,
  toDashboardData,
  processFile,
  getFileCategory,
};
