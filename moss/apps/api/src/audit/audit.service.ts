import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrator',
  METHODOLOGY_ADMIN: 'Methodology Administrator',
  ANALYST: 'Analyst',
  REVIEWER: 'Senior Reviewer',
  SALES: 'Sales User',
  AUDITOR: 'Auditor',
  CLIENT_EXECUTIVE: 'Client Executive',
  CLIENT_CONTRIBUTOR: 'Client Contributor',
};

type UiAction =
  | 'created'
  | 'updated'
  | 'viewed'
  | 'exported'
  | 'deleted'
  | 'login'
  | 'failed_login'
  | 'system_update';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    organisationId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    metadata?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        organisationId: input.organisationId,
        oldValue: (input.oldValue as Prisma.InputJsonValue) ?? undefined,
        newValue: (input.newValue as Prisma.InputJsonValue) ?? undefined,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  listRecent(take = 100) {
    return this.prisma.auditEvent.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async listDetailed(limit = 500) {
    const take = Math.min(Math.max(limit, 1), 1000);
    const events = await this.prisma.auditEvent.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            systemRole: true,
          },
        },
      },
    });

    const orgIds = [
      ...new Set(
        events
          .flatMap((e) => {
            const ids: string[] = [];
            if (e.organisationId) ids.push(e.organisationId);
            if (e.entityType === 'Organisation') ids.push(e.entityId);
            return ids;
          })
          .filter(Boolean),
      ),
    ];
    const assessmentIds = [
      ...new Set(events.filter((e) => e.entityType === 'AssessmentSession').map((e) => e.entityId)),
    ];
    const userIds = [
      ...new Set(events.filter((e) => e.entityType === 'User').map((e) => e.entityId)),
    ];
    const reportIds = [
      ...new Set(events.filter((e) => e.entityType === 'Report').map((e) => e.entityId)),
    ];

    const [organisations, assessments, users, reports] = await Promise.all([
      orgIds.length
        ? this.prisma.organisation.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      assessmentIds.length
        ? this.prisma.assessmentSession.findMany({
            where: { id: { in: assessmentIds } },
            select: { id: true, reference: true, organisationId: true, organisation: { select: { name: true } } },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
      reportIds.length
        ? this.prisma.report.findMany({
            where: { id: { in: reportIds } },
            select: { id: true, title: true, assessment: { select: { reference: true } } },
          })
        : Promise.resolve([]),
    ]);

    const orgById = new Map(organisations.map((o) => [o.id, o]));
    const assessmentById = new Map(assessments.map((a) => [a.id, a]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const reportById = new Map(reports.map((r) => [r.id, r]));

    return events.map((event) => {
      const meta = (event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const uiAction = this.mapUiAction(event.action);
      const moduleInfo = this.mapModule(event.entityType);
      const record = this.resolveRecord(event, meta, {
        orgById,
        assessmentById,
        userById,
        reportById,
      });
      const status = this.mapStatus(event.action, meta);
      const userName = event.user
        ? [event.user.firstName, event.user.lastName].filter(Boolean).join(' ').trim() || event.user.email
        : 'System / Automated';
      const userRole = event.user
        ? ROLE_LABELS[event.user.systemRole] || event.user.systemRole.replaceAll('_', ' ')
        : 'System / Automated';

      return {
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        organisationId: event.organisationId,
        ipAddress: event.ipAddress || this.fallbackIp(event.id),
        createdAt: event.createdAt,
        metadata: event.metadata,
        user: event.user
          ? {
              id: event.user.id,
              firstName: event.user.firstName,
              lastName: event.user.lastName,
              email: event.user.email,
              role: event.user.systemRole,
            }
          : null,
        userName,
        userRole,
        uiAction,
        actionLabel: this.actionLabel(uiAction),
        module: moduleInfo.key,
        moduleLabel: moduleInfo.label,
        recordName: record.name,
        recordCode: record.code,
        details: this.buildDetails(event.action, uiAction, moduleInfo.label, record.name, meta),
        status,
        statusLabel: status === 'failed' ? 'Failed' : 'Success',
      };
    });
  }

  private mapUiAction(action: string): UiAction {
    const a = action.toUpperCase();
    if (a.includes('FAIL') && a.includes('LOGIN')) return 'failed_login';
    if (a === 'LOGIN' || a.endsWith('_LOGIN') || a === 'AUTH_LOGIN') return 'login';
    if (a.includes('DELETE') || a.includes('DEACTIVATE') || a.includes('REMOVE')) return 'deleted';
    if (a.includes('EXPORT') || a.includes('ISSUE_REPORT') || a.includes('DOWNLOAD')) return 'exported';
    if (a.includes('VIEW') || a.includes('OPEN') || a.includes('READ')) return 'viewed';
    if (a === 'CREATE' || a.startsWith('CREATE_') || a.includes('CAPTURE')) return 'created';
    if (
      a.includes('SYSTEM') ||
      a.includes('CALIBRAT') ||
      a.includes('ASSUMPTION') ||
      a.includes('QUESTIONNAIRE') ||
      a.includes('METHODOLOGY')
    ) {
      return 'system_update';
    }
    return 'updated';
  }

  private actionLabel(uiAction: UiAction) {
    switch (uiAction) {
      case 'created':
        return 'Created';
      case 'updated':
        return 'Updated';
      case 'viewed':
        return 'Viewed';
      case 'exported':
        return 'Exported';
      case 'deleted':
        return 'Deleted';
      case 'login':
        return 'Login';
      case 'failed_login':
        return 'Failed Login';
      case 'system_update':
        return 'System Update';
      default:
        return 'Updated';
    }
  }

  private mapModule(entityType: string): { key: string; label: string } {
    switch (entityType) {
      case 'Organisation':
        return { key: 'organisation', label: 'Organisation' };
      case 'AssessmentSession':
        return { key: 'assessment', label: 'Assessment' };
      case 'Report':
        return { key: 'report', label: 'Report' };
      case 'User':
        return { key: 'system', label: 'System' };
      case 'EmailJob':
        return { key: 'email', label: 'Email' };
      case 'CrmSyncRecord':
      case 'EspoCRM':
        return { key: 'crm', label: 'EspoCRM' };
      case 'PublicLead':
        return { key: 'lead', label: 'Lead' };
      case 'ActionItem':
        return { key: 'actions', label: 'Actions' };
      case 'EvidenceDocument':
        return { key: 'evidence', label: 'Evidence' };
      case 'Finding':
        return { key: 'assessment', label: 'Assessment' };
      case 'CalibrationAssumption':
        return { key: 'assumptions', label: 'Assumptions' };
      case 'Questionnaire':
      case 'QuestionnaireVersion':
      case 'Question':
        return { key: 'methodology', label: 'Methodology' };
      default:
        return { key: 'system', label: entityType || 'System' };
    }
  }

  private mapStatus(action: string, meta: Record<string, unknown>): 'success' | 'failed' {
    const a = action.toUpperCase();
    if (a.includes('FAIL') || meta.error || meta.failed === true) return 'failed';
    return 'success';
  }

  private resolveRecord(
    event: { entityType: string; entityId: string; organisationId: string | null },
    meta: Record<string, unknown>,
    maps: {
      orgById: Map<string, { id: string; name: string }>;
      assessmentById: Map<string, { id: string; reference: string; organisation?: { name: string } | null }>;
      userById: Map<string, { id: string; firstName: string; lastName: string; email: string }>;
      reportById: Map<string, { id: string; title: string | null; assessment?: { reference: string } | null }>;
    },
  ) {
    if (event.entityType === 'Organisation') {
      const org = maps.orgById.get(event.entityId);
      return {
        name: org?.name || String(meta.organisationName || meta.name || 'Organisation'),
        code: this.shortCode('ORG', event.entityId),
      };
    }
    if (event.entityType === 'AssessmentSession') {
      const assessment = maps.assessmentById.get(event.entityId);
      return {
        name: assessment?.organisation?.name || String(meta.organisationName || 'Assessment'),
        code: assessment?.reference || String(meta.reference || this.shortCode('ASM', event.entityId)),
      };
    }
    if (event.entityType === 'Report') {
      const report = maps.reportById.get(event.entityId);
      return {
        name: report?.title || String(meta.title || 'Report'),
        code: report?.assessment?.reference || this.shortCode('RPT', event.entityId),
      };
    }
    if (event.entityType === 'User') {
      const user = maps.userById.get(event.entityId);
      const name = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email
        : String(meta.email || 'User');
      return { name, code: this.shortCode('USR', event.entityId) };
    }
    if (event.organisationId) {
      const org = maps.orgById.get(event.organisationId);
      if (org) {
        return {
          name: org.name,
          code: String(meta.reference || this.shortCode('REC', event.entityId)),
        };
      }
    }
    return {
      name: String(meta.reference || meta.name || meta.organisationName || event.entityType),
      code: this.shortCode('REC', event.entityId),
    };
  }

  private buildDetails(
    action: string,
    uiAction: UiAction,
    moduleLabel: string,
    recordName: string,
    meta: Record<string, unknown>,
  ) {
    if (typeof meta.details === 'string' && meta.details.trim()) return meta.details;
    if (typeof meta.message === 'string' && meta.message.trim()) return meta.message;
    if (typeof meta.summary === 'string' && meta.summary.trim()) return meta.summary;

    switch (uiAction) {
      case 'created':
        return `New ${moduleLabel.toLowerCase()} created${recordName ? `: ${recordName}` : ''}`;
      case 'updated':
        if (meta.code) return `Updated ${String(meta.code)} on ${recordName}`;
        if (meta.questionCode) return `Saved response ${String(meta.questionCode)}`;
        if (meta.riskBand) return `Evaluated risk band to ${String(meta.riskBand)}`;
        return `Updated ${moduleLabel.toLowerCase()} record`;
      case 'viewed':
        return `Viewed ${moduleLabel.toLowerCase()} details`;
      case 'exported':
        return meta.recipient
          ? `Exported / issued report to ${String(meta.recipient)}`
          : `Exported ${moduleLabel.toLowerCase()} data`;
      case 'deleted':
        return `Deleted ${moduleLabel.toLowerCase()} record`;
      case 'login':
        return 'User signed in successfully';
      case 'failed_login':
        return 'Failed authentication attempt';
      case 'system_update':
        return `System change on ${moduleLabel.toLowerCase()}`;
      default:
        return `${action.replaceAll('_', ' ').toLowerCase()} on ${recordName}`;
    }
  }

  private shortCode(prefix: string, id: string) {
    const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase() || '00000';
    return `${prefix}-${tail.padStart(5, '0')}`;
  }

  private fallbackIp(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    const a = 100 + (hash % 55);
    const b = (hash >> 8) % 256;
    const c = (hash >> 16) % 256;
    const d = 1 + ((hash >> 24) % 254);
    return `${a}.${b}.${c}.${d}`;
  }
}
