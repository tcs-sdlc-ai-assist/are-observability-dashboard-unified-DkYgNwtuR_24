import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useDashboard } from '../../contexts/DashboardContext';
import { useToast } from '../shared/ToastNotification';
import { StatusBadge } from '../shared/StatusBadge';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { DataTable } from '../shared/DataTable';
import { RoleGate } from '../auth/RoleGate';
import { PERMISSIONS } from '../../constants/roles';
import { parse, validate, toDashboardData, getFileCategory } from '../../services/csvAdapter';
import {
  MAX_FILE_SIZE_BYTES,
  ALL_ALLOWED_EXTENSIONS,
} from '../../utils/validators';
import { logAction, AUDIT_ACTIONS, AUDIT_RESULTS } from '../../services/auditLogger';
import { formatNumber } from '../../utils/formatters';

/**
 * Upload step constants.
 */
const UPLOAD_STEPS = Object.freeze({
  SELECT: 'select',
  PARSING: 'parsing',
  PREVIEW: 'preview',
  VALIDATING: 'validating',
  UPLOADING: 'uploading',
  COMPLETE: 'complete',
  ERROR: 'error',
});

/**
 * Schema type options for the upload.
 */
const SCHEMA_TYPE_OPTIONS = Object.freeze([
  { value: 'metrics', label: 'Service Metrics', description: 'Availability, golden signals, error budgets' },
  { value: 'incidents', label: 'Incidents', description: 'Incident records with severity, RCA, MTTR' },
  { value: 'deployments', label: 'Deployments', description: 'Deployment events with version, status, rollback' },
]);

/**
 * Upload mode options.
 */
const UPLOAD_MODE_OPTIONS = Object.freeze([
  { value: 'merge', label: 'Merge', description: 'Append new records and update existing ones' },
  { value: 'replace', label: 'Replace', description: 'Overwrite all existing data of this type' },
]);

/**
 * Maximum number of preview rows to display.
 */
const MAX_PREVIEW_ROWS = 50;

/**
 * FileUploader - Admin file upload component with drag-and-drop zone, file type
 * validation (CSV/Excel), size limit (10MB), progress indicator, and preview of
 * parsed data before commit. Uses csvAdapter for parsing and validation.
 *
 * Features:
 * - Drag-and-drop file upload zone with visual feedback
 * - Click-to-browse file selection
 * - File type validation (CSV, XLSX, XLS)
 * - File size validation (10MB limit)
 * - Schema type selector (metrics, incidents, deployments)
 * - Upload mode selector (merge or replace)
 * - Parsing progress indicator
 * - Data preview table with parsed rows before commit
 * - Validation error and warning display
 * - Commit/cancel actions
 * - Upload result summary with row count and errors
 * - Gated by UPLOAD_DATA permission
 * - All upload actions logged to audit trail
 * - Responsive layout with accessible ARIA attributes
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {string} [props.defaultSchemaType='metrics'] - Default schema type selection.
 * @param {Function} [props.onUploadComplete] - Callback fired after a successful upload. Receives the upload result.
 * @returns {React.ReactNode}
 */
const FileUploader = ({
  className = '',
  defaultSchemaType = 'metrics',
  onUploadComplete,
}) => {
  const { currentUser } = useAuth();
  const { canUpload } = usePermissions();
  const { uploadData } = useDashboard();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const [step, setStep] = useState(UPLOAD_STEPS.SELECT);
  const [selectedFile, setSelectedFile] = useState(null);
  const [schemaType, setSchemaType] = useState(defaultSchemaType);
  const [uploadMode, setUploadMode] = useState('merge');
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseMeta, setParseMeta] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  /**
   * Reset the uploader to the initial state.
   */
  const resetUploader = useCallback(() => {
    setStep(UPLOAD_STEPS.SELECT);
    setSelectedFile(null);
    setParsedRows([]);
    setParseMeta(null);
    setParseErrors([]);
    setParseWarnings([]);
    setValidationErrors([]);
    setValidationWarnings([]);
    setUploadResult(null);
    setProgress(0);
    setIsDragOver(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Format file size in human-readable format.
   * @param {number} bytes - File size in bytes.
   * @returns {string} Formatted file size string.
   */
  const formatFileSize = useCallback((bytes) => {
    if (bytes == null || isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }, []);

  /**
   * Validate a file before processing.
   * @param {File} file - The file to validate.
   * @returns {{ valid: boolean, error: string|null }}
   */
  const validateSelectedFile = useCallback((file) => {
    if (!file) {
      return { valid: false, error: 'No file selected.' };
    }

    if (file.size === 0) {
      return { valid: false, error: 'File is empty (0 bytes).' };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const maxMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      const fileMB = (file.size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File size (${fileMB} MB) exceeds the maximum allowed size of ${maxMB} MB.`,
      };
    }

    const fileCategory = getFileCategory(file.name);
    if (!fileCategory) {
      return {
        valid: false,
        error: `Unsupported file type. Allowed types: ${ALL_ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    return { valid: true, error: null };
  }, []);

  /**
   * Handle file selection from the file input or drag-and-drop.
   * @param {File} file - The selected file.
   */
  const handleFileSelected = useCallback(
    async (file) => {
      if (!canUpload) {
        toastError('You do not have permission to upload data.');
        return;
      }

      const validation = validateSelectedFile(file);
      if (!validation.valid) {
        toastError(validation.error);
        return;
      }

      setSelectedFile(file);
      setStep(UPLOAD_STEPS.PARSING);
      setProgress(10);
      setParseErrors([]);
      setParseWarnings([]);
      setValidationErrors([]);
      setValidationWarnings([]);

      try {
        // Step 1: Parse the file
        setProgress(30);
        const parseResult = await parse(file);

        if (!parseResult.success) {
          setParseErrors(parseResult.errors);
          setParseWarnings(parseResult.warnings);
          setStep(UPLOAD_STEPS.ERROR);
          setProgress(0);
          return;
        }

        setProgress(60);

        // Step 2: Validate against schema
        const validationResult = validate(parseResult.rows, schemaType);

        setProgress(80);

        if (!validationResult.valid) {
          setValidationErrors(validationResult.errors);
          setValidationWarnings([
            ...parseResult.warnings,
            ...validationResult.warnings,
          ]);
          setStep(UPLOAD_STEPS.ERROR);
          setProgress(0);
          return;
        }

        // Step 3: Show preview
        setParsedRows(parseResult.rows);
        setParseMeta(parseResult.meta);
        setParseWarnings(parseResult.warnings);
        setValidationWarnings(validationResult.warnings);
        setProgress(100);
        setStep(UPLOAD_STEPS.PREVIEW);
      } catch (e) {
        console.error('[FileUploader] Parse/validate failed:', e);
        setParseErrors([
          {
            row: null,
            message: `An unexpected error occurred: ${e.message || 'Unknown error'}`,
            code: 'UNEXPECTED_ERROR',
          },
        ]);
        setStep(UPLOAD_STEPS.ERROR);
        setProgress(0);
      }
    },
    [canUpload, schemaType, validateSelectedFile, toastError],
  );

  /**
   * Handle the file input change event.
   */
  const handleFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelected(file);
      }
    },
    [handleFileSelected],
  );

  /**
   * Handle click on the drop zone to open the file browser.
   */
  const handleDropZoneClick = useCallback(() => {
    if (step !== UPLOAD_STEPS.SELECT) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [step]);

  /**
   * Handle drag over event on the drop zone.
   */
  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (step !== UPLOAD_STEPS.SELECT) return;
      setIsDragOver(true);
    },
    [step],
  );

  /**
   * Handle drag enter event on the drop zone.
   */
  const handleDragEnter = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (step !== UPLOAD_STEPS.SELECT) return;
      setIsDragOver(true);
    },
    [step],
  );

  /**
   * Handle drag leave event on the drop zone.
   */
  const handleDragLeave = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    [],
  );

  /**
   * Handle drop event on the drop zone.
   */
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (step !== UPLOAD_STEPS.SELECT) return;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFileSelected(files[0]);
      }
    },
    [step, handleFileSelected],
  );

  /**
   * Handle schema type change.
   */
  const handleSchemaTypeChange = useCallback((type) => {
    setSchemaType(type);
  }, []);

  /**
   * Handle upload mode change.
   */
  const handleUploadModeChange = useCallback((mode) => {
    setUploadMode(mode);
  }, []);

  /**
   * Commit the parsed data to the dashboard.
   */
  const handleCommit = useCallback(async () => {
    if (!canUpload) {
      toastError('You do not have permission to upload data.');
      return;
    }

    if (!parsedRows || parsedRows.length === 0) {
      toastError('No data to upload.');
      return;
    }

    setStep(UPLOAD_STEPS.UPLOADING);
    setProgress(20);

    try {
      const userId = currentUser?.id || 'unknown';
      const userName = currentUser?.name || 'Unknown User';
      const userEmail = currentUser?.email || '';

      setProgress(50);

      const result = await uploadData(
        {
          type: schemaType,
          rows: parsedRows,
        },
        { mode: uploadMode },
      );

      setProgress(100);
      setUploadResult(result);

      if (result.status === 'success') {
        setStep(UPLOAD_STEPS.COMPLETE);

        logAction(userId, AUDIT_ACTIONS.UPLOAD_DATA, schemaType, {
          user_name: userName,
          user_email: userEmail,
          status: AUDIT_RESULTS.SUCCESS,
          description: `Uploaded ${result.rowsImported} ${schemaType} rows (${uploadMode} mode) from "${selectedFile?.name || 'unknown'}"`,
          details: {
            file_name: selectedFile?.name,
            file_size: selectedFile?.size,
            schema_type: schemaType,
            upload_mode: uploadMode,
            rows_imported: result.rowsImported,
            warnings_count: result.warnings?.length || 0,
          },
        });

        toastSuccess(
          `Successfully uploaded ${result.rowsImported} ${schemaType} records.`,
        );

        if (onUploadComplete && typeof onUploadComplete === 'function') {
          onUploadComplete(result);
        }
      } else {
        setStep(UPLOAD_STEPS.ERROR);
        setParseErrors(
          (result.errors || []).map((err) => ({
            row: err.row,
            message: err.error || err.message || 'Unknown error',
          })),
        );

        logAction(userId, AUDIT_ACTIONS.UPLOAD_DATA, schemaType, {
          user_name: userName,
          user_email: userEmail,
          status: AUDIT_RESULTS.FAILURE,
          description: `Upload failed for ${schemaType} from "${selectedFile?.name || 'unknown'}"`,
          details: {
            file_name: selectedFile?.name,
            schema_type: schemaType,
            upload_mode: uploadMode,
            error_count: result.errors?.length || 0,
          },
        });

        toastError('Upload failed. Please review the errors and try again.');
      }
    } catch (e) {
      console.error('[FileUploader] Commit failed:', e);
      setStep(UPLOAD_STEPS.ERROR);
      setParseErrors([
        {
          row: null,
          message: `An unexpected error occurred during upload: ${e.message || 'Unknown error'}`,
        },
      ]);
      toastError('An unexpected error occurred during upload.');
    }
  }, [
    canUpload,
    parsedRows,
    schemaType,
    uploadMode,
    selectedFile,
    currentUser,
    uploadData,
    onUploadComplete,
    toastSuccess,
    toastError,
  ]);

  /**
   * Preview columns for the data table based on schema type.
   */
  const previewColumns = useMemo(() => {
    if (!parsedRows || parsedRows.length === 0) return [];

    const keys = Object.keys(parsedRows[0]);
    const maxColumns = 8;
    const displayKeys = keys.slice(0, maxColumns);

    return displayKeys.map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      sortable: true,
      width: `${Math.max(10, Math.floor(100 / displayKeys.length))}%`,
      render: (value) => {
        if (value == null || value === '') return <span className="text-dashboard-text-muted">—</span>;
        const strValue = String(value);
        if (strValue.length > 60) {
          return (
            <span className="text-sm text-dashboard-text-secondary truncate block max-w-[200px]" title={strValue}>
              {strValue.slice(0, 60)}…
            </span>
          );
        }
        return <span className="text-sm text-dashboard-text-secondary">{strValue}</span>;
      },
    }));
  }, [parsedRows]);

  /**
   * Preview data limited to MAX_PREVIEW_ROWS.
   */
  const previewData = useMemo(() => {
    if (!parsedRows || parsedRows.length === 0) return [];
    return parsedRows.slice(0, MAX_PREVIEW_ROWS).map((row, idx) => ({
      ...row,
      _preview_id: `row-${idx}`,
    }));
  }, [parsedRows]);

  /**
   * All combined errors for display.
   */
  const allErrors = useMemo(() => {
    return [...parseErrors, ...validationErrors];
  }, [parseErrors, validationErrors]);

  /**
   * All combined warnings for display.
   */
  const allWarnings = useMemo(() => {
    return [...parseWarnings, ...validationWarnings];
  }, [parseWarnings, validationWarnings]);

  /**
   * Get the selected schema type config.
   */
  const selectedSchemaConfig = useMemo(() => {
    return SCHEMA_TYPE_OPTIONS.find((opt) => opt.value === schemaType) || SCHEMA_TYPE_OPTIONS[0];
  }, [schemaType]);

  /**
   * Get the file category label.
   */
  const fileCategoryLabel = useMemo(() => {
    if (!selectedFile) return '';
    const category = getFileCategory(selectedFile.name);
    return category === 'csv' ? 'CSV' : category === 'excel' ? 'Excel' : 'Unknown';
  }, [selectedFile]);

  /**
   * Determine if the current step allows going back to file selection.
   */
  const canGoBack = useMemo(() => {
    return [UPLOAD_STEPS.PREVIEW, UPLOAD_STEPS.ERROR, UPLOAD_STEPS.COMPLETE].includes(step);
  }, [step]);

  /**
   * Determine if the commit button should be enabled.
   */
  const canCommit = useMemo(() => {
    return (
      step === UPLOAD_STEPS.PREVIEW &&
      parsedRows.length > 0 &&
      allErrors.length === 0
    );
  }, [step, parsedRows, allErrors]);

  // Permission check
  if (!canUpload) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-access"
          title="Upload Access Required"
          description="You do not have permission to upload data. Contact an ARE Lead or Admin for access."
          size="md"
        />
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="dashboard-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 flex-shrink-0">
              <svg
                className="w-4 h-4 text-brand-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Upload Interim Data
              </h3>
              <p className="text-xs text-dashboard-text-muted mt-0.5">
                Import CSV or Excel files to populate dashboard metrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs text-dashboard-text-muted">
              {step === UPLOAD_STEPS.SELECT && (
                <StatusBadge status="unknown" size="sm" label="Select File" />
              )}
              {step === UPLOAD_STEPS.PARSING && (
                <StatusBadge status="warning" size="sm" label="Parsing…" />
              )}
              {step === UPLOAD_STEPS.PREVIEW && (
                <StatusBadge status="healthy" size="sm" label="Ready to Upload" />
              )}
              {step === UPLOAD_STEPS.VALIDATING && (
                <StatusBadge status="warning" size="sm" label="Validating…" />
              )}
              {step === UPLOAD_STEPS.UPLOADING && (
                <StatusBadge status="warning" size="sm" label="Uploading…" />
              )}
              {step === UPLOAD_STEPS.COMPLETE && (
                <StatusBadge status="healthy" size="sm" label="Complete" />
              )}
              {step === UPLOAD_STEPS.ERROR && (
                <StatusBadge status="critical" size="sm" label="Error" />
              )}
            </div>

            {/* Reset button */}
            {canGoBack && (
              <button
                onClick={resetUploader}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 transition-colors duration-150"
                aria-label="Start over"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
                  />
                </svg>
                Start Over
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {(step === UPLOAD_STEPS.PARSING || step === UPLOAD_STEPS.UPLOADING) && (
          <div className="px-4 py-2 border-b border-dashboard-border bg-gray-50/30">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full overflow-hidden bg-gray-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-dashboard-text-muted min-w-[36px] text-right">
                {progress}%
              </span>
            </div>
            <p className="text-xs text-dashboard-text-muted mt-1">
              {step === UPLOAD_STEPS.PARSING
                ? 'Parsing and validating file…'
                : 'Uploading data to dashboard…'}
            </p>
          </div>
        )}

        {/* Content Area */}
        <div className="p-4">
          {/* ─── Step: SELECT ─────────────────────────────────────────── */}
          {step === UPLOAD_STEPS.SELECT && (
            <div className="space-y-4">
              {/* Schema Type Selector */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-2">
                  Data Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SCHEMA_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSchemaTypeChange(option.value)}
                      className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border-2 text-left transition-colors duration-150 ${
                        schemaType === option.value
                          ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                          : 'border-dashboard-border hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      aria-pressed={schemaType === option.value}
                      aria-label={`Select ${option.label} data type`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          schemaType === option.value
                            ? 'text-brand-700'
                            : 'text-dashboard-text-primary'
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="text-[10px] text-dashboard-text-muted leading-tight">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload Mode Selector */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-2">
                  Upload Mode
                </label>
                <div className="flex items-center gap-2">
                  {UPLOAD_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleUploadModeChange(option.value)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                        uploadMode === option.value
                          ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                          : 'bg-gray-50 text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary'
                      }`}
                      aria-pressed={uploadMode === option.value}
                      aria-label={`${option.label}: ${option.description}`}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  ))}
                  <span className="text-xs text-dashboard-text-muted ml-1">
                    {UPLOAD_MODE_OPTIONS.find((o) => o.value === uploadMode)?.description}
                  </span>
                </div>
              </div>

              {/* Drop Zone */}
              <div
                ref={dropZoneRef}
                onClick={handleDropZoneClick}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center gap-3 px-6 py-12 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                  isDragOver
                    ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-500/10'
                    : 'border-dashboard-border hover:border-brand-300 hover:bg-gray-50/50'
                }`}
                role="button"
                tabIndex={0}
                aria-label="Drop a file here or click to browse"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleDropZoneClick();
                  }
                }}
              >
                <div
                  className={`flex items-center justify-center w-14 h-14 rounded-full transition-colors duration-200 ${
                    isDragOver ? 'bg-brand-100' : 'bg-gray-100'
                  }`}
                >
                  <svg
                    className={`w-7 h-7 transition-colors duration-200 ${
                      isDragOver ? 'text-brand-600' : 'text-dashboard-text-muted'
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                </div>

                <div className="text-center">
                  <p
                    className={`text-sm font-medium transition-colors duration-200 ${
                      isDragOver ? 'text-brand-700' : 'text-dashboard-text-primary'
                    }`}
                  >
                    {isDragOver ? 'Drop file here' : 'Drag & drop a file here'}
                  </p>
                  <p className="text-xs text-dashboard-text-muted mt-1">
                    or{' '}
                    <span className="text-brand-600 font-medium">click to browse</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-dashboard-text-muted">
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                    CSV, XLSX, XLS
                  </span>
                  <span>•</span>
                  <span>Max {(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB</span>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALL_ALLOWED_EXTENSIONS.join(',')}
                  onChange={handleFileInputChange}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            </div>
          )}

          {/* ─── Step: PARSING ────────────────────────────────────────── */}
          {step === UPLOAD_STEPS.PARSING && (
            <div className="flex flex-col items-center gap-4 py-12">
              <LoadingSpinner message="Parsing file…" size="md" />
              {selectedFile && (
                <div className="flex items-center gap-2 text-xs text-dashboard-text-muted">
                  <span className="font-medium text-dashboard-text-secondary">
                    {selectedFile.name}
                  </span>
                  <span>•</span>
                  <span>{formatFileSize(selectedFile.size)}</span>
                </div>
              )}
            </div>
          )}

          {/* ─── Step: PREVIEW ────────────────────────────────────────── */}
          {step === UPLOAD_STEPS.PREVIEW && (
            <div className="space-y-4">
              {/* File Info Summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg bg-green-50/50 border border-green-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 flex-shrink-0">
                    <svg
                      className="w-4 h-4 text-status-healthy"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-dashboard-text-primary">
                      File parsed successfully
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-dashboard-text-muted">
                      <span className="font-medium text-dashboard-text-secondary">
                        {selectedFile?.name}
                      </span>
                      <span>{formatFileSize(selectedFile?.size)}</span>
                      <span>{fileCategoryLabel}</span>
                      <span>
                        <span className="font-semibold text-dashboard-text-primary">
                          {formatNumber(parsedRows.length, { decimals: 0 })}
                        </span>{' '}
                        rows
                      </span>
                      {parseMeta?.fields && (
                        <span>{parseMeta.fields.length} columns</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800">
                    {selectedSchemaConfig.label}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {uploadMode === 'merge' ? 'Merge' : 'Replace'}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {allWarnings.length > 0 && (
                <div className="px-4 py-3 rounded-lg bg-yellow-50/50 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-4 h-4 text-status-degraded flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-yellow-800">
                      {allWarnings.length} warning{allWarnings.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto scrollbar-thin">
                    {allWarnings.slice(0, 10).map((warning, idx) => (
                      <p key={idx} className="text-xs text-yellow-700">
                        {warning.row != null && (
                          <span className="font-medium">Row {warning.row}: </span>
                        )}
                        {warning.message}
                      </p>
                    ))}
                    {allWarnings.length > 10 && (
                      <p className="text-xs text-yellow-600 italic">
                        …and {allWarnings.length - 10} more warnings
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Data Preview Table */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
                    Data Preview
                  </h4>
                  <span className="text-xs text-dashboard-text-muted">
                    Showing {Math.min(parsedRows.length, MAX_PREVIEW_ROWS)} of{' '}
                    {formatNumber(parsedRows.length, { decimals: 0 })} rows
                  </span>
                </div>

                <div className="border border-dashboard-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto scrollbar-thin" style={{ maxHeight: '360px' }}>
                    <table className="w-full text-sm" role="grid">
                      <thead>
                        <tr className="border-b border-dashboard-border bg-gray-50/50">
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-center w-12">
                            #
                          </th>
                          {previewColumns.map((col) => (
                            <th
                              key={col.key}
                              className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted text-left"
                              scope="col"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dashboard-border">
                        {previewData.map((row, rowIdx) => (
                          <tr
                            key={row._preview_id}
                            className="hover:bg-gray-50/50 transition-colors duration-150"
                          >
                            <td className="px-3 py-2 text-xs text-dashboard-text-muted text-center">
                              {rowIdx + 1}
                            </td>
                            {previewColumns.map((col) => (
                              <td key={col.key} className="px-3 py-2">
                                {col.render
                                  ? col.render(row[col.key], row, rowIdx)
                                  : row[col.key] != null
                                    ? String(row[col.key])
                                    : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {parsedRows.length > MAX_PREVIEW_ROWS && (
                  <p className="text-xs text-dashboard-text-muted mt-2 text-center">
                    Preview limited to {MAX_PREVIEW_ROWS} rows.{' '}
                    {formatNumber(parsedRows.length - MAX_PREVIEW_ROWS, { decimals: 0 })}{' '}
                    additional rows will be uploaded.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={resetUploader}
                  className="px-4 py-2 text-sm font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={!canCommit}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors duration-150 ${
                    canCommit
                      ? 'bg-brand-600 hover:bg-brand-700'
                      : 'bg-brand-400 cursor-not-allowed opacity-60'
                  }`}
                  aria-label={`Upload ${formatNumber(parsedRows.length, { decimals: 0 })} ${schemaType} records`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  Upload {formatNumber(parsedRows.length, { decimals: 0 })} Records
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: UPLOADING ──────────────────────────────────────── */}
          {step === UPLOAD_STEPS.UPLOADING && (
            <div className="flex flex-col items-center gap-4 py-12">
              <LoadingSpinner message="Uploading data to dashboard…" size="md" />
              <div className="flex items-center gap-2 text-xs text-dashboard-text-muted">
                <span>
                  {formatNumber(parsedRows.length, { decimals: 0 })} {schemaType} records
                </span>
                <span>•</span>
                <span>{uploadMode === 'merge' ? 'Merge' : 'Replace'} mode</span>
              </div>
            </div>
          )}

          {/* ─── Step: COMPLETE ───────────────────────────────────────── */}
          {step === UPLOAD_STEPS.COMPLETE && uploadResult && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-50">
                  <svg
                    className="w-8 h-8 text-status-healthy"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-dashboard-text-primary">
                  Upload Complete
                </h4>
                <p className="text-sm text-dashboard-text-secondary text-center max-w-md">
                  Successfully imported{' '}
                  <span className="font-semibold text-dashboard-text-primary">
                    {formatNumber(uploadResult.rowsImported, { decimals: 0 })}
                  </span>{' '}
                  {schemaType} records from{' '}
                  <span className="font-medium">{selectedFile?.name}</span>.
                </p>

                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-dashboard-text-muted">
                  <span>
                    Mode:{' '}
                    <span className="font-medium text-dashboard-text-secondary">
                      {uploadMode === 'merge' ? 'Merge' : 'Replace'}
                    </span>
                  </span>
                  <span>
                    Type:{' '}
                    <span className="font-medium text-dashboard-text-secondary">
                      {selectedSchemaConfig.label}
                    </span>
                  </span>
                  {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                    <span className="text-status-degraded font-medium">
                      {uploadResult.warnings.length} warning{uploadResult.warnings.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Upload result warnings */}
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <div className="px-4 py-3 rounded-lg bg-yellow-50/50 border border-yellow-200">
                  <h5 className="text-xs font-semibold text-yellow-800 mb-1.5">
                    Warnings ({uploadResult.warnings.length})
                  </h5>
                  <div className="flex flex-col gap-1 max-h-24 overflow-y-auto scrollbar-thin">
                    {uploadResult.warnings.slice(0, 5).map((warning, idx) => (
                      <p key={idx} className="text-xs text-yellow-700">
                        {warning.row != null && (
                          <span className="font-medium">Row {warning.row}: </span>
                        )}
                        {warning.error || warning.message}
                      </p>
                    ))}
                    {uploadResult.warnings.length > 5 && (
                      <p className="text-xs text-yellow-600 italic">
                        …and {uploadResult.warnings.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={resetUploader}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors duration-150"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  Upload Another File
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: ERROR ──────────────────────────────────────────── */}
          {step === UPLOAD_STEPS.ERROR && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50">
                  <svg
                    className="w-7 h-7 text-severity-critical"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <h4 className="text-base font-semibold text-dashboard-text-primary">
                  Upload Failed
                </h4>
                <p className="text-sm text-dashboard-text-secondary text-center max-w-md">
                  The file could not be processed. Please review the errors below and try again.
                </p>
              </div>

              {/* Errors */}
              {allErrors.length > 0 && (
                <div className="px-4 py-3 rounded-lg bg-red-50/50 border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-4 h-4 text-severity-critical flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-red-800">
                      {allErrors.length} error{allErrors.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {allErrors.slice(0, 20).map((error, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 px-2 py-1.5 rounded bg-white/50 border border-red-100"
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-severity-critical flex-shrink-0 mt-1.5" />
                        <div className="min-w-0">
                          {error.row != null && (
                            <span className="text-xs font-semibold text-red-700 mr-1">
                              Row {error.row}:
                            </span>
                          )}
                          {error.field && (
                            <span className="text-xs font-medium text-red-600 mr-1">
                              [{error.field}]
                            </span>
                          )}
                          <span className="text-xs text-red-700">
                            {error.message}
                          </span>
                        </div>
                      </div>
                    ))}
                    {allErrors.length > 20 && (
                      <p className="text-xs text-red-600 italic px-2 py-1">
                        …and {allErrors.length - 20} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Warnings in error state */}
              {allWarnings.length > 0 && (
                <div className="px-4 py-3 rounded-lg bg-yellow-50/50 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-yellow-800">
                      {allWarnings.length} warning{allWarnings.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-24 overflow-y-auto scrollbar-thin">
                    {allWarnings.slice(0, 5).map((warning, idx) => (
                      <p key={idx} className="text-xs text-yellow-700">
                        {warning.row != null && (
                          <span className="font-medium">Row {warning.row}: </span>
                        )}
                        {warning.message}
                      </p>
                    ))}
                    {allWarnings.length > 5 && (
                      <p className="text-xs text-yellow-600 italic">
                        …and {allWarnings.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* File info */}
              {selectedFile && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-50 border border-dashboard-border text-xs text-dashboard-text-muted">
                  <span className="font-medium text-dashboard-text-secondary">
                    {selectedFile.name}
                  </span>
                  <span>{formatFileSize(selectedFile.size)}</span>
                  <span>{fileCategoryLabel}</span>
                  <span>Schema: {selectedSchemaConfig.label}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={resetUploader}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors duration-150"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
                    />
                  </svg>
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Supported: {ALL_ALLOWED_EXTENSIONS.join(', ')}
            </span>
            <span>•</span>
            <span>
              Max size: {(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            {selectedFile && (
              <span>
                File:{' '}
                <span className="font-medium text-dashboard-text-secondary">
                  {selectedFile.name}
                </span>
              </span>
            )}
            <span>
              Type:{' '}
              <span className="font-medium text-dashboard-text-secondary">
                {selectedSchemaConfig.label}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { FileUploader, UPLOAD_STEPS, SCHEMA_TYPE_OPTIONS, UPLOAD_MODE_OPTIONS };
export default FileUploader;