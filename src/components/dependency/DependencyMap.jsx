import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { useDashboard } from '../../contexts/DashboardContext';
import { StatusBadge } from '../shared/StatusBadge';
import { MetricCard } from '../shared/MetricCard';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  SERVICE_STATUS,
  SERVICE_STATUS_COLORS,
} from '../../constants/metrics';
import { formatPercentage, formatNumber } from '../../utils/formatters';

/**
 * Node radius constants based on tier.
 */
const NODE_RADIUS = Object.freeze({
  [DOMAIN_TIERS.CRITICAL]: 24,
  [DOMAIN_TIERS.CORE]: 20,
  [DOMAIN_TIERS.SUPPORTING]: 16,
  default: 18,
});

/**
 * Node color mapping based on service status.
 */
const NODE_COLORS = Object.freeze({
  [SERVICE_STATUS.HEALTHY]: '#16a34a',
  [SERVICE_STATUS.DEGRADED]: '#ca8a04',
  [SERVICE_STATUS.DOWN]: '#dc2626',
  [SERVICE_STATUS.UNKNOWN]: '#6b7280',
  [SERVICE_STATUS.MAINTENANCE]: '#7c3aed',
});

/**
 * Node stroke color mapping based on tier.
 */
const TIER_STROKE_COLORS = Object.freeze({
  [DOMAIN_TIERS.CRITICAL]: '#4f46e5',
  [DOMAIN_TIERS.CORE]: '#6366f1',
  [DOMAIN_TIERS.SUPPORTING]: '#94a3b8',
  default: '#94a3b8',
});

/**
 * Edge type color mapping.
 */
const EDGE_COLORS = Object.freeze({
  database: '#6366f1',
  api: '#94a3b8',
  default: '#cbd5e1',
});

/**
 * DependencyMap - Interactive service dependency map using D3.js force-directed
 * graph. Nodes represent services (color-coded by health status), edges show
 * dependencies. Supports click-to-select, blast radius highlighting, zoom/pan,
 * and domain/tier filtering.
 *
 * Features:
 * - Force-directed graph layout via D3.js
 * - Nodes color-coded by service health status (healthy/degraded/down)
 * - Node size scaled by domain tier (Critical > Core > Supporting)
 * - Edge coloring by dependency type (database, api)
 * - Click node to view service details in side panel
 * - Blast radius highlighting on node selection (upstream/downstream)
 * - Zoom and pan support via D3 zoom behavior
 * - Domain and tier filter dropdowns
 * - Summary metric cards (total nodes, edges, degraded, down)
 * - Responsive SVG container
 * - Loading and empty states
 * - Legend for status colors and edge types
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {number} [props.width] - Override width for the SVG. Defaults to container width.
 * @param {number} [props.height=500] - Height of the SVG area in pixels.
 * @param {string} [props.highlightIncidentServiceId=null] - Service ID to highlight blast radius for.
 * @returns {React.ReactNode}
 */
const DependencyMap = ({
  className = '',
  compact = false,
  width: propWidth,
  height: propHeight = 500,
  highlightIncidentServiceId = null,
}) => {
  const { dependencyGraph, domains, isLoading, error } = useDashboard();
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [containerWidth, setContainerWidth] = useState(propWidth || 800);
  const [filterDomain, setFilterDomain] = useState(null);
  const [filterTier, setFilterTier] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const svgWidth = propWidth || containerWidth;
  const svgHeight = compact ? 360 : propHeight;

  /**
   * Observe container width for responsive SVG sizing.
   */
  useEffect(() => {
    if (propWidth || !containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [propWidth]);

  /**
   * Build a service lookup map from domains for enriching node data.
   */
  const serviceLookup = useMemo(() => {
    const map = new Map();

    if (!domains || !Array.isArray(domains)) {
      return map;
    }

    for (const domain of domains) {
      for (const service of domain.services || []) {
        map.set(service.service_id, {
          ...service,
          domain_id: domain.domain_id,
          domain_name: domain.name,
          domain_tier: domain.tier,
        });
      }
    }

    return map;
  }, [domains]);

  /**
   * Filter and enrich graph nodes with service data.
   */
  const filteredGraph = useMemo(() => {
    if (
      !dependencyGraph ||
      !dependencyGraph.nodes ||
      dependencyGraph.nodes.length === 0
    ) {
      return { nodes: [], edges: [] };
    }

    let nodes = dependencyGraph.nodes.map((node) => {
      const serviceData = serviceLookup.get(node.id);

      return {
        ...node,
        status: serviceData?.status || node.status || SERVICE_STATUS.UNKNOWN,
        availability: serviceData?.availability ?? null,
        domain_name: serviceData?.domain_name || node.domain || '',
        domain_tier: serviceData?.domain_tier || node.tier || DOMAIN_TIERS.SUPPORTING,
        golden_signals: serviceData?.golden_signals || {},
        error_budget: serviceData?.error_budget ?? null,
        sla: serviceData?.sla ?? null,
        slo: serviceData?.slo ?? null,
      };
    });

    // Apply domain filter
    if (filterDomain) {
      nodes = nodes.filter((n) => n.domain === filterDomain);
    }

    // Apply tier filter
    if (filterTier) {
      nodes = nodes.filter((n) => n.domain_tier === filterTier || n.tier === filterTier);
    }

    const nodeIds = new Set(nodes.map((n) => n.id));

    let edges = (dependencyGraph.edges || []).filter(
      (edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target),
    );

    // For filtered views, also include nodes that are targets/sources of visible edges
    const additionalNodeIds = new Set();
    for (const edge of edges) {
      if (!nodeIds.has(edge.source)) additionalNodeIds.add(edge.source);
      if (!nodeIds.has(edge.target)) additionalNodeIds.add(edge.target);
    }

    if (additionalNodeIds.size > 0 && !filterDomain && !filterTier) {
      const additionalNodes = dependencyGraph.nodes
        .filter((n) => additionalNodeIds.has(n.id))
        .map((node) => {
          const serviceData = serviceLookup.get(node.id);
          return {
            ...node,
            status: serviceData?.status || node.status || SERVICE_STATUS.UNKNOWN,
            availability: serviceData?.availability ?? null,
            domain_name: serviceData?.domain_name || node.domain || '',
            domain_tier: serviceData?.domain_tier || node.tier || DOMAIN_TIERS.SUPPORTING,
            golden_signals: serviceData?.golden_signals || {},
            error_budget: serviceData?.error_budget ?? null,
            sla: serviceData?.sla ?? null,
            slo: serviceData?.slo ?? null,
          };
        });

      nodes = [...nodes, ...additionalNodes];
    }

    // Re-filter edges to only include edges where both source and target are in nodes
    const finalNodeIds = new Set(nodes.map((n) => n.id));
    edges = edges.filter(
      (edge) => finalNodeIds.has(edge.source) && finalNodeIds.has(edge.target),
    );

    return { nodes, edges };
  }, [dependencyGraph, serviceLookup, filterDomain, filterTier]);

  /**
   * Compute blast radius for a given service ID.
   * Returns sets of upstream and downstream service IDs.
   */
  const blastRadius = useMemo(() => {
    const targetId = selectedNode?.id || highlightIncidentServiceId;

    if (!targetId || filteredGraph.edges.length === 0) {
      return { upstream: new Set(), downstream: new Set(), all: new Set() };
    }

    const downstream = new Set();
    const upstream = new Set();

    // BFS downstream (services that depend on the target)
    const downQueue = [targetId];
    const downVisited = new Set([targetId]);

    while (downQueue.length > 0) {
      const current = downQueue.shift();

      for (const edge of filteredGraph.edges) {
        const sourceId =
          typeof edge.source === 'object' ? edge.source.id : edge.source;
        const targetEdgeId =
          typeof edge.target === 'object' ? edge.target.id : edge.target;

        if (targetEdgeId === current && !downVisited.has(sourceId)) {
          downstream.add(sourceId);
          downVisited.add(sourceId);
          downQueue.push(sourceId);
        }
      }
    }

    // BFS upstream (services that the target depends on)
    const upQueue = [targetId];
    const upVisited = new Set([targetId]);

    while (upQueue.length > 0) {
      const current = upQueue.shift();

      for (const edge of filteredGraph.edges) {
        const sourceId =
          typeof edge.source === 'object' ? edge.source.id : edge.source;
        const targetEdgeId =
          typeof edge.target === 'object' ? edge.target.id : edge.target;

        if (sourceId === current && !upVisited.has(targetEdgeId)) {
          upstream.add(targetEdgeId);
          upVisited.add(targetEdgeId);
          upQueue.push(targetEdgeId);
        }
      }
    }

    const all = new Set([...upstream, ...downstream, targetId]);

    return { upstream, downstream, all };
  }, [selectedNode, highlightIncidentServiceId, filteredGraph.edges]);

  /**
   * Summary statistics for the graph.
   */
  const summary = useMemo(() => {
    const nodes = filteredGraph.nodes;

    return {
      totalNodes: nodes.length,
      totalEdges: filteredGraph.edges.length,
      healthyNodes: nodes.filter((n) => n.status === SERVICE_STATUS.HEALTHY).length,
      degradedNodes: nodes.filter((n) => n.status === SERVICE_STATUS.DEGRADED).length,
      downNodes: nodes.filter((n) => n.status === SERVICE_STATUS.DOWN).length,
      blastRadiusSize: blastRadius.all.size > 1 ? blastRadius.all.size : 0,
    };
  }, [filteredGraph, blastRadius]);

  /**
   * Domain options for the filter dropdown.
   */
  const domainOptions = useMemo(() => {
    if (!dependencyGraph || !dependencyGraph.nodes) {
      return [];
    }

    const domainSet = new Set();

    for (const node of dependencyGraph.nodes) {
      if (node.domain) {
        domainSet.add(node.domain);
      }
    }

    return Array.from(domainSet)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [dependencyGraph]);

  /**
   * Tier options for the filter dropdown.
   */
  const tierOptions = useMemo(() => {
    return Object.values(DOMAIN_TIERS).map((tier) => ({
      value: tier,
      label: DOMAIN_TIER_LABELS[tier] || tier,
    }));
  }, []);

  /**
   * Handle node click — select/deselect.
   */
  const handleNodeClick = useCallback(
    (nodeId) => {
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(null);
      } else {
        const node = filteredGraph.nodes.find((n) => n.id === nodeId);
        setSelectedNode(node || null);
      }
    },
    [selectedNode, filteredGraph.nodes],
  );

  /**
   * Close the detail panel.
   */
  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null);
  }, []);

  /**
   * Handle domain filter change.
   */
  const handleDomainFilterChange = useCallback((e) => {
    const val = e.target.value;
    setFilterDomain(val === '' ? null : val);
    setSelectedNode(null);
  }, []);

  /**
   * Handle tier filter change.
   */
  const handleTierFilterChange = useCallback((e) => {
    const val = e.target.value;
    setFilterTier(val === '' ? null : val);
    setSelectedNode(null);
  }, []);

  /**
   * Reset all filters.
   */
  const handleResetFilters = useCallback(() => {
    setFilterDomain(null);
    setFilterTier(null);
    setSelectedNode(null);
  }, []);

  /**
   * D3 force simulation and rendering.
   */
  useEffect(() => {
    if (
      !svgRef.current ||
      filteredGraph.nodes.length === 0
    ) {
      // Clear SVG if no data
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll('*').remove();
      }
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const w = svgWidth;
    const h = svgHeight;

    // Deep copy nodes and edges for D3 mutation
    const nodes = filteredGraph.nodes.map((n) => ({ ...n }));
    const edges = filteredGraph.edges.map((e) => ({
      ...e,
      source: typeof e.source === 'object' ? e.source.id : e.source,
      target: typeof e.target === 'object' ? e.target.id : e.target,
    }));

    // Zoom behavior
    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Double-click to reset zoom
    svg.on('dblclick.zoom', () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });

    const container = svg.append('g').attr('class', 'graph-container');

    // Arrow marker for directed edges
    svg
      .append('defs')
      .selectAll('marker')
      .data(['arrow-default', 'arrow-database', 'arrow-api', 'arrow-highlight'])
      .enter()
      .append('marker')
      .attr('id', (d) => d)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', (d) => {
        if (d === 'arrow-database') return EDGE_COLORS.database;
        if (d === 'arrow-api') return EDGE_COLORS.api;
        if (d === 'arrow-highlight') return '#4f46e5';
        return EDGE_COLORS.default;
      });

    // Force simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(edges)
          .id((d) => d.id)
          .distance(120),
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(35))
      .force('x', d3.forceX(w / 2).strength(0.05))
      .force('y', d3.forceY(h / 2).strength(0.05));

    simulationRef.current = simulation;

    // Determine if blast radius is active
    const blastTargetId = selectedNode?.id || highlightIncidentServiceId;
    const isBlastActive = blastTargetId && blastRadius.all.size > 1;

    // Draw edges
    const link = container
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edges)
      .enter()
      .append('line')
      .attr('stroke', (d) => {
        if (isBlastActive) {
          const srcId = typeof d.source === 'object' ? d.source.id : d.source;
          const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
          if (blastRadius.all.has(srcId) && blastRadius.all.has(tgtId)) {
            return '#4f46e5';
          }
          return '#e2e8f0';
        }
        return EDGE_COLORS[d.type] || EDGE_COLORS.default;
      })
      .attr('stroke-width', (d) => {
        if (isBlastActive) {
          const srcId = typeof d.source === 'object' ? d.source.id : d.source;
          const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
          if (blastRadius.all.has(srcId) && blastRadius.all.has(tgtId)) {
            return 2.5;
          }
          return 0.8;
        }
        return 1.5;
      })
      .attr('stroke-opacity', (d) => {
        if (isBlastActive) {
          const srcId = typeof d.source === 'object' ? d.source.id : d.source;
          const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
          if (blastRadius.all.has(srcId) && blastRadius.all.has(tgtId)) {
            return 1;
          }
          return 0.2;
        }
        return 0.6;
      })
      .attr('marker-end', (d) => {
        if (isBlastActive) {
          const srcId = typeof d.source === 'object' ? d.source.id : d.source;
          const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
          if (blastRadius.all.has(srcId) && blastRadius.all.has(tgtId)) {
            return 'url(#arrow-highlight)';
          }
          return 'url(#arrow-default)';
        }
        if (d.type === 'database') return 'url(#arrow-database)';
        if (d.type === 'api') return 'url(#arrow-api)';
        return 'url(#arrow-default)';
      });

    // Draw node groups
    const nodeGroup = container
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on('click', (_event, d) => {
        _event.stopPropagation();
        handleNodeClick(d.id);
      });

    // Node circles
    nodeGroup
      .append('circle')
      .attr(
        'r',
        (d) =>
          NODE_RADIUS[d.domain_tier || d.tier] || NODE_RADIUS.default,
      )
      .attr('fill', (d) => {
        if (isBlastActive && !blastRadius.all.has(d.id)) {
          return '#e2e8f0';
        }
        return NODE_COLORS[d.status] || NODE_COLORS[SERVICE_STATUS.UNKNOWN];
      })
      .attr('stroke', (d) => {
        if (selectedNode && selectedNode.id === d.id) {
          return '#1e1b4b';
        }
        if (blastTargetId === d.id) {
          return '#dc2626';
        }
        if (isBlastActive && blastRadius.downstream.has(d.id)) {
          return '#ea580c';
        }
        if (isBlastActive && blastRadius.upstream.has(d.id)) {
          return '#4f46e5';
        }
        return (
          TIER_STROKE_COLORS[d.domain_tier || d.tier] ||
          TIER_STROKE_COLORS.default
        );
      })
      .attr('stroke-width', (d) => {
        if (selectedNode && selectedNode.id === d.id) return 3.5;
        if (blastTargetId === d.id) return 3;
        if (isBlastActive && blastRadius.all.has(d.id)) return 2.5;
        return 2;
      })
      .attr('opacity', (d) => {
        if (isBlastActive && !blastRadius.all.has(d.id)) {
          return 0.3;
        }
        return 1;
      });

    // Pulse animation for down services
    nodeGroup
      .filter((d) => d.status === SERVICE_STATUS.DOWN)
      .append('circle')
      .attr(
        'r',
        (d) =>
          (NODE_RADIUS[d.domain_tier || d.tier] || NODE_RADIUS.default) + 4,
      )
      .attr('fill', 'none')
      .attr('stroke', NODE_COLORS[SERVICE_STATUS.DOWN])
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6)
      .append('animate')
      .attr('attributeName', 'r')
      .attr(
        'from',
        (d) =>
          (NODE_RADIUS[d.domain_tier || d.tier] || NODE_RADIUS.default) + 2,
      )
      .attr(
        'to',
        (d) =>
          (NODE_RADIUS[d.domain_tier || d.tier] || NODE_RADIUS.default) + 10,
      )
      .attr('dur', '1.5s')
      .attr('repeatCount', 'indefinite');

    // Node labels
    nodeGroup
      .append('text')
      .text((d) => d.label || d.id)
      .attr('text-anchor', 'middle')
      .attr(
        'dy',
        (d) =>
          (NODE_RADIUS[d.domain_tier || d.tier] || NODE_RADIUS.default) + 14,
      )
      .attr('font-size', '10px')
      .attr('font-family', 'Inter, system-ui, sans-serif')
      .attr('font-weight', '500')
      .attr('fill', (d) => {
        if (isBlastActive && !blastRadius.all.has(d.id)) {
          return '#cbd5e1';
        }
        return '#475569';
      })
      .attr('pointer-events', 'none');

    // Status icon inside node (abbreviated text)
    nodeGroup
      .append('text')
      .text((d) => {
        if (d.status === SERVICE_STATUS.DOWN) return '!';
        if (d.status === SERVICE_STATUS.DEGRADED) return '~';
        return '';
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'none');

    // Tick function
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Click on background to deselect
    svg.on('click', () => {
      setSelectedNode(null);
    });

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [
    filteredGraph,
    svgWidth,
    svgHeight,
    selectedNode,
    highlightIncidentServiceId,
    blastRadius,
    handleNodeClick,
  ]);

  /**
   * Get the selected node's detail data enriched from service lookup.
   */
  const selectedNodeDetail = useMemo(() => {
    if (!selectedNode) return null;

    const serviceData = serviceLookup.get(selectedNode.id);

    return {
      ...selectedNode,
      ...(serviceData || {}),
      upstreamCount: blastRadius.upstream.size,
      downstreamCount: blastRadius.downstream.size,
    };
  }, [selectedNode, serviceLookup, blastRadius]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading dependency map…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load dependency map"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state
  if (
    !dependencyGraph ||
    !dependencyGraph.nodes ||
    dependencyGraph.nodes.length === 0
  ) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No dependency data"
          description="No service dependency data is available. Upload metrics data to populate the dependency map."
          size="md"
        />
      </div>
    );
  }

  // No nodes after filtering
  if (filteredGraph.nodes.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="dashboard-card overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-sm font-semibold text-dashboard-text-primary">
                Service Dependency Map
              </h3>
            </div>
            {renderFilters()}
          </div>

          <EmptyState
            preset="no-results"
            title="No services match filters"
            description="Adjust the domain or tier filters to see services."
            size="sm"
            compact
            actionLabel="Reset Filters"
            onAction={handleResetFilters}
          />
        </div>
      </div>
    );
  }

  /**
   * Render the filter controls.
   */
  function renderFilters() {
    const hasActiveFilters = filterDomain !== null || filterTier !== null;

    return (
      <div className="flex items-center gap-2">
        <select
          value={filterDomain || ''}
          onChange={handleDomainFilterChange}
          className="px-2 py-1 text-xs bg-white border border-dashboard-border rounded-lg text-dashboard-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
          aria-label="Filter by domain"
        >
          <option value="">All Domains</option>
          {domainOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filterTier || ''}
          onChange={handleTierFilterChange}
          className="px-2 py-1 text-xs bg-white border border-dashboard-border rounded-lg text-dashboard-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-150"
          aria-label="Filter by tier"
        >
          <option value="">All Tiers</option>
          {tierOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="px-2 py-1 text-xs font-medium text-dashboard-text-muted hover:text-dashboard-text-secondary transition-colors duration-150"
            aria-label="Reset filters"
          >
            <svg
              className="w-3.5 h-3.5"
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
    );
  }

  /**
   * Render the legend.
   */
  function renderLegend() {
    return (
      <div className="flex flex-wrap items-center gap-4 text-xs text-dashboard-text-muted">
        {/* Status legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-dashboard-text-secondary">Status:</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[SERVICE_STATUS.HEALTHY] }}
            />
            Healthy
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[SERVICE_STATUS.DEGRADED] }}
            />
            Degraded
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[SERVICE_STATUS.DOWN] }}
            />
            Down
          </span>
        </div>

        {/* Edge type legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-dashboard-text-secondary">Edges:</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-0.5"
              style={{ backgroundColor: EDGE_COLORS.database }}
            />
            Database
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-0.5"
              style={{ backgroundColor: EDGE_COLORS.api }}
            />
            API
          </span>
        </div>

        {/* Blast radius legend */}
        {(selectedNode || highlightIncidentServiceId) && blastRadius.all.size > 1 && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-dashboard-text-secondary">Blast Radius:</span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border-2"
                style={{ borderColor: '#4f46e5', backgroundColor: 'transparent' }}
              />
              Upstream
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border-2"
                style={{ borderColor: '#ea580c', backgroundColor: 'transparent' }}
              />
              Downstream
            </span>
          </div>
        )}
      </div>
    );
  }

  /**
   * Render the selected node detail panel.
   */
  function renderDetailPanel() {
    if (!selectedNodeDetail) return null;

    const detail = selectedNodeDetail;
    const statusStr = detail.status || 'unknown';

    return (
      <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
        <div className="p-4">
          {/* Detail Header */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${
                  statusStr === 'healthy'
                    ? 'bg-status-healthy'
                    : statusStr === 'degraded'
                      ? 'bg-status-degraded'
                      : statusStr === 'down'
                        ? 'bg-status-down animate-pulse'
                        : 'bg-status-unknown'
                }`}
              />
              <h4 className="text-sm font-semibold text-dashboard-text-primary truncate">
                {detail.label || detail.name || detail.id}
              </h4>
              <StatusBadge status={statusStr} size="sm" />
            </div>
            <button
              onClick={handleCloseDetail}
              className="flex items-center justify-center w-6 h-6 rounded-md text-dashboard-text-muted hover:bg-gray-200 hover:text-dashboard-text-secondary transition-colors duration-150"
              aria-label="Close detail panel"
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
          </div>

          {/* Detail Metadata */}
          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-dashboard-text-muted">
            <span>
              Domain:{' '}
              <span className="font-medium text-dashboard-text-secondary">
                {detail.domain_name || detail.domain || '—'}
              </span>
            </span>
            <span>
              Tier:{' '}
              <span className="font-medium text-dashboard-text-secondary">
                {DOMAIN_TIER_LABELS[detail.domain_tier || detail.tier] ||
                  detail.domain_tier ||
                  detail.tier ||
                  '—'}
              </span>
            </span>
            <span>
              ID:{' '}
              <span className="font-mono text-dashboard-text-secondary">
                {detail.id}
              </span>
            </span>
          </div>

          {/* Detail Metrics */}
          <div
            className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}
          >
            <MetricCard
              title="Availability"
              value={detail.availability}
              unit="%"
              size="sm"
              status={
                detail.status === SERVICE_STATUS.HEALTHY
                  ? 'healthy'
                  : detail.status === SERVICE_STATUS.DEGRADED
                    ? 'degraded'
                    : detail.status === SERVICE_STATUS.DOWN
                      ? 'critical'
                      : undefined
              }
            />
            <MetricCard
              title="Error Budget"
              value={detail.error_budget}
              unit="%"
              size="sm"
              status={
                detail.error_budget != null && detail.error_budget <= 10
                  ? 'critical'
                  : detail.error_budget != null && detail.error_budget <= 25
                    ? 'warning'
                    : undefined
              }
            />
            <MetricCard
              title="Upstream Deps"
              value={detail.upstreamCount}
              unit="count"
              size="sm"
            />
            <MetricCard
              title="Downstream Impact"
              value={detail.downstreamCount}
              unit="count"
              size="sm"
              status={detail.downstreamCount > 3 ? 'warning' : undefined}
            />
          </div>

          {/* Golden Signals Summary */}
          {detail.golden_signals &&
            Object.keys(detail.golden_signals).length > 0 && (
              <div className="mt-3">
                <h5 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-2">
                  Golden Signals
                </h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {detail.golden_signals.latency_p95 != null && (
                    <div className="flex items-center justify-between gap-1 px-2 py-1 bg-white rounded border border-dashboard-border">
                      <span className="text-dashboard-text-muted">P95</span>
                      <span className="font-medium text-dashboard-text-primary">
                        {formatNumber(detail.golden_signals.latency_p95, {
                          decimals: 1,
                        })}{' '}
                        ms
                      </span>
                    </div>
                  )}
                  {detail.golden_signals.traffic_rps != null && (
                    <div className="flex items-center justify-between gap-1 px-2 py-1 bg-white rounded border border-dashboard-border">
                      <span className="text-dashboard-text-muted">RPS</span>
                      <span className="font-medium text-dashboard-text-primary">
                        {formatNumber(detail.golden_signals.traffic_rps, {
                          decimals: 0,
                        })}
                      </span>
                    </div>
                  )}
                  {detail.golden_signals.errors_5xx != null && (
                    <div className="flex items-center justify-between gap-1 px-2 py-1 bg-white rounded border border-dashboard-border">
                      <span className="text-dashboard-text-muted">5xx</span>
                      <span
                        className={`font-medium ${
                          detail.golden_signals.errors_5xx > 10
                            ? 'text-severity-critical'
                            : 'text-dashboard-text-primary'
                        }`}
                      >
                        {formatNumber(detail.golden_signals.errors_5xx, {
                          decimals: 0,
                        })}
                      </span>
                    </div>
                  )}
                  {detail.golden_signals.saturation_cpu != null && (
                    <div className="flex items-center justify-between gap-1 px-2 py-1 bg-white rounded border border-dashboard-border">
                      <span className="text-dashboard-text-muted">CPU</span>
                      <span
                        className={`font-medium ${
                          detail.golden_signals.saturation_cpu > 80
                            ? 'text-severity-critical'
                            : detail.golden_signals.saturation_cpu > 60
                              ? 'text-status-degraded'
                              : 'text-dashboard-text-primary'
                        }`}
                      >
                        {formatPercentage(
                          detail.golden_signals.saturation_cpu,
                          1,
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`} ref={containerRef}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">
            Service Dependency Map
          </h3>
          <StatusBadge
            status={
              summary.downNodes > 0
                ? 'critical'
                : summary.degradedNodes > 0
                  ? 'warning'
                  : 'healthy'
            }
            size="sm"
            label={
              summary.downNodes > 0
                ? `${summary.downNodes} Down`
                : summary.degradedNodes > 0
                  ? `${summary.degradedNodes} Degraded`
                  : 'All Healthy'
            }
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-dashboard-text-muted">
          <span>
            {summary.totalNodes} services · {summary.totalEdges} dependencies
          </span>
          {summary.blastRadiusSize > 0 && (
            <span className="flex items-center gap-1 text-brand-600 font-medium">
              <svg
                className="w-3.5 h-3.5"
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
              Blast radius: {summary.blastRadiusSize} services
            </span>
          )}
        </div>
      </div>

      {/* Summary Metric Cards */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MetricCard
            title="Total Services"
            value={summary.totalNodes}
            unit="count"
            size="sm"
          />
          <MetricCard
            title="Dependencies"
            value={summary.totalEdges}
            unit="count"
            size="sm"
          />
          <MetricCard
            title="Degraded"
            value={summary.degradedNodes}
            unit="count"
            size="sm"
            status={summary.degradedNodes > 0 ? 'warning' : 'healthy'}
          />
          <MetricCard
            title="Down"
            value={summary.downNodes}
            unit="count"
            size="sm"
            status={summary.downNodes > 0 ? 'critical' : 'healthy'}
          />
        </div>
      )}

      {/* Graph Card */}
      <div className="dashboard-card overflow-hidden">
        {/* Card Header with Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-dashboard-border">
          <div className="flex items-center gap-3 min-w-0">
            {renderLegend()}
          </div>
          {renderFilters()}
        </div>

        {/* SVG Graph */}
        <div
          className="relative bg-gray-50/30"
          style={{ height: svgHeight }}
        >
          <svg
            ref={svgRef}
            width={svgWidth}
            height={svgHeight}
            className="w-full"
            style={{ display: 'block' }}
            aria-label="Service dependency graph"
            role="img"
          />

          {/* Zoom hint */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-white/80 rounded text-[10px] text-dashboard-text-muted border border-dashboard-border">
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
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
              />
            </svg>
            Scroll to zoom · Drag to pan · Click node for details
          </div>
        </div>

        {/* Selected Node Detail Panel */}
        {renderDetailPanel()}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-dashboard-border bg-gray-50/30">
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            <span>
              {filteredGraph.nodes.length} nodes · {filteredGraph.edges.length}{' '}
              edges
            </span>
            {(filterDomain || filterTier) && (
              <span>
                (filtered
                {filterDomain ? ` · domain: ${filterDomain}` : ''}
                {filterTier
                  ? ` · tier: ${DOMAIN_TIER_LABELS[filterTier] || filterTier}`
                  : ''}
                )
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
            {selectedNode && (
              <span>
                Selected:{' '}
                <span className="font-medium text-dashboard-text-secondary">
                  {selectedNode.label || selectedNode.id}
                </span>
              </span>
            )}
            <span>Double-click to reset zoom</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { DependencyMap };
export default DependencyMap;