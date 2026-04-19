# ARE Observability Dashboard (Horizon)

A unified observability and monitoring platform for Application Reliability Engineering (ARE) teams. Horizon provides executive-level availability dashboards, golden signal analytics, incident intelligence, service dependency mapping, and compliance reporting — all within a single, role-gated interface.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
4. [Environment Variables](#environment-variables)
5. [Available Scripts](#available-scripts)
6. [Folder Structure](#folder-structure)
7. [Features](#features)
8. [Role-Based Access Control](#role-based-access-control)
9. [Data Architecture](#data-architecture)
10. [Deployment](#deployment)
11. [Browser Compatibility](#browser-compatibility)
12. [License](#license)

---

## Overview

Horizon is a React-based single-page application that consolidates observability data across multiple domains and services into a cohesive dashboard experience. It is designed for ARE leads, platform engineers, and executive stakeholders who need real-time visibility into platform health, SLA compliance, error budgets, and incident trends.

The application ships with a comprehensive mock dataset covering 8 domains, 17 services, 10 incidents, 8 deployments, and 12 months of SLA compliance history — enabling full functionality without any backend integration.

### Key Capabilities

- **Executive Availability Dashboard** — Platform-wide availability with per-domain and per-service drill-down
- **Golden Signals Analytics** — Latency, traffic, error rate, and saturation charts with threshold breach detection
- **Error Budget Health** — Burn-down visualization, burn rate analysis, and breach history
- **Incident Intelligence** — Severity breakdown, MTTR/MTTD trends, RCA analysis, failure pattern detection, and change failure correlation
- **Service Dependency Map** — Interactive D3.js force-directed graph with blast radius highlighting
- **Compliance Reporting** — SLA/SLO compliance reports with evidence links and export functionality
- **Embedded Tool Dashboards** — Iframe integration for Dynatrace and Elastic observability tools
- **Admin Management** — CSV/Excel data upload, metric threshold configuration, and immutable audit trail
- **Annotations & Risk Notes** — Contextual annotations on services and incidents with severity classification

---

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| **Framework** | React | 18.3 |
| **Build Tool** | Vite | 5.4 |
| **Routing** | React Router DOM | 6.26 |
| **Charts** | Recharts | 2.12 |
| **Graph Visualization** | D3.js | 7.9 |
| **CSS Framework** | Tailwind CSS | 3.4 |
| **CSV Parsing** | PapaParse | 5.4 |
| **Excel Parsing** | SheetJS (xlsx) | 0.18 |
| **UUID Generation** | uuid | 10.0 |
| **Linting** | ESLint | 8.57 |
| **Formatting** | Prettier | 3.3 |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x (LTS recommended)
- **npm** >= 9.x or **yarn** >= 1.22.x

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd are-observability-dashboard

# Install dependencies
npm install
```

### Configuration

Copy the example environment file and configure as needed:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) for a full reference.

### Development Server

```bash
npm run dev
```

The application starts at [http://localhost:3000](http://localhost:3000) with hot module replacement (HMR) enabled.

### Demo Accounts

The login page provides three pre-configured demo accounts for testing:

| Account | Email | Role | Access Level |
|---|---|---|---|
| Alice Admin | `alice.admin@horizon.com` | Admin | Full access to all features |
| Leo Lead | `leo.lead@horizon.com` | ARE Lead | Dashboard, metrics, upload, annotations, export |
| Vera Viewer | `vera.viewer@horizon.com` | View Only | Dashboard, metrics, and alerts (read-only) |

Any non-empty password is accepted for demo accounts.

---

## Environment Variables

All environment variables are prefixed with `VITE_` for Vite client-side exposure. Configure them in a `.env` file at the project root.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_APP_TITLE` | No | `ARE Observability Dashboard` | Application title in the browser tab and branding |
| `VITE_DYNATRACE_EMBED_URL` | No | _(empty)_ | Full URL to the Dynatrace APM dashboard for iframe embedding |
| `VITE_ELASTIC_EMBED_URL` | No | _(empty)_ | Full URL to the Elastic observability dashboard for iframe embedding |
| `VITE_SSO_ENABLED` | No | `false` | Set to `true` to enable SSO login flow via OIDC |
| `VITE_SSO_CLIENT_ID` | No | _(empty)_ | OAuth 2.0 / OIDC client ID from your identity provider |
| `VITE_SSO_AUTHORITY` | No | _(empty)_ | OIDC authority URL (e.g., `https://your-org.okta.com/oauth2/default`) |

> **Note:** Never commit `.env` files containing secrets to version control. The `.env.example` file is safe to commit as it contains only placeholder values.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server with HMR on port 3000 |
| `npm run build` | Build the production bundle to the `dist/` directory |
| `npm run preview` | Serve the production build locally for verification |
| `npm run lint` | Run ESLint across all `.js` and `.jsx` files |
| `npm run format` | Format source files with Prettier |

---

## Folder Structure

```
are-observability-dashboard/
├── public/                          # Static assets served at root
├── src/
│   ├── components/
│   │   ├── admin/                   # Admin management widgets
│   │   │   ├── AuditLogViewer.jsx   # Filterable/sortable audit log table with export
│   │   │   ├── DataPreview.jsx      # Parsed data preview table before upload commit
│   │   │   ├── FileUploader.jsx     # Drag-and-drop CSV/Excel upload with validation
│   │   │   └── ThresholdConfig.jsx  # Metric threshold configuration form
│   │   ├── annotations/
│   │   │   └── AnnotationPanel.jsx  # Side panel for risk notes and annotations
│   │   ├── auth/
│   │   │   ├── ProtectedRoute.jsx   # Route guard enforcing authentication and RBAC
│   │   │   └── RoleGate.jsx         # Conditional rendering based on user permissions
│   │   ├── compliance/
│   │   │   ├── ComplianceReport.jsx # SLA compliance report with charts and export
│   │   │   └── SOPLinks.jsx         # Categorized SOP/playbook link directory
│   │   ├── dashboard/
│   │   │   ├── AvailabilityOverview.jsx  # Platform availability with tier grouping
│   │   │   ├── DegradedServices.jsx      # Top degraded/down services table
│   │   │   ├── ErrorBudgetChart.jsx      # Error budget burn-down area charts
│   │   │   ├── ErrorBudgetTable.jsx      # Sortable error budget summary table
│   │   │   └── SLOComplianceCard.jsx     # SLA/SLO compliance with progress bars
│   │   ├── dependency/
│   │   │   ├── DependencyDetails.jsx     # Service detail side panel
│   │   │   └── DependencyMap.jsx         # D3.js force-directed dependency graph
│   │   ├── embedded/
│   │   │   └── EmbeddedDashboard.jsx     # Iframe wrapper for external tools
│   │   ├── golden-signals/
│   │   │   ├── ErrorRateChart.jsx        # 5xx and functional error line chart
│   │   │   ├── LatencyChart.jsx          # P95/P99 latency line chart
│   │   │   ├── SaturationChart.jsx       # CPU/memory/queue area chart
│   │   │   └── TrafficChart.jsx          # RPS bar chart
│   │   ├── incidents/
│   │   │   ├── ChangeCorrelation.jsx     # Deployment-incident correlation timeline
│   │   │   ├── FailurePatterns.jsx       # Repeated failure pattern detection
│   │   │   ├── IncidentSummary.jsx       # Severity breakdown and RCA pie chart
│   │   │   ├── MTTRTrendChart.jsx        # MTTR/MTTD trend line chart
│   │   │   └── RCACategoryChart.jsx      # Root cause analysis donut chart
│   │   ├── layout/
│   │   │   ├── DashboardLayout.jsx       # Main layout with sidebar and header
│   │   │   ├── Header.jsx               # Top navigation bar
│   │   │   └── Sidebar.jsx              # Collapsible navigation sidebar
│   │   └── shared/
│   │       ├── DataTable.jsx            # Sortable, searchable, paginated table
│   │       ├── EmptyState.jsx           # Configurable empty state placeholder
│   │       ├── FilterBar.jsx            # Reusable filter bar with dropdowns
│   │       ├── LoadingSpinner.jsx       # Animated loading indicator
│   │       ├── MetricCard.jsx           # Dashboard metric card with sparkline
│   │       ├── Modal.jsx               # Accessible modal dialog
│   │       ├── StatusBadge.jsx          # Color-coded status indicator badge
│   │       ├── ToastNotification.jsx    # Toast notification system
│   │       └── TrendArrow.jsx           # Directional trend indicator
│   ├── constants/
│   │   ├── metrics.js                   # Golden signals, severity, RCA, domain tiers, thresholds
│   │   ├── mockDashboardData.js         # Comprehensive mock dataset
│   │   ├── mockUsers.js                 # Demo user accounts
│   │   ├── navigation.js               # Navigation items, sections, external links
│   │   └── roles.js                     # Roles, permissions, hierarchy
│   ├── contexts/
│   │   ├── AuthContext.jsx              # Authentication state and user context
│   │   └── DashboardContext.jsx         # Dashboard data, filters, and data fetching
│   ├── hooks/
│   │   ├── useFilters.js               # Dashboard filter state management
│   │   ├── useLocalStorage.js          # Reactive localStorage with cross-tab sync
│   │   └── usePermissions.js           # Permission checks for the current user
│   ├── pages/
│   │   ├── AdminPage.jsx               # Admin management (upload, config, audit)
│   │   ├── CompliancePage.jsx           # Compliance reporting and SOP links
│   │   ├── DependencyMapPage.jsx        # Service dependency map visualization
│   │   ├── EmbeddedToolsPage.jsx        # Embedded Dynatrace/Elastic dashboards
│   │   ├── ErrorBudgetPage.jsx          # Error budget deep-dive
│   │   ├── ExecutiveOverviewPage.jsx    # Executive availability dashboard (landing)
│   │   ├── GoldenSignalsPage.jsx        # Golden signals analytics
│   │   ├── IncidentAnalyticsPage.jsx    # Incident intelligence and RCA
│   │   ├── LoginPage.jsx               # Authentication login screen
│   │   └── NotFoundPage.jsx            # 404 error page
│   ├── services/
│   │   ├── auditLogger.js              # Immutable audit logging service
│   │   ├── authService.js              # Authentication (login, logout, session)
│   │   ├── csvAdapter.js               # CSV/Excel parse, validate, transform pipeline
│   │   ├── dataService.js              # Core data access layer with mock data merging
│   │   ├── rbacService.js              # Role-based access control service
│   │   ├── ssoProvider.js              # SSO/OIDC integration scaffold
│   │   └── tokenManager.js             # JWT-like token generation and validation
│   ├── utils/
│   │   ├── chartHelpers.js             # Recharts helper utilities
│   │   ├── dateUtils.js                # Time range, MTTR/MTTD/MTBF, relative time
│   │   ├── exportUtils.js              # CSV/JSON export with browser download
│   │   ├── formatters.js               # Number, percentage, duration formatting
│   │   ├── storage.js                  # Namespaced localStorage wrapper
│   │   └── validators.js              # File, schema, and threshold validation
│   ├── App.jsx                         # Root component with provider hierarchy
│   ├── index.css                       # Tailwind CSS base, components, utilities
│   ├── main.jsx                        # Application entry point
│   └── router.jsx                      # React Router route configuration
├── .env.example                        # Environment variable template
├── .eslintrc.cjs                       # ESLint configuration
├── .prettierrc                         # Prettier configuration
├── CHANGELOG.md                        # Version history
├── DEPLOYMENT.md                       # Deployment and operations guide
├── index.html                          # HTML entry point
├── package.json                        # Dependencies and scripts
├── postcss.config.js                   # PostCSS configuration
├── tailwind.config.js                  # Tailwind CSS configuration
├── vercel.json                         # Vercel SPA rewrite rules
└── vite.config.js                      # Vite build configuration
```

---

## Features

### Executive Availability Dashboard

The default landing page provides a platform-wide availability overview with per-domain and per-service breakdown. Domains are grouped by tier (Critical, Core, Supporting) with tier-specific SLA/SLO targets. Expandable domain cards reveal service-level availability, SLA compliance badges, and error budget status. A degraded services widget lists the top services below SLA with trend arrows and severity indicators.

### Golden Signals

Four dedicated chart widgets cover the Google SRE golden signals:

- **Latency** — P95 and P99 latency line chart over 24 hours with warning/critical threshold reference lines
- **Traffic** — Requests per second bar chart with color-coded bars based on threshold status
- **Errors** — 5xx and functional error rate line chart with dual-series visualization
- **Saturation** — CPU, memory, and queue utilization stacked area chart with gradient fills

Each chart includes a per-service selector dropdown grouped by domain tier, custom tooltips with threshold status labels, and trend arrows.

### Error Budget Health

Per-service error budget burn-down area charts using Recharts with gradient fills. Warning (25%) and critical (10%) threshold reference lines are displayed on all budget charts. A burn rate analysis section provides per-tier breakdown, and a breach history table lists all services that have exhausted their error budgets.

### Service Dependency Map

An interactive force-directed graph visualization built with D3.js supporting zoom, pan, and drag. Nodes are color-coded by service health status with size scaled by domain tier. Clicking a node triggers BFS-based blast radius computation highlighting upstream and downstream dependencies. An incident overlay toggle highlights degraded/down services and their blast radius.

### Incident Analytics

Five tabbed analytics views:

- **Summary** — Total count, severity breakdown bar chart, RCA distribution pie chart, active/resolved counts, per-domain breakdown, and recent incidents list
- **MTTR/MTTD Trends** — Line chart of mean time to resolve and detect per incident over time with target and warning reference lines
- **RCA Category Analysis** — Donut chart of root cause distribution, severity-by-category stacked bar chart, MTTR comparison by category
- **Failure Patterns** — Automated detection of repeated failures (same service + same root cause ≥ 2 occurrences) with flagging threshold (≥ 3)
- **Change Failure Correlation** — Combined deployment/incident timeline with configurable correlation window (1h–24h) and confidence scoring

### Embedded Tool Dashboards

A tabbed interface for Dynatrace APM and Elastic observability dashboards rendered in responsive iframes. Tab selection persists across sessions via localStorage. Includes loading spinner, error fallback, refresh controls, and open-in-new-tab button. Configuration guide section is displayed when embed URLs are not set.

### Compliance Reporting

SLA compliance report with per-domain breakdown, monthly compliance trend bar chart, and breach analysis. Toggle between SLA and SLO compliance views with configurable time windows (3, 6, 12 months). Incident audit summary with severity breakdown, RCA distribution, and evidence links. SOP & Playbook directory with categorized links and search. Export compliance reports to CSV and JSON.

### Admin Data Upload

Drag-and-drop file upload zone supporting CSV, XLSX, and XLS files up to 10 MB. Schema type selector (Service Metrics, Incidents, Deployments) with upload mode (Merge, Replace). PapaParse CSV parsing and SheetJS Excel parsing with schema validation against required and optional columns. Data preview table before commit with validation error display.

### Configurable Metric Thresholds

Grouped threshold configuration form covering Availability, Error Budget, Latency, Errors, Saturation, and Traffic. Warning and critical threshold inputs per metric with direction indicators (lower-is-bad vs higher-is-bad). Form validation with inline error messages and logical ordering checks. Changes are persisted to localStorage and reflected across all dashboard views.

### Audit Trail

Immutable, append-only audit log stored in localStorage (max 10,000 entries). Logged actions include login, logout, session validation, data upload, metric/threshold configuration, user/role management, data export, and annotations. Filterable/sortable viewer with export to CSV and JSON.

### Annotations & Risk Notes

Side panel for ARE Leads and Admins to create, edit, and delete annotations on services or incidents. Annotation types include Risk Note, Observation, Action Item, and General. Severity selector (P1–P4) for risk classification. All annotation actions are logged to the audit trail.

---

## Role-Based Access Control

Horizon implements a three-tier RBAC system with the following roles:

### Roles

| Role | Description |
|---|---|
| **Admin** | Full administrative access to all features including user management, threshold configuration, data upload, audit logs, annotations, and export |
| **ARE Lead** | Operational access including dashboard viewing, metrics, alerts, annotations, data upload, audit log viewing, and data export |
| **View Only** | Read-only access to dashboards, metrics, and alerts |

### Permission Matrix

| Permission | Admin | ARE Lead | View Only |
|---|---|---|---|
| View Dashboard | ✓ | ✓ | ✓ |
| View Metrics | ✓ | ✓ | ✓ |
| View Alerts | ✓ | ✓ | ✓ |
| View Audit Logs | ✓ | ✓ | — |
| Annotate | ✓ | ✓ | — |
| Upload Data | ✓ | ✓ | — |
| Configure Metrics | ✓ | — | — |
| Configure Thresholds | ✓ | — | — |
| Manage Users | ✓ | — | — |
| Manage Roles | ✓ | — | — |
| Export Data | ✓ | ✓ | — |

### Route Protection

Routes are protected via the `ProtectedRoute` component which enforces authentication and optional role/permission checks. The `RoleGate` component provides conditional rendering within pages based on the current user's permissions.

---

## Data Architecture

### Data Flow

```
Mock Data (constants/mockDashboardData.js)
    ↓
Data Service (services/dataService.js) ← merges → Uploaded Data (localStorage)
    ↓
Dashboard Context (contexts/DashboardContext.jsx)
    ↓
Page Components (pages/*.jsx)
    ↓
Widget Components (components/**/*.jsx)
```

### Authentication Flow

```
Login Page → authService.login() → tokenManager.generateToken()
    ↓                                       ↓
AuthContext ← stores user + token → localStorage
    ↓
ProtectedRoute → validates token → renders page or redirects
```

### Storage Schema

All localStorage keys are prefixed with `are_`:

| Key | Description |
|---|---|
| `are_auth_token` | JWT-like authentication token |
| `are_auth_user` | Serialized authenticated user object |
| `are_auth_status` | Current authentication status string |
| `are_dashboard_data` | Persisted dashboard data (if modified) |
| `are_dashboard_data_backup` | Backup of dashboard data before mutations |
| `are_uploaded_data` | Uploaded interim data from CSV/Excel files |
| `are_metric_thresholds` | Custom metric threshold configuration |
| `are_audit_logs` | Immutable audit log entries (max 10,000) |
| `are_annotations` | User-created annotations and risk notes |
| `are_dashboard_filters` | Persisted filter preferences |
| `are_embedded_tools_active_tab` | Last selected embedded tool tab |

### Mock Dataset

The application ships with a comprehensive mock dataset:

- **8 Domains** — Claims, Enrollment, Provider, Member, Pharmacy, Billing, Reporting, Notifications
- **17 Services** — APIs and databases across all domains with realistic golden signal values
- **10 Incidents** — Spanning P1–P4 severity with Code, Infra, Data, and Config root causes
- **8 Deployments** — Including hotfixes, features, config changes, and a rolled-back deployment
- **12 Months** — Monthly SLA compliance records per domain
- **24-Hour Time Series** — Hourly golden signal data for 5 services
- **Dependency Graph** — 16 nodes and 17 directed edges with database and API dependency types

---

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to [Vercel](https://vercel.com/new)
2. Set the framework preset to **Vite**
3. Configure build settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Add environment variables in the Vercel project settings
5. Push to your default branch to trigger deployment

The included `vercel.json` handles SPA routing with a catch-all rewrite to `index.html`.

### Production Build

```bash
# Build the production bundle
npm run build

# Preview the production build locally
npm run preview
```

The production build is output to the `dist/` directory with minified, tree-shaken JavaScript and source maps.

For detailed deployment instructions including CI/CD pipeline setup, Nginx/Apache configuration, SSO integration, and troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Browser Compatibility

| Browser | Supported Versions |
|---|---|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |

---

## License

This project is **private and proprietary**. All rights reserved. Unauthorized copying, distribution, modification, or use of this software, in whole or in part, is strictly prohibited without prior written permission from the project owner.