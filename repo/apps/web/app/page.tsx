export { default } from "./dashboard/page";
/*
  FileCheck2,
  FileText,
  FolderOpen,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import styles from "./Dashboard.module.css";

const DASHBOARD_ENDPOINT = "/api/dashboard";

type TrendDirection = "up" | "down" | "neutral";

type DocumentStatus =
  | "APPROVED"
  | "DRAFT"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "SUPERSEDED"
  | "ARCHIVED";

type ActivityType =
  | "DOCUMENT_IMPORTED"
  | "DOCUMENT_APPROVED"
  | "RELATIONSHIP_CREATED"
  | "COMPLIANCE_ISSUE"
  | "USER_LOGIN"
  | "VERSION_SUPERSEDED";

interface KpiMetric {
  value: number;
  percentageChange: number;
  trend: TrendDirection;
}

interface DocumentsOverTimeItem {
  period: string;
  imported: number;
  approved: number;
}

interface StatusDistributionItem {
  status: DocumentStatus;
  label: string;
  count: number;
  percentage: number;
}

interface RecentDocumentItem {
  id: string;
  title: string;
  documentCode?: string | null;
  projectName: string;
  repositorySection?: string | null;
  version: string;
  status: DocumentStatus;
  fileType?: string | null;
  importedAt: string;
}

interface PendingApprovalItem {
  id: string;
  documentId: string;
  title: string;
  projectName: string;
  submittedBy: string;
  submittedAt: string;
}

interface DocumentTypeItem {
  type: string;
  count: number;
  percentage: number;
}

interface ProjectDistributionItem {
  projectId: string;
  projectCode: string;
  projectName: string;
  documentCount: number;
  percentage: number;
}

interface ComplianceOverview {
  percentage: number;
  compliant: number;
  atRisk: number;
  nonCompliant: number;
}

interface StorageOverview {
  usedBytes: number;
  totalBytes: number;
  percentageUsed: number;
}

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  performedBy?: string | null;
  occurredAt: string;
}

interface DashboardResponse {
  user: {
    displayName: string;
  };
  generatedAt: string;
  dateRange: {
    from: string;
    to: string;
  };
  metrics: {
    totalDocuments: KpiMetric;
    approvedDocuments: KpiMetric;
    pendingApprovals: KpiMetric;
    importedThisMonth: KpiMetric;
    complianceIssues: KpiMetric;
  };
  documentsOverTime: DocumentsOverTimeItem[];
  statusDistribution: StatusDistributionItem[];
  recentDocuments: RecentDocumentItem[];
  pendingApprovals: PendingApprovalItem[];
  documentTypes: DocumentTypeItem[];
  projectDistribution: ProjectDistributionItem[];
  compliance: ComplianceOverview;
  storage: StorageOverview;
  recentActivity: ActivityItem[];
}

interface ApiErrorResponse {
  message?: string;
}

const STATUS_COLOURS: Record<DocumentStatus, string> = {
  APPROVED: "#22a06b",
  DRAFT: "#377cf6",
  PENDING_REVIEW: "#e5a000",
  REJECTED: "#dc4545",
  SUPERSEDED: "#8b5cf6",
  ARCHIVED: "#64748b",
};

const TYPE_COLOURS = [
  "#dc4545",
  "#377cf6",
  "#22a06b",
  "#f59e0b",
  "#64748b",
  "#8b5cf6",
];

const PROJECT_COLOURS = [
  "#22a06b",
  "#377cf6",
  "#e5a000",
  "#8b5cf6",
  "#dc4545",
  "#0f9ea8",
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-ZA").format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** index;

  return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function normaliseStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}

function getFileTypeClass(fileType?: string | null): string {
  const normalised = fileType?.replace(".", "").toLowerCase();

  if (normalised === "pdf") {
    return styles.filePdf;
  }

  if (normalised === "doc" || normalised === "docx") {
    return styles.fileWord;
  }

  if (normalised === "xls" || normalised === "xlsx") {
    return styles.fileExcel;
  }

  if (normalised === "ppt" || normalised === "pptx") {
    return styles.filePowerPoint;
  }

  return styles.fileDefault;
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case "DOCUMENT_IMPORTED":
      return Upload;
    case "DOCUMENT_APPROVED":
      return CheckCircle2;
    case "RELATIONSHIP_CREATED":
      return Link2;
    case "COMPLIANCE_ISSUE":
      return ShieldCheck;
    case "USER_LOGIN":
      return UserRound;
    case "VERSION_SUPERSEDED":
      return RefreshCw;
    default:
      return FileText;
  }
}

function getActivityClass(type: ActivityType): string {
  switch (type) {
    case "DOCUMENT_IMPORTED":
      return styles.activityGreen;
    case "DOCUMENT_APPROVED":
      return styles.activityBlue;
    case "RELATIONSHIP_CREATED":
      return styles.activityPurple;
    case "COMPLIANCE_ISSUE":
      return styles.activityGold;
    case "USER_LOGIN":
      return styles.activityNavy;
    case "VERSION_SUPERSEDED":
      return styles.activityGrey;
    default:
      return styles.activityGrey;
  }
}

function KpiCard({
  title,
  metric,
  icon: Icon,
  variant,
}: {
  title: string;
  metric: KpiMetric;
  icon: typeof FileText;
  variant: "blue" | "green" | "purple" | "gold" | "red";
}) {
  const isPositive = metric.trend === "up";
  const isNegative = metric.trend === "down";
  const TrendIcon = isNegative ? ArrowDownRight : ArrowUpRight;

  return (
    <article className={styles.kpiCard}>
      <div className={`${styles.kpiIcon} ${styles[`kpiIcon${variant}`]}`}>
        <Icon size={22} strokeWidth={1.8} />
      </div>

      <div className={styles.kpiContent}>
        <span className={styles.kpiTitle}>{title}</span>
        <strong className={styles.kpiValue}>
          {formatNumber(metric.value)}
        </strong>

        <div
          className={`${styles.kpiTrend} ${
            isPositive
              ? styles.trendPositive
              : isNegative
                ? styles.trendNegative
                : styles.trendNeutral
          }`}
        >
          {metric.trend !== "neutral" && (
            <TrendIcon size={13} strokeWidth={2.2} />
          )}

          <span>
            {Math.abs(metric.percentageChange).toFixed(1)}% vs last 30 days
          </span>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={styles.statusBadge}
      style={{
        color: STATUS_COLOURS[status],
        backgroundColor: `${STATUS_COLOURS[status]}16`,
        borderColor: `${STATUS_COLOURS[status]}35`,
      }}
    >
      {normaliseStatusLabel(status)}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.dashboard}>
      <div className={styles.headerSkeleton}>
        <div className={`${styles.skeleton} ${styles.skeletonHeading}`} />
        <div className={`${styles.skeleton} ${styles.skeletonDate}`} />
      </div>

      <div className={styles.kpiGrid}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`kpi-skeleton-${index}`}
            className={`${styles.skeleton} ${styles.skeletonKpi}`}
          />
        ))}
      </div>

      <div className={styles.twoColumnGrid}>
        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
      </div>

      <div className={styles.twoColumnGrid}>
        <div className={`${styles.skeleton} ${styles.skeletonTable}`} />
        <div className={`${styles.skeleton} ${styles.skeletonTable}`} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      const token = await getSsoToken();

      const response = await fetch(DASHBOARD_ENDPOINT, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        let responseMessage = "The dashboard could not be loaded.";

        try {
          const body = (await response.json()) as ApiErrorResponse;

          if (body.message) {
            responseMessage = body.message;
          }
        } catch {
          // Keep the default error message.
        }

        throw new Error(responseMessage);
      }

      const data = (await response.json()) as DashboardResponse;
      setDashboard(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The dashboard could not be loaded.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const statusTotal = useMemo(() => {
    return (
      dashboard?.statusDistribution?.reduce(
        (total, item) => total + item.count,
        0,
      ) ?? 0
    );
  }, [dashboard]);

  const maximumProjectCount = useMemo(() => {
    if (!dashboard?.projectDistribution?.length) {
      return 1;
    }

    return Math.max(
      ...dashboard.projectDistribution.map((item) => item.documentCount),
      1,
    );
  }, [dashboard]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !dashboard) {
    return (
      <div className={styles.errorPage}>
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>
            <AlertTriangle size={28} />
          </div>

          <h1>Dashboard unavailable</h1>

          <p>
            {error ??
              "The dashboard response was empty. Check the API connection."}
          </p>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void loadDashboard()}
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className={styles.dashboard}>
      <section className={styles.pageHeader}>
        <div>
          <h1>
            Welcome back, {dashboard.user?.displayName || 'User'}
            <span aria-hidden="true"> 👋</span>
          </h1>

          <p>Here&apos;s what&apos;s happening in your repository today.</p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadDashboard(true)}
            disabled={isRefreshing}
          >
            <RefreshCw
              size={16}
              className={isRefreshing ? styles.spinning : undefined}
            />
            Refresh
          </button>

          <div className={styles.dateRange}>
            <CalendarDays size={17} />

            <span>
              {formatDate(dashboard.dateRange?.from)} –{" "}
              {formatDate(dashboard.dateRange?.to)}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="Repository statistics">
        <KpiCard
          title="Total Documents"
          metric={dashboard.metrics?.totalDocuments || { value: 0, percentageChange: 0, trend: 'neutral' }}
          icon={FileText}
          variant="blue"
        />

        <KpiCard
          title="Approved Documents"
          metric={dashboard.metrics?.approvedDocuments || { value: 0, percentageChange: 0, trend: 'neutral' }}
          icon={FileCheck2}
          variant="green"
        />

        <KpiCard
          title="Pending Approvals"
          metric={dashboard.metrics?.pendingApprovals || { value: 0, percentageChange: 0, trend: 'neutral' }}
          icon={Clock3}
          variant="purple"
        />

        <KpiCard
          title="Imported This Month"
          metric={dashboard.metrics?.importedThisMonth || { value: 0, percentageChange: 0, trend: 'neutral' }}
          icon={Upload}
          variant="gold"
        />

        <KpiCard
          title="Compliance Issues"
          metric={dashboard.metrics?.complianceIssues || { value: 0, percentageChange: 0, trend: 'neutral' }}
          icon={ShieldCheck}
          variant="red"
        />
      </section>

      <section className={styles.analyticsGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Documents Over Time</h2>
              <p>Imported and approved repository documents</p>
            </div>

            <span className={styles.panelFilter}>Last 6 months</span>
          </div>

          <div className={styles.chartContainer}>
            {dashboard.documentsOverTime?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dashboard.documentsOverTime}
                  margin={{
                    top: 10,
                    right: 12,
                    left: -16,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="importedGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#377cf6"
                        stopOpacity={0.22}
                      />
                      <stop
                        offset="100%"
                        stopColor="#377cf6"
                        stopOpacity={0}
                      />
                    </linearGradient>

                    <linearGradient
                      id="approvedGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#22a06b"
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="100%"
                        stopColor="#22a06b"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: "#718096",
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: "#718096",
                      fontSize: 11,
                    }}
                  />

                  <Tooltip
                    cursor={{
                      stroke: "#d8e0e8",
                      strokeDasharray: "4 4",
                    }}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #dce3eb",
                      borderRadius: "8px",
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                      fontSize: "12px",
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="imported"
                    name="Imported"
                    stroke="#377cf6"
                    strokeWidth={2.5}
                    fill="url(#importedGradient)"
                    activeDot={{ r: 4 }}
                  />

                  <Area
                    type="monotone"
                    dataKey="approved"
                    name="Approved"
                    stroke="#22a06b"
                    strokeWidth={2.5}
                    fill="url(#approvedGradient)"
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={FileText}
                title="No document activity yet"
                description="Imported and approved document activity will appear here."
              />
            )}
          </div>

          <div className={styles.chartLegend}>
            <span>
              <i className={styles.legendBlue} />
              Imported
            </span>

            <span>
              <i className={styles.legendGreen} />
              Approved
            </span>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Documents by Status</h2>
              <p>Current repository status distribution</p>
            </div>
          </div>

          <div className={styles.statusChartLayout}>
            <div className={styles.donutWrapper}>
              {dashboard.statusDistribution?.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.statusDistribution || []}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={1}
                        stroke="none"
                      >
                        {dashboard.statusDistribution?.map((item) => (
                          <Cell
                            key={item.status}
                            fill={STATUS_COLOURS[item.status]}
                          />
                        ))}
                      </Pie>

                      <Tooltip
                        formatter={(value) => [
                          formatNumber(Number(value)),
                          "Documents",
                        ]}
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #dce3eb",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className={styles.donutCentre}>
                    <strong>{formatNumber(statusTotal)}</strong>
                    <span>Total</span>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={FolderOpen}
                  title="No document statuses"
                  description="Status distribution will appear after documents are imported."
                />
              )}
            </div>

            <div className={styles.statusLegend}>
              {dashboard.statusDistribution?.map((item) => (
                <div key={item.status} className={styles.statusLegendItem}>
                  <span
                    className={styles.statusLegendColour}
                    style={{
                      backgroundColor: STATUS_COLOURS[item.status],
                    }}
                  />

                  <span className={styles.statusLegendLabel}>{item.label}</span>

                  <strong>
                    {item.percentage.toFixed(0)}%{" "}
                    <small>({formatNumber(item.count)})</small>
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className={styles.tablesGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Recent Documents</h2>
              <p>Recently imported and updated files</p>
            </div>

            <Link href="/repository/index" className={styles.viewButton}>
              View all
              <ChevronRight size={15} />
            </Link>
          </div>

          {dashboard.recentDocuments?.length > 0 ? (
            <div className={styles.tableWrapper}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Project</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Imported</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.recentDocuments?.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <Link
                          href={`/documents/${document.id}`}
                          className={styles.documentCell}
                        >
                          <span
                            className={`${styles.fileIcon} ${getFileTypeClass(
                              document.fileType,
                            )}`}
                          >
                            {document.fileType
                              ?.replace(".", "")
                              .slice(0, 3)
                              .toUpperCase() || "FILE"}
                          </span>

                          <span>
                            <strong>{document.title}</strong>
                            <small>
                              {document.repositorySection ??
                                document.documentCode ??
                                "Repository document"}
                            </small>
                          </span>
                        </Link>
                      </td>

                      <td>{document.projectName}</td>
                      <td>{document.version}</td>

                      <td>
                        <StatusBadge status={document.status} />
                      </td>

                      <td>
                        <span className={styles.dateCell}>
                          {formatDateTime(document.importedAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No recent documents"
              description="Imported repository documents will appear here."
            />
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Pending Approvals</h2>
              <p>Documents requiring review or approval</p>
            </div>

            <Link href="/imports/queue" className={styles.viewButton}>
              View all
              <ChevronRight size={15} />
            </Link>
          </div>

          {dashboard.pendingApprovals?.length > 0 ? (
            <div className={styles.tableWrapper}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Project</th>
                    <th>Submitted by</th>
                    <th>Submitted</th>
                  </tr>
                </thead>

                <tbody>
                  {dashboard.pendingApprovals?.map((approval) => (
                    <tr key={approval.id}>
                      <td>
                        <Link
                          href={`/documents/${approval.documentId}`}
                          className={styles.documentCell}
                        >
                          <span
                            className={`${styles.fileIcon} ${styles.fileWord}`}
                          >
                            DOC
                          </span>

                          <span>
                            <strong>{approval.title}</strong>
                            <small>Awaiting approval</small>
                          </span>
                        </Link>
                      </td>

                      <td>{approval.projectName}</td>
                      <td>{approval.submittedBy}</td>

                      <td>
                        <span className={styles.dateCell}>
                          {formatDateTime(approval.submittedAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No pending approvals"
              description="There are currently no documents awaiting approval."
            />
          )}
        </article>
      </section>

      <section className={styles.summaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Top Document Types</h2>
              <p>Repository files grouped by type</p>
            </div>
          </div>

          <div className={styles.typeChartLayout}>
            <div className={styles.smallDonut}>
              {dashboard.documentTypes?.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.documentTypes || []}
                        dataKey="count"
                        nameKey="type"
                        innerRadius="61%"
                        outerRadius="89%"
                        paddingAngle={1}
                        stroke="none"
                      >
                        {dashboard.documentTypes?.map((item, index) => (
                          <Cell
                            key={`${item.type}-${index}`}
                            fill={TYPE_COLOURS[index % TYPE_COLOURS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className={styles.donutCentre}>
                    <strong>
                      {formatNumber(
                        dashboard.documentTypes?.reduce(
                          (total, item) => total + item.count,
                          0,
                        ),
                      )}
                    </strong>
                    <span>Total</span>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No file types"
                  description="File type totals will appear here."
                />
              )}
            </div>

            <div className={styles.typeLegend}>
              {dashboard.documentTypes?.map((item, index) => (
                <div
                  key={`${item.type}-${index}`}
                  className={styles.typeLegendItem}
                >
                  <span
                    style={{
                      backgroundColor:
                        TYPE_COLOURS[index % TYPE_COLOURS.length],
                    }}
                  />

                  <strong>{item.type}</strong>

                  <small>
                    {item.percentage.toFixed(0)}% ({formatNumber(item.count)})
                  </small>
                </div>
              ))}
            </div>
          </div>

          <Link href="/repository/index" className={styles.reportLink}>
            View full report
            <ChevronRight size={15} />
          </Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Documents by Project</h2>
              <p>Repository volume by registered project</p>
            </div>
          </div>

          <div className={styles.projectList}>
            {dashboard.projectDistribution?.length > 0 ? (
              dashboard.projectDistribution?.map((project, index) => (
                <Link
                  key={project.projectId}
                  href={`/configuration/projects/${project.projectId}`}
                  className={styles.projectRow}
                >
                  <span className={styles.projectCode}>
                    {project.projectCode}
                  </span>

                  <span className={styles.progressTrack}>
                    <span
                      className={styles.progressFill}
                      style={{
                        width: `${
                          (project.documentCount / maximumProjectCount) * 100
                        }%`,
                        backgroundColor:
                          PROJECT_COLOURS[index % PROJECT_COLOURS.length],
                      }}
                    />
                  </span>

                  <strong>{formatNumber(project.documentCount)}</strong>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="No project documents"
                description="Project totals will appear after documents are imported."
              />
            )}
          </div>

          <Link href="/configuration/projects" className={styles.reportLink}>
            View full report
            <ChevronRight size={15} />
          </Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Compliance Overview</h2>
              <p>Repository metadata and governance compliance</p>
            </div>
          </div>

          <div className={styles.complianceHero}>
            <div className={styles.shieldIcon}>
              <ShieldCheck size={38} />
            </div>

            <div>
              <strong>{dashboard.compliance?.percentage?.toFixed(0) || 0}%</strong>
              <span>Overall compliance</span>
            </div>
          </div>

          <div className={styles.complianceStats}>
            <div>
              <span className={styles.compliantLabel}>Compliant</span>
              <strong>{formatNumber(dashboard.compliance?.compliant || 0)}</strong>
            </div>

            <div>
              <span className={styles.atRiskLabel}>At Risk</span>
              <strong>{formatNumber(dashboard.compliance?.atRisk || 0)}</strong>
            </div>

            <div>
              <span className={styles.nonCompliantLabel}>Non-Compliant</span>
              <strong>
                {formatNumber(dashboard.compliance?.nonCompliant || 0)}
              </strong>
            </div>
          </div>

          <Link href="/repository/index" className={styles.reportLink}>
            View full report
            <ChevronRight size={15} />
          </Link>
        </article>
      </section>

      <section className={styles.bottomGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Repository Storage</h2>
              <p>VPS repository storage usage</p>
            </div>

            <Link href="/settings" className={styles.viewButton}>
              View details
              <ChevronRight size={15} />
            </Link>
          </div>

          <div className={styles.storageContent}>
            <div
              className={styles.storageRing}
              style={{
                background: `conic-gradient(
                  #377cf6 0% ${Math.min(
                    dashboard.storage?.percentageUsed || 0,
                    100,
                  )}%,
                  #e9eef4 ${Math.min(
                    dashboard.storage?.percentageUsed || 0,
                    100,
                  )}% 100%
                )`,
              }}
            >
              <div>
                <strong>
                  {dashboard.storage?.percentageUsed?.toFixed(0) || 0}%
                </strong>
                <span>Used</span>
              </div>
            </div>

            <div className={styles.storageDetails}>
              <strong>
                {formatFileSize(dashboard.storage?.usedBytes || 0)} /{" "}
                {formatFileSize(dashboard.storage?.totalBytes || 0)}
              </strong>

              <span>Repository storage used</span>

              <div className={styles.storageBar}>
                <span
                  style={{
                    width: `${Math.min(
                      dashboard.storage?.percentageUsed || 0,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.activityPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Recent Activity</h2>
              <p>Latest repository and system events</p>
            </div>

            <Link href="/imports/logs" className={styles.viewButton}>
              View all activity
              <ChevronRight size={15} />
            </Link>
          </div>

          {dashboard.recentActivity?.length > 0 ? (
            <div className={styles.activityList}>
              {dashboard.recentActivity?.map((activity) => {
                const ActivityIcon = getActivityIcon(activity.type);

                return (
                  <article key={activity.id} className={styles.activityItem}>
                    <div
                      className={`${styles.activityIcon} ${getActivityClass(
                        activity.type,
                      )}`}
                    >
                      <ActivityIcon size={17} />
                    </div>

                    <div className={styles.activityBody}>
                      <strong>{activity.title}</strong>
                      <p>{activity.description}</p>

                      {activity.performedBy && (
                        <span>By {activity.performedBy}</span>
                      )}

                      <time dateTime={activity.occurredAt}>
                        {formatDateTime(activity.occurredAt)}
                      </time>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Clock3}
              title="No recent activity"
              description="Repository actions and audit events will appear here."
            />
          )}
        </article>
      </section>
    </main>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <Icon size={21} />
      </div>

      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
*/
