import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommunicationDirection,
  CommunicationMessageStatus,
  CommunicationMessageType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import {
  COMMUNICATION_ADMIN_ROLES,
  COMMUNICATION_READ_ROLES,
  COMMUNICATION_WRITE_ROLES,
  buildReferences,
  callOutcomeLabel,
  communicationStatusLabel,
  communicationTypeLabel,
  extractCorrelationToken,
  isValidEmail,
  messagePreview,
  parseMessageIdHeader,
  replySubject,
  sanitizeEmailHtml,
} from '../common/triage-communications';
import { EmailService } from '../email/email.service';
import { StorageService } from '../evidence/storage.service';
import { PrismaService } from '../prisma/prisma.service';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  systemRole: true,
} as const;

type ComposeEmailInput = {
  to?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  threadId?: string;
  saveDraft?: boolean;
};

type LogCallInput = {
  direction: 'OUTBOUND' | 'INBOUND';
  telephoneNumber?: string;
  contactedPerson?: string;
  outcome: string;
  notes?: string;
  durationSeconds?: number;
  followUpRequired?: boolean;
  followUpDate?: string;
  occurredAt?: string;
};

type InboundEmailPayload = {
  from: string;
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  providerMessageId?: string;
  provider?: string;
  attachments?: InboundAttachmentInput[];
};

type InboundAttachmentInput = {
  filename: string;
  mimeType: string;
  content: Buffer;
  sizeBytes?: number;
};

@Injectable()
export class TriageCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  private assertRead(user: AuthUser) {
    if (!COMMUNICATION_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('You do not have access to triage communications.');
    }
  }

  private assertWrite(user: AuthUser) {
    if (!COMMUNICATION_WRITE_ROLES.has(user.role)) {
      throw new ForbiddenException('You do not have permission to record triage communications.');
    }
  }

  private assertAdmin(user: AuthUser) {
    if (!COMMUNICATION_ADMIN_ROLES.has(user.role)) {
      throw new ForbiddenException('Only administrators can manage trash permanently.');
    }
  }

  private canManageTrash(user: AuthUser) {
    return COMMUNICATION_ADMIN_ROLES.has(user.role);
  }

  private async getLeadOrThrow(publicLeadId: string) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    return lead;
  }

  private async assertLeadAccess(publicLeadId: string, user: AuthUser) {
    this.assertRead(user);
    const lead = await this.getLeadOrThrow(publicLeadId);
    if (COMMUNICATION_ADMIN_ROLES.has(user.role)) return lead;
    if (user.role === 'AUDITOR') return lead;
    if (lead.assignedAnalystId && lead.assignedAnalystId !== user.id) {
      throw new ForbiddenException('This triage submission is assigned to another analyst.');
    }
    return lead;
  }

  async assertLeadAccessForPoll(publicLeadId: string, user: AuthUser) {
    return this.assertLeadAccess(publicLeadId, user);
  }

  private inboundDomain() {
    return (
      this.config.get<string>('INBOUND_EMAIL_DOMAIN')?.trim()
      || this.config.get<string>('SMTP_FROM_EMAIL')?.split('@')[1]?.trim()
      || 'physicalrisk.com'
    );
  }

  /** Client-visible reply address — plain mailbox; threading uses Message-ID headers. */
  private replyToAddress(_correlationToken: string) {
    return (
      this.config.get<string>('SMTP_FROM_EMAIL')?.trim()
      || this.config.get<string>('CONTACT_FROM_EMAIL')?.trim()
      || `sales@${this.inboundDomain()}`
    );
  }

  private async generateThreadIdentity(publicLeadId: string) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    return {
      threadNumber: `TRIAGE-COMM-${suffix}`,
      correlationToken: `${publicLeadId.slice(-8)}-${randomUUID().slice(0, 8)}`,
    };
  }

  async linkThreadsToLevel2(publicLeadId: string, level2AssessmentId: string) {
    await this.prisma.communicationThread.updateMany({
      where: { publicLeadId, level2AssessmentId: null },
      data: { level2AssessmentId },
    });
  }

  async getGlobalUnreadSummary(user: AuthUser) {
    this.assertRead(user);
    const where: Prisma.CommunicationMessageWhereInput = {
      direction: CommunicationDirection.INBOUND,
      type: CommunicationMessageType.INBOUND_EMAIL,
      deletedAt: null,
      status: { not: CommunicationMessageStatus.DRAFT },
      readReceipts: { none: { userId: user.id } },
    };
    if (!COMMUNICATION_ADMIN_ROLES.has(user.role) && user.role !== 'AUDITOR') {
      where.publicLead = {
        OR: [{ assignedAnalystId: null }, { assignedAnalystId: user.id }],
      };
    }
    const unreadCount = await this.prisma.communicationMessage.count({ where });
    return { unreadCount };
  }

  async getSummary(publicLeadId: string, user: AuthUser) {
    await this.assertLeadAccess(publicLeadId, user);
    const activeEmailWhere = {
      publicLeadId,
      deletedAt: null,
      status: { not: CommunicationMessageStatus.DRAFT },
    };
    const [threadCount, unreadCount, draftCount, trashCount, lastMessage] = await Promise.all([
      this.prisma.communicationThread.count({ where: { publicLeadId } }),
      this.prisma.communicationMessage.count({
        where: {
          ...activeEmailWhere,
          direction: CommunicationDirection.INBOUND,
          type: CommunicationMessageType.INBOUND_EMAIL,
          readReceipts: { none: { userId: user.id } },
        },
      }),
      this.prisma.communicationMessage.count({
        where: {
          publicLeadId,
          deletedAt: null,
          status: CommunicationMessageStatus.DRAFT,
          type: {
            in: [CommunicationMessageType.OUTBOUND_EMAIL, CommunicationMessageType.INBOUND_EMAIL],
          },
        },
      }),
      this.prisma.communicationMessage.count({
        where: { publicLeadId, deletedAt: { not: null } },
      }),
      this.prisma.communicationMessage.findFirst({
        where: { publicLeadId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, type: true, direction: true },
      }),
    ]);
    return {
      threadCount,
      unreadCount,
      draftCount,
      trashCount,
      lastMessageAt: lastMessage?.createdAt || null,
      lastMessageType: lastMessage?.type || null,
      lastMessageDirection: lastMessage?.direction || null,
      canManageTrash: this.canManageTrash(user),
    };
  }

  async listCommunications(
    publicLeadId: string,
    user: AuthUser,
    filter?: 'all' | 'email' | 'calls',
    q?: string,
    mailbox?: 'inbox' | 'sent' | 'drafts' | 'trash',
  ) {
    const lead = await this.assertLeadAccess(publicLeadId, user);
    const activeMailbox = mailbox || 'inbox';
    const emailTypes = [
      CommunicationMessageType.OUTBOUND_EMAIL,
      CommunicationMessageType.INBOUND_EMAIL,
    ];
    const callTypes = [
      CommunicationMessageType.OUTBOUND_CALL,
      CommunicationMessageType.INBOUND_CALL,
      CommunicationMessageType.CALL_NOTE,
    ];

    let messageWhere: Prisma.CommunicationMessageWhereInput;
    if (activeMailbox === 'trash') {
      messageWhere = {
        deletedAt: { not: null },
        type: { in: filter === 'calls' ? callTypes : emailTypes },
      };
    } else if (activeMailbox === 'drafts') {
      messageWhere = {
        deletedAt: null,
        status: CommunicationMessageStatus.DRAFT,
        type: { in: emailTypes },
      };
    } else if (activeMailbox === 'sent') {
      messageWhere = {
        deletedAt: null,
        status: { not: CommunicationMessageStatus.DRAFT },
        type: CommunicationMessageType.OUTBOUND_EMAIL,
        direction: CommunicationDirection.OUTBOUND,
      };
    } else if (filter === 'calls') {
      messageWhere = { deletedAt: null, type: { in: callTypes } };
    } else if (filter === 'all') {
      messageWhere = {
        deletedAt: null,
        OR: [
          { status: { not: CommunicationMessageStatus.DRAFT }, type: { in: emailTypes } },
          { type: { in: callTypes } },
        ],
      };
    } else {
      // email + inbox: inbound non-draft emails
      messageWhere = {
        deletedAt: null,
        status: { not: CommunicationMessageStatus.DRAFT },
        type: CommunicationMessageType.INBOUND_EMAIL,
        direction: CommunicationDirection.INBOUND,
      };
    }

    const threads = await this.prisma.communicationThread.findMany({
      where: { publicLeadId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        createdBy: { select: userSelect },
        messages: {
          where: messageWhere,
          orderBy: { createdAt: 'asc' },
          include: {
            sentBy: { select: userSelect },
            attachments: true,
            readReceipts: { where: { userId: user.id }, select: { id: true } },
          },
        },
      },
    });

    const standaloneMessages = await this.prisma.communicationMessage.findMany({
      where: { publicLeadId, threadId: null, ...messageWhere },
      orderBy: { createdAt: 'asc' },
      include: {
        sentBy: { select: userSelect },
        attachments: true,
        readReceipts: { where: { userId: user.id }, select: { id: true } },
      },
    });

    const query = String(q || '').trim().toLowerCase();
    const filteredThreads = query
      ? threads
          .map((thread) => {
            const threadHit =
              includesIgnoreCase(thread.subject, query)
              || includesIgnoreCase(thread.threadNumber, query);
            const messages = threadHit
              ? thread.messages
              : thread.messages.filter((message) => messageMatchesQuery(message, query));
            return { ...thread, messages };
          })
          .filter((thread) => thread.messages.length > 0)
      : threads.filter((thread) => thread.messages.length > 0);

    const filteredStandalone = query
      ? standaloneMessages.filter((message) => messageMatchesQuery(message, query))
      : standaloneMessages;

    return {
      client: {
        name: [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim(),
        company: lead.organisationName,
        email: lead.email,
        phone: lead.phone,
        hasEmail: Boolean(lead.email?.trim() && isValidEmail(lead.email)),
        hasPhone: Boolean(lead.phone?.trim()),
      },
      query: query || null,
      mailbox: activeMailbox,
      canManageTrash: this.canManageTrash(user),
      threads: filteredThreads.map((thread) => this.mapThread(thread, user.id)),
      standaloneMessages: filteredStandalone.map((msg) => this.mapMessage(msg, user.id)),
    };
  }

  private mapThread(thread: any, userId: string) {
    return {
      id: thread.id,
      threadNumber: thread.threadNumber,
      subject: thread.subject,
      unreadCount: thread.messages.filter(
        (m: any) =>
          m.direction === CommunicationDirection.INBOUND
          && !m.readReceipts?.length,
      ).length,
      lastMessageAt: thread.lastMessageAt,
      createdBy: thread.createdBy,
      messages: thread.messages.map((m: any) => this.mapMessage(m, userId)),
    };
  }

  private mapMessage(message: any, userId: string) {
    const isRead =
      message.direction === CommunicationDirection.OUTBOUND
      || Boolean(message.readReceipts?.length);
    return {
      id: message.id,
      threadId: message.threadId,
      type: message.type,
      typeLabel: communicationTypeLabel(message.type, message.direction),
      direction: message.direction,
      subject: message.subject,
      fromAddress: message.fromAddress,
      toAddresses: message.toAddresses,
      ccAddresses: message.ccAddresses,
      previewText: message.previewText,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      status: message.status,
      statusLabel: communicationStatusLabel(message.status),
      sentBy: message.sentBy,
      sentAt: message.sentAt,
      receivedAt: message.receivedAt,
      createdAt: message.createdAt,
      telephoneNumber: message.telephoneNumber,
      contactedPerson: message.contactedPerson,
      callOutcome: message.callOutcome,
      durationSeconds: message.durationSeconds,
      followUpRequired: message.followUpRequired,
      followUpDate: message.followUpDate,
      errorMessage: message.errorMessage,
      isRead,
      isDraft: message.status === CommunicationMessageStatus.DRAFT,
      isTrashed: Boolean(message.deletedAt),
      deletedAt: message.deletedAt || null,
      canRetry: message.status === CommunicationMessageStatus.FAILED,
      attachments: (message.attachments || []).map((a: any) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      })),
    };
  }

  private async persistAttachments(
    messageId: string,
    publicLeadId: string,
    files: Express.Multer.File[],
  ) {
    for (const file of files) {
      const safeName = file.originalname.replace(/[^\w.\-()+ ]/g, '_');
      const key = `triage-comms/${publicLeadId}/${messageId}/${randomUUID()}-${safeName}`;
      await this.storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');
      await this.prisma.communicationAttachment.create({
        data: {
          messageId,
          filename: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          storageKey: key,
        },
      });
    }
  }

  private async persistInboundAttachments(
    messageId: string,
    publicLeadId: string,
    attachments: InboundAttachmentInput[],
  ) {
    const maxBytes = 25 * 1024 * 1024;
    for (const file of attachments.slice(0, 10)) {
      const content = file.content;
      const sizeBytes = file.sizeBytes ?? content?.length ?? 0;
      if (!content?.length || sizeBytes <= 0 || sizeBytes > maxBytes) continue;
      const filename = (file.filename || 'attachment').replace(/[^\w.\-()+ ]/g, '_').slice(0, 180);
      const mimeType = file.mimeType || 'application/octet-stream';
      const key = `triage-comms/${publicLeadId}/${messageId}/${randomUUID()}-${filename}`;
      await this.storage.put(key, content, mimeType);
      await this.prisma.communicationAttachment.create({
        data: {
          messageId,
          filename: file.filename || filename,
          mimeType,
          sizeBytes,
          storageKey: key,
        },
      });
    }
  }

  async getAttachmentFile(publicLeadId: string, attachmentId: string, user: AuthUser) {
    await this.assertLeadAccess(publicLeadId, user);
    const attachment = await this.prisma.communicationAttachment.findFirst({
      where: {
        id: attachmentId,
        message: { publicLeadId, deletedAt: null },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    const buffer = await this.storage.getBuffer(attachment.storageKey);
    return {
      buffer,
      filename: attachment.filename,
      mimeType: attachment.mimeType || 'application/octet-stream',
    };
  }

  /** Attach files to an existing inbound message that was ingested without attachments. */
  async backfillInboundAttachments(
    internetMessageId: string | null | undefined,
    providerMessageId: string | null | undefined,
    attachments: InboundAttachmentInput[],
  ) {
    if (!attachments.length) return { updated: false };
    const or: Prisma.CommunicationMessageWhereInput[] = [
      ...(internetMessageId
        ? [
            { internetMessageId },
            { internetMessageId: internetMessageId.replace(/^<|>$/g, '') },
            { internetMessageId: `<${internetMessageId.replace(/^<|>$/g, '')}>` },
          ]
        : []),
      ...(providerMessageId ? [{ providerMessageId }] : []),
    ];
    if (!or.length) return { updated: false };

    const message = await this.prisma.communicationMessage.findFirst({
      where: {
        direction: CommunicationDirection.INBOUND,
        OR: or,
      },
      include: { attachments: true },
    });
    if (!message) return { updated: false };
    if (message.attachments.length > 0) return { updated: false, messageId: message.id };
    await this.persistInboundAttachments(message.id, message.publicLeadId, attachments);
    return { updated: true, messageId: message.id };
  }

  private async loadMailAttachments(messageId: string) {
    const attachments = await this.prisma.communicationAttachment.findMany({
      where: { messageId },
    });
    return Promise.all(
      attachments.map(async (attachment) => ({
        filename: attachment.filename,
        content: await this.storage.getBuffer(attachment.storageKey),
        contentType: attachment.mimeType,
      })),
    );
  }

  async composeEmail(
    publicLeadId: string,
    input: ComposeEmailInput,
    user: AuthUser,
    files: Express.Multer.File[] = [],
  ) {
    this.assertWrite(user);
    const lead = await this.assertLeadAccess(publicLeadId, user);
    const to = (input.to || lead.email || '').trim();
    if (!to || !isValidEmail(to)) {
      throw new BadRequestException('A valid client email address is required.');
    }

    const cc = (input.cc || []).map((v) => v.trim()).filter(isValidEmail);
    const bcc = (input.bcc || []).map((v) => v.trim()).filter(isValidEmail);
    const subject = input.subject.trim();
    const textBody = input.message.trim();
    if (!subject) throw new BadRequestException('Subject is required.');
    if (!textBody && !input.saveDraft) throw new BadRequestException('Message is required.');

    const htmlBody = sanitizeEmailHtml(`<p>${textBody.replace(/\n/g, '<br>')}</p>`);
    const preview = messagePreview(textBody);

    let thread = input.threadId
      ? await this.prisma.communicationThread.findFirst({
          where: { id: input.threadId, publicLeadId },
        })
      : null;

    if (input.threadId && !thread) {
      throw new NotFoundException('Communication thread not found.');
    }

    if (!thread) {
      const identity = await this.generateThreadIdentity(publicLeadId);
      thread = await this.prisma.communicationThread.create({
        data: {
          ...identity,
          publicLeadId,
          subject,
          createdByUserId: user.id,
          lastMessageAt: new Date(),
        },
      });
    }

    const previous = input.threadId
      ? await this.prisma.communicationMessage.findFirst({
          where: { threadId: thread.id, internetMessageId: { not: null } },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const smtpView = await this.email.getSmtpPublicView();
    const fromAddress = smtpView.fromEmail || 'no-reply@physicalrisk.com';
    const domain = (fromAddress.split('@')[1] || 'physicalrisk.com').trim();
    const internetMessageId = `<${randomUUID()}@${domain}>`;
    const inReplyTo = previous?.internetMessageId || undefined;
    const references = buildReferences(previous?.referencesHeader, previous?.internetMessageId);

    const message = await this.prisma.communicationMessage.create({
      data: {
        threadId: thread.id,
        publicLeadId,
        type: CommunicationMessageType.OUTBOUND_EMAIL,
        direction: CommunicationDirection.OUTBOUND,
        fromAddress,
        toAddresses: [to],
        ccAddresses: cc,
        bccAddresses: bcc,
        subject: input.threadId ? replySubject(subject) : subject,
        textBody,
        htmlBody,
        previewText: preview,
        status: input.saveDraft ? CommunicationMessageStatus.DRAFT : CommunicationMessageStatus.QUEUED,
        sentByUserId: user.id,
        internetMessageId,
        inReplyTo: inReplyTo || null,
        referencesHeader: references || null,
      },
      include: { sentBy: { select: userSelect }, attachments: true },
    });

    if (files.length) {
      await this.persistAttachments(message.id, publicLeadId, files);
    }

    if (input.saveDraft) {
      await this.audit.record({
        userId: user.id,
        action: 'TRIAGE_EMAIL_DRAFT_SAVED',
        entityType: 'PublicLead',
        entityId: publicLeadId,
        metadata: { messageId: message.id, threadId: thread.id },
      });
      return { thread, message: this.mapMessage({ ...message, readReceipts: [] }, user.id) };
    }

    try {
      const mailAttachments = await this.loadMailAttachments(message.id);
      const sendResult = await this.email.sendDirectMail({
        to: [to],
        cc,
        bcc,
        subject: message.subject || subject,
        text: textBody,
        html: htmlBody,
        replyTo: this.replyToAddress(thread.correlationToken),
        messageId: internetMessageId,
        inReplyTo,
        references,
        attachments: mailAttachments.length ? mailAttachments : undefined,
      });

      const updated = await this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: {
          status: CommunicationMessageStatus.SENT,
          sentAt: new Date(),
          providerMessageId: sendResult.providerMessageId || null,
          internetMessageId: sendResult.internetMessageId,
          errorMessage: null,
        },
        include: { sentBy: { select: userSelect }, attachments: true },
      });

      await this.prisma.communicationThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date(), subject: thread.subject || subject },
      });

      if (!lead.contactedAt) {
        await this.prisma.publicLead.update({
          where: { id: publicLeadId },
          data: { contactedAt: new Date(), reviewedAt: lead.reviewedAt || new Date() },
        });
      }

      await this.audit.record({
        userId: user.id,
        action: 'TRIAGE_EMAIL_SENT',
        entityType: 'PublicLead',
        entityId: publicLeadId,
        metadata: { messageId: updated.id, threadId: thread.id, to },
      });

      return { thread, message: this.mapMessage({ ...updated, readReceipts: [] }, user.id) };
    } catch (error: any) {
      const updated = await this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: {
          status: CommunicationMessageStatus.FAILED,
          errorMessage: String(error?.message || error).slice(0, 1000),
        },
        include: { sentBy: { select: userSelect }, attachments: true },
      });
      await this.audit.record({
        userId: user.id,
        action: 'TRIAGE_EMAIL_SEND_FAILED',
        entityType: 'PublicLead',
        entityId: publicLeadId,
        metadata: { messageId: message.id, threadId: thread.id },
      });
      throw new BadRequestException(
        `Failed to send email: ${String(error?.message || 'Unknown error')}`,
      );
    }
  }

  async retryEmail(publicLeadId: string, messageId: string, user: AuthUser) {
    this.assertWrite(user);
    await this.assertLeadAccess(publicLeadId, user);
    const message = await this.prisma.communicationMessage.findFirst({
      where: { id: messageId, publicLeadId },
      include: { thread: true },
    });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.status !== CommunicationMessageStatus.FAILED) {
      throw new BadRequestException('Only failed messages can be retried.');
    }
    if (!message.thread) throw new BadRequestException('Message thread missing.');

    try {
      const mailAttachments = await this.loadMailAttachments(message.id);
      const sendResult = await this.email.sendDirectMail({
        to: message.toAddresses,
        cc: message.ccAddresses,
        bcc: message.bccAddresses,
        subject: message.subject || 'Message from Physical Risk',
        text: message.textBody || '',
        html: message.htmlBody || undefined,
        replyTo: this.replyToAddress(message.thread.correlationToken),
        messageId: message.internetMessageId || undefined,
        inReplyTo: message.inReplyTo || undefined,
        references: message.referencesHeader || undefined,
        attachments: mailAttachments.length ? mailAttachments : undefined,
      });
      const updated = await this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: {
          status: CommunicationMessageStatus.SENT,
          sentAt: new Date(),
          providerMessageId: sendResult.providerMessageId || null,
          errorMessage: null,
        },
        include: { sentBy: { select: userSelect }, attachments: true, readReceipts: true },
      });
      return this.mapMessage(updated, user.id);
    } catch (error: any) {
      await this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: { errorMessage: String(error?.message || error).slice(0, 1000) },
      });
      throw new BadRequestException(`Retry failed: ${String(error?.message || error)}`);
    }
  }

  async logCall(publicLeadId: string, input: LogCallInput, user: AuthUser) {
    this.assertWrite(user);
    const lead = await this.assertLeadAccess(publicLeadId, user);
    const phone = (input.telephoneNumber || lead.phone || '').trim();
    if (!phone) throw new BadRequestException('No telephone number available for this submission.');

    const direction =
      input.direction === 'INBOUND'
        ? CommunicationDirection.INBOUND
        : CommunicationDirection.OUTBOUND;
    const type =
      direction === CommunicationDirection.INBOUND
        ? CommunicationMessageType.INBOUND_CALL
        : CommunicationMessageType.OUTBOUND_CALL;

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const preview = messagePreview(input.notes || '');

    const message = await this.prisma.communicationMessage.create({
      data: {
        publicLeadId,
        type,
        direction,
        fromAddress: direction === CommunicationDirection.OUTBOUND ? user.email : phone,
        toAddresses:
          direction === CommunicationDirection.OUTBOUND ? [phone] : [user.email],
        subject: `${direction === CommunicationDirection.OUTBOUND ? 'Outbound' : 'Inbound'} call`,
        textBody: input.notes?.trim() || null,
        previewText: preview,
        status: CommunicationMessageStatus.DELIVERED,
        sentByUserId: user.id,
        telephoneNumber: phone,
        contactedPerson: input.contactedPerson?.trim() || `${lead.firstName} ${lead.lastName}`.trim(),
        callOutcome: input.outcome as any,
        durationSeconds: input.durationSeconds ?? null,
        followUpRequired: Boolean(input.followUpRequired),
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
        sentAt: occurredAt,
        createdAt: occurredAt,
      },
      include: { sentBy: { select: userSelect }, attachments: true, readReceipts: true },
    });

    if (!lead.contactedAt) {
      await this.prisma.publicLead.update({
        where: { id: publicLeadId },
        data: { contactedAt: occurredAt, reviewedAt: lead.reviewedAt || occurredAt },
      });
    }

    await this.audit.record({
      userId: user.id,
      action: 'TRIAGE_CALL_LOGGED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: { messageId: message.id, outcome: input.outcome },
    });

    return this.mapMessage(message, user.id);
  }

  async markThreadRead(publicLeadId: string, threadId: string, user: AuthUser) {
    await this.assertLeadAccess(publicLeadId, user);
    const messages = await this.prisma.communicationMessage.findMany({
      where: {
        publicLeadId,
        threadId,
        direction: CommunicationDirection.INBOUND,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!messages.length) return { marked: 0 };
    await this.prisma.communicationMessageRead.createMany({
      data: messages.map((m) => ({ messageId: m.id, userId: user.id })),
      skipDuplicates: true,
    });
    await this.prisma.communicationThread.update({
      where: { id: threadId },
      data: { unreadInboundCount: 0 },
    });
    return { marked: messages.length };
  }

  async markMessageRead(publicLeadId: string, messageId: string, user: AuthUser) {
    await this.assertLeadAccess(publicLeadId, user);
    const message = await this.prisma.communicationMessage.findFirst({
      where: { id: messageId, publicLeadId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Message not found.');
    await this.prisma.communicationMessageRead.upsert({
      where: { messageId_userId: { messageId, userId: user.id } },
      create: { messageId, userId: user.id },
      update: { readAt: new Date() },
    });
    return { ok: true };
  }

  async moveToTrash(
    publicLeadId: string,
    user: AuthUser,
    opts: { messageId?: string; threadId?: string },
  ) {
    this.assertWrite(user);
    await this.assertLeadAccess(publicLeadId, user);
    const now = new Date();

    if (opts.threadId) {
      const result = await this.prisma.communicationMessage.updateMany({
        where: { publicLeadId, threadId: opts.threadId, deletedAt: null },
        data: { deletedAt: now, deletedByUserId: user.id },
      });
      if (!result.count) throw new NotFoundException('No messages found to delete.');
      await this.audit.record({
        userId: user.id,
        action: 'TRIAGE_EMAIL_TRASHED',
        entityType: 'PublicLead',
        entityId: publicLeadId,
        metadata: { threadId: opts.threadId, count: result.count },
      });
      return { trashed: result.count };
    }

    if (!opts.messageId) throw new BadRequestException('messageId or threadId is required.');
    const message = await this.prisma.communicationMessage.findFirst({
      where: { id: opts.messageId, publicLeadId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Message not found.');

    await this.prisma.communicationMessage.update({
      where: { id: message.id },
      data: { deletedAt: now, deletedByUserId: user.id },
    });
    await this.audit.record({
      userId: user.id,
      action: 'TRIAGE_EMAIL_TRASHED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: { messageId: message.id },
    });
    return { trashed: 1 };
  }

  async restoreFromTrash(
    publicLeadId: string,
    user: AuthUser,
    opts: { messageId?: string; threadId?: string },
  ) {
    this.assertAdmin(user);
    await this.assertLeadAccess(publicLeadId, user);

    if (opts.threadId) {
      const result = await this.prisma.communicationMessage.updateMany({
        where: { publicLeadId, threadId: opts.threadId, deletedAt: { not: null } },
        data: { deletedAt: null, deletedByUserId: null },
      });
      if (!result.count) throw new NotFoundException('No trashed messages found.');
      await this.audit.record({
        userId: user.id,
        action: 'TRIAGE_EMAIL_RESTORED',
        entityType: 'PublicLead',
        entityId: publicLeadId,
        metadata: { threadId: opts.threadId, count: result.count },
      });
      return { restored: result.count };
    }

    if (!opts.messageId) throw new BadRequestException('messageId or threadId is required.');
    const message = await this.prisma.communicationMessage.findFirst({
      where: { id: opts.messageId, publicLeadId, deletedAt: { not: null } },
    });
    if (!message) throw new NotFoundException('Trashed message not found.');
    await this.prisma.communicationMessage.update({
      where: { id: message.id },
      data: { deletedAt: null, deletedByUserId: null },
    });
    await this.audit.record({
      userId: user.id,
      action: 'TRIAGE_EMAIL_RESTORED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: { messageId: message.id },
    });
    return { restored: 1 };
  }

  async purgeFromTrash(
    publicLeadId: string,
    user: AuthUser,
    opts: { messageId?: string; threadId?: string },
  ) {
    this.assertAdmin(user);
    await this.assertLeadAccess(publicLeadId, user);

    const where: Prisma.CommunicationMessageWhereInput = {
      publicLeadId,
      deletedAt: { not: null },
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
      ...(opts.messageId ? { id: opts.messageId } : {}),
    };
    if (!opts.threadId && !opts.messageId) {
      throw new BadRequestException('messageId or threadId is required.');
    }

    const messages = await this.prisma.communicationMessage.findMany({
      where,
      include: { attachments: true },
    });
    if (!messages.length) throw new NotFoundException('Trashed message not found.');

    for (const message of messages) {
      for (const attachment of message.attachments) {
        try {
          await this.storage.delete(attachment.storageKey);
        } catch {
          // Best-effort attachment cleanup.
        }
      }
    }

    const result = await this.prisma.communicationMessage.deleteMany({ where });
    await this.audit.record({
      userId: user.id,
      action: 'TRIAGE_EMAIL_PURGED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: {
        messageId: opts.messageId || null,
        threadId: opts.threadId || null,
        count: result.count,
      },
    });
    return { purged: result.count };
  }

  async processInboundWebhook(payload: InboundEmailPayload, webhookSecret?: string) {
    const expected = this.config.get<string>('INBOUND_EMAIL_WEBHOOK_SECRET')?.trim();
    if (expected && webhookSecret !== expected) {
      throw new UnauthorizedException('Invalid inbound webhook secret.');
    }
    const result = await this.ingestInboundEmail(payload);
    if (result.skipped) {
      throw new BadRequestException('Unable to match inbound email to a triage communication thread.');
    }
    return result;
  }

  async ingestInboundEmail(payload: InboundEmailPayload) {
    const recipients = [
      ...(Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : []),
      ...(Array.isArray(payload.cc) ? payload.cc : payload.cc ? [payload.cc] : []),
    ];
    const providerMessageId = payload.providerMessageId?.trim() || null;
    const internetMessageId = payload.messageId?.trim() || null;

    if (providerMessageId || internetMessageId) {
      const existing = await this.prisma.communicationMessage.findFirst({
        where: {
          OR: [
            ...(providerMessageId ? [{ providerMessageId }] : []),
            ...(internetMessageId ? [{ internetMessageId }] : []),
          ],
        },
      });
      if (existing) return { duplicate: true, messageId: existing.id, threadId: existing.threadId };
    }

    let thread = await this.resolveInboundThread(payload, recipients);
    if (!thread) {
      return { duplicate: false, skipped: true, reason: 'NO_THREAD_MATCH' as const };
    }

    const preview = messagePreview(payload.text || payload.html?.replace(/<[^>]+>/g, ' ') || '');
    const htmlBody = payload.html ? sanitizeEmailHtml(payload.html) : null;

    const message = await this.prisma.communicationMessage.create({
      data: {
        threadId: thread.id,
        publicLeadId: thread.publicLeadId,
        type: CommunicationMessageType.INBOUND_EMAIL,
        direction: CommunicationDirection.INBOUND,
        provider: payload.provider || 'INBOUND_WEBHOOK',
        providerMessageId,
        internetMessageId,
        inReplyTo: payload.inReplyTo || null,
        referencesHeader: payload.references || null,
        fromAddress: payload.from.trim(),
        toAddresses: recipients,
        subject: payload.subject?.trim() || null,
        textBody: payload.text?.trim() || null,
        htmlBody,
        previewText: preview,
        status: CommunicationMessageStatus.RECEIVED,
        receivedAt: new Date(),
      },
    });

    if (payload.attachments?.length) {
      await this.persistInboundAttachments(message.id, thread.publicLeadId, payload.attachments);
    }

    await this.prisma.communicationThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: new Date(),
        unreadInboundCount: { increment: 1 },
      },
    });

    await this.audit.record({
      action: 'TRIAGE_EMAIL_RECEIVED',
      entityType: 'PublicLead',
      entityId: thread.publicLeadId,
      metadata: {
        messageId: message.id,
        threadId: thread.id,
        from: payload.from,
        attachmentCount: payload.attachments?.length || 0,
      },
    });

    return { duplicate: false, skipped: false, messageId: message.id, threadId: thread.id };
  }

  private async resolveInboundThread(payload: InboundEmailPayload, recipients: string[]) {
    const token = extractCorrelationToken(recipients);
    if (token) {
      const byToken = await this.prisma.communicationThread.findUnique({
        where: { correlationToken: token },
      });
      if (byToken) return byToken;
    }

    const candidateIds = [
      ...parseMessageIdHeader(payload.inReplyTo),
      ...parseMessageIdHeader(payload.references),
    ];
    for (const messageId of candidateIds) {
      const normalized = messageId.replace(/^<|>$/g, '');
      const variants = [messageId, `<${normalized}>`, normalized].filter(Boolean);
      const prior = await this.prisma.communicationMessage.findFirst({
        where: {
          OR: variants.flatMap((id) => [
            { internetMessageId: id },
            { providerMessageId: id },
          ]),
        },
        include: { thread: true },
      });
      if (prior?.thread) return prior.thread;
    }

    if (payload.providerMessageId) {
      const prior = await this.prisma.communicationMessage.findFirst({
        where: { providerMessageId: payload.providerMessageId },
        include: { thread: true },
      });
      if (prior?.thread) return prior.thread;
    }

    return null;
  }
}

function includesIgnoreCase(value: string | null | undefined, query: string) {
  return String(value || '').toLowerCase().includes(query);
}

function stripHtml(html?: string | null) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function messageMatchesQuery(
  message: {
    subject?: string | null;
    fromAddress?: string | null;
    toAddresses?: string[] | null;
    ccAddresses?: string[] | null;
    previewText?: string | null;
    textBody?: string | null;
    htmlBody?: string | null;
    threadId?: string | null;
    telephoneNumber?: string | null;
    contactedPerson?: string | null;
    callOutcome?: string | null;
    attachments?: { filename?: string | null }[] | null;
  },
  query: string,
) {
  if (
    includesIgnoreCase(message.subject, query)
    || includesIgnoreCase(message.fromAddress, query)
    || includesIgnoreCase(message.previewText, query)
    || includesIgnoreCase(message.textBody, query)
    || includesIgnoreCase(stripHtml(message.htmlBody), query)
    || includesIgnoreCase(message.threadId, query)
    || includesIgnoreCase(message.telephoneNumber, query)
    || includesIgnoreCase(message.contactedPerson, query)
    || includesIgnoreCase(message.callOutcome, query)
    || includesIgnoreCase(callOutcomeLabel(message.callOutcome as any), query)
  ) {
    return true;
  }
  if ((message.toAddresses || []).some((address) => includesIgnoreCase(address, query))) return true;
  if ((message.ccAddresses || []).some((address) => includesIgnoreCase(address, query))) return true;
  if ((message.attachments || []).some((attachment) => includesIgnoreCase(attachment.filename, query))) {
    return true;
  }
  return false;
}
