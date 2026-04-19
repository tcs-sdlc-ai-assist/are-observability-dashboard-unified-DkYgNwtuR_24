import { useMemo, useCallback } from 'react';

/**
 * EmptyState - Shared empty state placeholder component displayed when no data
 * is available for a section or view.
 *
 * Features:
 * - Customizable icon (SVG or React node)
 * - Title and description text
 * - Optional action button with click handler
 * - Optional secondary action link
 * - Multiple size variants (sm, md, lg)
 * - Optional illustration/icon presets for common empty states
 * - Accessible with appropriate ARIA attributes
 * - Responsive layout
 *
 * @param {Object} props
 * @param {string} [props.title='No data available'] - The empty state title text.
 * @param {string} [props.description] - Optional description text displayed below the title.
 * @param {React.ReactNode} [props.icon] - Optional custom icon or illustration to display. If omitted, a default icon is rendered.
 * @param {string} [props.preset] - Optional preset key for common empty states ('no-data', 'no-results', 'no-incidents', 'no-services', 'no-metrics', 'error', 'no-access').
 * @param {string} [props.actionLabel] - Label text for the primary action button.
 * @param {Function} [props.onAction] - Click handler for the primary action button.
 * @param {string} [props.secondaryActionLabel] - Label text for a secondary action link.
 * @param {Function} [props.onSecondaryAction] - Click handler for the secondary action link.
 * @param {'sm'|'md'|'lg'} [props.size='md'] - The size variant for the empty state.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout without extra padding.
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @returns {React.ReactNode}
 */
const EmptyState = ({
  title,
  description,
  icon,
  preset,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  size = 'md',
  compact = false,
  className = '',
}) => {
  /**
   * Resolve preset configuration for common empty state types.
   */
  const presetConfig = useMemo(() => {
    if (!preset || typeof preset !== 'string') {
      return null;
    }

    const normalizedPreset = preset.toLowerCase().trim();

    switch (normalizedPreset) {
      case 'no-data':
        return {
          title: 'No data available',
          description: 'There is no data to display at this time. Try adjusting your filters or uploading new data.',
          iconKey: 'empty-box',
        };
      case 'no-results':
        return {
          title: 'No results found',
          description: 'Your search or filter criteria did not match any records. Try broadening your search.',
          iconKey: 'search',
        };
      case 'no-incidents':
        return {
          title: 'No incidents',
          description: 'There are no incidents matching the current filters. All systems are operating normally.',
          iconKey: 'check-circle',
        };
      case 'no-services':
        return {
          title: 'No services found',
          description: 'No services are available for the selected domain or filter criteria.',
          iconKey: 'server',
        };
      case 'no-metrics':
        return {
          title: 'No metrics available',
          description: 'Metric data has not been loaded yet. Try uploading a metrics CSV or adjusting the time range.',
          iconKey: 'chart',
        };
      case 'error':
        return {
          title: 'Something went wrong',
          description: 'An error occurred while loading data. Please try again or contact your administrator.',
          iconKey: 'error',
        };
      case 'no-access':
        return {
          title: 'Access restricted',
          description: 'You do not have permission to view this content. Contact your administrator for access.',
          iconKey: 'lock',
        };
      default:
        return null;
    }
  }, [preset]);

  /**
   * Resolve the display title, preferring explicit prop over preset.
   */
  const displayTitle = title || (presetConfig ? presetConfig.title : 'No data available');

  /**
   * Resolve the display description, preferring explicit prop over preset.
   */
  const displayDescription = description || (presetConfig ? presetConfig.description : undefined);

  /**
   * Resolve size-specific CSS classes.
   */
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          container: compact ? 'py-6' : 'py-8',
          iconWrapper: 'w-10 h-10',
          iconSvg: 'w-5 h-5',
          title: 'text-sm',
          description: 'text-xs',
          gap: 'gap-2',
          button: 'px-3 py-1.5 text-xs',
          link: 'text-xs',
        };
      case 'lg':
        return {
          container: compact ? 'py-12' : 'py-20',
          iconWrapper: 'w-20 h-20',
          iconSvg: 'w-10 h-10',
          title: 'text-xl',
          description: 'text-sm',
          gap: 'gap-4',
          button: 'px-5 py-2.5 text-sm',
          link: 'text-sm',
        };
      case 'md':
      default:
        return {
          container: compact ? 'py-8' : 'py-16',
          iconWrapper: 'w-16 h-16',
          iconSvg: 'w-8 h-8',
          title: 'text-base',
          description: 'text-sm',
          gap: 'gap-3',
          button: 'px-4 py-2 text-sm',
          link: 'text-xs',
        };
    }
  }, [size, compact]);

  /**
   * Resolve the icon key from preset or default.
   */
  const iconKey = presetConfig ? presetConfig.iconKey : 'empty-box';

  /**
   * Render the icon SVG based on the icon key.
   */
  const renderIcon = useCallback(() => {
    // If a custom icon node is provided, render it directly
    if (icon) {
      return icon;
    }

    const svgClass = `${sizeClasses.iconSvg} text-dashboard-text-muted`;

    switch (iconKey) {
      case 'search':
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        );
      case 'check-circle':
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'server':
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
          </svg>
        );
      case 'chart':
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        );
      case 'error':
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        );
      case 'lock':
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        );
      case 'empty-box':
      default:
        return (
          <svg className={svgClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        );
    }
  }, [icon, iconKey, sizeClasses.iconSvg]);

  /**
   * Handle primary action click.
   */
  const handleAction = useCallback(() => {
    if (onAction && typeof onAction === 'function') {
      onAction();
    }
  }, [onAction]);

  /**
   * Handle secondary action click.
   */
  const handleSecondaryAction = useCallback(() => {
    if (onSecondaryAction && typeof onSecondaryAction === 'function') {
      onSecondaryAction();
    }
  }, [onSecondaryAction]);

  /**
   * Handle keyboard interaction for accessibility on the action button.
   */
  const handleActionKeyDown = useCallback(
    (event) => {
      if (onAction && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onAction();
      }
    },
    [onAction],
  );

  const hasAction = actionLabel && typeof onAction === 'function';
  const hasSecondaryAction = secondaryActionLabel && typeof onSecondaryAction === 'function';

  return (
    <div
      className={`flex items-center justify-center ${sizeClasses.container} ${className}`}
      role="status"
      aria-label={displayTitle}
    >
      <div className={`flex flex-col items-center text-center max-w-md ${sizeClasses.gap}`}>
        {/* Icon */}
        <div
          className={`flex items-center justify-center ${sizeClasses.iconWrapper} rounded-full bg-gray-50`}
          aria-hidden="true"
        >
          {renderIcon()}
        </div>

        {/* Title */}
        <h3
          className={`${sizeClasses.title} font-semibold text-dashboard-text-primary`}
        >
          {displayTitle}
        </h3>

        {/* Description */}
        {displayDescription && (
          <p
            className={`${sizeClasses.description} text-dashboard-text-muted max-w-sm`}
          >
            {displayDescription}
          </p>
        )}

        {/* Actions */}
        {(hasAction || hasSecondaryAction) && (
          <div className="flex items-center gap-3 mt-1">
            {hasAction && (
              <button
                onClick={handleAction}
                onKeyDown={handleActionKeyDown}
                className={`${sizeClasses.button} font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2`}
              >
                {actionLabel}
              </button>
            )}
            {hasSecondaryAction && (
              <button
                onClick={handleSecondaryAction}
                className={`${sizeClasses.link} font-medium text-brand-600 hover:text-brand-700 transition-colors duration-150`}
              >
                {secondaryActionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { EmptyState };
export default EmptyState;