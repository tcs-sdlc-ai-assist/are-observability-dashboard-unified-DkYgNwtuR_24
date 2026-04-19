import { useMemo } from 'react';

/**
 * StatusBadge - Reusable badge component for displaying color-coded status indicators.
 *
 * Supports service health statuses (healthy, degraded, down, unknown, maintenance),
 * budget statuses (critical, warning, breached), and severity levels (P1–P4).
 * Renders a colored dot alongside a text label with appropriate background tinting.
 *
 * @param {Object} props
 * @param {string} props.status - The status key (e.g., 'healthy', 'degraded', 'down', 'critical', 'warning', 'breached', 'unknown', 'maintenance', 'P1', 'P2', 'P3', 'P4').
 * @param {'sm'|'md'|'lg'} [props.size='md'] - The badge size variant.
 * @param {string} [props.label] - Optional custom label text. If omitted, a default label is derived from the status.
 * @param {boolean} [props.showDot=true] - Whether to show the colored status dot.
 * @param {boolean} [props.pulse=false] - Whether to animate the dot with a pulse effect (useful for active incidents).
 * @param {string} [props.className=''] - Additional CSS classes to apply to the badge container.
 * @returns {React.ReactNode}
 */
const StatusBadge = ({
  status,
  size = 'md',
  label,
  showDot = true,
  pulse = false,
  className = '',
}) => {
  /**
   * Resolve the display configuration (colors, label) for the given status.
   */
  const config = useMemo(() => {
    if (!status || typeof status !== 'string') {
      return {
        label: 'Unknown',
        dotClass: 'bg-status-unknown',
        badgeClass: 'bg-gray-100 text-gray-700',
      };
    }

    const normalizedStatus = status.toLowerCase().trim();

    switch (normalizedStatus) {
      // Service health statuses
      case 'healthy':
        return {
          label: 'Healthy',
          dotClass: 'bg-status-healthy',
          badgeClass: 'bg-green-50 text-green-800',
        };
      case 'degraded':
        return {
          label: 'Degraded',
          dotClass: 'bg-status-degraded',
          badgeClass: 'bg-yellow-50 text-yellow-800',
        };
      case 'down':
        return {
          label: 'Down',
          dotClass: 'bg-status-down',
          badgeClass: 'bg-red-50 text-red-800',
        };
      case 'maintenance':
        return {
          label: 'Maintenance',
          dotClass: 'bg-status-maintenance',
          badgeClass: 'bg-purple-50 text-purple-800',
        };
      case 'unknown':
        return {
          label: 'Unknown',
          dotClass: 'bg-status-unknown',
          badgeClass: 'bg-gray-100 text-gray-700',
        };

      // Budget / threshold statuses
      case 'critical':
      case 'breached':
        return {
          label: normalizedStatus === 'breached' ? 'Breached' : 'Critical',
          dotClass: 'bg-severity-critical',
          badgeClass: 'bg-red-50 text-red-800',
        };
      case 'warning':
        return {
          label: 'Warning',
          dotClass: 'bg-severity-medium',
          badgeClass: 'bg-yellow-50 text-yellow-800',
        };

      // Severity levels
      case 'p1':
        return {
          label: 'P1 — Critical',
          dotClass: 'bg-severity-critical',
          badgeClass: 'bg-red-100 text-red-800',
        };
      case 'p2':
        return {
          label: 'P2 — High',
          dotClass: 'bg-severity-high',
          badgeClass: 'bg-orange-100 text-orange-800',
        };
      case 'p3':
        return {
          label: 'P3 — Medium',
          dotClass: 'bg-severity-medium',
          badgeClass: 'bg-yellow-100 text-yellow-800',
        };
      case 'p4':
        return {
          label: 'P4 — Low',
          dotClass: 'bg-severity-low',
          badgeClass: 'bg-blue-100 text-blue-800',
        };

      // Incident / resolution statuses
      case 'resolved':
        return {
          label: 'Resolved',
          dotClass: 'bg-status-healthy',
          badgeClass: 'bg-green-50 text-green-800',
        };
      case 'open':
        return {
          label: 'Open',
          dotClass: 'bg-severity-critical',
          badgeClass: 'bg-red-50 text-red-800',
        };
      case 'investigating':
        return {
          label: 'Investigating',
          dotClass: 'bg-severity-high',
          badgeClass: 'bg-orange-50 text-orange-800',
        };

      // Deployment statuses
      case 'success':
        return {
          label: 'Success',
          dotClass: 'bg-status-healthy',
          badgeClass: 'bg-green-50 text-green-800',
        };
      case 'rolled_back':
        return {
          label: 'Rolled Back',
          dotClass: 'bg-severity-high',
          badgeClass: 'bg-orange-50 text-orange-800',
        };
      case 'failed':
        return {
          label: 'Failed',
          dotClass: 'bg-severity-critical',
          badgeClass: 'bg-red-50 text-red-800',
        };

      default:
        return {
          label: status,
          dotClass: 'bg-status-unknown',
          badgeClass: 'bg-gray-100 text-gray-700',
        };
    }
  }, [status]);

  /**
   * Resolve size-specific CSS classes for the badge container, dot, and text.
   */
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          container: 'px-1.5 py-0.5 text-[10px] leading-4',
          dot: 'w-1.5 h-1.5',
          gap: 'gap-1',
        };
      case 'lg':
        return {
          container: 'px-3 py-1 text-sm leading-5',
          dot: 'w-2.5 h-2.5',
          gap: 'gap-2',
        };
      case 'md':
      default:
        return {
          container: 'px-2 py-0.5 text-xs leading-4',
          dot: 'w-2 h-2',
          gap: 'gap-1.5',
        };
    }
  }, [size]);

  /**
   * Determine whether the dot should pulse.
   * Auto-pulse for 'down' and 'open' statuses unless explicitly overridden.
   */
  const shouldPulse = useMemo(() => {
    if (pulse) {
      return true;
    }

    if (!status || typeof status !== 'string') {
      return false;
    }

    const normalizedStatus = status.toLowerCase().trim();
    return normalizedStatus === 'down' || normalizedStatus === 'open';
  }, [status, pulse]);

  const displayLabel = label || config.label;

  return (
    <span
      className={`inline-flex items-center ${sizeClasses.gap} ${sizeClasses.container} rounded-full font-medium ${config.badgeClass} ${className}`}
      title={displayLabel}
    >
      {showDot && (
        <span
          className={`inline-block ${sizeClasses.dot} rounded-full flex-shrink-0 ${config.dotClass} ${shouldPulse ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{displayLabel}</span>
    </span>
  );
};

export { StatusBadge };
export default StatusBadge;