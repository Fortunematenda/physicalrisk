import { Body, Controller, Headers, Post } from '@nestjs/common';
import { TriageCommunicationsService } from './triage-communications.service';

@Controller('email/inbound')
export class TriageInboundEmailController {
  constructor(private readonly communications: TriageCommunicationsService) {}

  @Post('webhook')
  processWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-inbound-webhook-secret') secret?: string,
  ) {
    const payload = normalizeInboundPayload(body);
    return this.communications.processInboundWebhook(payload, secret);
  }
}

function normalizeInboundPayload(body: Record<string, unknown>) {
  const toValue = body.to ?? body.recipient ?? body.envelope_to;
  const fromValue = body.from ?? body.sender;
  return {
    from: String(fromValue || ''),
    to: toValue as string | string[] | undefined,
    cc: body.cc as string | string[] | undefined,
    subject: typeof body.subject === 'string' ? body.subject : undefined,
    text:
      typeof body.text === 'string'
        ? body.text
        : typeof body.plain === 'string'
          ? body.plain
          : undefined,
    html: typeof body.html === 'string' ? body.html : undefined,
    messageId:
      typeof body.messageId === 'string'
        ? body.messageId
        : typeof body['message-id'] === 'string'
          ? body['message-id']
          : undefined,
    inReplyTo:
      typeof body.inReplyTo === 'string'
        ? body.inReplyTo
        : typeof body['in-reply-to'] === 'string'
          ? body['in-reply-to']
          : undefined,
    references:
      typeof body.references === 'string'
        ? body.references
        : typeof body.References === 'string'
          ? body.References
          : undefined,
    providerMessageId:
      typeof body.providerMessageId === 'string' ? body.providerMessageId : undefined,
    provider: typeof body.provider === 'string' ? body.provider : 'INBOUND_WEBHOOK',
  };
}
