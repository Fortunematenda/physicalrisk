import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment as MailparserAttachment } from 'mailparser';
import { TriageCommunicationsService } from './triage-communications.service';

type PollSummary = {
  processed: number;
  duplicates: number;
  skipped: number;
  errors: number;
  attachmentsBackfilled: number;
  busy?: boolean;
};

function addressList(field: unknown): string[] {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.flatMap((entry) => addressList(entry));
  }
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const value = (field as { value?: Array<{ address?: string }> }).value || [];
    return value.map((v) => v.address).filter(Boolean) as string[];
  }
  return [];
}

function headerString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  return undefined;
}

function isInternalMailboxAddress(fromAddress: string) {
  const fromLower = fromAddress.toLowerCase();
  return (
    fromLower.includes('@physicalrisk.com')
    || fromLower.includes('mailer-daemon')
    || fromLower.includes('postmaster')
  );
}

/** Keep real file attachments; skip tiny embedded signature images. */
function mapParsedAttachments(attachments: MailparserAttachment[] | undefined) {
  if (!attachments?.length) return [];
  return attachments
    .filter((attachment) => {
      const disposition = String(attachment.contentDisposition || '').toLowerCase();
      const filename = attachment.filename?.trim() || '';
      const hasFilename = Boolean(filename);
      const contentType = String(attachment.contentType || '');
      const size = attachment.size || attachment.content?.length || 0;
      const isInlineImage =
        (disposition === 'inline' || Boolean(attachment.cid))
        && contentType.startsWith('image/');
      // Signature / logo embeds — keep named files (e.g. signed PDF renamed oddly) via size floor.
      if (isInlineImage && (!hasFilename || size < 40 * 1024)) return false;
      if (!hasFilename && disposition !== 'attachment' && !contentType.includes('pdf')) return false;
      return size > 0 && size <= 25 * 1024 * 1024;
    })
    .map((attachment) => ({
      filename: attachment.filename?.trim()
        || (String(attachment.contentType || '').includes('pdf') ? 'attachment.pdf' : `attachment-${attachment.checksum || 'file'}`),
      mimeType: attachment.contentType || 'application/octet-stream',
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(attachment.content || []),
      sizeBytes: attachment.size || undefined,
    }));
}

@Injectable()
export class TriageInboundImapService {
  private readonly logger = new Logger(TriageInboundImapService.name);
  private polling = false;
  /** Avoid re-parsing the same unmatched Seen message every 15s (clears on API restart). */
  private readonly recentlySkipped = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly communications: TriageCommunicationsService,
  ) {}

  private skipKeyStillHot(key: string) {
    const at = this.recentlySkipped.get(key);
    if (!at) return false;
    if (Date.now() - at > 30 * 60 * 1000) {
      this.recentlySkipped.delete(key);
      return false;
    }
    return true;
  }

  private rememberSkip(key: string) {
    this.recentlySkipped.set(key, Date.now());
    if (this.recentlySkipped.size > 500) {
      const oldest = [...this.recentlySkipped.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100);
      for (const [k] of oldest) this.recentlySkipped.delete(k);
    }
  }

  isEnabled() {
    const flag = String(this.config.get('INBOUND_IMAP_ENABLED') || '').trim().toLowerCase();
    return flag === 'true' || flag === '1' || flag === 'yes';
  }

  /** Poll frequently so client replies appear quickly in triage. */
  @Cron('*/15 * * * * *')
  async scheduledPoll() {
    if (!this.isEnabled()) return;
    await this.pollInbox();
  }

  async pollInbox(): Promise<PollSummary> {
    if (this.polling) {
      return {
        processed: 0,
        duplicates: 0,
        skipped: 0,
        errors: 0,
        attachmentsBackfilled: 0,
        busy: true,
      };
    }
    this.polling = true;
    try {
      return await this.fetchUnreadMessages();
    } finally {
      this.polling = false;
    }
  }

  private imapConfig() {
    const host =
      this.config.get<string>('INBOUND_IMAP_HOST')?.trim()
      || this.config.get<string>('SMTP_HOST')?.trim()
      || '';
    const port = Number(this.config.get<string>('INBOUND_IMAP_PORT') || 993);
    const secureFlag = String(this.config.get('INBOUND_IMAP_SECURE') ?? 'true').toLowerCase();
    const secure = secureFlag !== 'false' && secureFlag !== '0';
    const user =
      this.config.get<string>('INBOUND_IMAP_USER')?.trim()
      || this.config.get<string>('SMTP_USER')?.trim()
      || '';
    const pass =
      this.config.get<string>('INBOUND_IMAP_PASSWORD')?.trim()
      || this.config.get<string>('SMTP_PASSWORD')?.trim()
      || '';
    const mailbox = this.config.get<string>('INBOUND_IMAP_MAILBOX')?.trim() || 'INBOX';
    return { host, port, secure, user, pass, mailbox };
  }

  private async fetchUnreadMessages(): Promise<PollSummary> {
    const summary: PollSummary = {
      processed: 0,
      duplicates: 0,
      skipped: 0,
      errors: 0,
      attachmentsBackfilled: 0,
    };
    const { host, port, secure, user, pass, mailbox } = this.imapConfig();

    if (!host || !user || !pass) {
      this.logger.warn('IMAP inbox polling skipped: host, user, or password not configured.');
      return summary;
    }

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(mailbox);
      try {
        const unreadResult = await client.search({ seen: false }, { uid: true });
        const unreadUids = Array.isArray(unreadResult) ? unreadResult : [];

        // Also ingest recent Seen mail not yet in triage (clients/webmail often auto-mark Seen).
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentResult = await client.search({ since }, { uid: true });
        const recentUids = (Array.isArray(recentResult) ? recentResult : []).slice(-50);
        const ingestUids = Array.from(new Set([...unreadUids, ...recentUids]));

        const messages = ingestUids.length
          ? await client.fetchAll(ingestUids, { source: true }, { uid: true })
          : [];

        const handledUids: number[] = [];

        for (const message of messages) {
          if (!message.source || !message.uid) continue;
          try {
            const parsed = await simpleParser(message.source);
            const skipKey = parsed.messageId || `imap-${message.uid}`;
            const isUnread = unreadUids.includes(message.uid);
            if (!isUnread && this.skipKeyStillHot(skipKey)) {
              continue;
            }

            const fromAddress =
              parsed.from?.value?.[0]?.address
              || parsed.from?.text
              || '';
            const toAddresses = [
              ...addressList(parsed.to),
              ...addressList(parsed.cc),
            ];
            const attachments = mapParsedAttachments(parsed.attachments);

            const result = await this.communications.ingestInboundEmail({
              from: fromAddress,
              to: toAddresses,
              subject: parsed.subject || undefined,
              text: parsed.text || undefined,
              html: typeof parsed.html === 'string' ? parsed.html : undefined,
              messageId: parsed.messageId || undefined,
              inReplyTo: headerString(parsed.inReplyTo),
              references: headerString(parsed.references),
              providerMessageId: `imap-${message.uid}`,
              provider: 'IMAP',
              attachments,
            });

            if (result.duplicate) {
              summary.duplicates += 1;
              if (attachments.length) {
                const backfill = await this.communications.backfillInboundAttachments(
                  parsed.messageId || null,
                  `imap-${message.uid}`,
                  attachments,
                );
                if (backfill.updated) summary.attachmentsBackfilled += 1;
              }
              handledUids.push(message.uid);
              this.recentlySkipped.delete(skipKey);
            } else if (result.skipped) {
              summary.skipped += 1;
              this.logger.warn(
                `IMAP message skipped (no triage thread match): from=${fromAddress} subject=${parsed.subject || '(none)'} inReplyTo=${headerString(parsed.inReplyTo) || '(none)'} attachments=${attachments.length}`,
              );
              if (isInternalMailboxAddress(fromAddress)) {
                handledUids.push(message.uid);
              } else if (!isUnread) {
                this.rememberSkip(skipKey);
              }
            } else {
              summary.processed += 1;
              handledUids.push(message.uid);
              this.recentlySkipped.delete(skipKey);
            }
          } catch (error: any) {
            summary.errors += 1;
            this.logger.warn(
              `Failed to process IMAP message uid=${message.uid}: ${error?.message || error}`,
            );
          }
        }

        if (handledUids.length) {
          await client.messageFlagsAdd(handledUids, ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }
    } catch (error: any) {
      this.logger.warn(`IMAP inbox poll failed: ${error?.message || error}`);
      summary.errors += 1;
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore logout errors
      }
    }

    if (summary.processed > 0 || summary.attachmentsBackfilled > 0 || summary.skipped > 0) {
      this.logger.log(
        `IMAP inbox: ${summary.processed} reply/replies imported (${summary.duplicates} duplicates, ${summary.skipped} unmatched, ${summary.attachmentsBackfilled} attachment backfills).`,
      );
    }

    return summary;
  }
}
