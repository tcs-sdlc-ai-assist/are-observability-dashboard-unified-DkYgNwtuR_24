import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { StatusBadge } from '../shared/StatusBadge';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { getExternalLinks } from '../../constants/navigation';

/**
 * SOPLinks - Component displaying categorized links to ARE playbooks, runbooks,
 * and escalation SOPs. Organized by domain/category with external link icons.
 * Data sourced from dashboard configuration (confluence_links) and navigation
 * constants (external links).
 *
 * Features:
 * - Categorized link directory (SOP, Runbook, Architecture, External Tools)
 * - External link icons with open-in-new-tab behavior
 * - Category filter toggle to show/hide specific categories
 * - Search/filter across link titles and categories
 * - Link count badges per category
 * - Availability indicators for external tool links
 * - Responsive grid layout with compact mode support
 * - Loading and empty states
 * - Accessible with appropriate ARIA attributes
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showSearch=true] - Whether to show the search input.
 * @param {boolean} [props.showCategoryFilter=true] - Whether to show the category filter toggles.
 * @param {boolean} [props.showExternalTools=true] - Whether to include external tool links from navigation constants.
 * @returns {React.ReactNode}
 */
const SOPLinks = ({
  className = '',
  compact = false,
  showSearch = true,
  showCategoryFilter = true,
  showExternalTools = true,
}) => {
  const { dashboardData, isLoading, error } = useDashboard();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  /**
   * Get confluence/SOP links from dashboard data configuration.
   */
  const confluenceLinks = useMemo(() => {
    if (!dashboardData || !dashboardData.config || !dashboardData.config.confluence_links) {
      return [];
    }

    return dashboardData.config.confluence_links.map((link, idx) => ({
      id: `confluence-${idx}`,
      title: link.title || '',
      url: link.url || '',
      category: link.category || 'General',
      source: 'confluence',
      isAvailable: Boolean(link.url),
    }));
  }, [dashboardData]);

  /**
   * Get external tool links from navigation constants.
   */
  const externalToolLinks = useMemo(() => {
    if (!showExternalTools) {
      return [];
    }

    const links = getExternalLinks();

    return links.map((link) => ({
      id: `external-${link.key}`,
      title: link.label || '',
      url: link.url || '',
      category: 'External Tools',
      source: 'external',
      isAvailable: link.isAvailable || false,
      description: link.description || '',
    }));
  }, [showExternalTools]);

  /**
   * Combine all links into a single array.
   */
  const allLinks = useMemo(() => {
    return [...confluenceLinks, ...externalToolLinks];
  }, [confluenceLinks, externalToolLinks]);

  /**
   * Extract unique categories from all links.
   */
  const categories = useMemo(() => {
    if (!allLinks || allLinks.length === 0) {
      return [];
    }

    const categoryMap = new Map();

    for (const link of allLinks) {
      const cat = link.category || 'General';

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { name: cat, count: 0 });
      }

      categoryMap.get(cat).count += 1;
    }

    return Array.from(categoryMap.values()).sort((a, b) => {
      // Sort with a preferred order: SOP, Runbook, Architecture, External Tools, then alphabetical
      const order = ['SOP', 'Runbook', 'Architecture', 'External Tools', 'General'];
      const aIdx = order.indexOf(a.name);
      const bIdx = order.indexOf(b.name);

      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [allLinks]);

  /**
   * Filter links based on search query and active category.
   */
  const filteredLinks = useMemo(() => {
    if (!allLinks || allLinks.length === 0) {
      return [];
    }

    let links = [...allLinks];

    // Apply category filter
    if (activeCategory) {
      links = links.filter((link) => link.category === activeCategory);
    }

    // Apply search filter
    if (searchQuery && searchQuery.trim().length > 0) {
      const query = searchQuery.trim().toLowerCase();
      links = links.filter(
        (link) =>
          (link.title && link.title.toLowerCase().includes(query)) ||
          (link.category && link.category.toLowerCase().includes(query)) ||
          (link.description && link.description.toLowerCase().includes(query)) ||
          (link.url && link.url.toLowerCase().includes(query)),
      );
    }

    return links;
  }, [allLinks, activeCategory, searchQuery]);

  /**
   * Group filtered links by category for display.
   */
  const groupedLinks = useMemo(() => {
    if (!filteredLinks || filteredLinks.length === 0) {
      return [];
    }

    const groupMap = new Map();

    for (const link of filteredLinks) {
      const cat = link.category || 'General';

      if (!groupMap.has(cat)) {
        groupMap.set(cat, { category: cat, links: [] });
      }

      groupMap.get(cat).links.push(link);
    }

    const groups = Array.from(groupMap.values());

    // Sort groups by preferred order
    const order = ['SOP', 'Runbook', 'Architecture', 'External Tools', 'General'];
    groups.sort((a, b) => {
      const aIdx = order.indexOf(a.category);
      const bIdx = order.indexOf(b.category);

      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.category.localeCompare(b.category);
    });

    return groups;
  }, [filteredLinks]);

  /**
   * Summary counts.
   */
  const summary = useMemo(() => {
    return {
      total: allLinks.length,
      filtered: filteredLinks.length,
      available: allLinks.filter((l) => l.isAvailable).length,
      categories: categories.length,
    };
  }, [allLinks, filteredLinks, categories]);

  /**
   * Handle search input change.
   */
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  /**
   * Handle search clear.
   */
  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  /**
   * Handle category filter toggle.
   */
  const handleCategoryToggle = useCallback((category) => {
    setActiveCategory((prev) => (prev === category ? null : category));
  }, []);

  /**
   * Reset all filters.
   */
  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setActiveCategory(null);
  }, []);

  /**
   * Get the icon for a category.
   * @param {string} category - The category name.
   * @returns {React.ReactNode}
   */
  const getCategoryIcon = useCallback((category) => {
    switch (category) {
      case 'SOP':
        return (
          <svg
            className="w-4 h-4 text-brand-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
            />
          </svg>
        );
      case 'Runbook':
        return (
          <svg
            className="w-4 h-4 text-brand-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
        );
      case 'Architecture':
        return (
          <svg
            className="w-4 h-4 text-brand-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        );
      case 'External Tools':
        return (
          <svg
            className="w-4 h-4 text-brand-600"
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
        );
      default:
        return (
          <svg
            className="w-4 h-4 text-brand-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-6.364-6.364L4.5 8.257"
            />
          </svg>
        );
    }
  }, []);

  /**
   * Get the category badge color class.
   * @param {string} category - The category name.
   * @returns {string} Tailwind CSS class string.
   */
  const getCategoryBadgeClass = useCallback((category) => {
    switch (category) {
      case 'SOP':
        return 'bg-brand-50 text-brand-800';
      case 'Runbook':
        return 'bg-blue-50 text-blue-800';
      case 'Architecture':
        return 'bg-purple-50 text-purple-800';
      case 'External Tools':
        return 'bg-orange-50 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }, []);

  const hasActiveFilters = activeCategory !== null || (searchQuery && searchQuery.trim().length > 0);

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading SOP & playbook links…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load SOP links"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state — no links at all
  if (!allLinks || allLinks.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No SOP or playbook links"
          description="No SOP, runbook, or playbook links are configured. Upload dashboard data with confluence_links to populate this directory."
          size="md"
        />
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            SOP & Playbook Directory
          </h3>
          <StatusBadge
            status="healthy"
            size="sm"
            label={`${summary.available} Available`}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
          <span>
            {summary.total} link{summary.total !== 1 ? 's' : ''} · {summary.categories} categor{summary.categories !== 1 ? 'ies' : 'y'}
          </span>
        </div>
      </div>

      {/* Filters Row */}
      {(showSearch || showCategoryFilter) && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Category Filter Toggles */}
          {showCategoryFilter && categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => handleCategoryToggle(cat.name)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors duration-150 ${
                    activeCategory === cat.name
                      ? `${getCategoryBadgeClass(cat.name)} ring-2 ring-brand-500/20`
                      : 'bg-gray-50 text-dashboard-text-muted hover:bg-gray-100 hover:text-dashboard-text-secondary'
                  }`}
                  aria-pressed={activeCategory === cat.name}
                  aria-label={`Filter by ${cat.name}`}
                >
                  {cat.name}
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white/60 text-[10px] font-semibold">
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Search Input */}
          {showSearch && (
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg
                  className="w-4 h-4 text-dashboard-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search links…"
                className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-50 border border-dashboard-border rounded-lg text-dashboard-text-primary placeholder-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
                aria-label="Search SOP and playbook links"
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={handleSearchClear}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-dashboard-text-muted hover:text-dashboard-text-secondary transition-colors duration-150"
                  aria-label="Clear search"
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
              )}
            </div>
          )}

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-dashboard-text-secondary hover:bg-gray-100 hover:text-dashboard-text-primary rounded-lg transition-colors duration-150"
              aria-label="Reset all filters"
            >
              <svg
                className="w-3.5 h-3.5"
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
          )}
        </div>
      )}

      {/* No results after filtering */}
      {filteredLinks.length === 0 && hasActiveFilters && (
        <div className="dashboard-card overflow-hidden">
          <EmptyState
            preset="no-results"
            title="No links match your filters"
            description="Try adjusting your search query or category filter to find the link you're looking for."
            size="sm"
            compact
            actionLabel="Reset Filters"
            onAction={handleResetFilters}
          />
        </div>
      )}

      {/* Grouped Links */}
      {groupedLinks.length > 0 && (
        <div className="space-y-6">
          {groupedLinks.map((group) => (
            <div key={group.category}>
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-50 flex-shrink-0">
                  {getCategoryIcon(group.category)}
                </div>
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  {group.category}
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {group.links.length}
                </span>
              </div>

              {/* Links Grid */}
              <div
                className={`grid gap-3 ${
                  compact
                    ? 'grid-cols-1 lg:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {group.links.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`dashboard-card overflow-hidden group transition-all duration-150 ${
                      link.isAvailable
                        ? 'hover:shadow-card-hover'
                        : 'opacity-50 cursor-not-allowed pointer-events-none'
                    }`}
                    aria-label={`${link.title}${!link.isAvailable ? ' (unavailable)' : ''}`}
                    tabIndex={link.isAvailable ? 0 : -1}
                  >
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 flex-shrink-0 group-hover:bg-brand-100 transition-colors duration-150">
                          {getCategoryIcon(link.category)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-dashboard-text-primary truncate group-hover:text-brand-600 transition-colors duration-150">
                            {link.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 ${getCategoryBadgeClass(link.category)}`}
                            >
                              {link.category}
                            </span>
                            {link.source === 'external' && (
                              <span className="flex items-center gap-1 text-[10px] text-dashboard-text-muted">
                                {link.isAvailable ? (
                                  <>
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-healthy" />
                                    Available
                                  </>
                                ) : (
                                  <>
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-unknown" />
                                    Not Configured
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                          {link.description && (
                            <p className="text-[10px] text-dashboard-text-muted mt-1 line-clamp-1">
                              {link.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <svg
                        className="w-4 h-4 text-dashboard-text-muted group-hover:text-brand-600 transition-colors duration-150 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                        />
                      </svg>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {filteredLinks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 px-1 text-xs text-dashboard-text-muted">
          <div className="flex items-center gap-3">
            <span>
              {hasActiveFilters
                ? `Showing ${filteredLinks.length} of ${allLinks.length} links`
                : `${allLinks.length} link${allLinks.length !== 1 ? 's' : ''}`}
            </span>
            <span>·</span>
            <span>
              {summary.categories} categor{summary.categories !== 1 ? 'ies' : 'y'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
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
            All links open in a new tab
          </div>
        </div>
      )}
    </div>
  );
};

export { SOPLinks };
export default SOPLinks;