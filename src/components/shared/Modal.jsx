import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * Modal - Reusable modal dialog component with overlay, title, body, and footer actions.
 *
 * Features:
 * - Overlay backdrop with click-to-close support
 * - Close on Escape key press
 * - Customizable title, body content, and footer actions
 * - Multiple size variants (sm, md, lg, xl, full)
 * - Optional close button in header
 * - Focus trap within the modal when open
 * - Scroll lock on body when open
 * - Animated entrance/exit via CSS classes
 * - Accessible with appropriate ARIA attributes
 * - Renders via React portal pattern (inline, since no portal utility exists)
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is currently open/visible.
 * @param {Function} props.onClose - Callback fired when the modal requests to close (Escape, overlay click, close button).
 * @param {string} [props.title] - Optional title text displayed in the modal header.
 * @param {React.ReactNode} [props.children] - The modal body content.
 * @param {React.ReactNode} [props.footer] - Optional footer content (typically action buttons).
 * @param {'sm'|'md'|'lg'|'xl'|'full'} [props.size='md'] - The modal width variant.
 * @param {boolean} [props.showCloseButton=true] - Whether to show the X close button in the header.
 * @param {boolean} [props.closeOnOverlayClick=true] - Whether clicking the overlay backdrop closes the modal.
 * @param {boolean} [props.closeOnEscape=true] - Whether pressing Escape closes the modal.
 * @param {string} [props.className=''] - Additional CSS classes for the modal panel.
 * @param {string} [props.overlayClassName=''] - Additional CSS classes for the overlay backdrop.
 * @param {React.ReactNode} [props.icon] - Optional icon rendered before the title.
 * @param {string} [props.description] - Optional description text below the title.
 * @param {boolean} [props.preventBodyScroll=true] - Whether to prevent body scrolling when the modal is open.
 * @returns {React.ReactNode}
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  overlayClassName = '',
  icon,
  description,
  preventBodyScroll = true,
}) => {
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  /**
   * Resolve size-specific CSS classes for the modal panel width.
   */
  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'max-w-sm';
      case 'lg':
        return 'max-w-2xl';
      case 'xl':
        return 'max-w-4xl';
      case 'full':
        return 'max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)]';
      case 'md':
      default:
        return 'max-w-lg';
    }
  }, [size]);

  /**
   * Handle close request.
   */
  const handleClose = useCallback(() => {
    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  /**
   * Handle overlay click.
   */
  const handleOverlayClick = useCallback(
    (event) => {
      if (!closeOnOverlayClick) {
        return;
      }

      // Only close if the click target is the overlay itself, not the modal content
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [closeOnOverlayClick, handleClose],
  );

  /**
   * Handle Escape key press.
   */
  useEffect(() => {
    if (!isOpen || !closeOnEscape) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeOnEscape, handleClose]);

  /**
   * Prevent body scroll when modal is open.
   */
  useEffect(() => {
    if (!preventBodyScroll) {
      return;
    }

    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen, preventBodyScroll]);

  /**
   * Focus management: store previously focused element and restore on close.
   */
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement;

      // Focus the modal panel after a brief delay to allow animation
      const timer = setTimeout(() => {
        if (modalRef.current) {
          modalRef.current.focus();
        }
      }, 50);

      return () => {
        clearTimeout(timer);
      };
    } else {
      // Restore focus to the previously focused element
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    }
  }, [isOpen]);

  /**
   * Trap focus within the modal when open.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleTabKey = (event) => {
      if (event.key !== 'Tab' || !modalRef.current) {
        return;
      }

      const focusableElements = modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab: if focus is on the first element, wrap to last
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab: if focus is on the last element, wrap to first
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    window.addEventListener('keydown', handleTabKey);

    return () => {
      window.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  // Don't render anything if the modal is not open
  if (!isOpen) {
    return null;
  }

  const hasHeader = title || icon || description || showCloseButton;
  const hasFooter = footer != null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-200 animate-fade-in ${overlayClassName}`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Centering container */}
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={handleOverlayClick}
      >
        {/* Modal panel */}
        <div
          ref={modalRef}
          className={`relative w-full ${sizeClasses} bg-white rounded-xl border border-dashboard-border shadow-panel transform transition-all duration-200 animate-slide-up ${className}`}
          tabIndex={-1}
          role="document"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {hasHeader && (
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-0">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Icon */}
                {icon && (
                  <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
                    {icon}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {/* Title */}
                  {title && (
                    <h3
                      id="modal-title"
                      className="text-lg font-semibold text-dashboard-text-primary leading-6"
                    >
                      {title}
                    </h3>
                  )}

                  {/* Description */}
                  {description && (
                    <p
                      id="modal-description"
                      className="mt-1 text-sm text-dashboard-text-secondary"
                    >
                      {description}
                    </p>
                  )}
                </div>
              </div>

              {/* Close button */}
              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary transition-colors duration-150 flex-shrink-0 -mt-1 -mr-1"
                  aria-label="Close modal"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Body */}
          {children && (
            <div
              className={`px-6 overflow-y-auto scrollbar-thin ${
                hasHeader ? 'pt-4' : 'pt-6'
              } ${hasFooter ? 'pb-4' : 'pb-6'}`}
              style={{ maxHeight: 'calc(80vh - 10rem)' }}
            >
              {children}
            </div>
          )}

          {/* Footer */}
          {hasFooter && (
            <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { Modal };
export default Modal;