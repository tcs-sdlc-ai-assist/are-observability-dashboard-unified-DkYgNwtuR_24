import { useMemo } from 'react';

/**
 * LoadingSpinner - Shared loading state indicator component with optional message text.
 * Used during data fetching, file upload processing, and other async operations.
 *
 * Features:
 * - Animated spinning indicator
 * - Optional message text below the spinner
 * - Multiple size variants (sm, md, lg)
 * - Optional overlay mode for covering parent containers
 * - Customizable colors via className
 * - Accessible with aria attributes
 *
 * @param {Object} props
 * @param {string} [props.message] - Optional message text displayed below the spinner.
 * @param {'sm'|'md'|'lg'} [props.size='md'] - The spinner size variant.
 * @param {boolean} [props.overlay=false] - If true, renders as a centered overlay covering the parent container.
 * @param {boolean} [props.fullScreen=false] - If true, renders as a full-screen centered overlay.
 * @param {string} [props.className=''] - Additional CSS classes to apply to the container.
 * @param {string} [props.spinnerClassName=''] - Additional CSS classes to apply to the spinner element.
 * @returns {React.ReactNode}
 */
const LoadingSpinner = ({
  message,
  size = 'md',
  overlay = false,
  fullScreen = false,
  className = '',
  spinnerClassName = '',
}) => {
  /**
   * Resolve size-specific CSS classes for the spinner and text.
   */
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          spinner: 'w-5 h-5 border-2',
          text: 'text-xs',
          gap: 'gap-2',
        };
      case 'lg':
        return {
          spinner: 'w-12 h-12 border-[5px]',
          text: 'text-base',
          gap: 'gap-4',
        };
      case 'md':
      default:
        return {
          spinner: 'w-8 h-8 border-4',
          text: 'text-sm',
          gap: 'gap-3',
        };
    }
  }, [size]);

  /**
   * Resolve the container CSS classes based on overlay/fullScreen mode.
   */
  const containerClasses = useMemo(() => {
    if (fullScreen) {
      return 'fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm';
    }

    if (overlay) {
      return 'absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm rounded-lg';
    }

    return 'flex items-center justify-center';
  }, [overlay, fullScreen]);

  return (
    <div
      className={`${containerClasses} ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message || 'Loading'}
    >
      <div className={`flex flex-col items-center ${sizeClasses.gap}`}>
        <div
          className={`${sizeClasses.spinner} border-brand-200 border-t-brand-600 rounded-full animate-spin ${spinnerClassName}`}
        />
        {message && (
          <p className={`${sizeClasses.text} text-dashboard-text-secondary font-medium`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export { LoadingSpinner };
export default LoadingSpinner;