# Changelog

All notable changes to the ARE Observability Dashboard (Horizon) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-09-12

### Added

#### Authentication & Role-Based Access Control
- Three-tier RBAC system with **Admin**, **ARE Lead**, and **View Only** roles
- Permission-based route protection via `ProtectedRoute` and `RoleGate` components
- Mock user authentication with email/password login flow
- SSO provider integration scaffold (Okta/OIDC-ready) with environment variable configuration
- JWT-like token generation, validation, and session management via `tokenManager`
- Persistent authentication state across browser sessions using localStorage
- Login page with Horizon branding, demo account quick-select, and SSO placeholder button

#### Executive Availability Dashboard
- Platform-wide availability overview with per-domain and per-service breakdown
- Domain tier grouping (Critical, Core, Supporting) with tier-specific SLA/SLO targets
- Color-coded health status indicators (healthy, degraded, down, unknown, maintenance)
- Expandable domain cards with service-level availability, SLA compliance badges, and error budget
- Degraded services widget listing top services below SLA with trend arrows and severity indicators
- SLO compliance card with toggle between SLA and SLO views, progress bars, and gap analysis
- Responsive metric cards with sparkline visualizations and trend direction arrows

#### Error Budget Health
- Error budget burn-down area chart per service using Recharts with gradient fills
- Warning (25%) and critical (10%) threshold reference lines on all budget charts
- Burn rate calculation and display (percentage consumed per day over 30-day window)
- Tier-grouped domain cards with expandable service-level budget detail
- Error budget summary table with sortable columns, search, and filter by status (all/at-risk/breached)
- Budget progress bars with threshold markers for visual breach indication
- Dedicated Error Budget page with burn rate analysis by tier and breach history table

#### Golden Signals Dashboard
- **Latency**: P95 and P99 latency line chart over 24 hours with warning/critical threshold lines
- **Traffic**: Requests per second bar chart with color-coded bars based on threshold status
- **Errors**: 5xx and functional error rate line chart with dual-series visualization
- **Saturation**: CPU, memory, and queue utilization stacked area chart with gradient fills
- Per-service selector dropdown grouped by domain tier across all four signal charts
- Custom Recharts tooltips with formatted values, threshold status labels, and severity indicators
- Signal focus toggle to view all four signals or drill into a single signal type
- Per-service golden signals summary table with color-coded threshold indicators

#### Service Dependency Map
- Interactive force-directed graph visualization using D3.js with zoom, pan, and drag support
- Nodes color-coded by service health status with size scaled by domain tier
- Directed edges with arrow markers colored by dependency type (database, API)
- Click-to-select node with blast radius highlighting (upstream and downstream dependencies)
- BFS-based blast radius computation for upstream and downstream impact analysis
- Domain and tier filter dropdowns for graph subsetting
- Dependency details side panel showing service identity, health metrics, golden signals, dependencies, and incidents
- Incident overlay toggle to highlight degraded/down services and their blast radius
- Service search bar with autocomplete results and click-to-select

#### Incident Analytics
- **Incident Summary**: Total count, severity breakdown bar chart, RCA distribution pie chart, active/resolved counts, per-domain breakdown, and recent incidents list
- **MTTR/MTTD Trends**: Line chart of mean time to resolve and detect per incident over time with target and warning reference lines, per-severity breakdown table
- **RCA Category Analysis**: Donut chart of root cause distribution (Code, Infra, Data, Config), severity-by-category stacked bar chart, MTTR comparison by category, and filterable recent incidents
- **Failure Patterns**: Automated detection of repeated failures (same service + same root cause ≥ 2 occurrences), flagging threshold (≥ 3), sortable pattern table with expandable incident history
- **Change Failure Correlation**: Combined deployment/incident timeline using Recharts ComposedChart, configurable correlation window (1h–24h), correlated pair detection with confidence scoring (explicit/high/medium/low), change failure rate metric, and expandable deployment→incident detail pairs
- Toggleable time windows (24h, 7d, 30d) across all incident analytics views

#### Embedded Tool Dashboards
- Tabbed interface for Dynatrace APM and Elastic observability dashboards
- Responsive iframe wrapper with loading spinner, error fallback, and refresh controls
- Environment variable-driven URL configuration (`VITE_DYNATRACE_EMBED_URL`, `VITE_ELASTIC_EMBED_URL`)
- Sandbox attributes for iframe security (allow-scripts, allow-same-origin, allow-popups, allow-forms)
- Open-in-new-tab button for full-screen external access
- Tab selection persistence across sessions via localStorage
- Configuration guide section when embed URLs are not set

#### Compliance Reporting
- SLA compliance report with per-domain breakdown, monthly compliance trend bar chart, and breach analysis
- Toggle between SLA and SLO compliance views with configurable time windows (3, 6, 12 months)
- Per-domain expandable service-level compliance table with target vs actual, gap, and progress bars
- Incident audit summary with severity breakdown, RCA distribution, and evidence links (Confluence/Jira URLs)
- SOP & Playbook directory with categorized links (SOP, Runbook, Architecture, External Tools)
- Category filter toggles and search across all link titles and categories
- Export compliance reports to CSV and JSON with audit trail logging

#### Admin Data Upload
- Drag-and-drop file upload zone with click-to-browse fallback
- File type validation (CSV, XLSX, XLS) and size validation (10 MB limit)
- Schema type selector (Service Metrics, Incidents, Deployments) with upload mode (Merge, Replace)
- PapaParse CSV parsing and XLSX library Excel parsing with error collection
- Schema validation against required and optional columns with per-row/per-cell error reporting
- Data preview table before commit with row count, column mapping, and validation error display
- Upload progress indicator with step tracking (select → parsing → preview → uploading → complete)
- All upload actions logged to the immutable audit trail

#### Configurable Metric Thresholds
- Grouped threshold configuration form (Availability, Error Budget, Latency, Errors, Saturation, Traffic)
- Warning and critical threshold inputs per metric with direction indicators (lower-is-bad vs higher-is-bad)
- Default value display with per-metric reset-to-default button
- Form validation with inline error messages and logical ordering checks
- Save and reset-all buttons with unsaved changes indicator
- Threshold changes persisted to localStorage and reflected across all dashboard views
- All configuration changes logged to the audit trail

#### Audit Trail
- Immutable, append-only audit log stored in localStorage (max 10,000 entries)
- Logged actions: login, logout, session validation, data upload, metric/threshold configuration, user/role management, data export, annotations, and view access
- Filterable/sortable audit log viewer with columns for timestamp, user, action, resource, status, and description
- Filter by action type, result status, user, and free-text search
- Expandable rows showing full entry details and JSON metadata
- Export audit logs to CSV and JSON formats
- Summary metric cards (total entries, unique users, successful, failures/denied)
- Pagination with configurable page size

#### Annotations & Risk Notes
- Side panel for ARE Leads and Admins to create, edit, and delete annotations on services or incidents
- Annotation types: Risk Note, Observation, Action Item, General
- Severity selector (P1–P4) for risk classification
- Character-limited text input with validation (3–2,000 characters)
- Annotations persisted to localStorage with created/updated timestamps and user attribution
- All annotation actions logged to the audit trail
- View-only access message for users without ANNOTATE permission

#### Shared UI Components
- `MetricCard` — Dashboard card with title, value, unit, trend arrow, sparkline, and status indicator
- `StatusBadge` — Color-coded badge for service health, severity levels, budget status, and deployment status
- `TrendArrow` — Directional trend indicator with configurable color inversion
- `DataTable` — Sortable, searchable, paginated table with custom cell renderers
- `FilterBar` — Reusable filter bar with domain, service, environment, time range, severity, and root cause dropdowns
- `EmptyState` — Configurable empty state placeholder with presets for common scenarios
- `LoadingSpinner` — Animated loading indicator with optional message and overlay mode
- `Modal` — Accessible modal dialog with focus trap, scroll lock, and keyboard navigation
- `ToastNotification` — Toast notification system with success, error, warning, and info variants

#### Layout & Navigation
- Collapsible sidebar with section-grouped navigation items filtered by user role/permissions
- Sticky header bar with dynamic page title, global search placeholder, notification bell, and user menu
- Mobile-responsive sidebar drawer with overlay toggle
- External links section in sidebar with availability indicators for Dynatrace and Elastic

#### Data Layer & Services
- `dataService` — Core data access layer merging mock data with uploaded interim data from localStorage
- `csvAdapter` — File parsing pipeline (parse → validate → transform) for CSV and Excel files
- `authService` — Authentication service with login, logout, session validation, and SSO callback handling
- `rbacService` — Role-based access control service with permission checks, route access validation, and role label resolution
- `auditLogger` — Immutable audit logging service with filtering, export, and summary capabilities
- `tokenManager` — JWT-like token generation, validation, storage, and TTL management
- `ssoProvider` — SSO integration scaffold with OIDC-compatible login URL generation and callback handling

#### Utilities
- `formatters` — Number, percentage, duration, and timestamp formatting utilities
- `dateUtils` — Time range calculation, MTTR/MTTD/MTBF computation, relative time display, and timestamp parsing
- `chartHelpers` — Recharts helper utilities for trend calculation, axis formatting, color generation, and threshold reference lines
- `exportUtils` — CSV and JSON export with browser download trigger, data flattening, and timestamped file naming
- `validators` — File size/type validation, CSV schema validation, and metric threshold validation
- `storage` — Namespaced localStorage wrapper with JSON serialization, quota handling, and cross-tab synchronization

#### Configuration & Constants
- `metrics.js` — Golden signal definitions, severity levels, RCA categories, domain tiers, SLA/SLO targets, threshold defaults, and service status constants
- `roles.js` — Role definitions, permission mappings, role hierarchy, and permission check utilities
- `navigation.js` — Navigation item definitions, section grouping, external link configuration, and role-filtered route resolution
- `mockDashboardData.js` — Comprehensive mock dataset with 8 domains, 17 services, 10 incidents, 8 deployments, 12 months of SLA compliance, golden signal time series, and dependency graph
- `mockUsers.js` — Three demo user accounts (Admin, ARE Lead, View Only) for development and testing

#### Infrastructure
- Vite 5 build configuration with React plugin and path aliases
- Tailwind CSS 3 with custom design tokens for brand colors, severity colors, status colors, and dashboard theme
- ESLint configuration with React, React Hooks, and React Refresh plugins
- Prettier configuration for consistent code formatting
- PostCSS with Tailwind CSS and Autoprefixer
- Vercel deployment configuration with SPA rewrite rules
- Environment variable support for application title, Dynatrace/Elastic embed URLs, and SSO configuration