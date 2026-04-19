import { useMemo } from 'react';

/**
 * TrendArrow - Small trend direction indicator component showing up/down/stable
 * arrow with color coding (green for improvement, red for degradation).
 *
 * Color logic:
 * - "up" direction: defaults to red (degradation, e.g., latency increasing) unless
 *   `invertColor` is true (e.g., availability increasing = good).
 * - "down" direction: defaults to green (improvement, e.g., latency decreasing) unless
 *   `invertColor` is true (e.g., availability decreasing = bad).
 * - "stable" direction: neutral gray.
 *
 * @param {Object} props
 * @param {'up'|'down'|'stable'} props.direction - The trend direction.
 * @param {number|string} [props.value] - Optional numeric value to display alongside the arrow (e.g., percentage change).
 * @param {boolean} [props.invertColor=false] - If true, inverts the color logic (up = green, down = red).
 *   Use this for metrics where higher values are better (e.g., availability, error budget).
 * @param {'sm'|'md'|'lg'} [props.size='md'] - The size variant for the arrow and text.
 * @param {boolean} [props.showValue=true] - Whether to display the value text alongside the arrow.
 * @param {string} [props.className=''] - Additional CSS classes to apply to the container.
 * @returns {React.ReactNode}
 */
const TrendArrow = ({
  direction,
  value,
  invertColor = false,
  size = 'md',
  showValue = true,
  className = '',
}) => {
  /**
   * Normalize the direction to a known value.
   */
  const normalizedDirection = useMemo(() => {
    if (!direction || typeof direction !== 'string') {
      return 'stable';
    }

    const lower = direction.toLowerCase().trim();

    if (lower === 'up') return 'up';
    if (lower === 'down') return 'down';
    return 'stable';
  }, [direction]);

  /**
   * Resolve the color class based on direction and invertColor flag.
   *
   * Default (invertColor = false):
   *   - up = red (degradation — e.g., latency going up is bad)
   *   - down = green (improvement — e.g., latency going down is good)
   *   - stable = gray (neutral)
   *
   * Inverted (invertColor = true):
   *   - up = green (improvement — e.g., availability going up is good)
   *   - down = red (degradation — e.g., availability going down is bad)
   *   - stable = gray (neutral)
   */
  const colorClass = useMemo(() => {
    if (normalizedDirection === 'stable') {
      return 'text-dashboard-text-muted';
    }

    if (normalizedDirection === 'up') {
      return invertColor ? 'text-status-healthy' : 'text-severity-critical';
    }

    // down
    return invertColor ? 'text-severity-critical' : 'text-status-healthy';
  }, [normalizedDirection, invertColor]);

  /**
   * Resolve size-specific CSS classes for the icon and text.
   */
  const sizeConfig = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          icon: 'w-3 h-3',
          text: 'text-[10px] leading-3',
          gap: 'gap-0.5',
        };
      case 'lg':
        return {
          icon: 'w-5 h-5',
          text: 'text-sm leading-5',
          gap: 'gap-1.5',
        };
      case 'md':
      default:
        return {
          icon: 'w-4 h-4',
          text: 'text-xs leading-4',
          gap: 'gap-1',
        };
    }
  }, [size]);

  /**
   * Format the display value.
   */
  const displayValue = useMemo(() => {
    if (value == null || value === '') {
      return null;
    }

    const numValue = parseFloat(value);

    if (isNaN(numValue)) {
      return String(value);
    }

    const absValue = Math.abs(numValue);
    const formatted = absValue % 1 === 0 ? absValue.toFixed(0) : absValue.toFixed(1);

    return `${formatted}%`;
  }, [value]);

  /**
   * Render the appropriate SVG arrow icon based on direction.
   */
  const renderIcon = () => {
    const iconClass = `${sizeConfig.icon} flex-shrink-0 ${colorClass}`;

    if (normalizedDirection === 'up') {
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
        </svg>
      );
    }

    if (normalizedDirection === 'down') {
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
        </svg>
      );
    }

    // stable — horizontal dash/arrow
    return (
      <svg
        className={iconClass}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
      </svg>
    );
  };

  /**
   * Build the accessible label for screen readers.
   */
  const ariaLabel = useMemo(() => {
    const directionLabel =
      normalizedDirection === 'up'
        ? 'Trending up'
        : normalizedDirection === 'down'
          ? 'Trending down'
          : 'Stable';

    if (displayValue) {
      return `${directionLabel} ${displayValue}`;
    }

    return directionLabel;
  }, [normalizedDirection, displayValue]);

  return (
    <span
      className={`inline-flex items-center ${sizeConfig.gap} ${className}`}
      title={ariaLabel}
      aria-label={ariaLabel}
      role="img"
    >
      {renderIcon()}
      {showValue && displayValue && (
        <span className={`${sizeConfig.text} font-medium ${colorClass}`}>
          {displayValue}
        </span>
      )}
    </span>
  );
};

export { TrendArrow };
export default TrendArrow;