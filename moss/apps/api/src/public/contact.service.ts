import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EspoCrmService } from '../crm/espocrm.service';
import { EspoCrmHttpError } from '../crm/espocrm.client';
import { EmailService } from '../email/email.service';

export type ContactInput = {
  fullName: string;
  organisation: string;
  email: string;
  programmeInterest: string;
  description: string;
};

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crm: EspoCrmService,
    private readonly email: EmailService,
  ) {}

  allowedProgrammes(): string[] {
    return (this.config.get<string>('CONTACT_PROGRAMME_OPTIONS') || 'MOSS Assessment')
      .split(',').map((v) => v.trim()).filter(Boolean);
  }

  async verifyCaptcha(token: string, ip: string) {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY') || '';
    if (!secret || !token) throw new BadRequestException({ captchaToken: 'Please complete the security check.' });
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      });
      const result = await response.json() as { success?: boolean; hostname?: string };
      const hosts = (this.config.get<string>('CONTACT_ALLOWED_HOSTS') || 'test.physicalrisk.com')
        .split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
      if (!result.success || !result.hostname || !hosts.includes(result.hostname.toLowerCase())) {
        throw new Error('CAPTCHA_REJECTED');
      }
    } catch {
      throw new BadRequestException({ captchaToken: 'Security verification failed. Please try again.' });
    }
  }

  async submit(input: ContactInput) {
    const normalized = {
      fullName: input.fullName.trim().replace(/\s+/g, ' '),
      organisation: input.organisation.trim(),
      email: input.email.trim().toLowerCase(),
      programmeInterest: input.programmeInterest.trim(),
      description: input.description.trim(),
    };
    if (!this.allowedProgrammes().includes(normalized.programmeInterest)) {
      throw new BadRequestException({ programmeInterest: 'Select a valid programme.' });
    }
    if (normalized.description.length < 10) {
      throw new BadRequestException({ description: 'At least 10 characters required.' });
    }
    if (normalized.description.length > 3000) {
      throw new BadRequestException({ description: 'Enter no more than 3,000 characters.' });
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const existing = await this.prisma.contactSubmission.findUnique({ where: { fingerprint } });
    if (existing) {
      await this.ensureQueued(existing.id);
      return this.publicResult(existing.publicReference);
    }

    const publicReference = `ENQ-${randomBytes(8).toString('hex').toUpperCase()}`;
    const row = await this.prisma.contactSubmission.create({
      data: { ...normalized, source: 'wordpress', fingerprint, publicReference },
    });
    await this.ensureQueued(row.id);
    return this.publicResult(publicReference);
  }

  private async ensureQueued(id: string) {
    const row = await this.prisma.contactSubmission.findUnique({
      where: { id },
    });
    if (!row) throw new ServiceUnavailableException({ success: false, message: 'We could not safely store your enquiry.' });
    try {
      if (!row.emailJobId) await this.queueNotification(row, row.espocrmLeadId);
      await this.prisma.contactSubmission.update({
        where: { id },
        data: { crmStatus: row.crmStatus === 'SUCCESS' ? 'SUCCESS' : 'PENDING', nextAttemptAt: row.nextAttemptAt || new Date() },
      });
    } catch {
      await this.prisma.contactSubmission.update({ where: { id }, data: { notificationStatus: 'PENDING', safeErrorCode: 'NOTIFICATION_QUEUE_UNAVAILABLE' } });
      throw new ServiceUnavailableException({
        success: false,
        message: 'We could not safely queue your enquiry. Your details have been kept; please try again shortly.',
      });
    }
  }

  private publicResult(submissionId: string) {
    return { success: true, message: 'Thank you. Your enquiry has been sent successfully.', submissionId };
  }

  private async deliver(id: string) {
    const row = await this.prisma.contactSubmission.findUnique({ where: { id } });
    if (!row) return;
    if (row.crmStatus === 'SUCCESS') {
      if (!row.emailJobId) await this.queueNotification(row, row.espocrmLeadId);
      return;
    }
    try {
      const result = await this.crm.upsertWebsiteContact({
        submissionId: row.publicReference,
        fullName: row.fullName,
        organisation: row.organisation,
        email: row.email,
        programmeInterest: row.programmeInterest,
        description: row.description,
        source: row.source,
      });
      await this.prisma.contactSubmission.update({
        where: { id },
        data: { espocrmLeadId: result.leadId, crmStatus: 'SUCCESS', safeErrorCode: null },
      });
      let emailJobId = row.emailJobId;
      if (!emailJobId) {
        try {
          emailJobId = await this.queueNotification(row, result.leadId);
        } catch {
          await this.prisma.contactSubmission.update({ where: { id }, data: { notificationStatus: 'PENDING', safeErrorCode: 'NOTIFICATION_QUEUE_UNAVAILABLE' } });
          this.logger.warn(JSON.stringify({ event: 'contact_delivery', submissionId: row.publicReference, leadId: result.leadId, crm: 'SUCCESS', notification: 'PENDING', errorCode: 'NOTIFICATION_QUEUE_UNAVAILABLE' }));
          return;
        }
      }
      await this.prisma.contactSubmission.update({
        where: { id },
        data: { espocrmLeadId: result.leadId, crmStatus: 'SUCCESS', emailJobId, notificationStatus: 'QUEUED', safeErrorCode: null },
      });
      this.logger.log(JSON.stringify({ event: 'contact_delivery', submissionId: row.publicReference, leadId: result.leadId, crm: 'SUCCESS', notification: 'QUEUED' }));
    } catch (error) {
      const attempt = row.attemptCount + 1;
      const safeCrmError = error instanceof EspoCrmHttpError
        ? { errorCode: error.code, statusCode: error.statusCode, retryable: error.retryable }
        : { errorCode: 'CRM_UNAVAILABLE' };
      await this.prisma.contactSubmission.update({
        where: { id },
        data: { crmStatus: 'PENDING', attemptCount: attempt, safeErrorCode: 'CRM_UNAVAILABLE', nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000) },
      });
      this.logger.warn(JSON.stringify({ event: 'contact_delivery', submissionId: row.publicReference, crm: 'PENDING', notification: 'WAITING', ...safeCrmError }));
    }
  }

  private async queueNotification(row: {
    id: string; fullName: string; organisation: string; email: string;
    programmeInterest: string; description: string; source: string; createdAt: Date;
  }, leadId: string | null): Promise<string> {
    const job = await this.email.enqueue({
      recipient: this.config.get<string>('CONTACT_NOTIFICATION_TO') || 'info@physicalrisk.com',
      subject: `New MOSS assessment enquiry – ${row.organisation}`,
      template: 'website_contact_enquiry', relatedType: 'ContactSubmission', relatedId: row.id,
      payload: {
        fullName: row.fullName, organisation: row.organisation, email: row.email,
        programmeInterest: row.programmeInterest, description: row.description,
        source: row.source, submittedAt: row.createdAt.toISOString(), ...(leadId ? { leadId } : {}),
        replyTo: row.email,
        fromEmail: this.config.get<string>('CONTACT_FROM_EMAIL') || 'no-reply@physicalrisk.com',
      },
    });
    await this.prisma.contactSubmission.update({
      where: { id: row.id }, data: { emailJobId: job.id, notificationStatus: 'QUEUED', safeErrorCode: null },
    });
    return job.id;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryPending() {
    const rows = await this.prisma.contactSubmission.findMany({
      where: { crmStatus: 'PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
      orderBy: { createdAt: 'asc' }, take: 10,
    });
    for (const row of rows) await this.deliver(row.id);
    const notificationRows = await this.prisma.contactSubmission.findMany({
      where: { notificationStatus: 'PENDING', emailJobId: null },
      orderBy: { createdAt: 'asc' }, take: 10,
    });
    for (const row of notificationRows) {
      // CRM lookup/update is idempotent by normalized email; this path reuses
      // the same Lead and re-attempts only durable notification queuing.
      await this.deliver(row.id);
    }
  }
}
