import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailJobStatus, Prisma } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../evidence/storage.service';
import type { AuthUser } from '../common/current-user.decorator';

type EnqueueInput = {
  recipient: string;
  subject: string;
  template: string;
  payload?: Record<string, unknown>;
  relatedType?: string;
  relatedId?: string;
  organisationId?: string;
};

type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

export type SmtpPublicView = {
  provider: string;
  host: string;
  port: string;
  user: string;
  fromEmail: string;
  fromName: string;
  encryption: 'SSL/TLS' | 'STARTTLS';
  configured: boolean;
  passwordSet: boolean;
  source: 'database' | 'environment' | 'none';
};

export type UpdateSmtpInput = {
  host?: string;
  port?: number | string;
  secure?: boolean;
  encryption?: 'SSL/TLS' | 'STARTTLS';
  user?: string;
  password?: string;
  fromEmail?: string;
  fromName?: string;
};

const SMTP_SETTING_KEY = 'smtp';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Port 465 expects implicit TLS; 587 expects plain + STARTTLS. */
function normalizeSmtpConfig(config: SmtpConfig): SmtpConfig {
  const port = Number(config.port) || 587;
  let secure = config.secure;
  if (port === 465) secure = true;
  else if (port === 587) secure = false;
  return { ...config, port, secure };
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async enqueue(input: EnqueueInput) {
    return this.prisma.emailJob.create({
      data: {
        recipient: input.recipient,
        subject: input.subject,
        template: input.template,
        payload: (input.payload || {}) as Prisma.InputJsonValue,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        organisationId: input.organisationId,
        status: EmailJobStatus.PENDING,
      },
    });
  }

  list(limit = 500) {
    return this.prisma.emailJob.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async listDetailed(limit = 500) {
    const items = await this.prisma.emailJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const orgIds = [...new Set(items.map((i) => i.organisationId).filter(Boolean) as string[])];
    const orgs = orgIds.length
      ? await this.prisma.organisation.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
    const orgById = new Map(orgs.map((o) => [o.id, o.name]));

    return items.map((job) => {
      const payload = (job.payload || {}) as Record<string, unknown>;
      const organisationName =
        orgById.get(job.organisationId || '')
        || (typeof payload.organisationName === 'string' ? payload.organisationName : null)
        || null;

      let uiStatus: 'delivered' | 'failed' | 'pending' | 'scheduled' = 'pending';
      if (job.status === EmailJobStatus.SENT) uiStatus = 'delivered';
      else if (job.status === EmailJobStatus.FAILED || job.status === EmailJobStatus.CANCELLED) uiStatus = 'failed';
      else if (job.status === EmailJobStatus.QUEUED) uiStatus = 'scheduled';
      else uiStatus = 'pending';

      const template = job.template || '';
      let emailType: 'notification' | 'report' | 'alert' | 'system' | 'invite' | 'security' = 'notification';
      if (/report/i.test(template)) emailType = 'report';
      else if (/returned|missing|internal_submission|alert/i.test(template)) emailType = 'alert';
      else if (/approved|assigned/i.test(template)) emailType = 'system';
      else if (/invite|welcome/i.test(template)) emailType = 'invite';
      else if (/security|password|reset/i.test(template)) emailType = 'security';
      else if (/submission_confirmation|assessment_/i.test(template)) emailType = 'notification';

      const deliverability = uiStatus === 'delivered' ? 100 : uiStatus === 'failed' ? 0 : null;

      return {
        ...job,
        organisationName,
        uiStatus,
        emailType,
        deliverability,
        opened: false,
      };
    });
  }

  private envSmtp(): SmtpConfig {
    const fromRaw = this.config.get<string>('SMTP_FROM') || '';
    const fromEmail =
      this.config.get<string>('SMTP_FROM_EMAIL')
      || (fromRaw.includes('<') ? fromRaw.replace(/^.*<([^>]+)>.*$/, '$1').trim() : fromRaw)
      || '';
    return {
      host: (this.config.get<string>('SMTP_HOST') || '').trim(),
      port: Number(this.config.get<string>('SMTP_PORT') || 587) || 587,
      secure: (this.config.get<string>('SMTP_SECURE') || 'false') === 'true',
      user: (this.config.get<string>('SMTP_USER') || '').trim(),
      password: this.config.get<string>('SMTP_PASSWORD') || '',
      fromEmail: fromEmail.trim(),
      fromName: (this.config.get<string>('SMTP_FROM_NAME') || 'MOSS').trim() || 'MOSS',
    };
  }

  private parseStoredSmtp(value: unknown): Partial<SmtpConfig> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const raw = value as Record<string, unknown>;
    return {
      host: typeof raw.host === 'string' ? raw.host.trim() : undefined,
      port: raw.port != null && raw.port !== '' ? Number(raw.port) || undefined : undefined,
      secure: typeof raw.secure === 'boolean' ? raw.secure : undefined,
      user: typeof raw.user === 'string' ? raw.user.trim() : undefined,
      password: typeof raw.password === 'string' ? raw.password : undefined,
      fromEmail: typeof raw.fromEmail === 'string' ? raw.fromEmail.trim() : undefined,
      fromName: typeof raw.fromName === 'string' ? raw.fromName.trim() : undefined,
    };
  }

  async resolveSmtpConfig(): Promise<{ config: SmtpConfig; source: SmtpPublicView['source'] }> {
    const env = this.envSmtp();
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SMTP_SETTING_KEY } });
    const stored = this.parseStoredSmtp(row?.value);

    const hasDbHost = Boolean(stored.host);
    if (hasDbHost || row) {
      const config = normalizeSmtpConfig({
        host: (stored.host ?? env.host) || '',
        port: stored.port ?? env.port ?? 587,
        secure: stored.secure ?? env.secure,
        user: stored.user ?? env.user ?? '',
        password: stored.password || env.password || '',
        fromEmail: (stored.fromEmail ?? env.fromEmail) || '',
        fromName: (stored.fromName ?? env.fromName) || 'MOSS',
      });
      return { config, source: config.host ? 'database' : (env.host ? 'environment' : 'none') };
    }

    return {
      config: normalizeSmtpConfig(env),
      source: env.host ? 'environment' : 'none',
    };
  }

  toPublicView(config: SmtpConfig, source: SmtpPublicView['source']): SmtpPublicView {
    const configured = Boolean(config.host);
    return {
      provider: configured ? 'SMTP' : 'Not configured',
      host: config.host || '',
      port: String(config.port || 587),
      user: config.user || '',
      fromEmail: config.fromEmail || '',
      fromName: config.fromName || 'MOSS',
      encryption: config.secure ? 'SSL/TLS' : 'STARTTLS',
      configured,
      passwordSet: Boolean(config.password),
      source: configured ? source : 'none',
    };
  }

  async getSmtpPublicView(): Promise<SmtpPublicView> {
    const { config, source } = await this.resolveSmtpConfig();
    return this.toPublicView(config, source);
  }

  async updateSmtp(input: UpdateSmtpInput, user: AuthUser) {
    const { config: current } = await this.resolveSmtpConfig();
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SMTP_SETTING_KEY } });
    const stored = this.parseStoredSmtp(row?.value);

    let secure = current.secure;
    if (typeof input.secure === 'boolean') secure = input.secure;
    else if (input.encryption === 'SSL/TLS') secure = true;
    else if (input.encryption === 'STARTTLS') secure = false;

    const passwordProvided = typeof input.password === 'string' && input.password.length > 0;
    const next = normalizeSmtpConfig({
      host: input.host !== undefined ? String(input.host).trim() : (stored.host ?? current.host),
      port: input.port !== undefined ? Number(input.port) || 587 : (stored.port ?? current.port),
      secure,
      user: input.user !== undefined ? String(input.user).trim() : (stored.user ?? current.user),
      password: passwordProvided
        ? String(input.password)
        : (stored.password ?? current.password ?? ''),
      fromEmail: input.fromEmail !== undefined
        ? String(input.fromEmail).trim()
        : (stored.fromEmail ?? current.fromEmail),
      fromName: input.fromName !== undefined
        ? String(input.fromName).trim() || 'MOSS'
        : (stored.fromName ?? current.fromName),
    });

    if (next.port < 1 || next.port > 65535) {
      throw new BadRequestException('SMTP port must be between 1 and 65535.');
    }
    if (next.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.fromEmail)) {
      throw new BadRequestException('From email looks invalid.');
    }

    await this.prisma.systemSetting.upsert({
      where: { key: SMTP_SETTING_KEY },
      create: {
        key: SMTP_SETTING_KEY,
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: user.id,
      },
      update: {
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: user.id,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE_SMTP',
      entityType: 'SystemSetting',
      entityId: SMTP_SETTING_KEY,
      metadata: {
        host: next.host,
        port: next.port,
        secure: next.secure,
        user: next.user,
        fromEmail: next.fromEmail,
        fromName: next.fromName,
        passwordUpdated: passwordProvided,
      },
    });

    return this.getSmtpPublicView();
  }

  private createTransport(config: SmtpConfig) {
    const normalized = normalizeSmtpConfig(config);
    return nodemailer.createTransport({
      host: normalized.host,
      port: normalized.port,
      secure: normalized.secure,
      requireTLS: !normalized.secure,
      auth: normalized.user
        ? { user: normalized.user, pass: normalized.password }
        : undefined,
    });
  }

  private formatFrom(config: SmtpConfig) {
    const fromEmail = config.fromEmail || 'no-reply@example.com';
    return fromEmail.includes('<') ? fromEmail : `${config.fromName || 'MOSS'} <${fromEmail}>`;
  }

  async testSmtp(to: string, user: AuthUser) {
    const recipient = (to || user.email || '').trim();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new BadRequestException('A valid test recipient email is required.');
    }

    const { config } = await this.resolveSmtpConfig();
    if (!config.host) {
      throw new BadRequestException('SMTP host is not configured.');
    }

    const transporter = this.createTransport(config);
    try {
      await transporter.sendMail({
        from: this.formatFrom(config),
        to: recipient,
        subject: 'MOSS SMTP test',
        html: `<p style="font-family:Inter,Segoe UI,sans-serif">This is a test email from MOSS confirming SMTP settings.</p>
<p style="font-family:Inter,Segoe UI,sans-serif;color:#64748b">Sent by ${user.email} at ${new Date().toISOString()}.</p>`,
        text: 'This is a test email from MOSS confirming SMTP settings.',
      });
    } catch (error: any) {
      throw new BadRequestException(`SMTP test failed: ${error?.message || error}`);
    }

    await this.audit.record({
      userId: user.id,
      action: 'TEST_SMTP',
      entityType: 'SystemSetting',
      entityId: SMTP_SETTING_KEY,
      metadata: { to: recipient },
    });

    return { ok: true, to: recipient, message: `Test email sent to ${recipient}.` };
  }

  private renderBody(template: string, payload: Record<string, unknown> = {}) {
    const brand = 'Physical Risk · MOSS';
    const lines: string[] = [`<p style="font-family:Segoe UI,Arial,sans-serif">${brand}</p>`];
    switch (template) {
      case 'assessment_assigned':
        lines.push(`<p>You have been assigned as <strong>${payload.role || 'analyst'}</strong> on a MOSS assessment.</p>`);
        break;
      case 'assessment_returned':
        lines.push(`<p>Assessment <strong>${payload.reference || ''}</strong> was returned for changes.</p>`);
        if (payload.reason) lines.push(`<p>Reason: ${String(payload.reason)}</p>`);
        break;
      case 'submission_confirmation':
        lines.push(`<p>Dear ${payload.firstName || 'Colleague'},</p>`);
        lines.push(`<p>Thank you. Your Security Cost Leakage assessment for <strong>${payload.organisationName || 'your organisation'}</strong> was received.</p>`);
        lines.push(`<p>Our analysts will review your responses and be in contact shortly.</p>`);
        break;
      case 'missing_information':
        lines.push(`<p>Dear ${payload.firstName || 'Colleague'},</p>`);
        lines.push(`<p>We need additional information for assessment <strong>${payload.reference || ''}</strong>.</p>`);
        if (payload.comment) lines.push(`<p>${String(payload.comment)}</p>`);
        break;
      case 'assessment_approved':
        lines.push(`<p>Assessment <strong>${payload.reference || ''}</strong> has been approved.</p>`);
        break;
      case 'report_issued':
      case 'report_available':
        lines.push(`<p>Dear Colleague,</p>`);
        lines.push(
          `<p>Please find the executive report for <strong>${payload.organisationName || 'your organisation'}</strong>${
            payload.reference ? ` (${payload.reference})` : ''
          } attached to this email as a PDF.</p>`,
        );
        if (payload.url) {
          lines.push(`<p>You can also <a href="${payload.url}">open the secure report link</a> (valid for 7 days).</p>`);
        }
        break;
      case 'internal_submission':
        lines.push(`<p>A new assessment was submitted: <strong>${payload.reference || ''}</strong> (${payload.organisationName || ''}).</p>`);
        break;
      case 'website_contact_enquiry':
        lines.push('<h2>Website contact enquiry – Book a MOSS Assessment</h2>');
        lines.push(`<p><strong>Full name:</strong> ${escapeHtml(payload.fullName)}</p>`);
        lines.push(`<p><strong>Organisation:</strong> ${escapeHtml(payload.organisation)}</p>`);
        lines.push(`<p><strong>Email address:</strong> ${escapeHtml(payload.email)}</p>`);
        lines.push(`<p><strong>Programme of interest:</strong> ${escapeHtml(payload.programmeInterest)}</p>`);
        lines.push(`<p><strong>Brief description:</strong><br>${escapeHtml(payload.description).replace(/\n/g, '<br>')}</p>`);
        lines.push(`<p><strong>Source:</strong> ${escapeHtml(payload.source)}</p>`);
        lines.push(`<p><strong>Submitted:</strong> ${escapeHtml(payload.submittedAt)}</p>`);
        lines.push(`<p><strong>EspoCRM Lead ID:</strong> ${escapeHtml(payload.leadId)}</p>`);
        break;
      default:
        lines.push(`<p>${payload.message || 'MOSS notification'}</p>`);
    }
    return lines.join('\n');
  }

  async processQueue(limit = 20) {
    const { config } = await this.resolveSmtpConfig();
    if (!config.host) return { processed: 0, skipped: true };

    const jobs = await this.prisma.emailJob.findMany({
      where: { status: { in: [EmailJobStatus.PENDING, EmailJobStatus.QUEUED] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const transporter = this.createTransport(config);
    const from = this.formatFrom(config);

    let processed = 0;
    for (const job of jobs) {
      await this.prisma.emailJob.update({
        where: { id: job.id },
        data: { status: EmailJobStatus.PROCESSING, attemptCount: { increment: 1 } },
      });
      try {
        const payload = (job.payload as Record<string, unknown>) || {};
        const html = this.renderBody(job.template, payload);
        const text = job.template === 'website_contact_enquiry'
          ? [
              'Website contact enquiry – Book a MOSS Assessment',
              `Full name: ${String(payload.fullName || '')}`,
              `Organisation: ${String(payload.organisation || '')}`,
              `Email address: ${String(payload.email || '')}`,
              `Programme of interest: ${String(payload.programmeInterest || '')}`,
              `Brief description: ${String(payload.description || '')}`,
              `Source: ${String(payload.source || '')}`,
              `Submitted: ${String(payload.submittedAt || '')}`,
              `EspoCRM Lead ID: ${String(payload.leadId || '')}`,
            ].join('\n')
          : html.replace(/<[^>]+>/g, ' ');
        const attachments = await this.resolveAttachments(payload);
        await transporter.sendMail({
          from: job.template === 'website_contact_enquiry' && payload.fromEmail
            ? `${config.fromName || 'MOSS'} <${String(payload.fromEmail)}>`
            : from,
          to: job.recipient,
          subject: job.subject,
          html,
          text,
          replyTo: job.template === 'website_contact_enquiry' ? String(payload.replyTo || '') || undefined : undefined,
          attachments,
        });
        await this.prisma.emailJob.update({
          where: { id: job.id },
          data: { status: EmailJobStatus.SENT, sentAt: new Date(), errorMessage: null },
        });
        processed += 1;
      } catch (error: any) {
        this.logger.warn(`Email job ${job.id} failed: ${error?.message || error}`);
        await this.prisma.emailJob.update({
          where: { id: job.id },
          data: {
            status: job.attemptCount >= 4 ? EmailJobStatus.FAILED : EmailJobStatus.PENDING,
            errorMessage: String(error?.message || error).slice(0, 1000),
          },
        });
      }
    }
    return { processed, skipped: false };
  }

  private async resolveAttachments(payload: Record<string, unknown>): Promise<MailAttachment[] | undefined> {
    const storageKey =
      typeof payload.attachmentStorageKey === 'string' ? payload.attachmentStorageKey.trim() : '';
    if (!storageKey) return undefined;

    const filename =
      (typeof payload.attachmentFileName === 'string' && payload.attachmentFileName.trim())
      || 'report.pdf';
    const contentType =
      (typeof payload.attachmentContentType === 'string' && payload.attachmentContentType.trim())
      || 'application/pdf';

    try {
      const content = await this.storage.getBuffer(storageKey);
      if (!content.length) {
        this.logger.warn(`Email attachment empty for key ${storageKey}`);
        return undefined;
      }
      return [{ filename, content, contentType }];
    } catch (error: any) {
      this.logger.warn(`Unable to load email attachment ${storageKey}: ${error?.message || error}`);
      return undefined;
    }
  }

  async retry(id: string) {
    const job = await this.prisma.emailJob.findUnique({ where: { id } });
    if (!job) return null;
    return this.prisma.emailJob.update({
      where: { id },
      data: { status: EmailJobStatus.PENDING, errorMessage: null },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      await this.processQueue();
    } catch (error: any) {
      this.logger.warn(`Email queue tick failed: ${error?.message || error}`);
    }
  }
}
