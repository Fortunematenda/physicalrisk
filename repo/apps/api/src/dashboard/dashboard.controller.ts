import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Between, In, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Public } from '../common/public.decorator';
import { DatabaseService } from '../database/database.service';
import { ImportStatus, ProjectStatus, DocumentStatus, ApprovalStatus } from '../database/entities';

/** Parse and validate a date-range query pair. Returns { from, to, label, previousFrom, previousTo } */
function parseDateRange(fromParam?: string, toParam?: string) {
  const now = new Date();
  let from: Date;
  let to: Date;
  let label = 'Last 30 days';

  if (fromParam && toParam) {
    from = new Date(fromParam);
    to = new Date(toParam);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO 8601 dates (YYYY-MM-DD).');
    }
    if (from > to) {
      throw new BadRequestException('The "from" date cannot be after the "to" date.');
    }
    label = 'Custom range';
  } else {
    to = now;
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Normalise to start/end of day
  from = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
  to = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);

  // Calculate previous period of same length for comparison
  const periodMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - periodMs);

  return { from, to, label, previousFrom, previousTo };
}

function calculateTrend(current: number, previous: number): { percentageChange: number; trend: 'up' | 'down' | 'neutral' } {
  if (previous === 0 && current === 0) return { percentageChange: 0, trend: 'neutral' };
  if (previous === 0) return { percentageChange: 100, trend: 'up' };
  const change = ((current - previous) / previous) * 100;
  return {
    percentageChange: Math.abs(Math.round(change * 10) / 10),
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
  };
}

@ApiTags('dashboard')
@Controller()
export class DashboardController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get('health')
  health() { return { status: 'ok', service: 'repository-import-gateway', timestamp: new Date().toISOString() }; }

  @Get('dashboard')
  async dashboard(
    @Req() req: any,
    @Query('from') fromParam?: string,
    @Query('to') toParam?: string,
  ) {
    const { from, to, label, previousFrom, previousTo } = parseDateRange(fromParam, toParam);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. RESOLVE AUTHENTICATED USER FROM DATABASE
    // ──────────────────────────────────────────────────────────────────────────
    let user: { id: string; displayName: string; firstName: string; email: string } = {
      id: '', displayName: 'User', firstName: 'User', email: '',
    };

    const tokenEmail = typeof req.user?.email === 'string' ? req.user.email.trim() : '';
    const tokenName = typeof req.user?.name === 'string' ? req.user.name.trim() : '';

    let dbUser = null as Awaited<ReturnType<typeof this.db.users.findOne>>;
    if (tokenEmail) {
      dbUser = await this.db.users.findOne({ where: { email: tokenEmail } });
    }
    if (!dbUser && req.user?.id) {
      dbUser = await this.db.users.findOne({ where: { id: req.user.id } });
    }

    if (dbUser) {
      const firstName = dbUser.name?.split(' ')[0] || dbUser.email.split('@')[0];
      user = { id: dbUser.id, displayName: dbUser.name, firstName, email: dbUser.email };
    } else if (tokenName || tokenEmail) {
      const displayName = tokenName || tokenEmail;
      const firstName = tokenName.split(' ')[0] || tokenEmail.split('@')[0] || 'User';
      user = {
        id: req.user?.id ?? '',
        displayName,
        firstName,
        email: tokenEmail,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. CORE METRICS
    // ──────────────────────────────────────────────────────────────────────────
    const [totalDocuments, currentVersions] = await Promise.all([
      this.db.documents.count(),
      this.db.documentVersions.count({ where: { isCurrent: true } }),
    ]);

    // Imports in selected period
    const importedInPeriod = await this.db.importJobs.count({
      where: { status: ImportStatus.IMPORTED, completedAt: Between(from, to) },
    });

    // Imports in previous period (for comparison)
    const importedInPrevious = await this.db.importJobs.count({
      where: { status: ImportStatus.IMPORTED, completedAt: Between(previousFrom, previousTo) },
    });

    // Failed imports in period
    const failedInPeriod = await this.db.importJobs.count({
      where: { status: ImportStatus.FAILED, updatedAt: Between(from, to) },
    });
    const failedInPrevious = await this.db.importJobs.count({
      where: { status: ImportStatus.FAILED, updatedAt: Between(previousFrom, previousTo) },
    });

    // Requires attention: drafts and in-progress imports (failed jobs belong in Import Logs only)
    const requiresAttention = await this.db.importJobs.count({
      where: [
        { status: ImportStatus.DRAFT },
        { status: ImportStatus.RECEIVED },
        { status: ImportStatus.VALIDATING },
        { status: ImportStatus.READY },
        { status: ImportStatus.ROUTING },
      ],
    });
    const requiresAttentionPrevious = requiresAttention; // snapshot metric, no comparison

    // ──────────────────────────────────────────────────────────────────────────
    // 3. DOCUMENTS OVER TIME (based on selected date range)
    // ──────────────────────────────────────────────────────────────────────────
    const rangeDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    let grouping: 'hour' | 'day' | 'month' = 'day';
    if (rangeDays <= 1) grouping = 'hour';
    else if (rangeDays > 90) grouping = 'month';

    const documentsOverTime = await this.getDocumentsOverTime(from, to, grouping);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. STATUS DISTRIBUTION (current state, not time-filtered)
    // ──────────────────────────────────────────────────────────────────────────
    const statusCounts = await this.db.documents
      .createQueryBuilder('document')
      .select('document.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('document.status')
      .getRawMany();

    const statusDistribution = statusCounts.map(item => ({
      status: item.status,
      label: item.status.toLowerCase().split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      count: parseInt(item.count),
      percentage: totalDocuments > 0 ? (parseInt(item.count) / totalDocuments) * 100 : 0,
    }));

    // ──────────────────────────────────────────────────────────────────────────
    // 5. RECENT DOCUMENTS
    // ──────────────────────────────────────────────────────────────────────────
    const recentDocuments = await this.db.documents.find({
      take: 8,
      order: { updatedAt: 'DESC' },
      relations: { project: true, section: true, versions: true },
    });

    const recentDocumentsFormatted = recentDocuments.map(doc => {
      const currentVersion = doc.versions?.find(v => v.isCurrent) || doc.versions?.[0];
      return {
        id: doc.id,
        title: doc.title,
        documentCode: doc.code,
        projectName: doc.project?.name || 'Unknown',
        repositorySection: doc.section?.name,
        version: currentVersion?.versionNo || '1.0',
        status: doc.status,
        fileType: currentVersion?.originalFileName?.split('.').pop() || null,
        importedAt: doc.createdAt,
      };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. DOCUMENTS REQUIRING ATTENTION (replaces "Pending Approvals")
    // ──────────────────────────────────────────────────────────────────────────
    const attentionJobs = await this.db.importJobs.find({
      where: [
        { status: ImportStatus.DRAFT },
        { status: ImportStatus.RECEIVED },
        { status: ImportStatus.VALIDATING },
        { status: ImportStatus.READY },
        { status: ImportStatus.ROUTING },
      ],
      take: 8,
      order: { createdAt: 'DESC' },
      relations: { project: true, sourceSystem: true, resolvedSection: true, document: true, initiatedBy: true },
    });

    const documentsRequiringAttention = attentionJobs.map(job => {
      let stage = 'Awaiting Metadata';
      let reason = 'Requires attention';
      if (job.status === ImportStatus.DRAFT) { stage = 'Draft'; reason = 'Saved as draft — continue import'; }
      else if (job.status === ImportStatus.ROUTING) { stage = 'Routing Required'; reason = 'Awaiting routing decision'; }
      else if (job.status === ImportStatus.VALIDATING) { stage = 'Validation Failed'; reason = 'Validation in progress'; }
      else if (job.status === ImportStatus.READY) { stage = 'Approval Verification Required'; reason = 'Ready for final import'; }
      else if (job.status === ImportStatus.RECEIVED) { stage = 'Awaiting Metadata'; reason = 'Received, metadata incomplete'; }

      return {
        id: job.id,
        documentId: job.document?.id || null,
        title: job.document?.title || job.fileName,
        projectName: job.project?.name || 'Unknown',
        submittedBy: job.initiatedBy?.name || 'System',
        stage,
        reason,
        receivedAt: job.createdAt,
      };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 7. DOCUMENT TYPES (current state)
    // ──────────────────────────────────────────────────────────────────────────
    const typeCounts = await this.db.documents
      .createQueryBuilder('document')
      .select('document.documentType', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('document.documentType')
      .getRawMany();

    const documentTypes = typeCounts
      .filter(item => item.type)
      .map(item => ({
        type: item.type,
        count: parseInt(item.count),
        percentage: totalDocuments > 0 ? (parseInt(item.count) / totalDocuments) * 100 : 0,
      }))
      .slice(0, 6);

    // ──────────────────────────────────────────────────────────────────────────
    // 8. PROJECT DISTRIBUTION (current state)
    // ──────────────────────────────────────────────────────────────────────────
    const projectCounts = await this.db.documents
      .createQueryBuilder('document')
      .select('project.id', 'projectId')
      .addSelect('project.code', 'projectCode')
      .addSelect('project.name', 'projectName')
      .addSelect('COUNT(*)', 'documentCount')
      .leftJoin('document.project', 'project')
      .groupBy('project.id, project.code, project.name')
      .orderBy('"documentCount"', 'DESC')
      .getRawMany();

    const maxProjectCount = projectCounts.length > 0 ? Math.max(...projectCounts.map(p => parseInt(p.documentCount))) : 1;

    const projectDistribution = projectCounts.map(item => ({
      projectId: item.projectId,
      projectCode: item.projectCode,
      projectName: item.projectName,
      documentCount: parseInt(item.documentCount),
      percentage: maxProjectCount > 0 ? (parseInt(item.documentCount) / maxProjectCount) * 100 : 0,
    }));

    // ──────────────────────────────────────────────────────────────────────────
    // 9. COMPLIANCE OVERVIEW
    // ──────────────────────────────────────────────────────────────────────────
    const approvedVersions = await this.db.documentVersions.count({ where: { approvalStatus: ApprovalStatus.APPROVED } });
    const pendingVersions = await this.db.documentVersions.count({ where: { approvalStatus: ApprovalStatus.PENDING_REVIEW } });
    const rejectedVersions = await this.db.documentVersions.count({ where: { approvalStatus: ApprovalStatus.REJECTED } });

    const assessedCount = approvedVersions + pendingVersions + rejectedVersions;

    const compliance = assessedCount > 0
      ? {
          status: 'ASSESSED' as const,
          percentage: Math.round((approvedVersions / assessedCount) * 100 * 10) / 10,
          assessed: assessedCount,
          compliant: approvedVersions,
          atRisk: pendingVersions,
          nonCompliant: rejectedVersions,
        }
      : {
          status: 'NOT_ASSESSED' as const,
          percentage: null,
          assessed: 0,
          compliant: 0,
          atRisk: 0,
          nonCompliant: 0,
        };

    // ──────────────────────────────────────────────────────────────────────────
    // 10. STORAGE OVERVIEW
    // ──────────────────────────────────────────────────────────────────────────
    const storageResult = await this.db.documentVersions
      .createQueryBuilder('version')
      .select('COALESCE(SUM(version.fileSize), 0)', 'usedBytes')
      .getRawOne();

    const usedBytes = parseInt(storageResult?.usedBytes || '0');
    const totalBytes = 107374182400; // 100 GB configured storage

    const storage = {
      usedBytes,
      totalBytes,
      percentageUsed: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100 * 10) / 10 : 0,
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 11. RECENT ACTIVITY (from audit logs, falling back to import jobs)
    // ──────────────────────────────────────────────────────────────────────────
    const recentLogs = await this.db.auditLogs.find({
      take: 10,
      order: { createdAt: 'DESC' },
      where: { createdAt: Between(from, to) },
      relations: { user: true },
    });

    let recentActivity: any[];

    if (recentLogs.length > 0) {
      recentActivity = recentLogs.map(log => ({
        id: log.id,
        type: this.mapAuditAction(log.action),
        title: log.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase()),
        description: log.message,
        performedBy: log.user?.name || null,
        occurredAt: log.createdAt,
      }));
    } else {
      // Fallback: use import jobs
      const recentImports = await this.db.importJobs.find({
        take: 10,
        order: { createdAt: 'DESC' },
        relations: { project: true, sourceSystem: true, resolvedSection: true, document: true, initiatedBy: true },
      });

      recentActivity = recentImports.map(job => ({
        id: job.id,
        type: job.status === ImportStatus.IMPORTED ? 'DOCUMENT_IMPORTED' : job.status === ImportStatus.FAILED ? 'COMPLIANCE_ISSUE' : 'DOCUMENT_IMPORTED',
        title: job.status === ImportStatus.IMPORTED
          ? `Document imported: ${job.document?.title || job.fileName}`
          : `Import ${job.status.toLowerCase()}: ${job.document?.title || job.fileName}`,
        description: job.status === ImportStatus.FAILED
          ? (job.errorMessage || 'Import failed')
          : `Imported from ${job.sourceSystem?.name || 'Unknown'} to ${job.resolvedSection?.name || 'repository'}`,
        performedBy: job.initiatedBy?.name || null,
        occurredAt: job.createdAt,
      }));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 12. BUILD RESPONSE
    // ──────────────────────────────────────────────────────────────────────────
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        firstName: user.firstName,
        email: user.email,
      },
      generatedAt: new Date().toISOString(),
      dateRange: {
        from: from.toISOString(),
        to: to.toISOString(),
        label,
      },
      metrics: {
        totalDocuments: { value: totalDocuments },
        currentVersions: { value: currentVersions },
        importedInPeriod: {
          value: importedInPeriod,
          ...calculateTrend(importedInPeriod, importedInPrevious),
        },
        requiresAttention: {
          value: requiresAttention,
          percentageChange: 0,
          trend: 'neutral' as const,
        },
        failedImports: {
          value: failedInPeriod,
          ...calculateTrend(failedInPeriod, failedInPrevious),
        },
      },
      documentsOverTime,
      statusDistribution,
      recentDocuments: recentDocumentsFormatted,
      documentsRequiringAttention,
      documentTypes,
      projectDistribution,
      compliance,
      storage,
      recentActivity,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  private async getDocumentsOverTime(from: Date, to: Date, grouping: 'hour' | 'day' | 'month') {
    const results: { period: string; imported: number; versions: number }[] = [];

    if (grouping === 'month') {
      const current = new Date(from.getFullYear(), from.getMonth(), 1);
      const end = new Date(to.getFullYear(), to.getMonth() + 1, 0);
      while (current <= end) {
        const monthStart = new Date(current);
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);

        const [imported, versions] = await Promise.all([
          this.db.importJobs.count({ where: { status: ImportStatus.IMPORTED, completedAt: Between(monthStart, monthEnd) } }),
          this.db.documentVersions.count({ where: { createdAt: Between(monthStart, monthEnd) } }),
        ]);

        results.push({
          period: monthStart.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }),
          imported,
          versions,
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else if (grouping === 'day') {
      const current = new Date(from);
      while (current <= to) {
        const dayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 0, 0, 0, 0);
        const dayEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999);

        const [imported, versions] = await Promise.all([
          this.db.importJobs.count({ where: { status: ImportStatus.IMPORTED, completedAt: Between(dayStart, dayEnd) } }),
          this.db.documentVersions.count({ where: { createdAt: Between(dayStart, dayEnd) } }),
        ]);

        results.push({
          period: dayStart.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }),
          imported,
          versions,
        });
        current.setDate(current.getDate() + 1);
      }
    } else {
      // Hourly
      const current = new Date(from);
      while (current <= to) {
        const hourStart = new Date(current);
        const hourEnd = new Date(current.getTime() + 60 * 60 * 1000 - 1);

        const [imported, versions] = await Promise.all([
          this.db.importJobs.count({ where: { status: ImportStatus.IMPORTED, completedAt: Between(hourStart, hourEnd) } }),
          this.db.documentVersions.count({ where: { createdAt: Between(hourStart, hourEnd) } }),
        ]);

        results.push({
          period: `${hourStart.getHours().toString().padStart(2, '0')}:00`,
          imported,
          versions,
        });
        current.setHours(current.getHours() + 1);
      }
    }

    return results;
  }

  private mapAuditAction(action: string): string {
    if (action.includes('IMPORT') || action.includes('import')) return 'DOCUMENT_IMPORTED';
    if (action.includes('VERSION') || action.includes('version')) return 'VERSION_SUPERSEDED';
    if (action.includes('RELATIONSHIP') || action.includes('relationship')) return 'RELATIONSHIP_CREATED';
    if (action.includes('LOGIN') || action.includes('login')) return 'USER_LOGIN';
    if (action.includes('REJECT') || action.includes('FAIL') || action.includes('COMPLIANCE')) return 'COMPLIANCE_ISSUE';
    return 'DOCUMENT_IMPORTED';
  }
}
