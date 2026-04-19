import { useState, useCallback, useEffect, useRef, useMemo, createContext, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';

/**
 * Toast variant configuration with colors and icons.
 */
const TOAST_VARIANTS = Object.freeze({
  success: {
    key: 'success',
    label: 'Success',
    containerClass: 'bg-white border-l-4 border-l-status-healthy',
    iconClass: 'text-status-healthy',
  },
  error: {
    key: 'error',
    label: 'Error',
    containerClass: 'bg-white border-l-4 border-l-severity-critical',
    iconClass: 'text-severity-critical',
  },
  warning: {
    key: 'warning',
    label: 'Warning',
    containerClass: 'bg-white border-l-4 border-l-status-degraded',
    iconClass: 'text-status-degraded',
  },
  info: {
    key: 'info',
    label: 'Info',
    containerClass: 'bg-white border-l-4 border-l-brand-500',
    iconClass: 'text-brand-500',
  },
});

/**
 * Default auto-dismiss duration in milliseconds.
 */
const DEFAULT_DURATION = 5000;

/**
 * Maximum number of toasts visible at once.
 */
const MAX_VISIBLE_TOASTS = 5;

/**
 * Render the appropriate SVG icon for a toast variant.
 * @param {string} variant - The toast variant key.
 * @param {string} className - Additional CSS classes.
 * @returns {React.ReactNode}
 */
const ToastIcon = ({ variant, className = '' }) => {
  const baseClass = `w-5 h-5 flex-shrink-0 ${className}`;

  switch (variant) {
    case 'success':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'error':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      );
    case 'warning':
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      );
  }
};

/**
 * SingleToast - Individual toast notification item.
 *
 * @param {Object} props
 * @param {Object} props.toast - The toast data object.
 * @param {string} props.toast.id - Unique toast identifier.
 * @param {string} props.toast.variant - Toast variant ('success', 'error', 'warning', 'info').
 * @param {string} props.toast.message - The toast message text.
 * @param {string} [props.toast.title] - Optional toast title.
 * @param {number} [props.toast.duration] - Auto-dismiss duration in ms. 0 for persistent.
 * @param {Function} props.onDismiss - Callback to dismiss this toast.
 * @returns {React.ReactNode}
 */
const SingleToast = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef(null);
  const hoverRef = useRef(false);

  const variantConfig = TOAST_VARIANTS[toast.variant] || TOAST_VARIANTS.info;

  /**
   * Initiate the exit animation and then dismiss.
   */
  const handleDismiss = useCallback(() => {
    if (isExiting) {
      return;
    }

    setIsExiting(true);

    // Wait for exit animation to complete before removing
    setTimeout(() => {
      if (onDismiss && typeof onDismiss === 'function') {
        onDismiss(toast.id);
      }
    }, 200);
  }, [isExiting, onDismiss, toast.id]);

  /**
   * Set up auto-dismiss timer.
   */
  useEffect(() => {
    const duration = toast.duration != null ? toast.duration : DEFAULT_DURATION;

    if (duration <= 0) {
      return;
    }

    const startTimer = () => {
      timerRef.current = setTimeout(() => {
        if (!hoverRef.current) {
          handleDismiss();
        }
      }, duration);
    };

    startTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toast.duration, handleDismiss]);

  /**
   * Pause auto-dismiss on hover.
   */
  const handleMouseEnter = useCallback(() => {
    hoverRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Resume auto-dismiss on mouse leave.
   */
  const handleMouseLeave = useCallback(() => {
    hoverRef.current = false;

    const duration = toast.duration != null ? toast.duration : DEFAULT_DURATION;

    if (duration <= 0) {
      return;
    }

    // Restart timer with a shorter remaining duration
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, Math.min(duration, 2000));
  }, [toast.duration, handleDismiss]);

  /**
   * Handle keyboard dismiss.
   */
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape' || event.key === 'Delete') {
        event.preventDefault();
        handleDismiss();
      }
    },
    [handleDismiss],
  );

  return (
    <div
      className={`flex items-start gap-3 w-full max-w-sm px-4 py-3 rounded-lg border border-dashboard-border shadow-panel transition-all duration-200 ${
        variantConfig.containerClass
      } ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-slide-up'}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Icon */}
      <ToastIcon variant={toast.variant} className={variantConfig.iconClass} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-semibold text-dashboard-text-primary leading-5 truncate">
            {toast.title}
          </p>
        )}
        <p
          className={`text-sm text-dashboard-text-secondary leading-5 ${
            toast.title ? 'mt-0.5' : ''
          }`}
        >
          {toast.message}
        </p>
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="flex items-center justify-center w-6 h-6 rounded-md text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary transition-colors duration-150 flex-shrink-0 -mt-0.5 -mr-1"
        aria-label="Dismiss notification"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

/**
 * ToastContainer - Renders the stack of active toast notifications.
 * Positioned fixed at the top-right of the viewport.
 *
 * @param {Object} props
 * @param {Object[]} props.toasts - Array of toast data objects.
 * @param {Function} props.onDismiss - Callback to dismiss a toast by ID.
 * @returns {React.ReactNode}
 */
const ToastContainer = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) {
    return null;
  }

  // Limit visible toasts
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
      role="region"
    >
      {visibleToasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <SingleToast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};

// ─── Toast Context ─────────────────────────────────────────────────────────

const ToastContext = createContext(null);

/**
 * ToastProvider - Context provider that manages toast state and exposes
 * the toast API to child components via the useToast hook.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components.
 * @returns {React.ReactNode}
 */
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  /**
   * Add a new toast notification.
   * @param {Object} options - Toast options.
   * @param {string} options.message - The toast message text.
   * @param {string} [options.variant='info'] - Toast variant ('success', 'error', 'warning', 'info').
   * @param {string} [options.title] - Optional toast title.
   * @param {number} [options.duration=DEFAULT_DURATION] - Auto-dismiss duration in ms. 0 for persistent.
   * @returns {string} The unique toast ID.
   */
  const addToast = useCallback((options) => {
    if (!options || typeof options !== 'object') {
      return '';
    }

    const id = `toast-${uuidv4()}`;

    const normalizedVariant =
      options.variant && typeof options.variant === 'string' && TOAST_VARIANTS[options.variant.toLowerCase()]
        ? options.variant.toLowerCase()
        : 'info';

    const toast = {
      id,
      message: options.message || '',
      variant: normalizedVariant,
      title: options.title || null,
      duration: options.duration != null ? options.duration : DEFAULT_DURATION,
      createdAt: Date.now(),
    };

    setToasts((prev) => [...prev, toast]);

    return id;
  }, []);

  /**
   * Dismiss a toast by its ID.
   * @param {string} toastId - The toast ID to dismiss.
   */
  const dismissToast = useCallback((toastId) => {
    if (!toastId) {
      return;
    }

    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  /**
   * Dismiss all active toasts.
   */
  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  /**
   * Convenience method: show a success toast.
   * @param {string} message - The toast message.
   * @param {Object} [options] - Additional toast options.
   * @returns {string} The toast ID.
   */
  const success = useCallback(
    (message, options = {}) => {
      return addToast({ ...options, message, variant: 'success' });
    },
    [addToast],
  );

  /**
   * Convenience method: show an error toast.
   * @param {string} message - The toast message.
   * @param {Object} [options] - Additional toast options.
   * @returns {string} The toast ID.
   */
  const error = useCallback(
    (message, options = {}) => {
      return addToast({ ...options, message, variant: 'error', duration: options.duration != null ? options.duration : 8000 });
    },
    [addToast],
  );

  /**
   * Convenience method: show a warning toast.
   * @param {string} message - The toast message.
   * @param {Object} [options] - Additional toast options.
   * @returns {string} The toast ID.
   */
  const warning = useCallback(
    (message, options = {}) => {
      return addToast({ ...options, message, variant: 'warning', duration: options.duration != null ? options.duration : 6000 });
    },
    [addToast],
  );

  /**
   * Convenience method: show an info toast.
   * @param {string} message - The toast message.
   * @param {Object} [options] - Additional toast options.
   * @returns {string} The toast ID.
   */
  const info = useCallback(
    (message, options = {}) => {
      return addToast({ ...options, message, variant: 'info' });
    },
    [addToast],
  );

  const contextValue = useMemo(
    () => ({
      toasts,
      addToast,
      dismissToast,
      dismissAll,
      success,
      error,
      warning,
      info,
    }),
    [toasts, addToast, dismissToast, dismissAll, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

/**
 * Custom hook to access the toast notification API.
 * Must be used within a ToastProvider.
 *
 * @returns {{
 *   toasts: Object[],
 *   addToast: (options: Object) => string,
 *   dismissToast: (toastId: string) => void,
 *   dismissAll: () => void,
 *   success: (message: string, options?: Object) => string,
 *   error: (message: string, options?: Object) => string,
 *   warning: (message: string, options?: Object) => string,
 *   info: (message: string, options?: Object) => string,
 * }}
 */
const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      'useToast must be used within a ToastProvider. Wrap your component tree with <ToastProvider>.',
    );
  }

  return context;
};

export { ToastNotification, ToastProvider, ToastContainer, useToast, TOAST_VARIANTS, DEFAULT_DURATION, MAX_VISIBLE_TOASTS };

/**
 * ToastNotification - Standalone toast component that can be rendered directly.
 * For most use cases, prefer the ToastProvider + useToast pattern instead.
 *
 * @param {Object} props
 * @param {string} props.message - The toast message text.
 * @param {string} [props.variant='info'] - Toast variant ('success', 'error', 'warning', 'info').
 * @param {string} [props.title] - Optional toast title.
 * @param {number} [props.duration=DEFAULT_DURATION] - Auto-dismiss duration in ms. 0 for persistent.
 * @param {boolean} [props.visible=true] - Whether the toast is visible.
 * @param {Function} [props.onDismiss] - Callback when the toast is dismissed.
 * @param {string} [props.className=''] - Additional CSS classes.
 * @returns {React.ReactNode}
 */
const ToastNotification = ({
  message,
  variant = 'info',
  title,
  duration = DEFAULT_DURATION,
  visible = true,
  onDismiss,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(visible);

  useEffect(() => {
    setIsVisible(visible);
  }, [visible]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);

    if (onDismiss && typeof onDismiss === 'function') {
      onDismiss();
    }
  }, [onDismiss]);

  if (!isVisible) {
    return null;
  }

  const toast = {
    id: 'standalone-toast',
    message: message || '',
    variant: variant || 'info',
    title: title || null,
    duration: duration != null ? duration : DEFAULT_DURATION,
  };

  return (
    <div className={`fixed top-4 right-4 z-[9999] ${className}`}>
      <SingleToast toast={toast} onDismiss={handleDismiss} />
    </div>
  );
};

export default ToastNotification;