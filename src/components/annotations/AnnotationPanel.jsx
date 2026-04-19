import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useDashboard } from '../../contexts/DashboardContext';
import { useToast } from '../shared/ToastNotification';
import { StatusBadge } from '../shared/StatusBadge';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { RoleGate } from '../auth/RoleGate';
import { PERMISSIONS, ROLES } from '../../constants/roles';
import {
  SEVERITY_LEVELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { logAction, AUDIT_ACTIONS, AUDIT_RESULTS } from '../../services/auditLogger';
import { getItem, setItem } from '../../utils/storage';
import { formatTimestamp } from '../../utils/formatters';
import { getRelativeTime } from '../../utils/dateUtils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Storage key for persisting annotations in localStorage.
 */
const ANNOTATIONS_STORAGE_KEY = 'annotations';

/**
 * Maximum character length for annotation text.
 */
const MAX_ANNOTATION_LENGTH = 2000;

/**
 * Annotation type constants.
 */
const ANNOTATION_TYPES = Object.freeze({
  RISK_NOTE: 'risk_note',
  OBSERVATION: 'observation',
  ACTION_ITEM: 'action_item',
  GENERAL: 'general',
});

/**
 * Annotation type labels for display.
 */
const ANNOTATION_TYPE_LABELS = Object.freeze({
  [ANNOTATION_TYPES.RISK_NOTE]: 'Risk Note',
  [ANNOTATION_TYPES.OBSERVATION]: 'Observation',
  [ANNOTATION_TYPES.ACTION_ITEM]: 'Action Item',
  [ANNOTATION_TYPES.GENERAL]: 'General',
});

/**
 * Annotation type color classes.
 */
const ANNOTATION_TYPE_COLORS = Object.freeze({
  [ANNOTATION_TYPES.RISK_NOTE]: 'bg-red-50 text-red-800',
  [ANNOTATION_TYPES.OBSERVATION]: 'bg-blue-50 text-blue-800',
  [ANNOTATION_TYPES.ACTION_ITEM]: 'bg-yellow-50 text-yellow-800',
  [ANNOTATION_TYPES.GENERAL]: 'bg-gray-100 text-gray-700',
});

/**
 * Retrieve all annotations from localStorage.
 * @returns {Object[]} Array of annotation objects.
 */
const getAllAnnotations = () => {
  const annotations = getItem(ANNOTATIONS_STORAGE_KEY, []);
  if (!Array.isArray(annotations)) {
    return [];
  }
  return annotations;
};

/**
 * Persist annotations to localStorage.
 * @param {Object[]} annotations - Array of annotation objects.
 * @returns {boolean} True if persisted successfully.
 */
const persistAnnotations = (annotations) => {
  if (!annotations || !Array.isArray(annotations)) {
    return false;
  }
  return setItem(ANNOTATIONS_STORAGE_KEY, annotations);
};

/**
 * AnnotationPanel - Side panel component for ARE Leads to add, edit, and view
 * annotations and risk notes on services or incidents.
 *
 * Features:
 * - Text input for annotation content with character count
 * - Severity selector (P1–P4) for risk classification
 * - Annotation type selector (Risk Note, Observation, Action Item, General)
 * - Save and cancel buttons with validation
 * - List of existing annotations for the selected resource
 * - Edit and delete existing annotations
 * - Gated by ANNOTATE permission (ARE_LEAD and ADMIN roles)
 * - All create/edit/delete actions logged to audit trail
 * - Close button to dismiss the panel
 * - Loading and empty states
 * - Responsive layout with compact mode support
 *
 * @param {Object} props
 * @param {string} [props.resourceType='service'] - The type of resource being annotated ('service' or 'incident').
 * @param {string} [props.resourceId] - The ID of the resource being annotated.
 * @param {string} [props.resourceName] - The display name of the resource.
 * @param {boolean} [props.isOpen=false] - Whether the panel is currently open/visible.
 * @param {Function} [props.onClose] - Callback to close the panel.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @returns {React.ReactNode}
 */
const AnnotationPanel = ({
  resourceType = 'service',
  resourceId,
  resourceName,
  isOpen = false,
  onClose,
  compact = false,
  className = '',
}) => {
  const { currentUser } = useAuth();
  const { canAnnotate, isAuthenticated } = usePermissions();
  const { success: toastSuccess, error: toastError } = useToast();

  const [annotations, setAnnotations] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState(null);
  const [formText, setFormText] = useState('');
  const [formSeverity, setFormSeverity] = useState(SEVERITY_LEVELS.P3);
  const [formType, setFormType] = useState(ANNOTATION_TYPES.GENERAL);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(null);
  const textareaRef = useRef(null);
  const panelRef = useRef(null);

  /**
   * Load annotations for the current resource from localStorage.
   */
  const loadAnnotations = useCallback(() => {
    if (!resourceId) {
      setAnnotations([]);
      return;
    }

    const allAnnotations = getAllAnnotations();
    const resourceAnnotations = allAnnotations
      .filter(
        (a) =>
          a.resource_id === resourceId && a.resource_type === resourceType,
      )
      .sort((a, b) => {
        const dateA = a.updated_at
          ? new Date(a.updated_at).getTime()
          : new Date(a.created_at).getTime();
        const dateB = b.updated_at
          ? new Date(b.updated_at).getTime()
          : new Date(b.created_at).getTime();
        return dateB - dateA;
      });

    setAnnotations(resourceAnnotations);
  }, [resourceId, resourceType]);

  /**
   * Reload annotations when the resource changes or the panel opens.
   */
  useEffect(() => {
    if (isOpen && resourceId) {
      loadAnnotations();
    }
  }, [isOpen, resourceId, loadAnnotations]);

  /**
   * Focus the textarea when entering edit/create mode.
   */
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  /**
   * Close panel on Escape key.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isEditing) {
          handleCancelEdit();
        } else if (onClose && typeof onClose === 'function') {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isEditing, onClose]);

  /**
   * Handle close button click.
   */
  const handleClose = useCallback(() => {
    if (isEditing) {
      handleCancelEdit();
    }
    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  }, [isEditing, onClose]);

  /**
   * Reset the form to its default state.
   */
  const resetForm = useCallback(() => {
    setFormText('');
    setFormSeverity(SEVERITY_LEVELS.P3);
    setFormType(ANNOTATION_TYPES.GENERAL);
    setEditingAnnotationId(null);
    setIsEditing(false);
  }, []);

  /**
   * Start creating a new annotation.
   */
  const handleStartCreate = useCallback(() => {
    resetForm();
    setIsEditing(true);
  }, [resetForm]);

  /**
   * Start editing an existing annotation.
   * @param {Object} annotation - The annotation to edit.
   */
  const handleStartEdit = useCallback((annotation) => {
    if (!annotation) return;

    setFormText(annotation.text || '');
    setFormSeverity(annotation.severity || SEVERITY_LEVELS.P3);
    setFormType(annotation.annotation_type || ANNOTATION_TYPES.GENERAL);
    setEditingAnnotationId(annotation.annotation_id);
    setIsEditing(true);
  }, []);

  /**
   * Cancel the current edit/create operation.
   */
  const handleCancelEdit = useCallback(() => {
    resetForm();
  }, [resetForm]);

  /**
   * Handle text input change.
   */
  const handleTextChange = useCallback((e) => {
    const value = e.target.value;
    if (value.length <= MAX_ANNOTATION_LENGTH) {
      setFormText(value);
    }
  }, []);

  /**
   * Handle severity selection change.
   */
  const handleSeverityChange = useCallback((severity) => {
    setFormSeverity(severity);
  }, []);

  /**
   * Handle annotation type selection change.
   */
  const handleTypeChange = useCallback((type) => {
    setFormType(type);
  }, []);

  /**
   * Validate the form before saving.
   * @returns {{ valid: boolean, error: string|null }}
   */
  const validateForm = useCallback(() => {
    if (!formText || formText.trim().length === 0) {
      return { valid: false, error: 'Annotation text is required.' };
    }

    if (formText.trim().length < 3) {
      return { valid: false, error: 'Annotation text must be at least 3 characters.' };
    }

    if (formText.length > MAX_ANNOTATION_LENGTH) {
      return {
        valid: false,
        error: `Annotation text must not exceed ${MAX_ANNOTATION_LENGTH} characters.`,
      };
    }

    if (!resourceId) {
      return { valid: false, error: 'No resource selected for annotation.' };
    }

    return { valid: true, error: null };
  }, [formText, resourceId]);

  /**
   * Save the annotation (create or update).
   */
  const handleSave = useCallback(async () => {
    if (!canAnnotate) {
      toastError('You do not have permission to create annotations.');
      return;
    }

    const validation = validateForm();
    if (!validation.valid) {
      toastError(validation.error);
      return;
    }

    setIsSaving(true);

    try {
      const allAnnotations = getAllAnnotations();
      const now = new Date().toISOString();
      const userId = currentUser?.id || 'unknown';
      const userName = currentUser?.name || 'Unknown User';
      const userEmail = currentUser?.email || '';

      if (editingAnnotationId) {
        // Update existing annotation
        const index = allAnnotations.findIndex(
          (a) => a.annotation_id === editingAnnotationId,
        );

        if (index === -1) {
          toastError('Annotation not found. It may have been deleted.');
          resetForm();
          loadAnnotations();
          return;
        }

        const updatedAnnotation = {
          ...allAnnotations[index],
          text: formText.trim(),
          severity: formSeverity,
          annotation_type: formType,
          updated_at: now,
          updated_by: userId,
          updated_by_name: userName,
        };

        allAnnotations[index] = updatedAnnotation;

        const persisted = persistAnnotations(allAnnotations);

        if (!persisted) {
          toastError('Failed to save annotation. Storage may be full.');
          return;
        }

        logAction(userId, AUDIT_ACTIONS.ANNOTATE, resourceType, {
          user_name: userName,
          user_email: userEmail,
          status: AUDIT_RESULTS.SUCCESS,
          description: `Updated annotation ${editingAnnotationId} on ${resourceType} "${resourceName || resourceId}"`,
          details: {
            annotation_id: editingAnnotationId,
            resource_id: resourceId,
            resource_type: resourceType,
            resource_name: resourceName,
            severity: formSeverity,
            annotation_type: formType,
            action: 'update',
          },
        });

        toastSuccess('Annotation updated successfully.');
      } else {
        // Create new annotation
        const newAnnotation = {
          annotation_id: `ann-${uuidv4()}`,
          resource_id: resourceId,
          resource_type: resourceType,
          resource_name: resourceName || resourceId,
          text: formText.trim(),
          severity: formSeverity,
          annotation_type: formType,
          created_at: now,
          created_by: userId,
          created_by_name: userName,
          updated_at: null,
          updated_by: null,
          updated_by_name: null,
        };

        allAnnotations.unshift(newAnnotation);

        const persisted = persistAnnotations(allAnnotations);

        if (!persisted) {
          toastError('Failed to save annotation. Storage may be full.');
          return;
        }

        logAction(userId, AUDIT_ACTIONS.ANNOTATE, resourceType, {
          user_name: userName,
          user_email: userEmail,
          status: AUDIT_RESULTS.SUCCESS,
          description: `Created annotation on ${resourceType} "${resourceName || resourceId}"`,
          details: {
            annotation_id: newAnnotation.annotation_id,
            resource_id: resourceId,
            resource_type: resourceType,
            resource_name: resourceName,
            severity: formSeverity,
            annotation_type: formType,
            action: 'create',
          },
        });

        toastSuccess('Annotation created successfully.');
      }

      resetForm();
      loadAnnotations();
    } catch (e) {
      console.error('[AnnotationPanel] Save failed:', e);
      toastError('An unexpected error occurred while saving the annotation.');
    } finally {
      setIsSaving(false);
    }
  }, [
    canAnnotate,
    validateForm,
    editingAnnotationId,
    formText,
    formSeverity,
    formType,
    resourceId,
    resourceType,
    resourceName,
    currentUser,
    resetForm,
    loadAnnotations,
    toastSuccess,
    toastError,
  ]);

  /**
   * Delete an annotation.
   * @param {string} annotationId - The annotation ID to delete.
   */
  const handleDelete = useCallback(
    async (annotationId) => {
      if (!canAnnotate) {
        toastError('You do not have permission to delete annotations.');
        return;
      }

      if (!annotationId) return;

      setIsDeleting(annotationId);

      try {
        const allAnnotations = getAllAnnotations();
        const index = allAnnotations.findIndex(
          (a) => a.annotation_id === annotationId,
        );

        if (index === -1) {
          toastError('Annotation not found. It may have already been deleted.');
          loadAnnotations();
          return;
        }

        const deletedAnnotation = allAnnotations[index];
        allAnnotations.splice(index, 1);

        const persisted = persistAnnotations(allAnnotations);

        if (!persisted) {
          toastError('Failed to delete annotation.');
          return;
        }

        const userId = currentUser?.id || 'unknown';
        const userName = currentUser?.name || 'Unknown User';
        const userEmail = currentUser?.email || '';

        logAction(userId, AUDIT_ACTIONS.ANNOTATE, resourceType, {
          user_name: userName,
          user_email: userEmail,
          status: AUDIT_RESULTS.SUCCESS,
          description: `Deleted annotation ${annotationId} from ${resourceType} "${resourceName || resourceId}"`,
          details: {
            annotation_id: annotationId,
            resource_id: resourceId,
            resource_type: resourceType,
            resource_name: resourceName,
            severity: deletedAnnotation.severity,
            annotation_type: deletedAnnotation.annotation_type,
            action: 'delete',
          },
        });

        // If we were editing this annotation, cancel the edit
        if (editingAnnotationId === annotationId) {
          resetForm();
        }

        toastSuccess('Annotation deleted.');
        loadAnnotations();
      } catch (e) {
        console.error('[AnnotationPanel] Delete failed:', e);
        toastError('An unexpected error occurred while deleting the annotation.');
      } finally {
        setIsDeleting(null);
      }
    },
    [
      canAnnotate,
      resourceId,
      resourceType,
      resourceName,
      currentUser,
      editingAnnotationId,
      resetForm,
      loadAnnotations,
      toastSuccess,
      toastError,
    ],
  );

  /**
   * Compute summary counts for annotations.
   */
  const summary = useMemo(() => {
    if (!annotations || annotations.length === 0) {
      return { total: 0, riskNotes: 0, actionItems: 0 };
    }

    return {
      total: annotations.length,
      riskNotes: annotations.filter(
        (a) => a.annotation_type === ANNOTATION_TYPES.RISK_NOTE,
      ).length,
      actionItems: annotations.filter(
        (a) => a.annotation_type === ANNOTATION_TYPES.ACTION_ITEM,
      ).length,
    };
  }, [annotations]);

  /**
   * Check if the form has unsaved changes.
   */
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditing) return false;
    return formText.trim().length > 0;
  }, [isEditing, formText]);

  /**
   * Get the severity badge status string for StatusBadge.
   * @param {string} severity - The severity level.
   * @returns {string} Status string for StatusBadge.
   */
  const getSeverityBadgeStatus = useCallback((severity) => {
    if (!severity) return 'P4';
    return severity;
  }, []);

  // Don't render if the panel is not open
  if (!isOpen) {
    return null;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div
        className={`bg-white border border-dashboard-border rounded-lg shadow-card overflow-hidden ${className}`}
        ref={panelRef}
      >
        <EmptyState
          preset="no-access"
          title="Authentication Required"
          description="You must be signed in to view or create annotations."
          size="sm"
          compact
        />
      </div>
    );
  }

  return (
    <div
      className={`bg-white border border-dashboard-border rounded-lg shadow-card overflow-hidden ${className}`}
      ref={panelRef}
      role="complementary"
      aria-label="Annotation panel"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-dashboard-border">
        <div className="flex items-start gap-3 min-w-0 flex-1">
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
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-dashboard-text-primary">
              Annotations
            </h4>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {resourceName && (
                <span className="text-xs text-dashboard-text-secondary truncate max-w-[180px]">
                  {resourceName}
                </span>
              )}
              {resourceType && (
                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-gray-100 text-dashboard-text-muted">
                  {resourceType}
                </span>
              )}
              {summary.total > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold">
                  {summary.total}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-7 h-7 rounded-md text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary transition-colors duration-150 flex-shrink-0 -mt-0.5 -mr-1"
          aria-label="Close annotation panel"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div
        className="overflow-y-auto scrollbar-thin"
        style={{ maxHeight: compact ? '400px' : '600px' }}
      >
        {/* Create/Edit Form — gated by ANNOTATE permission */}
        <RoleGate requiredPermission={PERMISSIONS.ANNOTATE}>
          <div className="px-4 pt-3 pb-1">
            {!isEditing ? (
              /* Add Annotation Button */
              <button
                onClick={handleStartCreate}
                disabled={!resourceId}
                className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border-2 border-dashed transition-colors duration-150 ${
                  resourceId
                    ? 'border-brand-200 text-brand-600 hover:bg-brand-50 hover:border-brand-400'
                    : 'border-dashboard-border text-dashboard-text-muted cursor-not-allowed opacity-50'
                }`}
                aria-label="Add new annotation"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                <span className="text-sm font-medium">Add Annotation</span>
              </button>
            ) : (
              /* Annotation Form */
              <div className="space-y-3 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
                    {editingAnnotationId ? 'Edit Annotation' : 'New Annotation'}
                  </h5>
                  <button
                    onClick={handleCancelEdit}
                    className="text-xs text-dashboard-text-muted hover:text-dashboard-text-secondary transition-colors duration-150"
                    aria-label="Cancel editing"
                  >
                    Cancel
                  </button>
                </div>

                {/* Annotation Type Selector */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-1.5">
                    Type
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(ANNOTATION_TYPES).map((type) => (
                      <button
                        key={type}
                        onClick={() => handleTypeChange(type)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                          formType === type
                            ? `${ANNOTATION_TYPE_COLORS[type]} ring-2 ring-brand-500/20`
                            : 'bg-gray-50 text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary'
                        }`}
                        aria-pressed={formType === type}
                        aria-label={`Set type to ${ANNOTATION_TYPE_LABELS[type]}`}
                      >
                        {ANNOTATION_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Severity Selector */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-1.5">
                    Severity
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(SEVERITY_LEVELS).map((level) => (
                      <button
                        key={level}
                        onClick={() => handleSeverityChange(level)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                          formSeverity === level
                            ? 'ring-2 ring-brand-500/20'
                            : 'hover:opacity-80'
                        }`}
                        style={{
                          backgroundColor:
                            formSeverity === level
                              ? `${SEVERITY_COLORS[level]}20`
                              : '#f9fafb',
                          color:
                            formSeverity === level
                              ? SEVERITY_COLORS[level]
                              : '#94a3b8',
                        }}
                        aria-pressed={formSeverity === level}
                        aria-label={`Set severity to ${level} (${SEVERITY_LABELS[level]})`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: SEVERITY_COLORS[level],
                          }}
                        />
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Input */}
                <div>
                  <label
                    htmlFor="annotation-text"
                    className="block text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-1.5"
                  >
                    Annotation
                  </label>
                  <textarea
                    id="annotation-text"
                    ref={textareaRef}
                    value={formText}
                    onChange={handleTextChange}
                    placeholder="Enter your annotation or risk note…"
                    rows={compact ? 3 : 4}
                    maxLength={MAX_ANNOTATION_LENGTH}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
                    aria-label="Annotation text"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-dashboard-text-muted">
                      {formText.length > 0 && formText.trim().length < 3
                        ? 'Minimum 3 characters required'
                        : ''}
                    </span>
                    <span
                      className={`text-[10px] ${
                        formText.length > MAX_ANNOTATION_LENGTH * 0.9
                          ? 'text-severity-critical'
                          : 'text-dashboard-text-muted'
                      }`}
                    >
                      {formText.length}/{MAX_ANNOTATION_LENGTH}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 text-sm font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 transition-colors duration-150"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={
                      isSaving ||
                      !formText.trim() ||
                      formText.trim().length < 3
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors duration-150 ${
                      isSaving ||
                      !formText.trim() ||
                      formText.trim().length < 3
                        ? 'bg-brand-400 cursor-not-allowed opacity-60'
                        : 'bg-brand-600 hover:bg-brand-700'
                    }`}
                    aria-label={
                      editingAnnotationId
                        ? 'Update annotation'
                        : 'Save annotation'
                    }
                  >
                    {isSaving && (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {editingAnnotationId ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </RoleGate>

        {/* Permission denied message for non-annotators */}
        <RoleGate
          requiredPermission={PERMISSIONS.ANNOTATE}
          silent={false}
          fallback={
            <div className="px-4 py-3 border-b border-dashboard-border bg-gray-50/30">
              <div className="flex items-center gap-2 text-xs text-dashboard-text-muted">
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
                <span>
                  You have view-only access. Contact an ARE Lead or Admin to
                  add annotations.
                </span>
              </div>
            </div>
          }
        >
          {/* This renders nothing — the fallback above handles the denied case */}
          <span />
        </RoleGate>

        {/* Annotations List */}
        <div className="px-4 pt-2 pb-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
              {annotations.length > 0
                ? `Annotations (${annotations.length})`
                : 'Annotations'}
            </h5>
            {summary.riskNotes > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-severity-critical font-medium">
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
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                {summary.riskNotes} risk{' '}
                {summary.riskNotes === 1 ? 'note' : 'notes'}
              </span>
            )}
          </div>
        </div>

        {annotations.length > 0 ? (
          <div className="divide-y divide-dashboard-border">
            {annotations.map((annotation) => {
              const isCurrentlyEditing =
                editingAnnotationId === annotation.annotation_id;
              const isCurrentlyDeleting =
                isDeleting === annotation.annotation_id;
              const isOwnAnnotation =
                currentUser && annotation.created_by === currentUser.id;

              return (
                <div
                  key={annotation.annotation_id}
                  className={`px-4 py-3 transition-colors duration-150 ${
                    isCurrentlyEditing
                      ? 'bg-brand-50/30'
                      : 'hover:bg-gray-50/50'
                  }`}
                >
                  {/* Annotation Header */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <StatusBadge
                        status={getSeverityBadgeStatus(annotation.severity)}
                        size="sm"
                      />
                      {annotation.annotation_type && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 ${
                            ANNOTATION_TYPE_COLORS[annotation.annotation_type] ||
                            ANNOTATION_TYPE_COLORS[ANNOTATION_TYPES.GENERAL]
                          }`}
                        >
                          {ANNOTATION_TYPE_LABELS[annotation.annotation_type] ||
                            annotation.annotation_type}
                        </span>
                      )}
                    </div>

                    {/* Edit/Delete actions — only for users with ANNOTATE permission */}
                    <RoleGate requiredPermission={PERMISSIONS.ANNOTATE}>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleStartEdit(annotation)}
                          disabled={isCurrentlyDeleting || isSaving}
                          className="flex items-center justify-center w-6 h-6 rounded-md text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary transition-colors duration-150"
                          aria-label={`Edit annotation`}
                          title="Edit"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() =>
                            handleDelete(annotation.annotation_id)
                          }
                          disabled={isCurrentlyDeleting || isSaving}
                          className="flex items-center justify-center w-6 h-6 rounded-md text-dashboard-text-muted hover:bg-red-50 hover:text-severity-critical transition-colors duration-150"
                          aria-label={`Delete annotation`}
                          title="Delete"
                        >
                          {isCurrentlyDeleting ? (
                            <div className="w-3 h-3 border-2 border-dashboard-text-muted/30 border-t-dashboard-text-muted rounded-full animate-spin" />
                          ) : (
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </RoleGate>
                  </div>

                  {/* Annotation Text */}
                  <p className="text-sm text-dashboard-text-primary leading-relaxed whitespace-pre-wrap break-words">
                    {annotation.text}
                  </p>

                  {/* Annotation Metadata */}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-dashboard-text-muted">
                    <span>
                      By{' '}
                      <span className="font-medium text-dashboard-text-secondary">
                        {annotation.created_by_name || annotation.created_by}
                      </span>
                    </span>
                    {annotation.created_at && (
                      <span title={formatTimestamp(annotation.created_at)}>
                        {getRelativeTime(annotation.created_at)}
                      </span>
                    )}
                    {annotation.updated_at && (
                      <span
                        className="italic"
                        title={formatTimestamp(annotation.updated_at)}
                      >
                        edited{' '}
                        {getRelativeTime(annotation.updated_at)}
                        {annotation.updated_by_name &&
                          annotation.updated_by_name !==
                            annotation.created_by_name && (
                            <span>
                              {' '}
                              by {annotation.updated_by_name}
                            </span>
                          )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 pb-4">
            {resourceId ? (
              <div className="flex flex-col items-center gap-1.5 py-6">
                <svg
                  className="w-8 h-8 text-dashboard-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                  />
                </svg>
                <p className="text-xs text-dashboard-text-muted text-center">
                  No annotations yet for this {resourceType}.
                </p>
                <RoleGate requiredPermission={PERMISSIONS.ANNOTATE}>
                  <button
                    onClick={handleStartCreate}
                    className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150"
                  >
                    Add the first annotation
                  </button>
                </RoleGate>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-6">
                <svg
                  className="w-8 h-8 text-dashboard-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                  />
                </svg>
                <p className="text-xs text-dashboard-text-muted text-center">
                  Select a service or incident to view annotations.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
        <div className="flex items-center gap-3 text-[10px] text-dashboard-text-muted">
          {summary.total > 0 && (
            <span>
              {summary.total} annotation{summary.total !== 1 ? 's' : ''}
            </span>
          )}
          {summary.riskNotes > 0 && (
            <span className="text-severity-critical font-medium">
              {summary.riskNotes} risk
            </span>
          )}
          {summary.actionItems > 0 && (
            <span className="text-status-degraded font-medium">
              {summary.actionItems} action{summary.actionItems !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {resourceId && (
          <span className="text-[10px] text-dashboard-text-muted font-mono truncate max-w-[120px]">
            {resourceId}
          </span>
        )}
      </div>
    </div>
  );
};

export { AnnotationPanel, ANNOTATION_TYPES, ANNOTATION_TYPE_LABELS, ANNOTATIONS_STORAGE_KEY };
export default AnnotationPanel;