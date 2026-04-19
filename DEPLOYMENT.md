# Deployment & Operations Guide

## ARE Observability Dashboard (Horizon)

This guide covers deployment procedures, environment configuration, CI/CD pipeline setup, and production readiness for the Horizon ARE Observability Dashboard.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Local Development](#local-development)
4. [Vercel Deployment](#vercel-deployment)
5. [SPA Rewrite Configuration](#spa-rewrite-configuration)
6. [CI/CD Pipeline (GitHub Actions)](#cicd-pipeline-github-actions)
7. [SSO Configuration](#sso-configuration)
8. [Embedded Tool Integration](#embedded-tool-integration)
9. [Production Readiness Checklist](#production-readiness-checklist)
10. [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## Prerequisites

- **Node.js** >= 18.x (LTS recommended)
- **npm** >= 9.x or **yarn** >= 1.22.x
- **Git** >= 2.30.x
- **Vercel CLI** (optional, for manual deployments): `npm i -g vercel`
- A **Vercel** account linked to your GitHub repository
- (Optional) **Dynatrace** and/or **Elastic** instances with embeddable dashboard URLs
- (Optional) **Okta** or OIDC-compatible identity provider for SSO

---

## Environment Variables

All environment variables are prefixed with `VITE_` for Vite client-side exposure. Create a `.env` file in the project root (use `.env.example` as a template):

```bash
cp .env.example .env
```

### Variable Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_APP_TITLE` | No | `ARE Observability Dashboard` | Application title displayed in the browser tab and branding |
| `VITE_DYNATRACE_EMBED_URL` | No | _(empty)_ | Full URL to the Dynatrace APM dashboard for iframe embedding |
| `VITE_ELASTIC_EMBED_URL` | No | _(empty)_ | Full URL to the Elastic observability dashboard for iframe embedding |
| `VITE_SSO_ENABLED` | No | `false` | Set to `true` to enable SSO login flow via OIDC |
| `VITE_SSO_CLIENT_ID` | No | _(empty)_ | OAuth 2.0 / OIDC client ID from your identity provider |
| `VITE_SSO_AUTHORITY` | No | _(empty)_ | OIDC authority URL (e.g., `https://your-org.okta.com/oauth2/default`) |

### Example `.env` for Development

```bash
# Application
VITE_APP_TITLE=ARE Observability Dashboard

# Dynatrace Integration
VITE_DYNATRACE_EMBED_URL=https://your-dynatrace-instance.live.dynatrace.com/ui/dashboard/abc123

# Elastic Integration
VITE_ELASTIC_EMBED_URL=https://your-elastic-instance.elastic-cloud.com/app/dashboards#/view/xyz789

# SSO Configuration
VITE_SSO_ENABLED=false
VITE_SSO_CLIENT_ID=
VITE_SSO_AUTHORITY=
```

### Example `.env` for Production

```bash
VITE_APP_TITLE=Horizon — ARE Observability
VITE_DYNATRACE_EMBED_URL=https://prod-dynatrace.example.com/ui/dashboard/prod-dashboard-id
VITE_ELASTIC_EMBED_URL=https://prod-elastic.example.com/app/dashboards#/view/prod-view-id
VITE_SSO_ENABLED=true
VITE_SSO_CLIENT_ID=0oa1b2c3d4e5f6g7h8i9
VITE_SSO_AUTHORITY=https://your-org.okta.com/oauth2/default
```

> **Important:** Never commit `.env` files containing secrets to version control. The `.env.example` file is safe to commit as it contains only placeholder values.

### Setting Environment Variables in Vercel

1. Navigate to your project in the [Vercel Dashboard](https://vercel.com/dashboard)
2. Go to **Settings** → **Environment Variables**
3. Add each variable with the appropriate scope:
   - **Production**: Variables used in production deployments
   - **Preview**: Variables used in preview/PR deployments
   - **Development**: Variables used with `vercel dev`
4. Click **Save** after adding each variable
5. Redeploy for changes to take effect

---

## Local Development

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

The development server starts at `http://localhost:3000` with hot module replacement (HMR) enabled.

### Lint & Format

```bash
# Run ESLint
npm run lint

# Format with Prettier
npm run format
```

### Build for Production (Local)

```bash
npm run build
```

Output is generated in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

Serves the production build locally for verification before deployment.

---

## Vercel Deployment

### Automatic Deployments (Recommended)

1. **Connect Repository**: Link your GitHub repository to Vercel via the [Vercel Dashboard](https://vercel.com/new).

2. **Configure Build Settings**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
   - **Node.js Version**: 18.x

3. **Set Environment Variables**: Add all required `VITE_*` variables in the Vercel project settings (see [Environment Variables](#environment-variables) above).

4. **Deploy**: Push to your default branch (e.g., `main`) to trigger an automatic production deployment. Pull requests automatically generate preview deployments.

### Manual Deployment via Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Deployment Configuration

The project includes a `vercel.json` configuration file that handles SPA routing:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This ensures all routes are served by `index.html`, allowing React Router to handle client-side routing.

---

## SPA Rewrite Configuration

Since Horizon is a single-page application (SPA) using React Router for client-side routing, the server must be configured to serve `index.html` for all routes. Without this, direct navigation to routes like `/golden-signals` or `/incidents` would return a 404.

### Vercel

Already configured via `vercel.json` (included in the repository):

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Nginx (Alternative Hosting)

If deploying to a server running Nginx, add the following to your server block:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/horizon/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Apache (Alternative Hosting)

If deploying to Apache, create a `.htaccess` file in the `dist/` directory:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>
```

### AWS S3 + CloudFront (Alternative Hosting)

Configure the CloudFront distribution with a custom error response:

- **HTTP Error Code**: 403 and 404
- **Response Page Path**: `/index.html`
- **HTTP Response Code**: 200

---

## CI/CD Pipeline (GitHub Actions)

### Workflow: Build, Lint, and Deploy

Create `.github/workflows/deploy.yml`:

```yaml
name: Build, Lint & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build production bundle
        run: npm run build
        env:
          VITE_APP_TITLE: ${{ vars.VITE_APP_TITLE || 'ARE Observability Dashboard' }}
          VITE_DYNATRACE_EMBED_URL: ${{ secrets.VITE_DYNATRACE_EMBED_URL }}
          VITE_ELASTIC_EMBED_URL: ${{ secrets.VITE_ELASTIC_EMBED_URL }}
          VITE_SSO_ENABLED: ${{ vars.VITE_SSO_ENABLED || 'false' }}
          VITE_SSO_CLIENT_ID: ${{ secrets.VITE_SSO_CLIENT_ID }}
          VITE_SSO_AUTHORITY: ${{ secrets.VITE_SSO_AUTHORITY }}

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7

  deploy-preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Deploy to Vercel (Preview)
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./

  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment:
      name: production
      url: ${{ steps.deploy.outputs.preview-url }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Deploy to Vercel (Production)
        id: deploy
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./
```

### Required GitHub Secrets

Configure these in your repository under **Settings** → **Secrets and variables** → **Actions**:

| Secret | Description |
|---|---|
| `VERCEL_TOKEN` | Vercel personal access token (generate at [vercel.com/account/tokens](https://vercel.com/account/tokens)) |
| `VERCEL_ORG_ID` | Vercel organization/team ID (found in `.vercel/project.json` after `vercel link`) |
| `VERCEL_PROJECT_ID` | Vercel project ID (found in `.vercel/project.json` after `vercel link`) |
| `VITE_DYNATRACE_EMBED_URL` | Dynatrace embed URL for production builds |
| `VITE_ELASTIC_EMBED_URL` | Elastic embed URL for production builds |
| `VITE_SSO_CLIENT_ID` | SSO client ID for production builds |
| `VITE_SSO_AUTHORITY` | SSO authority URL for production builds |

### Required GitHub Variables

Configure these under **Settings** → **Secrets and variables** → **Actions** → **Variables**:

| Variable | Description |
|---|---|
| `VITE_APP_TITLE` | Application title (non-sensitive, can be a variable) |
| `VITE_SSO_ENABLED` | `true` or `false` (non-sensitive, can be a variable) |

### Linking Vercel to Your Repository

To obtain `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`:

```bash
# Install Vercel CLI
npm install -g vercel

# Link the project (creates .vercel/project.json)
vercel link

# Read the IDs from the generated file
cat .vercel/project.json
```

> **Note:** Add `.vercel/` to your `.gitignore` to avoid committing project-specific Vercel configuration.

---

## SSO Configuration

Horizon includes an SSO integration scaffold compatible with Okta and other OIDC-compliant identity providers. For the MVP, mock authentication is used. To enable SSO in production:

### 1. Register an Application in Your Identity Provider

**Okta Example:**

1. Navigate to **Applications** → **Create App Integration**
2. Select **OIDC - OpenID Connect** and **Single-Page Application**
3. Configure:
   - **Sign-in redirect URIs**: `https://your-domain.com/auth/callback`
   - **Sign-out redirect URIs**: `https://your-domain.com`
   - **Allowed grant types**: Authorization Code (with PKCE)
   - **Scopes**: `openid`, `profile`, `email`
4. Note the **Client ID** and **Issuer URI** (authority)

### 2. Set Environment Variables

```bash
VITE_SSO_ENABLED=true
VITE_SSO_CLIENT_ID=0oa1b2c3d4e5f6g7h8i9
VITE_SSO_AUTHORITY=https://your-org.okta.com/oauth2/default
```

### 3. Configure Redirect URIs

Ensure the following redirect URIs are registered with your identity provider:

| URI | Purpose |
|---|---|
| `https://your-domain.com/auth/callback` | Post-login redirect (authorization code exchange) |
| `https://your-domain.com` | Post-logout redirect |
| `http://localhost:3000/auth/callback` | Development post-login redirect |
| `http://localhost:3000` | Development post-logout redirect |

### 4. Role Mapping

The SSO provider scaffold (`src/services/ssoProvider.js`) includes a `resolveMockSSOUser` function that maps IdP claims to application roles. In production, update this function to map your IdP's group/role claims to the Horizon RBAC roles:

- `ADMIN` — Full administrative access
- `ARE_LEAD` — ARE Lead with annotation and upload permissions
- `VIEW_ONLY` — Read-only dashboard access

### 5. CORS Configuration

If your identity provider requires CORS configuration, ensure the following origins are allowed:

- `https://your-domain.com` (production)
- `http://localhost:3000` (development)

---

## Embedded Tool Integration

### Dynatrace

1. Generate an embeddable dashboard URL from your Dynatrace instance:
   - Navigate to the desired dashboard in Dynatrace
   - Use the **Share** → **Embed** option to generate an iframe-compatible URL
   - Ensure the URL allows embedding (check `X-Frame-Options` and `Content-Security-Policy` headers)

2. Set the environment variable:
   ```bash
   VITE_DYNATRACE_EMBED_URL=https://your-instance.live.dynatrace.com/ui/dashboard/abc123
   ```

3. If Dynatrace requires authentication for embedded views, configure SSO or API token-based access on the Dynatrace side.

### Elastic

1. Generate an embeddable dashboard URL from your Elastic/Kibana instance:
   - Navigate to the desired dashboard in Kibana
   - Use the **Share** → **Embed code** → **Saved object** option
   - Copy the iframe `src` URL

2. Set the environment variable:
   ```bash
   VITE_ELASTIC_EMBED_URL=https://your-instance.elastic-cloud.com/app/dashboards#/view/xyz789
   ```

3. Ensure Kibana's `server.securityResponseHeaders.disableEmbedding` is set to `false` to allow iframe embedding.

### Iframe Security

The `EmbeddedDashboard` component applies the following sandbox attributes to embedded iframes:

```
allow-scripts allow-same-origin allow-popups allow-forms
```

This provides a balance between functionality (scripts and forms work) and security (no top-level navigation, no pointer lock). Adjust the `sandbox` prop on the `EmbeddedDashboard` component if your embedded tools require additional permissions.

### Troubleshooting Embedded Dashboards

| Issue | Cause | Solution |
|---|---|---|
| Blank iframe | `X-Frame-Options: DENY` header | Configure the external tool to allow framing from your domain |
| Blank iframe | `Content-Security-Policy: frame-ancestors 'none'` | Update CSP on the external tool to include your domain |
| Login prompt in iframe | Session not shared | Configure SSO between Horizon and the embedded tool |
| Mixed content warning | HTTP URL embedded in HTTPS page | Use HTTPS URLs for all embedded dashboards |
| "Not Configured" message | Environment variable not set | Set the `VITE_DYNATRACE_EMBED_URL` or `VITE_ELASTIC_EMBED_URL` variable |

---

## Production Readiness Checklist

### Build & Deployment

- [ ] `npm run build` completes without errors
- [ ] `npm run lint` passes with zero warnings (or acceptable warnings only)
- [ ] Production build tested locally via `npm run preview`
- [ ] `vercel.json` SPA rewrite rules are in place
- [ ] Vercel project is linked and configured with correct build settings
- [ ] All required environment variables are set in Vercel project settings
- [ ] Production deployment URL is accessible and loads correctly
- [ ] All routes (e.g., `/golden-signals`, `/incidents`, `/compliance`) resolve correctly via direct navigation

### Environment & Configuration

- [ ] `.env` file is NOT committed to version control
- [ ] `.env.example` is up to date with all required variables
- [ ] `VITE_APP_TITLE` is set to the production application name
- [ ] Dynatrace embed URL is configured and accessible (if applicable)
- [ ] Elastic embed URL is configured and accessible (if applicable)
- [ ] SSO is configured and tested with the production identity provider (if applicable)
- [ ] SSO redirect URIs are registered for the production domain
- [ ] SSO client ID and authority URL are set as secrets in CI/CD

### Security

- [ ] No secrets or API keys are hardcoded in source code
- [ ] All sensitive environment variables are stored as GitHub Secrets (not Variables)
- [ ] SSO state/nonce CSRF protection is functional
- [ ] Iframe sandbox attributes are appropriate for embedded tools
- [ ] `referrerPolicy="no-referrer"` is set on embedded iframes
- [ ] No `console.log` statements in production code (only `console.warn` and `console.error`)
- [ ] Authentication tokens have a reasonable TTL (default: 1 hour)
- [ ] Audit log entries are immutable and append-only

### Performance

- [ ] Production build is minified and tree-shaken (Vite handles this automatically)
- [ ] Source maps are generated (`sourcemap: true` in `vite.config.js`) for debugging
- [ ] Static assets (JS, CSS, fonts) are served with long-lived cache headers
- [ ] Google Fonts are preconnected via `<link rel="preconnect">` in `index.html`
- [ ] Lazy loading is applied to embedded iframes (`loading="lazy"`)
- [ ] localStorage usage is within quota limits (audit log capped at 10,000 entries)

### Functionality

- [ ] Login flow works with all three demo accounts (Admin, ARE Lead, View Only)
- [ ] Role-based access control restricts pages and features correctly
- [ ] Dashboard data loads from mock data on first visit
- [ ] CSV/Excel file upload parses, validates, and merges data correctly
- [ ] Metric threshold configuration saves and persists across sessions
- [ ] Audit log captures login, logout, upload, configuration, and export actions
- [ ] Export to CSV and JSON generates valid downloadable files
- [ ] Annotations can be created, edited, and deleted by authorized users
- [ ] All charts render correctly with mock data (Recharts, D3.js)
- [ ] Dependency map supports zoom, pan, drag, and node selection
- [ ] Embedded tool dashboards load or show appropriate fallback messages
- [ ] Toast notifications appear for success, error, warning, and info events
- [ ] Mobile responsive layout works on tablet and phone viewports
- [ ] Sidebar collapses on desktop and renders as a drawer on mobile

### Browser Compatibility

- [ ] Chrome (latest 2 versions)
- [ ] Firefox (latest 2 versions)
- [ ] Safari (latest 2 versions)
- [ ] Edge (latest 2 versions)

---

## Monitoring & Troubleshooting

### Common Issues

#### Build Fails with "JSX not allowed in .js files"

Vite only transforms JSX in `.jsx` files. If a file contains JSX syntax but has a `.js` extension, rename it to `.jsx`.

#### localStorage Quota Exceeded

The audit log is capped at 10,000 entries (`MAX_AUDIT_LOG_ENTRIES` in `src/services/auditLogger.js`). If other data (uploaded metrics, thresholds) causes quota issues:

1. Open browser DevTools → **Application** → **Local Storage**
2. Check keys prefixed with `are_` for large entries
3. Use the admin page to reset data or clear specific keys
4. The `src/utils/storage.js` module logs quota errors to the console

#### Embedded Dashboard Shows "Not Configured"

1. Verify the environment variable is set: check **Vercel Dashboard** → **Settings** → **Environment Variables**
2. Ensure the URL is a valid, fully-qualified URL (starts with `https://`)
3. Redeploy after adding or changing environment variables
4. Check the browser console for CORS or CSP errors

#### SSO Login Redirects to a Blank Page

1. Verify the redirect URI (`/auth/callback`) is registered with your identity provider
2. Check that `VITE_SSO_AUTHORITY` points to the correct OIDC issuer URL
3. Ensure the `VITE_SSO_CLIENT_ID` matches the registered application
4. Check the browser console for CORS errors on the token endpoint

#### Data Not Persisting After Page Refresh

1. Verify localStorage is not disabled in the browser
2. Check for quota exceeded errors in the browser console
3. Ensure the `are_` namespace prefix is consistent across all storage operations
4. Open DevTools → **Application** → **Local Storage** and verify keys exist

### Log Locations

| Log Type | Location | Description |
|---|---|---|
| Audit Logs | localStorage (`are_audit_logs`) | Immutable record of all user actions |
| Console Warnings | Browser DevTools Console | Runtime warnings from application code |
| Console Errors | Browser DevTools Console | Runtime errors and failed operations |
| Build Logs | Vercel Dashboard → Deployments | Build output and deployment status |
| CI/CD Logs | GitHub Actions → Workflow Runs | Lint, build, and deploy pipeline logs |

### Useful DevTools Commands

```javascript
// View all Horizon localStorage keys
Object.keys(localStorage).filter(k => k.startsWith('are_'));

// View current dashboard data size
JSON.stringify(localStorage.getItem('are_dashboard_data')).length / 1024 + ' KB';

// View audit log entry count
JSON.parse(localStorage.getItem('are_audit_logs') || '[]').length;

// Clear all Horizon data (development only)
Object.keys(localStorage).filter(k => k.startsWith('are_')).forEach(k => localStorage.removeItem(k));

// View current auth token payload
JSON.parse(atob(localStorage.getItem('are_auth_token')?.split('.')[1] || 'bnVsbA=='));
```

---

## Architecture Notes

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

---

## Support

For issues related to deployment or configuration, check:

1. The [Vercel Documentation](https://vercel.com/docs)
2. The [Vite Documentation](https://vitejs.dev/guide/)
3. The [React Router Documentation](https://reactrouter.com/en/main)
4. The project `CHANGELOG.md` for recent changes