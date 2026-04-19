import { useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { usePermissions } from '../../hooks/usePermissions';
import { MetricCard } from '../shared/MetricCard';
import { StatusBadge } from '../shared/StatusBadge';
import { TrendArrow } from '../shared/TrendArrow';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import {
  DOMAIN_TIERS,
  DOMAIN_TIER_LABELS,
  DOMAIN_TIER_ORDER,
  DEFAULT_SLA_TARGETS,
  DEFAULT_SLO_TARGETS,
  SEVERITY_LEVELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
  RCA_CATEGORIES,
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_COLORS,
  SERVICE_STATUS,
} from '../../constants/metrics';
import { formatPercentage, formatNumber, formatTimestamp } from '../../utils/formatters';
import { getRelativeTime, parseTimestamp } from '../../utils/dateUtils';
import { exportToCSV, exportToJSON, prepareIncidentsForExport, prepareServicesForExport } from '../../utils/exportUtils';
import { logAction, AUDIT_ACTIONS, AUDIT_RESULTS } from '../../services/auditLogger';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../shared/ToastNotification';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/**
 * ComplianceReport - Compliance reporting widget showing SLA adherence, uptime
 * percentages, incident audit summary, evidence links, and export functionality.
 *
 * Features:
 * - Overall SLA compliance rate with per-domain breakdown
 * - Monthly SLA compliance trend bar chart
 * - Uptime percentages per domain and service with tier grouping
 * - Incident audit summary with severity breakdown and RCA distribution
 * - Evidence links (mock Confluence/Jira URLs) for each incident
 * - Export button for audit reports (CSV and JSON)
 * - Toggleable time window (3 months / 6 months / 12 months)
 * - Toggle between SLA and SLO compliance views
 * - Per-domain expandable detail with service-level compliance
 * - Breach analysis with total breach minutes and affected services
 * - Confluence/SOP links section
 * - Color-coded compliance indicators (green/yellow/red)
 * - Responsive grid layout with compact mode support
 * - Loading and empty states
 *
 * @param {Object} props
 * @param {string} [props.className=''] - Additional CSS classes for the container.
 * @param {boolean} [props.compact=false] - If true, renders a more compact layout.
 * @param {boolean} [props.showMetricCards=true] - Whether to show the summary metric cards.
 * @param {boolean} [props.showChart=true] - Whether to show the monthly compliance chart.
 * @param {boolean} [props.showIncidentAudit=true] - Whether to show the incident audit summary.
 * @param {boolean} [props.showEvidenceLinks=true] - Whether to show evidence links for incidents.
 * @param {boolean} [props.showExport=true] - Whether to show the export button.
 * @param {boolean} [props.showConfluenceLinks=true] - Whether to show Confluence/SOP links.
 * @param {number} [props.chartHeight=260] - Height of the chart area in pixels.
 * @returns {React.ReactNode}
 */
const ComplianceReport = ({
  className = '',
  compact = false,
  showMetricCards = true,
  showChart = true,
  showIncidentAudit = true,
  showEvidenceLinks = true,
  showExport = true,
  showConfluenceLinks = true,
  chartHeight = 260,
}) => {
  const { dashboardData, domains, isLoading, error } = useDashboard();
  const { currentUser } = useAuth();
  const { canExport } = usePermissions();
  const { success: toastSuccess, error: toastError } = useToast();

  const [monthsWindow, setMonthsWindow] = useState(12);
  const [activeView, setActiveView] = useState('sla');
  const [expandedDomains, setExpandedDomains] = useState({});
  const [expandedIncidents, setExpandedIncidents] = useState({});
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Get all SLA compliance records from dashboard data.
   */
  const allComplianceRecords = useMemo(() => {
    if (!dashboardData || !dashboardData.sla_compliance) {
      return [];
    }
    return dashboardData.sla_compliance;
  }, [dashboardData]);

  /**
   * Get all incidents from dashboard data.
   */
  const allIncidents = useMemo(() => {
    if (!dashboardData || !dashboardData.incidents) {
      return [];
    }
    return dashboardData.incidents;
  }, [dashboardData]);

  /**
   * Get confluence links from dashboard data.
   */
  const confluenceLinks = useMemo(() => {
    if (!dashboardData || !dashboardData.config || !dashboardData.config.confluence_links) {
      return [];
    }
    return dashboardData.config.confluence_links;
  }, [dashboardData]);

  /**
   * Filter compliance records based on the selected months window.
   */
  const filteredComplianceRecords = useMemo(() => {
    if (!allComplianceRecords || allComplianceRecords.length === 0) {
      return [];
    }

    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - monthsWindow, 1);
    const cutoffMonth = cutoffDate.toISOString().slice(0, 7);

    return allComplianceRecords.filter((record) => {
      if (!record.month) return false;
      return record.month >= cutoffMonth;
    });
  }, [allComplianceRecords, monthsWindow]);

  /**
   * Compute per-domain compliance summaries.
   */
  const domainComplianceSummaries = useMemo(() => {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return [];
    }

    const recordsByDomain = {};
    for (const record of filteredComplianceRecords) {
      if (!recordsByDomain[record.domain_id]) {
        recordsByDomain[record.domain_id] = [];
      }
      recordsByDomain[record.domain_id].push(record);
    }

    return domains.map((domain) => {
      const records = (recordsByDomain[domain.domain_id] || []).sort(
        (a, b) => (a.month || '').localeCompare(b.month || ''),
      );
      const tier = domain.tier || DOMAIN_TIERS.SUPPORTING;
      const slaTarget = DEFAULT_SLA_TARGETS[tier] ?? 99.9;
      const sloTarget = DEFAULT_SLO_TARGETS[tier] ?? 99.5;

      const totalMonths = records.length;
      const compliantMonths = records.filter((r) => r.compliant).length;
      const breachMonths = totalMonths - compliantMonths;

      const avgAvailability =
        totalMonths > 0
          ? parseFloat(
              (records.reduce((sum, r) => sum + (r.availability || 0), 0) / totalMonths).toFixed(2),
            )
          : 0;

      const totalBreachMinutes = records.reduce(
        (sum, r) => sum + (r.breach_minutes || 0),
        0,
      );

      const complianceRate =
        totalMonths > 0
          ? parseFloat(((compliantMonths / totalMonths) * 100).toFixed(2))
          : 100;

      // Compute per-service availability from current snapshot
      const services = (domain.services || []).map((service) => {
        const availability = service.availability != null ? service.availability : 0;
        const serviceSla = service.sla != null ? service.sla : slaTarget;
        const serviceSlo = service.slo != null ? service.slo : sloTarget;
        const target = activeView === 'sla' ? serviceSla : serviceSlo;
        const isCompliant = availability >= target;
        const gap = parseFloat((availability - target).toFixed(4));

        return {
          service_id: service.service_id,
          name: service.name,
          availability,
          sla_target: serviceSla,
          slo_target: serviceSlo,
          target,
          is_compliant: isCompliant,
          gap,
          status: service.status,
          error_budget: service.error_budget,
        };
      });

      const compliantServices = services.filter((s) => s.is_compliant).length;

      // Domain incidents
      const domainIncidents = allIncidents.filter((inc) => inc.domain_id === domain.domain_id);

      return {
        domain_id: domain.domain_id,
        name: domain.name,
        tier,
        sla_target: slaTarget,
        slo_target: sloTarget,
        avg_availability: avgAvailability,
        total_months: totalMonths,
        compliant_months: compliantMonths,
        breach_months: breachMonths,
        compliance_rate: complianceRate,
        total_breach_minutes: parseFloat(totalBreachMinutes.toFixed(2)),
        monthly_records: records,
        services,
        total_services: services.length,
        compliant_services: compliantServices,
        incident_count: domainIncidents.length,
        p1_count: domainIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P1).length,
        p2_count: domainIncidents.filter((i) => i.severity === SEVERITY_LEVELS.P2).length,
      };
    }).sort((a, b) => {
      const tierDiff = (DOMAIN_TIER_ORDER[a.tier] ?? 99) - (DOMAIN_TIER_ORDER[b.tier] ?? 99);
      if (tierDiff !== 0) return tierDiff;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [domains, filteredComplianceRecords, allIncidents, activeView]);

  /**
   * Compute overall compliance summary.
   */
  const overallSummary = useMemo(() => {
    if (!domainComplianceSummaries || domainComplianceSummaries.length === 0) {
      return {
        totalDomains: 0,
        totalServices: 0,
        compliantServices: 0,
        overallComplianceRate: 100,
        overallAvailability: 0,
        totalBreachMinutes: 0,
        totalIncidents: 0,
        p1Incidents: 0,
        p2Incidents: 0,
        totalMonthlyRecords: 0,
        compliantMonthlyRecords: 0,
        monthlyComplianceRate: 100,
      };
    }

    let totalServices = 0;
    let compliantServices = 0;
    let totalBreachMinutes = 0;
    let totalIncidents = 0;
    let p1Incidents = 0;
    let p2Incidents = 0;
    let totalMonthlyRecords = 0;
    let compliantMonthlyRecords = 0;
    let totalAvailability = 0;

    for (const domain of domainComplianceSummaries) {
      totalServices += domain.total_services;
      compliantServices += domain.compliant_services;
      totalBreachMinutes += domain.total_breach_minutes;
      totalIncidents += domain.incident_count;
      p1Incidents += domain.p1_count;
      p2Incidents += domain.p2_count;
      totalMonthlyRecords += domain.total_months;
      compliantMonthlyRecords += domain.compliant_months;
      totalAvailability += domain.avg_availability * domain.total_months;
    }

    const overallAvailability =
      totalMonthlyRecords > 0
        ? parseFloat((totalAvailability / totalMonthlyRecords).toFixed(2))
        : 0;

    const overallComplianceRate =
      totalServices > 0
        ? parseFloat(((compliantServices / totalServices) * 100).toFixed(2))
        : 100;

    const monthlyComplianceRate =
      totalMonthlyRecords > 0
        ? parseFloat(((compliantMonthlyRecords / totalMonthlyRecords) * 100).toFixed(2))
        : 100;

    return {
      totalDomains: domainComplianceSummaries.length,
      totalServices,
      compliantServices,
      overallComplianceRate,
      overallAvailability,
      totalBreachMinutes: parseFloat(totalBreachMinutes.toFixed(2)),
      totalIncidents,
      p1Incidents,
      p2Incidents,
      totalMonthlyRecords,
      compliantMonthlyRecords,
      monthlyComplianceRate,
    };
  }, [domainComplianceSummaries]);

  /**
   * Build monthly compliance chart data aggregated across all domains.
   */
  const monthlyChartData = useMemo(() => {
    if (!filteredComplianceRecords || filteredComplianceRecords.length === 0) {
      return [];
    }

    const monthMap = new Map();

    for (const record of filteredComplianceRecords) {
      if (!record.month) continue;

      if (!monthMap.has(record.month)) {
        monthMap.set(record.month, {
          month: record.month,
          totalDomains: 0,
          compliantDomains: 0,
          avgAvailability: 0,
          totalAvailability: 0,
          totalBreachMinutes: 0,
        });
      }

      const entry = monthMap.get(record.month);
      entry.totalDomains += 1;
      if (record.compliant) entry.compliantDomains += 1;
      entry.totalAvailability += record.availability || 0;
      entry.totalBreachMinutes += record.breach_minutes || 0;
    }

    const data = Array.from(monthMap.values())
      .map((entry) => ({
        ...entry,
        avgAvailability:
          entry.totalDomains > 0
            ? parseFloat((entry.totalAvailability / entry.totalDomains).toFixed(2))
            : 0,
        complianceRate:
          entry.totalDomains > 0
            ? parseFloat(((entry.compliantDomains / entry.totalDomains) * 100).toFixed(2))
            : 100,
        monthLabel: formatMonthLabel(entry.month),
      }))
      .sort((a, b) => (a.month || '').localeCompare(b.month || ''));

    return data;
  }, [filteredComplianceRecords]);

  /**
   * Compute incident audit summary.
   */
  const incidentAuditSummary = useMemo(() => {
    if (!allIncidents || allIncidents.length === 0) {
      return {
        total: 0,
        bySeverity: {},
        byRootCause: {},
        avgMTTR: null,
        avgMTTD: null,
        recentIncidents: [],
      };
    }

    const bySeverity = {};
    for (const level of Object.values(SEVERITY_LEVELS)) {
      bySeverity[level] = allIncidents.filter((i) => i.severity === level).length;
    }

    const byRootCause = {};
    for (const category of Object.values(RCA_CATEGORIES)) {
      const count = allIncidents.filter((i) => i.root_cause === category).length;
      if (count > 0) {
        byRootCause[category] = count;
      }
    }

    const mttrValues = allIncidents
      .filter((i) => i.mttr != null && !isNaN(i.mttr))
      .map((i) => parseFloat(i.mttr));

    const mttdValues = allIncidents
      .filter((i) => i.mttd != null && !isNaN(i.mttd))
      .map((i) => parseFloat(i.mttd));

    const avgMTTR =
      mttrValues.length > 0
        ? parseFloat((mttrValues.reduce((sum, v) => sum + v, 0) / mttrValues.length).toFixed(2))
        : null;

    const avgMTTD =
      mttdValues.length > 0
        ? parseFloat((mttdValues.reduce((sum, v) => sum + v, 0) / mttdValues.length).toFixed(2))
        : null;

    const recentIncidents = [...allIncidents]
      .sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    return {
      total: allIncidents.length,
      bySeverity,
      byRootCause,
      avgMTTR,
      avgMTTD,
      recentIncidents,
    };
  }, [allIncidents]);

  /**
   * Determine the overall compliance health status.
   */
  const complianceStatus = useMemo(() => {
    if (overallSummary.totalServices === 0) return 'unknown';
    if (overallSummary.overallComplianceRate >= 100) return 'healthy';
    if (overallSummary.overallComplianceRate >= 80) return 'warning';
    return 'critical';
  }, [overallSummary]);

  /**
   * Format a month string (YYYY-MM) to a display label.
   * @param {string} month - The month string.
   * @returns {string} Formatted label.
   */
  function formatMonthLabel(month) {
    if (!month || typeof month !== 'string') return '';
    const parts = month.split('-');
    if (parts.length < 2) return month;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    if (isNaN(date.getTime())) return month;
    return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }

  /**
   * Toggle the expanded state of a domain card.
   */
  const toggleDomain = useCallback((domainId) => {
    setExpandedDomains((prev) => ({
      ...prev,
      [domainId]: !prev[domainId],
    }));
  }, []);

  /**
   * Toggle the expanded state of an incident row.
   */
  const toggleIncident = useCallback((incidentId) => {
    setExpandedIncidents((prev) => ({
      ...prev,
      [incidentId]: !prev[incidentId],
    }));
  }, []);

  /**
   * Handle months window toggle.
   */
  const handleMonthsWindowChange = useCallback((months) => {
    setMonthsWindow(months);
  }, []);

  /**
   * Handle view toggle between SLA and SLO.
   */
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
  }, []);

  /**
   * Handle export of compliance report.
   */
  const handleExport = useCallback(
    async (format) => {
      if (!canExport) {
        toastError('You do not have permission to export data.');
        return;
      }

      setIsExporting(true);

      try {
        const exportData = domainComplianceSummaries.map((domain) => ({
          domain_id: domain.domain_id,
          domain_name: domain.name,
          tier: domain.tier,
          sla_target: domain.sla_target,
          slo_target: domain.slo_target,
          avg_availability: domain.avg_availability,
          compliance_rate: domain.compliance_rate,
          total_months: domain.total_months,
          compliant_months: domain.compliant_months,
          breach_months: domain.breach_months,
          total_breach_minutes: domain.total_breach_minutes,
          total_services: domain.total_services,
          compliant_services: domain.compliant_services,
          incident_count: domain.incident_count,
          p1_count: domain.p1_count,
          p2_count: domain.p2_count,
        }));

        let success = false;

        if (format === 'json') {
          success = exportToJSON(
            {
              summary: overallSummary,
              domains: exportData,
              incidents: prepareIncidentsForExport(allIncidents),
              monthly_compliance: monthlyChartData,
            },
            {
              baseName: 'compliance-report',
              wrapWithMetadata: true,
              metadata: {
                export_type: 'compliance_report',
                view: activeView,
                months_window: monthsWindow,
              },
            },
          );
        } else {
          const columnLabels = {
            domain_id: 'Domain ID',
            domain_name: 'Domain Name',
            tier: 'Tier',
            sla_target: 'SLA Target (%)',
            slo_target: 'SLO Target (%)',
            avg_availability: 'Avg Availability (%)',
            compliance_rate: 'Compliance Rate (%)',
            total_months: 'Total Months',
            compliant_months: 'Compliant Months',
            breach_months: 'Breach Months',
            total_breach_minutes: 'Total Breach Minutes',
            total_services: 'Total Services',
            compliant_services: 'Compliant Services',
            incident_count: 'Incidents',
            p1_count: 'P1 Incidents',
            p2_count: 'P2 Incidents',
          };

          success = exportToCSV(exportData, {
            baseName: 'compliance-report',
            columnLabels,
          });
        }

        if (success) {
          const userId = currentUser?.id || 'unknown';
          const userName = currentUser?.name || 'Unknown User';
          const userEmail = currentUser?.email || '';

          logAction(userId, AUDIT_ACTIONS.EXPORT_DATA, 'compliance_report', {
            user_name: userName,
            user_email: userEmail,
            status: AUDIT_RESULTS.SUCCESS,
            description: `Exported compliance report as ${format.toUpperCase()} (${monthsWindow} months, ${activeView.toUpperCase()} view)`,
            details: {
              format,
              months_window: monthsWindow,
              view: activeView,
              domain_count: domainComplianceSummaries.length,
              incident_count: allIncidents.length,
            },
          });

          toastSuccess(`Compliance report exported as ${format.toUpperCase()}.`);
        } else {
          toastError('Failed to export compliance report.');
        }
      } catch (e) {
        console.error('[ComplianceReport] Export failed:', e);
        toastError('An unexpected error occurred during export.');
      } finally {
        setIsExporting(false);
      }
    },
    [
      canExport,
      domainComplianceSummaries,
      overallSummary,
      allIncidents,
      monthlyChartData,
      activeView,
      monthsWindow,
      currentUser,
      toastSuccess,
      toastError,
    ],
  );

  /**
   * Get the availability color class based on value and target.
   */
  const getAvailabilityColorClass = useCallback((availability, target) => {
    if (availability == null || isNaN(availability)) return 'text-dashboard-text-muted';
    if (availability >= target) return 'text-status-healthy';
    if (availability >= target - 0.1) return 'text-status-degraded';
    return 'text-severity-critical';
  }, []);

  /**
   * Get the compliance rate color class.
   */
  const getComplianceColorClass = useCallback((rate) => {
    if (rate == null || isNaN(rate)) return 'text-dashboard-text-muted';
    if (rate >= 100) return 'text-status-healthy';
    if (rate >= 80) return 'text-status-degraded';
    return 'text-severity-critical';
  }, []);

  /**
   * Get the progress bar color class based on compliance status.
   */
  const getProgressBarColorClass = useCallback((isCompliant, gap) => {
    if (isCompliant) return 'bg-status-healthy';
    if (gap != null && gap >= -0.1) return 'bg-status-degraded';
    return 'bg-severity-critical';
  }, []);

  /**
   * Get the MTTR color class.
   */
  const getMTTRColorClass = useCallback((value) => {
    if (value == null || isNaN(value)) return 'text-dashboard-text-muted';
    if (value > 60) return 'text-severity-critical';
    if (value > 30) return 'text-status-degraded';
    return 'text-status-healthy';
  }, []);

  /**
   * Custom tooltip for the monthly compliance chart.
   */
  const renderChartTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className="bg-white border border-dashboard-border rounded-lg shadow-panel px-3 py-2 text-xs">
        <p className="font-medium text-dashboard-text-primary mb-1">{label}</p>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-dashboard-text-muted">Compliance:</span>
          <span
            className={`font-semibold ${getComplianceColorClass(data.complianceRate)}`}
          >
            {formatPercentage(data.complianceRate, 1)}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-dashboard-text-muted">Avg Availability:</span>
          <span className="font-semibold text-dashboard-text-primary">
            {formatPercentage(data.avgAvailability, 2)}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-dashboard-text-muted">Domains:</span>
          <span className="font-medium text-dashboard-text-secondary">
            {data.compliantDomains}/{data.totalDomains} compliant
          </span>
        </div>
        {data.totalBreachMinutes > 0 && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-dashboard-text-muted">Breach:</span>
            <span className="font-medium text-severity-critical">
              {formatNumber(data.totalBreachMinutes, { decimals: 1 })} min
            </span>
          </div>
        )}
      </div>
    );
  }, [getComplianceColorClass]);

  /**
   * Custom bar shape that colors each bar based on compliance rate.
   */
  const renderComplianceBar = useCallback((props) => {
    const { x, y, width, height, payload } = props;
    let fill = '#16a34a';
    if (payload && payload.complianceRate < 100) {
      fill = payload.complianceRate >= 80 ? '#ca8a04' : '#dc2626';
    }

    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} ry={2} />;
  }, []);

  /**
   * Render the months window toggle buttons.
   */
  function renderMonthsWindowToggle() {
    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {[3, 6, 12].map((months) => (
          <button
            key={months}
            onClick={() => handleMonthsWindowChange(months)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
              monthsWindow === months
                ? 'bg-white text-dashboard-text-primary shadow-sm'
                : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
            }`}
            aria-pressed={monthsWindow === months}
            aria-label={`Show last ${months} months`}
          >
            {months}mo
          </button>
        ))}
      </div>
    );
  }

  /**
   * Render the view toggle buttons.
   */
  function renderViewToggle() {
    return (
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => handleViewChange('sla')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeView === 'sla'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={activeView === 'sla'}
          aria-label="Show SLA compliance"
        >
          SLA
        </button>
        <button
          onClick={() => handleViewChange('slo')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeView === 'slo'
              ? 'bg-white text-dashboard-text-primary shadow-sm'
              : 'text-dashboard-text-muted hover:text-dashboard-text-secondary'
          }`}
          aria-pressed={activeView === 'slo'}
          aria-label="Show SLO compliance"
        >
          SLO
        </button>
      </div>
    );
  }

  /**
   * Render the export dropdown.
   */
  function renderExportButton() {
    if (!showExport || !canExport) return null;

    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleExport('csv')}
          disabled={isExporting}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
            isExporting
              ? 'bg-gray-100 text-dashboard-text-muted cursor-not-allowed'
              : 'bg-white border border-dashboard-border text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
          }`}
          aria-label="Export as CSV"
        >
          {isExporting ? (
            <div className="w-3 h-3 border-2 border-dashboard-text-muted/30 border-t-dashboard-text-muted rounded-full animate-spin" />
          ) : (
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          )}
          CSV
        </button>
        <button
          onClick={() => handleExport('json')}
          disabled={isExporting}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
            isExporting
              ? 'bg-gray-100 text-dashboard-text-muted cursor-not-allowed'
              : 'bg-white border border-dashboard-border text-dashboard-text-secondary hover:bg-gray-50 hover:text-dashboard-text-primary'
          }`}
          aria-label="Export as JSON"
        >
          JSON
        </button>
      </div>
    );
  }

  /**
   * Render a progress bar for compliance visualization.
   */
  function renderProgressBar(actual, target, isCompliant, gap) {
    const rangeMin = Math.max(0, target - 1);
    const rangeMax = target;
    const range = rangeMax - rangeMin;
    let progressPercent = 100;

    if (range > 0 && actual < target) {
      progressPercent = Math.max(0, Math.min(100, ((actual - rangeMin) / range) * 100));
    }

    const barColorClass = getProgressBarColorClass(isCompliant, gap);

    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
            style={{ width: `${progressPercent}%` }}
            title={`${formatPercentage(actual, 2)} / ${formatPercentage(target, 2)}`}
          />
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner message="Loading compliance data…" size="md" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="error"
          title="Failed to load compliance data"
          description={error}
          size="md"
        />
      </div>
    );
  }

  // Empty state
  if (!domains || domains.length === 0) {
    return (
      <div className={`${className}`}>
        <EmptyState
          preset="no-data"
          title="No compliance data"
          description="No domain or service data is available. Upload metrics data to populate the compliance report."
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
            Compliance Report
          </h3>
          <StatusBadge
            status={complianceStatus}
            size="sm"
            label={
              complianceStatus === 'healthy'
                ? 'All Compliant'
                : complianceStatus === 'warning'
                  ? 'Partial Compliance'
                  : complianceStatus === 'critical'
                    ? 'Compliance Issues'
                    : 'Unknown'
            }
          />
        </div>
        <div className="flex items-center gap-3">
          {renderViewToggle()}
          {renderMonthsWindowToggle()}
          {renderExportButton()}
        </div>
      </div>

      {/* Top-Level Metric Cards */}
      {showMetricCards && (
        <div
          className={`grid gap-4 mb-6 ${
            compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          <MetricCard
            title={`${activeView === 'sla' ? 'SLA' : 'SLO'} Compliance`}
            value={overallSummary.overallComplianceRate}
            unit="%"
            size={compact ? 'sm' : 'md'}
            status={complianceStatus}
            subtitle={`${overallSummary.compliantServices} of ${overallSummary.totalServices} services`}
            trend={{
              direction: overallSummary.overallComplianceRate >= 100 ? 'stable' : 'down',
              invertColor: true,
            }}
          />
          <MetricCard
            title="Platform Availability"
            value={overallSummary.overallAvailability}
            unit="%"
            size={compact ? 'sm' : 'md'}
            status={overallSummary.overallAvailability >= 99.9 ? 'healthy' : 'degraded'}
          />
          <MetricCard
            title="Monthly Compliance"
            value={overallSummary.monthlyComplianceRate}
            unit="%"
            size={compact ? 'sm' : 'md'}
            status={
              overallSummary.monthlyComplianceRate >= 100
                ? 'healthy'
                : overallSummary.monthlyComplianceRate >= 80
                  ? 'warning'
                  : 'critical'
            }
            subtitle={`${overallSummary.compliantMonthlyRecords} of ${overallSummary.totalMonthlyRecords} months`}
          />
          <MetricCard
            title="Total Breach Minutes"
            value={overallSummary.totalBreachMinutes}
            unit="min"
            size={compact ? 'sm' : 'md'}
            status={overallSummary.totalBreachMinutes > 0 ? 'critical' : 'healthy'}
            subtitle={`${overallSummary.totalIncidents} incidents`}
            trend={{
              direction: overallSummary.totalBreachMinutes > 0 ? 'up' : 'stable',
              invertColor: false,
            }}
          />
        </div>
      )}

      {/* Monthly Compliance Chart */}
      {showChart && monthlyChartData.length > 0 && (
        <div className="dashboard-card overflow-hidden mb-6">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
            <div className="flex items-center gap-3 min-w-0">
              <h4 className="text-sm font-semibold text-dashboard-text-primary">
                Monthly {activeView === 'sla' ? 'SLA' : 'SLO'} Compliance Trend
              </h4>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                {monthlyChartData.length}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-status-healthy" />
                100% Compliant
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-status-degraded" />
                ≥80%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-severity-critical" />
                &lt;80%
              </span>
            </div>
          </div>

          <div className="p-4">
            <div style={{ width: '100%', height: compact ? 180 : chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChartData}
                  margin={{
                    top: 8,
                    right: 12,
                    left: compact ? -10 : 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    width={compact ? 40 : 50}
                  />
                  <Tooltip content={renderChartTooltip} />
                  <Bar
                    dataKey="complianceRate"
                    name="Compliance Rate"
                    maxBarSize={compact ? 28 : 40}
                    shape={renderComplianceBar}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
            <span className="text-xs text-dashboard-text-muted">
              {monthlyChartData.length} months · {overallSummary.totalDomains} domains
            </span>
            <span className="text-xs text-dashboard-text-muted">
              Last {monthsWindow} months
            </span>
          </div>
        </div>
      )}

      {/* Domain Compliance Cards */}
      <div className="space-y-6 mb-6">
        {/* Group by tier */}
        {Object.values(DOMAIN_TIERS).map((tier) => {
          const tierDomains = domainComplianceSummaries.filter((d) => d.tier === tier);
          if (tierDomains.length === 0) return null;

          const tierTarget = activeView === 'sla'
            ? (DEFAULT_SLA_TARGETS[tier] ?? 99.9)
            : (DEFAULT_SLO_TARGETS[tier] ?? 99.5);

          const tierAvgCompliance =
            tierDomains.length > 0
              ? parseFloat(
                  (
                    tierDomains.reduce((sum, d) => sum + d.compliance_rate, 0) / tierDomains.length
                  ).toFixed(2),
                )
              : 100;

          return (
            <div key={tier}>
              {/* Tier Header */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-dashboard-text-primary">
                    {DOMAIN_TIER_LABELS[tier] || tier} Tier
                  </h4>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                    {tierDomains.length}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                  <span>
                    {activeView === 'sla' ? 'SLA' : 'SLO'} Target:{' '}
                    <span className="font-medium text-dashboard-text-secondary">
                      {formatPercentage(tierTarget, 2)}
                    </span>
                  </span>
                  <span>
                    Compliance:{' '}
                    <span className={`font-medium ${getComplianceColorClass(tierAvgCompliance)}`}>
                      {formatPercentage(tierAvgCompliance, 1)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Domain Cards Grid */}
              <div
                className={`grid gap-3 ${
                  compact ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {tierDomains.map((domainData) => {
                  const isExpanded = expandedDomains[domainData.domain_id] || false;
                  const target =
                    activeView === 'sla' ? domainData.sla_target : domainData.slo_target;
                  const isCompliant = domainData.avg_availability >= target;

                  return (
                    <div
                      key={domainData.domain_id}
                      className="dashboard-card overflow-hidden cursor-pointer"
                    >
                      {/* Domain Header */}
                      <div
                        className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50/50 transition-colors duration-150"
                        onClick={() => toggleDomain(domainData.domain_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleDomain(domainData.domain_id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={`${domainData.name} domain — ${formatPercentage(domainData.compliance_rate, 1)} compliance`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              isCompliant
                                ? 'bg-status-healthy'
                                : domainData.compliance_rate >= 80
                                  ? 'bg-status-degraded'
                                  : 'bg-status-down animate-pulse'
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-semibold text-dashboard-text-primary truncate">
                                {domainData.name}
                              </h5>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-dashboard-text-muted">
                                {domainData.compliant_services}/{domainData.total_services} services
                              </span>
                              {isCompliant ? (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                                  {activeView.toUpperCase()} ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                  {activeView.toUpperCase()} ✗
                                </span>
                              )}
                              {domainData.breach_months > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                  {domainData.breach_months} breach{domainData.breach_months !== 1 ? 'es' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <span
                              className={`text-lg font-bold leading-none ${getAvailabilityColorClass(domainData.avg_availability, target)}`}
                            >
                              {formatPercentage(domainData.avg_availability, 2)}
                            </span>
                            <div className="text-[10px] text-dashboard-text-muted mt-0.5">
                              target: {formatPercentage(target, 2)}
                            </div>
                          </div>
                          <svg
                            className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Domain Progress Bar */}
                      <div className="px-4 pb-3">
                        {renderProgressBar(
                          domainData.avg_availability,
                          target,
                          isCompliant,
                          domainData.avg_availability - target,
                        )}
                      </div>

                      {/* Expanded Service Detail */}
                      {isExpanded && domainData.services.length > 0 && (
                        <div className="border-t border-dashboard-border bg-gray-50/30 animate-fade-in">
                          <div className="px-4 py-2">
                            {/* Compliance Summary Row */}
                            <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-dashboard-text-muted">
                              <span>
                                Compliance Rate:{' '}
                                <span className={`font-medium ${getComplianceColorClass(domainData.compliance_rate)}`}>
                                  {formatPercentage(domainData.compliance_rate, 1)}
                                </span>
                              </span>
                              <span>
                                Months: {domainData.compliant_months}/{domainData.total_months} compliant
                              </span>
                              {domainData.total_breach_minutes > 0 && (
                                <span>
                                  Breach:{' '}
                                  <span className="font-medium text-severity-critical">
                                    {formatNumber(domainData.total_breach_minutes, { decimals: 1 })} min
                                  </span>
                                </span>
                              )}
                              {domainData.incident_count > 0 && (
                                <span>
                                  Incidents:{' '}
                                  <span className="font-medium text-dashboard-text-secondary">
                                    {domainData.incident_count}
                                  </span>
                                  {domainData.p1_count > 0 && (
                                    <span className="ml-1 text-severity-critical">
                                      ({domainData.p1_count} P1)
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Service Table */}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted">
                                  <th className="text-left py-1.5 pr-2">Service</th>
                                  <th className="text-right py-1.5 px-2">Actual</th>
                                  <th className="text-right py-1.5 px-2">Target</th>
                                  <th className="text-right py-1.5 px-2">Gap</th>
                                  <th className="py-1.5 px-2 w-24">Progress</th>
                                  <th className="text-center py-1.5 pl-2">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-dashboard-border">
                                {domainData.services.map((service) => {
                                  const gapDisplay =
                                    service.gap != null && !isNaN(service.gap)
                                      ? service.gap >= 0
                                        ? `+${Math.abs(service.gap).toFixed(3)}%`
                                        : `-${Math.abs(service.gap).toFixed(3)}%`
                                      : '—';

                                  const gapColorClass =
                                    service.gap != null && !isNaN(service.gap)
                                      ? service.gap >= 0
                                        ? 'text-status-healthy'
                                        : service.gap >= -0.1
                                          ? 'text-status-degraded'
                                          : 'text-severity-critical'
                                      : 'text-dashboard-text-muted';

                                  return (
                                    <tr
                                      key={service.service_id}
                                      className="hover:bg-white/50 transition-colors duration-150"
                                    >
                                      <td className="py-2 pr-2">
                                        <span className="text-sm text-dashboard-text-primary font-medium truncate block max-w-[140px]">
                                          {service.name}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span
                                          className={`text-sm font-semibold ${getAvailabilityColorClass(service.availability, service.target)}`}
                                        >
                                          {formatPercentage(service.availability, 2)}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span className="text-dashboard-text-muted">
                                          {formatPercentage(service.target, 2)}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span className={`font-medium ${gapColorClass}`}>
                                          {gapDisplay}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2">
                                        {renderProgressBar(
                                          service.availability,
                                          service.target,
                                          service.is_compliant,
                                          service.gap,
                                        )}
                                      </td>
                                      <td className="py-2 pl-2 text-center">
                                        {service.is_compliant ? (
                                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-green-50 text-green-800">
                                            ✓
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-red-50 text-red-800">
                                            ✗
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Incident Audit Summary + Evidence Links */}
      {showIncidentAudit && incidentAuditSummary.total > 0 && (
        <div
          className={`grid gap-4 mb-6 ${
            showConfluenceLinks && confluenceLinks.length > 0
              ? compact
                ? 'grid-cols-1 lg:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1'
          }`}
        >
          {/* Incident Audit Summary */}
          <div className="dashboard-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
              <div className="flex items-center gap-3 min-w-0">
                <h4 className="text-sm font-semibold text-dashboard-text-primary">
                  Incident Audit Summary
                </h4>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                  {incidentAuditSummary.total}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-dashboard-text-muted">
                {incidentAuditSummary.avgMTTR != null && (
                  <span>
                    Avg MTTR:{' '}
                    <span className={`font-medium ${getMTTRColorClass(incidentAuditSummary.avgMTTR)}`}>
                      {formatNumber(incidentAuditSummary.avgMTTR, { decimals: 0 })} min
                    </span>
                  </span>
                )}
                {incidentAuditSummary.avgMTTD != null && (
                  <span>
                    Avg MTTD:{' '}
                    <span className="font-medium text-dashboard-text-secondary">
                      {formatNumber(incidentAuditSummary.avgMTTD, { decimals: 0 })} min
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Severity Breakdown */}
            <div className="px-4 py-3 border-b border-dashboard-border">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-2">
                Severity Breakdown
              </h5>
              <div className="flex flex-wrap items-center gap-3">
                {Object.values(SEVERITY_LEVELS).map((level) => {
                  const count = incidentAuditSummary.bySeverity[level] || 0;
                  return (
                    <div
                      key={level}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-dashboard-border"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: SEVERITY_COLORS[level] }}
                      />
                      <span className="text-xs font-medium text-dashboard-text-primary">
                        {level}
                      </span>
                      <span className="text-xs font-bold text-dashboard-text-primary">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RCA Distribution */}
            <div className="px-4 py-3 border-b border-dashboard-border">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-2">
                Root Cause Distribution
              </h5>
              <div className="flex flex-wrap items-center gap-3">
                {Object.entries(incidentAuditSummary.byRootCause).map(([category, count]) => (
                  <div
                    key={category}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-dashboard-border"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: RCA_CATEGORY_COLORS[category] || '#6b7280' }}
                    />
                    <span className="text-xs font-medium text-dashboard-text-primary">
                      {(RCA_CATEGORY_LABELS[category] || category).split(' ')[0]}
                    </span>
                    <span className="text-xs font-bold text-dashboard-text-primary">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Incidents with Evidence Links */}
            {showEvidenceLinks && (
              <div className="divide-y divide-dashboard-border">
                {incidentAuditSummary.recentIncidents.map((incident) => {
                  const isIncExpanded = expandedIncidents[incident.incident_id] || false;
                  const hasEvidence =
                    incident.evidence_links &&
                    Array.isArray(incident.evidence_links) &&
                    incident.evidence_links.length > 0;

                  return (
                    <div key={incident.incident_id}>
                      <div
                        className="px-4 py-3 hover:bg-gray-50/50 transition-colors duration-150 cursor-pointer"
                        onClick={() => toggleIncident(incident.incident_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleIncident(incident.incident_id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isIncExpanded}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <StatusBadge status={incident.severity || 'P4'} size="sm" />
                              <StatusBadge status={incident.status || 'unknown'} size="sm" />
                              {incident.root_cause && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4"
                                  style={{
                                    backgroundColor: `${RCA_CATEGORY_COLORS[incident.root_cause] || '#6b7280'}15`,
                                    color: RCA_CATEGORY_COLORS[incident.root_cause] || '#6b7280',
                                  }}
                                >
                                  {(RCA_CATEGORY_LABELS[incident.root_cause] || incident.root_cause).split(' ')[0]}
                                </span>
                              )}
                              {hasEvidence && (
                                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-brand-50 text-brand-700">
                                  {incident.evidence_links.length} link{incident.evidence_links.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-dashboard-text-primary truncate">
                              {incident.title || incident.incident_id}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {incident.mttr != null && (
                              <span className={`text-xs font-medium ${getMTTRColorClass(incident.mttr)}`}>
                                {formatNumber(incident.mttr, { decimals: 0 })}m
                              </span>
                            )}
                            <svg
                              className={`w-4 h-4 text-dashboard-text-muted transition-transform duration-200 ${
                                isIncExpanded ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                              />
                            </svg>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-dashboard-text-muted">
                          {incident.start_time && (
                            <span>{getRelativeTime(incident.start_time)}</span>
                          )}
                          {incident.domain_id && (
                            <span>
                              Domain:{' '}
                              <span className="font-medium text-dashboard-text-secondary">
                                {incident.domain_id}
                              </span>
                            </span>
                          )}
                          {incident.service_id && (
                            <span>
                              Service:{' '}
                              <span className="font-medium text-dashboard-text-secondary">
                                {incident.service_id}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded Evidence Links */}
                      {isIncExpanded && (
                        <div className="px-4 pb-3 bg-gray-50/30 animate-fade-in">
                          {incident.description && (
                            <p className="text-xs text-dashboard-text-secondary mb-2">
                              {incident.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-dashboard-text-muted">
                            {incident.start_time && (
                              <span>
                                Start:{' '}
                                <span className="font-medium text-dashboard-text-secondary">
                                  {formatTimestamp(incident.start_time)}
                                </span>
                              </span>
                            )}
                            {incident.end_time && (
                              <span>
                                End:{' '}
                                <span className="font-medium text-dashboard-text-secondary">
                                  {formatTimestamp(incident.end_time)}
                                </span>
                              </span>
                            )}
                            {incident.mttr != null && (
                              <span>
                                MTTR:{' '}
                                <span className={`font-medium ${getMTTRColorClass(incident.mttr)}`}>
                                  {formatNumber(incident.mttr, { decimals: 0 })} min
                                </span>
                              </span>
                            )}
                            {incident.mttd != null && (
                              <span>
                                MTTD:{' '}
                                <span className="font-medium text-dashboard-text-secondary">
                                  {formatNumber(incident.mttd, { decimals: 0 })} min
                                </span>
                              </span>
                            )}
                            {incident.mtbf != null && (
                              <span>
                                MTBF:{' '}
                                <span className="font-medium text-dashboard-text-secondary">
                                  {formatNumber(incident.mtbf, { decimals: 0 })} hr
                                </span>
                              </span>
                            )}
                          </div>
                          {hasEvidence && (
                            <div>
                              <h6 className="text-[10px] font-semibold uppercase tracking-wider text-dashboard-text-muted mb-1.5">
                                Evidence Links
                              </h6>
                              <div className="flex flex-col gap-1">
                                {incident.evidence_links.map((link, idx) => (
                                  <a
                                    key={idx}
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-150 truncate"
                                    title={link}
                                  >
                                    <svg
                                      className="w-3 h-3 flex-shrink-0"
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
                                    <span className="truncate">{link}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {!hasEvidence && (
                            <p className="text-[10px] text-dashboard-text-muted italic">
                              No evidence links available for this incident.
                            </p>
                          )}
                          <div className="mt-2">
                            <span className="text-[10px] text-dashboard-text-muted font-mono">
                              {incident.incident_id}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Incident Audit Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
              <span className="text-xs text-dashboard-text-muted">
                {incidentAuditSummary.total} total incidents
              </span>
              <span className="text-xs text-dashboard-text-muted">
                {overallSummary.p1Incidents > 0 && (
                  <span className="text-severity-critical font-medium mr-2">
                    {overallSummary.p1Incidents} P1
                  </span>
                )}
                {overallSummary.p2Incidents > 0 && (
                  <span className="text-severity-high font-medium">
                    {overallSummary.p2Incidents} P2
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Confluence / SOP Links */}
          {showConfluenceLinks && confluenceLinks.length > 0 && (
            <div className="dashboard-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-dashboard-border">
                <div className="flex items-center gap-3 min-w-0">
                  <h4 className="text-sm font-semibold text-dashboard-text-primary">
                    SOP & Runbook Links
                  </h4>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-dashboard-text-muted text-[10px] font-semibold">
                    {confluenceLinks.length}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-dashboard-border">
                {confluenceLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors duration-150 group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 flex-shrink-0">
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
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-dashboard-text-primary truncate group-hover:text-brand-600 transition-colors duration-150">
                          {link.title}
                        </p>
                        {link.category && (
                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-gray-100 text-dashboard-text-muted mt-0.5">
                            {link.category}
                          </span>
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
                  </a>
                ))}
              </div>

              <div className="flex items-center justify-between px-4 py-2 border-t border-dashboard-border bg-gray-50/30">
                <span className="text-xs text-dashboard-text-muted">
                  {confluenceLinks.length} resource{confluenceLinks.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-dashboard-text-muted">
                  Opens in new tab
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No incidents state */}
      {showIncidentAudit && incidentAuditSummary.total === 0 && (
        <div className="dashboard-card overflow-hidden mb-6">
          <div className="flex items-center gap-3 p-4 border-b border-dashboard-border">
            <h4 className="text-sm font-semibold text-dashboard-text-primary">
              Incident Audit Summary
            </h4>
            <StatusBadge status="healthy" size="sm" label="No Incidents" />
          </div>
          <div className="flex flex-col items-center gap-1.5 py-8">
            <svg
              className="w-8 h-8 text-status-healthy"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-dashboard-text-muted">
              No incidents recorded. All systems operating within compliance targets.
            </p>
          </div>
        </div>
      )}

      {/* Report Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-dashboard-text-muted">
        <div className="flex items-center gap-3">
          <span>
            {overallSummary.totalDomains} domains · {overallSummary.totalServices} services
          </span>
          <span>·</span>
          <span>
            {activeView === 'sla' ? 'SLA' : 'SLO'} Compliance: Last {monthsWindow} months
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Report generated: {formatTimestamp(new Date().toISOString())}
          </span>
        </div>
      </div>
    </div>
  );
};

export { ComplianceReport };
export default ComplianceReport;