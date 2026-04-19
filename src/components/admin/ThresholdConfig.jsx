import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useDashboard } from '../../contexts/DashboardContext';
import { useToast } from '../shared/ToastNotification';
import { StatusBadge } from '../shared/StatusBadge';
import { MetricCard } from '../shared/MetricCard';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { RoleGate } from '../auth/RoleGate';
import { PERMISSIONS } from '../../constants/roles';
import {
  DEFAULT_METRIC_THRESHOLDS,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  DEFAULT_ERROR_BUDGET_THRESHOLDS,
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  GOLDEN_SIGNALS,
  GOLDEN_SIGNAL_LABELS,
  GOLDEN_SIGNAL_METRICS,
  METRIC_UNITS,
} from '../../constants/metrics';
import { logAction, AUDIT_ACTIONS, AUDIT_RESULTS } from '../../services/auditLogger';
import { formatNumber, formatPercentage } from '../../utils/formatters';

/**
 * Metric group definitions for organizing the threshold form.
 */
const METRIC_GROUPS = Object.freeze([
  {
    key: 'availability',
    label: 'Availability & SLA',
    description: 'Service availability and SLA compliance thresholds',
    icon: 'shield',
    metrics: [
      {
        key: 'availability',
        label: 'Availability',
        unit: '%',
        description: 'Minimum acceptable availability percentage',
        direction: 'lower_is_bad',
        min: 0,
        max: 100,
        step: 0.01,
      },
    ],
  },
  {
    key: 'error_budget',
    label: 'Error Budget',
    description: 'Error budget remaining thresholds for alerting',
    icon: 'budget',
    metrics: [
      {
        key: 'error_budget',
        label: 'Error Budget Remaining',
        unit: '%',
        description: 'Remaining error budget percentage thresholds',
        direction: 'lower_is_bad',
        min: 0,
        max: 100,
        step: 0.5,
      },
    ],
  },
  {
    key: 'latency',
    label: 'Latency',
    description: 'Response time thresholds for P95 and P99 percentiles',
    icon: 'clock',
    metrics: [
      {
        key: 'latency_p95',
        label: 'P95 Latency',
        unit: 'ms',
        description: '95th percentile response time threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 30000,
        step: 10,
      },
      {
        key: 'latency_p99',
        label: 'P99 Latency',
        unit: 'ms',
        description: '99th percentile response time threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 60000,
        step: 10,
      },
    ],
  },
  {
    key: 'errors',
    label: 'Error Rates',
    description: 'Error count thresholds for 5xx and functional errors',
    icon: 'alert',
    metrics: [
      {
        key: 'errors_5xx',
        label: '5xx Errors',
        unit: 'count',
        description: 'HTTP 5xx error count threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 10000,
        step: 1,
      },
      {
        key: 'errors_functional',
        label: 'Functional Errors',
        unit: 'count',
        description: 'Functional/business logic error count threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 10000,
        step: 1,
      },
    ],
  },
  {
    key: 'saturation',
    label: 'Saturation',
    description: 'Resource utilization thresholds for CPU, memory, and queue depth',
    icon: 'gauge',
    metrics: [
      {
        key: 'saturation_cpu',
        label: 'CPU Utilization',
        unit: '%',
        description: 'CPU utilization percentage threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'saturation_mem',
        label: 'Memory Utilization',
        unit: '%',
        description: 'Memory utilization percentage threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'saturation_queue',
        label: 'Queue Saturation',
        unit: '%',
        description: 'Queue depth saturation percentage threshold',
        direction: 'higher_is_bad',
        min: 0,
        max: 100,
        step: 1,
      },
    ],
  },
  {
    key: 'traffic',
    label: 'Traffic',
    description: 'Request rate thresholds (optional — null means no threshold)',
    icon: 'traffic',
    metrics: [
      {
        key: 'traffic_rps',
        label: 'Requests Per Second',
        unit: 'rps',
        description: 'Traffic volume threshold (leave empty for no threshold)',
        direction: 'higher_is_bad',
        min: 0,
        max: 1000000,
        step: 100,
      },
    ],
  },
]);

/**
 * ThresholdConfig - Admin configuration form for setting metric thresholds
 * per domain/application. Fields for SLO targets, error budget limits,
 * latency thresholds, saturation warnings. Save persists to localStorage
 * via dataService.
 *
 * Features:
 * - Grouped metric threshold configuration (Availability, Error Budget, Latency, Errors, Saturation, Traffic)
 * - Warning and critical threshold inputs per metric
 * - Visual direction indicators (lower-is-bad vs higher-is-bad)
 * - Default value display with reset-to-default per metric
 * - Form validation with inline error messages
 * - Save and reset all buttons
 * - Current threshold summary metric cards
 * - Expandable/collapsible metric groups
 * - Gated by CONFIGURE_THRESHOLDS permission
 * - All configuration changes logged to audit trail
 * - Loading and empty states
 * - Responsive layout with compact mode support
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {Function} [props.onSave] - Optional callback fired after a successful save. Receives the saved config.
 * @returns {React.ReactNode}
 */
const ThresholdConfig = ({
  className = '',
  compact = false,
  onSave,
}) => {
  const { currentUser } = useAuth();
  const { canConfigureThresholds } = usePermissions();
  const { updateThresholds, fetchMetricThresholds, isLoading: dashboardLoading } = useDashboard();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const [formValues, setFormValues] = useState({});
  const [originalValues, setOriginalValues] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingThresholds, setIsLoadingThresholds] = useState(true);
  const [loadError, setLoadError] = useState(null);

  /**
   * Load current thresholds from the data service on mount.
   */
  const loadThresholds = useCallback(async () => {
    setIsLoadingThresholds(true);
    setLoadError(null);

    try {
      const result = await fetchMetricThresholds();

      if (result.status === 'success' && result.data) {
        const thresholds = result.data;
        const values = {};

        for (const group of METRIC_GROUPS) {
          for (const metric of group.metrics) {
            const config = thresholds[metric.key] || DEFAULT_METRIC_THRESHOLDS[metric.key] || {};
            values[metric.key] = {
              warning: config.warning != null ? String(config.warning) : '',
              critical: config.critical != null ? String(config.critical) : '',
            };
          }
        }

        setFormValues(values);
        setOriginalValues(JSON.parse(JSON.stringify(values)));
      } else {
        // Fall back to defaults
        const values = {};

        for (const group of METRIC_GROUPS) {
          for (const metric of group.metrics) {
            const config = DEFAULT_METRIC_THRESHOLDS[metric.key] || {};
            values[metric.key] = {
              warning: config.warning != null ? String(config.warning) : '',
              critical: config.critical != null ? String(config.critical) : '',
            };
          }
        }

        setFormValues(values);
        setOriginalValues(JSON.parse(JSON.stringify(values)));
      }

      // Expand all groups by default
      const expanded = {};
      for (const group of METRIC_GROUPS) {
        expanded[group.key] = true;
      }
      setExpandedGroups(expanded);
    } catch (e) {
      console.error('[ThresholdConfig] Failed to load thresholds:', e);
      setLoadError('Failed to load current threshold configuration.');
    } finally {
      setIsLoadingThresholds(false);
    }
  }, [fetchMetricThresholds]);

  useEffect(() => {
    loadThresholds();
  }, [loadThresholds]);

  /**
   * Toggle the expanded state of a metric group.
   */
  const toggleGroup = useCallback((groupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }, []);

  /**
   * Handle input change for a threshold value.
   */
  const handleInputChange = useCallback((metricKey, thresholdType, value) => {
    setFormValues((prev) => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        [thresholdType]: value,
      },
    }));

    // Clear validation error for this field
    setValidationErrors((prev) => {
      const updated = { ...prev };
      delete updated[`${metricKey}.${thresholdType}`];
      delete updated[`${metricKey}.order`];
      return updated;
    });
  }, []);

  /**
   * Reset a single metric to its default values.
   */
  const handleResetMetric = useCallback((metricKey) => {
    const defaultConfig = DEFAULT_METRIC_THRESHOLDS[metricKey] || {};

    setFormValues((prev) => ({
      ...prev,
      [metricKey]: {
        warning: defaultConfig.warning != null ? String(defaultConfig.warning) : '',
        critical: defaultConfig.critical != null ? String(defaultConfig.critical) : '',
      },
    }));

    // Clear validation errors for this metric
    setValidationErrors((prev) => {
      const updated = { ...prev };
      delete updated[`${metricKey}.warning`];
      delete updated[`${metricKey}.critical`];
      delete updated[`${metricKey}.order`];
      return updated;
    });
  }, []);

  /**
   * Reset all metrics to their default values.
   */
  const handleResetAll = useCallback(() => {
    const values = {};

    for (const group of METRIC_GROUPS) {
      for (const metric of group.metrics) {
        const config = DEFAULT_METRIC_THRESHOLDS[metric.key] || {};
        values[metric.key] = {
          warning: config.warning != null ? String(config.warning) : '',
          critical: config.critical != null ? String(config.critical) : '',
        };
      }
    }

    setFormValues(values);
    setValidationErrors({});
    toastWarning('All thresholds reset to defaults. Click Save to persist.');
  }, [toastWarning]);

  /**
   * Validate the form values before saving.
   * @returns {boolean} True if the form is valid.
   */
  const validateForm = useCallback(() => {
    const errors = {};

    for (const group of METRIC_GROUPS) {
      for (const metric of group.metrics) {
        const values = formValues[metric.key];
        if (!values) continue;

        const warningStr = values.warning != null ? String(values.warning).trim() : '';
        const criticalStr = values.critical != null ? String(values.critical).trim() : '';

        let warningNum = null;
        let criticalNum = null;

        // Validate warning value
        if (warningStr.length > 0) {
          warningNum = parseFloat(warningStr);
          if (isNaN(warningNum)) {
            errors[`${metric.key}.warning`] = 'Must be a valid number';
          } else if (warningNum < metric.min) {
            errors[`${metric.key}.warning`] = `Must be ≥ ${metric.min}`;
          } else if (warningNum > metric.max) {
            errors[`${metric.key}.warning`] = `Must be ≤ ${metric.max}`;
          }
        }

        // Validate critical value
        if (criticalStr.length > 0) {
          criticalNum = parseFloat(criticalStr);
          if (isNaN(criticalNum)) {
            errors[`${metric.key}.critical`] = 'Must be a valid number';
          } else if (criticalNum < metric.min) {
            errors[`${metric.key}.critical`] = `Must be ≥ ${metric.min}`;
          } else if (criticalNum > metric.max) {
            errors[`${metric.key}.critical`] = `Must be ≤ ${metric.max}`;
          }
        }

        // Validate logical ordering between warning and critical
        if (
          warningNum != null &&
          criticalNum != null &&
          !isNaN(warningNum) &&
          !isNaN(criticalNum)
        ) {
          if (metric.direction === 'lower_is_bad') {
            // For availability/error_budget: warning > critical
            if (warningNum <= criticalNum) {
              errors[`${metric.key}.order`] =
                'Warning must be greater than Critical (lower values are worse)';
            }
          } else {
            // For latency/errors/saturation: warning < critical
            if (warningNum >= criticalNum) {
              errors[`${metric.key}.order`] =
                'Warning must be less than Critical (higher values are worse)';
            }
          }
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formValues]);

  /**
   * Save the threshold configuration.
   */
  const handleSave = useCallback(async () => {
    if (!canConfigureThresholds) {
      toastError('You do not have permission to configure thresholds.');
      return;
    }

    if (!validateForm()) {
      toastError('Please fix the validation errors before saving.');
      return;
    }

    setIsSaving(true);

    try {
      // Build the threshold config object
      const config = {};

      for (const group of METRIC_GROUPS) {
        for (const metric of group.metrics) {
          const values = formValues[metric.key];
          if (!values) continue;

          const warningStr = String(values.warning || '').trim();
          const criticalStr = String(values.critical || '').trim();

          const warningNum = warningStr.length > 0 ? parseFloat(warningStr) : null;
          const criticalNum = criticalStr.length > 0 ? parseFloat(criticalStr) : null;

          config[metric.key] = {
            warning: warningNum != null && !isNaN(warningNum) ? warningNum : null,
            critical: criticalNum != null && !isNaN(criticalNum) ? criticalNum : null,
          };
        }
      }

      const result = await updateThresholds(config);

      if (result.status === 'success') {
        const userId = currentUser?.id || 'unknown';
        const userName = currentUser?.name || 'Unknown User';
        const userEmail = currentUser?.email || '';

        logAction(userId, AUDIT_ACTIONS.CONFIGURE_THRESHOLDS, 'metric_thresholds', {
          user_name: userName,
          user_email: userEmail,
          status: AUDIT_RESULTS.SUCCESS,
          description: `Updated metric threshold configuration (${Object.keys(config).length} metrics)`,
          details: {
            metrics_updated: Object.keys(config),
            config,
          },
        });

        setOriginalValues(JSON.parse(JSON.stringify(formValues)));
        toastSuccess('Metric thresholds saved successfully.');

        if (onSave && typeof onSave === 'function') {
          onSave(config);
        }
      } else {
        const errorMsg = result.error || 'Failed to save threshold configuration.';
        toastError(errorMsg);

        if (result.validationErrors && result.validationErrors.length > 0) {
          const newErrors = {};
          for (const err of result.validationErrors) {
            if (err.field) {
              newErrors[err.field] = err.message;
            }
          }
          setValidationErrors((prev) => ({ ...prev, ...newErrors }));
        }
      }
    } catch (e) {
      console.error('[ThresholdConfig] Save failed:', e);
      toastError('An unexpected error occurred while saving thresholds.');
    } finally {
      setIsSaving(false);
    }
  }, [
    canConfigureThresholds,
    validateForm,
    formValues,
    currentUser,
    updateThresholds,
    onSave,
    toastSuccess,
    toastError,
  ]);

  /**
   * Check if the form has unsaved changes.
   */
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formValues) !== JSON.stringify(originalValues);
  }, [formValues, originalValues]);

  /**
   * Compute summary statistics for the current threshold configuration.
   */
  const summary = useMemo(() => {
    let configuredCount = 0;
    let totalMetrics = 0;
    let changedCount = 0;

    for (const group of METRIC_GROUPS) {
      for (const metric of group.metrics) {
        totalMetrics++;
        const values = formValues[metric.key];
        if (!values) continue;

        const hasWarning = String(values.warning || '').trim().length > 0;
        const hasCritical = String(values.critical || '').trim().length > 0;

        if (hasWarning || hasCritical) {
          configuredCount++;
        }

        const original = originalValues[metric.key];
        if (original) {
          if (
            String(values.warning || '').trim() !== String(original.warning || '').trim() ||
            String(values.critical || '').trim() !== String(original.critical || '').trim()
          ) {
            changedCount++;
          }
        }
      }
    }

    return {
      totalMetrics,
      configuredCount,
      changedCount,
      errorCount: Object.keys(validationErrors).length,
    };
  }, [formValues, originalValues, validationErrors]);

  /**
   * Get the icon SVG for a metric group.
   */
  const getGroupIcon = useCallback((iconKey) => {
    const baseClass = 'w-4 h-4 text-brand-600';

    switch (iconKey) {
      case 'shield':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        );
      case 'budget':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
          </svg>
        );
      case 'clock':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'alert':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        );
      case 'gauge':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        );
      case 'traffic':
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
          </svg>
        );
      default:
        return (
          <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
    }
  }, []);

  /**
   * Get the default value display for a metric.
   */
  const getDefaultDisplay = useCallback((metricKey) => {
    const config = DEFAULT_METRIC_THRESHOLDS[metricKey];
    if (!config) return { warning: '—', critical: '—' };

    return {
      warning: config.warning != null ? String(config.warning) : '—',
      critical: config.critical != null ? String(config.critical) : '—',
    };
  }, []);

  /**
   * Check if a metric's current values differ from defaults.
   */
  const isMetricModified = useCallback(
    (metricKey) => {
      const values = formValues[metricKey];
      const defaults = DEFAULT_METRIC_THRESHOLDS[metricKey] || {};

      if (!values) return false;

      const currentWarning = String(values.warning || '').trim();
      const currentCritical = String(values.critical || '').trim();
      const defaultWarning = defaults.warning != null ? String(defaults.warning) : '';
      const defaultCritical = defaults.critical != null ? String(defaults.critical) : '';

      return currentWarning !== defaultWarning || currentCritical !== defaultCritical;
    },
    [formValues],
  );

  // Permission check
  if (!canConfigureThresholds) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-access"
          title="Configuration Access Required"
          description="You do not have permission to configure metric thresholds. Contact an Admin for access."
          size="md"
        />
      </div>
    );
  }

  // Loading state
  if (isLoadingThresholds || dashboardLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading threshold configuration…" size="md" />
      </div>
    );
  }

  // Load error state
  if (loadError) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load thresholds"
          description={loadError}
          size="md"
          actionLabel="Retry"
          onAction={loadThresholds}
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
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Metric Threshold Configuration
              </h3>
              <p className="text-xs text-dashboard-text-muted mt-0.5">
                Configure warning and critical thresholds for observability metrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Summary badges */}
            <div className="flex items-center gap-2 text-xs text-dashboard-text-muted">
              <span>
                <span className="font-semibold text-dashboard-text-primary">
                  {summary.configuredCount}
                </span>{' '}
                of {summary.totalMetrics} configured
              </span>
              {summary.changedCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-status-degraded font-medium">
                    {summary.changedCount} unsaved
                  </span>
                </>
              )}
              {summary.errorCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-severity-critical font-medium">
                    {summary.errorCount} error{summary.errorCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>

            {/* Unsaved changes indicator */}
            {hasUnsavedChanges && (
              <StatusBadge status="warning" size="sm" label="Unsaved Changes" />
            )}
          </div>
        </div>

        {/* Summary Metric Cards */}
        {!compact && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-dashboard-border bg-gray-50/30">
            <MetricCard
              title="Total Metrics"
              value={summary.totalMetrics}
              unit="count"
              size="sm"
            />
            <MetricCard
              title="Configured"
              value={summary.configuredCount}
              unit="count"
              size="sm"
              status={summary.configuredCount === summary.totalMetrics ? 'healthy' : undefined}
            />
            <MetricCard
              title="Pending Changes"
              value={summary.changedCount}
              unit="count"
              size="sm"
              status={summary.changedCount > 0 ? 'warning' : 'healthy'}
            />
            <MetricCard
              title="Validation Errors"
              value={summary.errorCount}
              unit="count"
              size="sm"
              status={summary.errorCount > 0 ? 'critical' : 'healthy'}
            />
          </div>
        )}

        {/* Direction Legend */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-b border-dashboard-border bg-gray-50/20">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
            Threshold Direction:
          </span>
          <span className="flex items-center gap-1.5 text-xs text-dashboard-text-muted">
            <svg className="w-3 h-3 text-severity-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
            </svg>
            Lower is worse (availability, error budget)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-dashboard-text-muted">
            <svg className="w-3 h-3 text-severity-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
            Higher is worse (latency, errors, saturation)
          </span>
        </div>

        {/* Metric Groups */}
        <div className="divide-y divide-dashboard-border">
          {METRIC_GROUPS.map((group) => {
            const isExpanded = expandedGroups[group.key] || false;
            const groupHasErrors = group.metrics.some(
              (m) =>
                validationErrors[`${m.key}.warning`] ||
                validationErrors[`${m.key}.critical`] ||
                validationErrors[`${m.key}.order`],
            );
            const groupHasChanges = group.metrics.some((m) => isMetricModified(m.key));

            return (
              <div key={group.key}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center justify-between gap-3 w-full px-4 py-3 text-left hover:bg-gray-50/50 transition-colors duration-150"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.label} thresholds`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 flex-shrink-0">
                      {getGroupIcon(group.icon)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-dashboard-text-primary">
                          {group.label}
                        </h4>
                        <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                          {group.metrics.length}
                        </span>
                        {groupHasErrors && (
                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                            Error
                          </span>
                        )}
                        {groupHasChanges && !groupHasErrors && (
                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-yellow-50 text-yellow-800">
                            Modified
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-dashboard-text-muted mt-0.5">
                        {group.description}
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-200 flex-shrink-0 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>

                {/* Group Content */}
                {isExpanded && (
                  <div className="bg-gray-50/30 animate-fade-in">
                    <div className="px-4 py-3 space-y-4">
                      {group.metrics.map((metric) => {
                        const values = formValues[metric.key] || {
                          warning: '',
                          critical: '',
                        };
                        const defaults = getDefaultDisplay(metric.key);
                        const warningError = validationErrors[`${metric.key}.warning`];
                        const criticalError = validationErrors[`${metric.key}.critical`];
                        const orderError = validationErrors[`${metric.key}.order`];
                        const modified = isMetricModified(metric.key);

                        return (
                          <div
                            key={metric.key}
                            className={`rounded-lg border bg-white p-4 ${
                              warningError || criticalError || orderError
                                ? 'border-red-200'
                                : modified
                                  ? 'border-yellow-200'
                                  : 'border-dashboard-border'
                            }`}
                          >
                            {/* Metric Header */}
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <h5 className="text-sm font-medium text-dashboard-text-primary">
                                  {metric.label}
                                </h5>
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-gray-100 text-dashboard-text-muted">
                                  {metric.unit}
                                </span>
                                {metric.direction === 'lower_is_bad' ? (
                                  <span className="flex items-center gap-1 text-[10px] text-dashboard-text-muted">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
                                    </svg>
                                    Lower is worse
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[10px] text-dashboard-text-muted">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                                    </svg>
                                    Higher is worse
                                  </span>
                                )}
                                {modified && (
                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-yellow-50 text-yellow-800">
                                    Modified
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleResetMetric(metric.key)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-dashboard-text-muted hover:text-dashboard-text-secondary hover:bg-gray-100 rounded-md transition-colors duration-150"
                                title={`Reset ${metric.label} to defaults`}
                                aria-label={`Reset ${metric.label} to defaults`}
                              >
                                <svg
                                  className="w-3 h-3"
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
                                Reset
                              </button>
                            </div>

                            {/* Description */}
                            <p className="text-[10px] text-dashboard-text-muted mb-3">
                              {metric.description}
                            </p>

                            {/* Threshold Inputs */}
                            <div
                              className={`grid gap-4 ${
                                compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                              }`}
                            >
                              {/* Warning Threshold */}
                              <div>
                                <label
                                  htmlFor={`${metric.key}-warning`}
                                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-degraded mb-1.5"
                                >
                                  <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
                                  Warning Threshold
                                </label>
                                <div className="relative">
                                  <input
                                    id={`${metric.key}-warning`}
                                    type="number"
                                    value={values.warning}
                                    onChange={(e) =>
                                      handleInputChange(metric.key, 'warning', e.target.value)
                                    }
                                    placeholder={
                                      defaults.warning !== '—'
                                        ? `Default: ${defaults.warning}`
                                        : 'Not set'
                                    }
                                    min={metric.min}
                                    max={metric.max}
                                    step={metric.step}
                                    className={`w-full px-3 py-2 pr-12 text-sm bg-gray-50 border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:border-brand-500 transition-colors duration-150 ${
                                      warningError
                                        ? 'border-severity-critical focus:ring-red-500/20'
                                        : 'border-dashboard-border focus:ring-brand-500/20'
                                    }`}
                                    aria-label={`${metric.label} warning threshold`}
                                    aria-invalid={Boolean(warningError)}
                                  />
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-dashboard-text-muted pointer-events-none">
                                    {metric.unit}
                                  </span>
                                </div>
                                {warningError && (
                                  <p className="text-[10px] text-severity-critical mt-1">
                                    {warningError}
                                  </p>
                                )}
                                <p className="text-[10px] text-dashboard-text-muted mt-1">
                                  Default: {defaults.warning !== '—' ? `${defaults.warning} ${metric.unit}` : 'Not set'}
                                </p>
                              </div>

                              {/* Critical Threshold */}
                              <div>
                                <label
                                  htmlFor={`${metric.key}-critical`}
                                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-severity-critical mb-1.5"
                                >
                                  <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
                                  Critical Threshold
                                </label>
                                <div className="relative">
                                  <input
                                    id={`${metric.key}-critical`}
                                    type="number"
                                    value={values.critical}
                                    onChange={(e) =>
                                      handleInputChange(metric.key, 'critical', e.target.value)
                                    }
                                    placeholder={
                                      defaults.critical !== '—'
                                        ? `Default: ${defaults.critical}`
                                        : 'Not set'
                                    }
                                    min={metric.min}
                                    max={metric.max}
                                    step={metric.step}
                                    className={`w-full px-3 py-2 pr-12 text-sm bg-gray-50 border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:border-brand-500 transition-colors duration-150 ${
                                      criticalError
                                        ? 'border-severity-critical focus:ring-red-500/20'
                                        : 'border-dashboard-border focus:ring-brand-500/20'
                                    }`}
                                    aria-label={`${metric.label} critical threshold`}
                                    aria-invalid={Boolean(criticalError)}
                                  />
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-dashboard-text-muted pointer-events-none">
                                    {metric.unit}
                                  </span>
                                </div>
                                {criticalError && (
                                  <p className="text-[10px] text-severity-critical mt-1">
                                    {criticalError}
                                  </p>
                                )}
                                <p className="text-[10px] text-dashboard-text-muted mt-1">
                                  Default: {defaults.critical !== '—' ? `${defaults.critical} ${metric.unit}` : 'Not set'}
                                </p>
                              </div>
                            </div>

                            {/* Order validation error */}
                            {orderError && (
                              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-red-50/50 border border-red-200">
                                <svg
                                  className="w-3.5 h-3.5 text-severity-critical flex-shrink-0"
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
                                <p className="text-[10px] text-red-700">{orderError}</p>
                              </div>
                            )}

                            {/* Current value preview */}
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-dashboard-border text-xs text-dashboard-text-muted">
                              <span>
                                Current:{' '}
                                <span className="font-medium text-status-degraded">
                                  Warning{' '}
                                  {String(values.warning || '').trim().length > 0
                                    ? `${values.warning} ${metric.unit}`
                                    : 'not set'}
                                </span>
                                {' · '}
                                <span className="font-medium text-severity-critical">
                                  Critical{' '}
                                  {String(values.critical || '').trim().length > 0
                                    ? `${values.critical} ${metric.unit}`
                                    : 'not set'}
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetAll}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Reset all thresholds to defaults"
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
              Reset All to Defaults
            </button>

            {hasUnsavedChanges && (
              <span className="text-xs text-status-degraded font-medium">
                {summary.changedCount} unsaved change{summary.changedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadThresholds}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-dashboard-text-secondary bg-white border border-dashboard-border rounded-lg hover:bg-gray-50 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || summary.errorCount > 0}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors duration-150 ${
                isSaving || summary.errorCount > 0
                  ? 'bg-brand-400 cursor-not-allowed opacity-60'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
              aria-label="Save threshold configuration"
            >
              {isSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
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
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {isSaving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              {summary.totalMetrics} metric{summary.totalMetrics !== 1 ? 's' : ''} across{' '}
              {METRIC_GROUPS.length} groups
            </span>
            <span>·</span>
            <span>
              {summary.configuredCount} configured
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              Changes are persisted to local storage
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { ThresholdConfig, METRIC_GROUPS };
export default ThresholdConfig;