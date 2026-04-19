import { useMemo, useCallback } from 'react';
import { TrendArrow } from './TrendArrow';
import { formatPercentage, formatNumber, formatDuration } from '../../utils/formatters';
import { calculateTrendDirection } from '../../utils/chartHelpers';

/**
 * MetricCard - Dashboard card component displaying a single metric with title,
 * value, unit, trend arrow, and optional sparkline visualization.
 *
 * Used across executive overview and golden signals views to present key
 * observability metrics in a compact, scannable format.
 *
 * @param {Object} props
 * @param {string} props.title - The metric display title (e.g., "P95 Latency", "Availability").
 * @param {number|string} props.value - The current metric value.
 * @param {string} [props.unit=''] - The unit of measurement ('ms', '%', 'count', 'rps', 's', 'min', 'hr').
 * @param {Object} [props.trend] - Trend information for the metric.
 * @param {'up'|'down'|'stable'} [props.trend.direction] - The trend direction.
 * @param {number|string} [props.trend.value] - The trend change value (e.g., percentage change).
 * @param {boolean} [props.trend.invertColor=false] - If true, inverts the color logic (up = green, down = red).
 * @param {number[]} [props.sparkData] - Array of numeric values for the sparkline visualization.
 * @param {'sm'|'md'|'lg'} [props.size='md'] - The card size variant.
 * @param {string} [props.status] - Optional status indicator ('healthy', 'degraded', 'down', 'warning', 'critical').
 * @param {string} [props.subtitle] - Optional subtitle text displayed below the title.
 * @param {string} [props.className=''] - Additional CSS classes to apply to the card container.
 * @param {Function} [props.onClick] - Optional click handler for the card.
 * @returns {React.ReactNode}
 */
const MetricCard = ({
  title,
  value,
  unit = '',
  trend,
  sparkData,
  size = 'md',
  status,
  subtitle,
  className = '',
  onClick,
}) => {
  /**
   * Format the display value based on the unit type.
   */
  const formattedValue = useMemo(() => {
    if (value == null || value === '') {
      return '—';
    }

    const numValue = parseFloat(value);

    if (isNaN(numValue)) {
      return String(value);
    }

    switch (unit) {
      case '%':
        return formatPercentage(numValue, numValue >= 99 ? 2 : 1);

      case 'ms':
        if (numValue >= 1000) {
          return formatNumber(numValue / 1000, { decimals: 2, unit: 's' });
        }
        return formatNumber(numValue, { decimals: numValue < 10 ? 2 : 1 });

      case 's':
        return formatNumber(numValue, { decimals: 2 });

      case 'min':
        return formatNumber(numValue, { decimals: 1 });

      case 'hr':
        return formatNumber(numValue, { decimals: 1 });

      case 'rps':
        return formatNumber(numValue, { decimals: 0, compact: numValue >= 10000 });

      case 'count':
        return formatNumber(numValue, { decimals: 0, compact: numValue >= 10000 });

      default:
        return formatNumber(numValue, {
          decimals: numValue % 1 === 0 ? 0 : 2,
        });
    }
  }, [value, unit]);

  /**
   * Resolve the unit label to display alongside the value.
   */
  const unitLabel = useMemo(() => {
    if (!unit || typeof unit !== 'string') {
      return '';
    }

    // Don't show unit if it was already embedded in the formatted value (e.g., formatNumber with unit option)
    if (unit === 'ms' && parseFloat(value) >= 1000) {
      return '';
    }

    switch (unit) {
      case '%':
        return '';
      case 'ms':
        return 'ms';
      case 's':
        return 's';
      case 'min':
        return 'min';
      case 'hr':
        return 'hr';
      case 'rps':
        return 'rps';
      case 'count':
        return '';
      default:
        return unit;
    }
  }, [unit, value]);

  /**
   * Resolve the trend data, auto-calculating from sparkData if not explicitly provided.
   */
  const resolvedTrend = useMemo(() => {
    if (trend && trend.direction) {
      return trend;
    }

    if (sparkData && Array.isArray(sparkData) && sparkData.length >= 2) {
      const trendResult = calculateTrendDirection(sparkData, { threshold: 5 });
      return {
        direction: trendResult.direction,
        value: Math.abs(trendResult.changePercent),
        invertColor: trend?.invertColor || false,
      };
    }

    return null;
  }, [trend, sparkData]);

  /**
   * Resolve the status indicator color class.
   */
  const statusConfig = useMemo(() => {
    if (!status || typeof status !== 'string') {
      return null;
    }

    const normalizedStatus = status.toLowerCase().trim();

    switch (normalizedStatus) {
      case 'healthy':
        return { dotClass: 'bg-status-healthy', borderClass: 'border-l-status-healthy' };
      case 'degraded':
      case 'warning':
        return { dotClass: 'bg-status-degraded', borderClass: 'border-l-status-degraded' };
      case 'down':
      case 'critical':
        return { dotClass: 'bg-status-down', borderClass: 'border-l-status-down' };
      case 'maintenance':
        return { dotClass: 'bg-status-maintenance', borderClass: 'border-l-status-maintenance' };
      default:
        return { dotClass: 'bg-status-unknown', borderClass: 'border-l-status-unknown' };
    }
  }, [status]);

  /**
   * Resolve size-specific CSS classes.
   */
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          container: 'p-3',
          title: 'text-xs',
          value: 'text-lg font-semibold',
          unit: 'text-xs',
          sparkHeight: 24,
        };
      case 'lg':
        return {
          container: 'p-6',
          title: 'text-sm',
          value: 'text-3xl font-bold',
          unit: 'text-sm',
          sparkHeight: 40,
        };
      case 'md':
      default:
        return {
          container: 'p-4',
          title: 'text-xs',
          value: 'text-2xl font-bold',
          unit: 'text-xs',
          sparkHeight: 32,
        };
    }
  }, [size]);

  /**
   * Render the sparkline SVG from sparkData.
   */
  const renderSparkline = useCallback(() => {
    if (!sparkData || !Array.isArray(sparkData) || sparkData.length < 2) {
      return null;
    }

    const numericData = sparkData.filter((v) => v != null && !isNaN(v)).map(Number);

    if (numericData.length < 2) {
      return null;
    }

    const height = sizeClasses.sparkHeight;
    const width = 80;
    const padding = 2;

    const min = Math.min(...numericData);
    const max = Math.max(...numericData);
    const range = max - min || 1;

    const points = numericData.map((val, index) => {
      const x = padding + (index / (numericData.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (val - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const polylinePoints = points.join(' ');

    // Determine sparkline color based on trend direction
    let strokeColor = '#94a3b8'; // muted gray default
    if (resolvedTrend) {
      const dir = resolvedTrend.direction;
      const invert = resolvedTrend.invertColor;

      if (dir === 'up') {
        strokeColor = invert ? '#16a34a' : '#dc2626';
      } else if (dir === 'down') {
        strokeColor = invert ? '#dc2626' : '#16a34a';
      }
    }

    // Build gradient fill path
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const fillPath = `M${firstPoint} ${points.slice(1).map((p) => `L${p}`).join(' ')} L${width - padding},${height - padding} L${padding},${height - padding} Z`;

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`spark-grad-${title?.replace(/\s+/g, '-') || 'default'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d={fillPath}
          fill={`url(#spark-grad-${title?.replace(/\s+/g, '-') || 'default'})`}
        />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dot on the last data point */}
        {(() => {
          const lastParts = points[points.length - 1].split(',');
          return (
            <circle
              cx={parseFloat(lastParts[0])}
              cy={parseFloat(lastParts[1])}
              r="2"
              fill={strokeColor}
            />
          );
        })()}
      </svg>
    );
  }, [sparkData, sizeClasses.sparkHeight, resolvedTrend, title]);

  /**
   * Handle card click.
   */
  const handleClick = useCallback(() => {
    if (onClick && typeof onClick === 'function') {
      onClick();
    }
  }, [onClick]);

  /**
   * Handle keyboard interaction for accessibility.
   */
  const handleKeyDown = useCallback(
    (event) => {
      if (onClick && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const isClickable = typeof onClick === 'function';

  return (
    <div
      className={`dashboard-card ${sizeClasses.container} ${
        statusConfig ? `border-l-4 ${statusConfig.borderClass}` : ''
      } ${isClickable ? 'cursor-pointer hover:shadow-card-hover' : ''} ${className}`}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={
        isClickable
          ? `${title || 'Metric'}: ${formattedValue}${unitLabel ? ` ${unitLabel}` : ''}`
          : undefined
      }
    >
      {/* Header row: title + sparkline */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {statusConfig && (
              <span
                className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${statusConfig.dotClass}`}
                aria-hidden="true"
              />
            )}
            <h3
              className={`${sizeClasses.title} font-medium text-dashboard-text-secondary uppercase tracking-wider truncate`}
            >
              {title || 'Metric'}
            </h3>
          </div>
          {subtitle && (
            <p className="text-[10px] text-dashboard-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* Sparkline */}
        {renderSparkline()}
      </div>

      {/* Value row: value + unit + trend */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1 min-w-0">
          <span
            className={`${sizeClasses.value} text-dashboard-text-primary leading-none truncate`}
          >
            {formattedValue}
          </span>
          {unitLabel && (
            <span
              className={`${sizeClasses.unit} text-dashboard-text-muted font-medium flex-shrink-0`}
            >
              {unitLabel}
            </span>
          )}
        </div>

        {/* Trend arrow */}
        {resolvedTrend && resolvedTrend.direction && (
          <TrendArrow
            direction={resolvedTrend.direction}
            value={resolvedTrend.value}
            invertColor={resolvedTrend.invertColor || false}
            size={size === 'lg' ? 'md' : 'sm'}
            showValue={resolvedTrend.value != null}
            className="flex-shrink-0"
          />
        )}
      </div>
    </div>
  );
};

export { MetricCard };
export default MetricCard;