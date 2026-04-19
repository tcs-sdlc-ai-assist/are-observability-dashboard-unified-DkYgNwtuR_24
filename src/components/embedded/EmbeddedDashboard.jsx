import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { StatusBadge } from '../shared/StatusBadge';

/**
 * EmbeddedDashboard - Iframe wrapper component for embedding external dashboards
 * (Dynatrace, Elastic, or any third-party observability tool). Renders the external
 * dashboard within a responsive iframe with loading state, error fallback, and
 * refresh controls.
 *
 * Features:
 * - Responsive iframe container with configurable height
 * - Loading spinner while the iframe content loads
 * - Error fallback when the URL is unavailable or not configured
 * - Refresh button to reload the embedded content
 * - Full-screen toggle (opens in new tab)
 * - Title bar with status indicator
 * - Sandbox attributes for security
 * - Accessible with appropriate ARIA attributes
 * - URLs sourced from environment variables
 *
 * @param {Object} props
 * @param {string} [props.url] - The URL to embed in the iframe. If omitted, falls back to env var lookup.
 * @param {string} [props.title='Embedded Dashboard'] - The display title for the dashboard.
 * @param {number|string} [props.height=600] - The height of the iframe in pixels or CSS value.
 * @param {string} [props.envKey] - The environment variable key to resolve the URL from (e.g., 'VITE_DYNATRACE_EMBED_URL').
 * @param {string} [props.description] - Optional description text displayed below the title.
 * @param {boolean} [props.showHeader=true] - Whether to show the header bar with title and controls.
 * @param {boolean} [props.showRefresh=true] - Whether to show the refresh button.
 * @param {boolean} [props.showOpenExternal=true] - Whether to show the open-in-new-tab button.
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {string} [props.sandbox] - Custom sandbox attribute for the iframe. Defaults to a secure set.
 * @returns {React.ReactNode}
 */
const EmbeddedDashboard = ({
  url: propUrl,
  title = 'Embedded Dashboard',
  height = 600,
  envKey,
  description,
  showHeader = true,
  showRefresh = true,
  showOpenExternal = true,
  className = '',
  sandbox,
}) => {
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Resolve the embed URL from props or environment variables.
   */
  const resolvedUrl = useMemo(() => {
    // Prefer explicit URL prop
    if (propUrl && typeof propUrl === 'string' && propUrl.trim().length > 0) {
      return propUrl.trim();
    }

    // Fall back to environment variable
    if (envKey && typeof envKey === 'string') {
      const envUrl = import.meta.env[envKey];
      if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
        return envUrl.trim();
      }
    }

    return null;
  }, [propUrl, envKey]);

  /**
   * Determine if the URL is available and valid.
   */
  const isUrlAvailable = useMemo(() => {
    if (!resolvedUrl) {
      return false;
    }

    try {
      new URL(resolvedUrl);
      return true;
    } catch (_e) {
      return false;
    }
  }, [resolvedUrl]);

  /**
   * Compute the iframe height style value.
   */
  const iframeHeight = useMemo(() => {
    if (typeof height === 'number') {
      return `${height}px`;
    }

    if (typeof height === 'string') {
      // If it's already a CSS value (e.g., '100%', '600px'), use as-is
      if (/^\d+$/.test(height)) {
        return `${height}px`;
      }
      return height;
    }

    return '600px';
  }, [height]);

  /**
   * Default sandbox attributes for security.
   * Allows scripts and same-origin for most embedded dashboards to function.
   */
  const sandboxValue = useMemo(() => {
    if (sandbox && typeof sandbox === 'string') {
      return sandbox;
    }

    return 'allow-scripts allow-same-origin allow-popups allow-forms';
  }, [sandbox]);

  /**
   * Handle iframe load event.
   */
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  /**
   * Handle iframe error event.
   */
  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  /**
   * Refresh the embedded dashboard by remounting the iframe.
   */
  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setRefreshKey((prev) => prev + 1);
  }, []);

  /**
   * Open the embedded URL in a new browser tab.
   */
  const handleOpenExternal = useCallback(() => {
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    }
  }, [resolvedUrl]);

  /**
   * Reset loading state when the URL changes.
   */
  useEffect(() => {
    if (isUrlAvailable) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [resolvedUrl, isUrlAvailable]);

  /**
   * Set a timeout to detect if the iframe fails to load within a reasonable time.
   */
  useEffect(() => {
    if (!isUrlAvailable || !isLoading) {
      return;
    }

    const timeout = setTimeout(() => {
      // If still loading after 30 seconds, assume an issue
      if (isLoading) {
        setIsLoading(false);
        // Don't set error — the iframe may still be loading slowly
      }
    }, 30000);

    return () => {
      clearTimeout(timeout);
    };
  }, [isUrlAvailable, isLoading, refreshKey]);

  // URL not configured — show empty state
  if (!isUrlAvailable) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          {/* Header */}
          {showHeader && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-dashboard-text-primary">{title}</h3>
                <StatusBadge status="unknown" size="sm" label="Not Configured" />
              </div>
            </div>
          )}

          <EmptyState
            preset="no-data"
            title={`${title} Not Available`}
            description={
              resolvedUrl
                ? `The URL "${resolvedUrl}" is not a valid URL. Please check the configuration.`
                : envKey
                  ? `The environment variable "${envKey}" is not configured. Set it in your .env file to enable this embedded dashboard.`
                  : 'No URL has been provided for this embedded dashboard. Configure the URL via environment variables or component props.'
            }
            size="md"
            icon={
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
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="dashboard-card overflow-hidden">
        {/* Header */}
        {showHeader && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">{title}</h3>
              {isLoading && (
                <StatusBadge status="warning" size="sm" label="Loading…" />
              )}
              {!isLoading && hasError && (
                <StatusBadge status="critical" size="sm" label="Error" />
              )}
              {!isLoading && !hasError && (
                <StatusBadge status="healthy" size="sm" label="Connected" />
              )}
              {description && (
                <span className="text-xs text-dashboard-text-muted hidden sm:inline truncate max-w-[240px]">
                  {description}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Refresh button */}
              {showRefresh && (
                <button
                  onClick={handleRefresh}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary transition-colors duration-150"
                  aria-label={`Refresh ${title}`}
                  title="Refresh dashboard"
                >
                  <svg
                    className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
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
                </button>
              )}

              {/* Open in new tab button */}
              {showOpenExternal && (
                <button
                  onClick={handleOpenExternal}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary transition-colors duration-150"
                  aria-label={`Open ${title} in new tab`}
                  title="Open in new tab"
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
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Iframe Container */}
        <div className="relative" style={{ height: iframeHeight }}>
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
              <LoadingSpinner
                message={`Loading ${title}…`}
                size="md"
              />
            </div>
          )}

          {/* Error overlay */}
          {!isLoading && hasError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
              <EmptyState
                preset="error"
                title="Failed to Load Dashboard"
                description={`The embedded dashboard at "${resolvedUrl}" could not be loaded. This may be due to network issues, CORS restrictions, or the service being unavailable.`}
                size="sm"
                compact
                actionLabel="Retry"
                onAction={handleRefresh}
                secondaryActionLabel="Open in New Tab"
                onSecondaryAction={handleOpenExternal}
              />
            </div>
          )}

          {/* Iframe */}
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={resolvedUrl}
            title={title}
            width="100%"
            height="100%"
            style={{ border: 'none', display: 'block' }}
            sandbox={sandboxValue}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            aria-label={`Embedded dashboard: ${title}`}
          />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span className="flex items-center gap-1.5">
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
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              External Dashboard
            </span>
            <span className="hidden sm:inline truncate max-w-[300px] font-mono text-[10px]">
              {resolvedUrl}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            {!isLoading && !hasError && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-healthy" />
                Connected
              </span>
            )}
            {isLoading && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-degraded animate-pulse" />
                Loading
              </span>
            )}
            {!isLoading && hasError && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-down" />
                Unavailable
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { EmbeddedDashboard };
export default EmbeddedDashboard;