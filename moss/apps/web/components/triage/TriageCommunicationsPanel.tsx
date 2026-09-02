'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  CornerUpRight,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Phone,
  RotateCcw,
  Search,
  Smile,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { EmailComposer } from '@/components/triage/communications/EmailComposer';
import {
  buildDefaultSubject,
  clearLocalDraft,
  extractEmailFromChip,
  formatRecipientChip,
  forwardSubject,
  loadLocalDraft,
  replySubject,
  saveLocalDraft,
  type ComposeMode,
  type EmailDraft,
} from '@/components/triage/communications/email-composer-utils';
import { getStoredUser } from '@/lib/auth-user';
import { useConfirm } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { cn } from '@/lib/utils';

type Mailbox = 'inbox' | 'sent' | 'drafts' | 'trash';
type Filter = 'all' | 'email';

type CommunicationMessage = {
  id: string;
  threadId?: string | null;
  type: string;
  typeLabel: string;
  direction: 'OUTBOUND' | 'INBOUND';
  subject?: string | null;
  fromAddress: string;
  toAddresses: string[];
  previewText?: string | null;
  textBody?: string | null;
  status: string;
  statusLabel: string;
  sentBy?: { firstName?: string; lastName?: string; email?: string } | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  telephoneNumber?: string | null;
  callOutcome?: string | null;
  followUpRequired?: boolean;
  isRead?: boolean;
  isDraft?: boolean;
  isTrashed?: boolean;
  canRetry?: boolean;
  attachments?: { id: string; filename: string; mimeType?: string | null; sizeBytes?: number | null }[];
};

type CommunicationThread = {
  id: string;
  threadNumber: string;
  subject?: string | null;
  unreadCount: number;
  lastMessageAt?: string | null;
  messages: CommunicationMessage[];
};

type CommunicationsPayload = {
  client: {
    name: string;
    company: string;
    email: string;
    phone?: string | null;
    hasEmail: boolean;
    hasPhone: boolean;
  };
  query?: string | null;
  mailbox?: Mailbox;
  canManageTrash?: boolean;
  threads: CommunicationThread[];
  standaloneMessages: CommunicationMessage[];
};

type CommunicationsSummary = {
  unreadCount: number;
  lastMessageAt?: string | null;
  lastMessageType?: string | null;
  lastMessageDirection?: string | null;
};

type Props = {
  submissionId: string;
  item: any;
  initialAction?: 'compose' | 'call' | 'log-call' | null;
  onInitialActionHandled?: () => void;
  onSummaryChange?: (summary: { unreadCount: number }) => void;
};

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtGmailDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function messageSnippet(message: CommunicationMessage) {
  const raw = (message.previewText || message.textBody || '').trim();
  let text = (splitEmailBody(raw).main || raw).replace(/\s+/g, ' ').trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function messageSenderLabel(message: CommunicationMessage, clientName: string) {
  if (message.type.includes('CALL')) {
    return message.direction === 'INBOUND' ? clientName || 'Client' : personName(message.sentBy) || 'Physical Risk';
  }
  if (message.direction === 'INBOUND') {
    const local = message.fromAddress.split('@')[0]?.replace(/[.+]/g, ' ').trim();
    return clientName || local || message.fromAddress;
  }
  return personName(message.sentBy) || 'Physical Risk';
}

function senderInitials(label: string) {
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (label[0] || '?').toUpperCase();
}

function fmtGmailThreadDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtGmailThreadDateTime(value?: string | null) {
  const when = fmtGmailThreadDate(value);
  const relative = relativeTime(value);
  return relative ? `${when} ${relative}` : when;
}

function relativeTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return '(today)';
  if (days === 1) return '(1 day ago)';
  return `(${days} days ago)`;
}

function splitEmailBody(text: string) {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!normalized) return { main: '', quoted: '' };

  const onWrote = normalized.match(
    /^([\s\S]*?)\n+(On\s[\s\S]{0,300}?\bwrote:\s*(?:\n|$)[\s\S]*)$/i,
  );
  if (onWrote?.[1]?.trim()) {
    return { main: onWrote[1].trim(), quoted: onWrote[2].trim() };
  }

  const outlook = normalized.match(
    /^([\s\S]*?)\n+(-{2,}\s*Original Message\s*-{2,}[\s\S]*)$/i,
  );
  if (outlook?.[1]?.trim()) {
    return { main: outlook[1].trim(), quoted: outlook[2].trim() };
  }

  const lines = normalized.split('\n');
  let cut = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^On\s.+\bwrote:\s*$/i.test(line) || /^>/.test(line)) {
      cut = i;
      while (cut > 0 && !lines[cut - 1].trim()) cut -= 1;
      break;
    }
  }
  if (cut > 0) {
    return {
      main: lines.slice(0, cut).join('\n').trim(),
      quoted: lines.slice(cut).join('\n').trim(),
    };
  }

  return { main: normalized, quoted: '' };
}

function avatarColor(direction: 'INBOUND' | 'OUTBOUND') {
  return direction === 'INBOUND'
    ? 'bg-sky-600 text-white'
    : 'bg-red-600 text-white';
}

function personName(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  if (!user) return '—';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || '—';
}

function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (!q || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded-sm bg-amber-100 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

export function TriageCommunicationsPanel({
  submissionId,
  item,
  initialAction,
  onInitialActionHandled,
  onSummaryChange,
}: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [mailbox, setMailbox] = useState<Mailbox>('inbox');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<CommunicationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('new');
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeExpanded, setComposeExpanded] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [composeQuoted, setComposeQuoted] = useState('');
  const [showComposeQuoted, setShowComposeQuoted] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [emailDraft, setEmailDraft] = useState<EmailDraft>({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    message: '',
  });
  const draftSaveTimer = useRef<number | null>(null);
  const threadCardRef = useRef<HTMLDivElement>(null);
  const [callDraft, setCallDraft] = useState({
    direction: 'OUTBOUND',
    outcome: 'CLIENT_REACHED',
    notes: '',
    durationSeconds: '',
    followUpRequired: false,
    followUpDate: '',
  });
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, string | null>>({});
  const [newEmailBannerCount, setNewEmailBannerCount] = useState<number | null>(null);
  const [composePoppedOut, setComposePoppedOut] = useState(false);

  const storedUser = useMemo(() => getStoredUser(), []);
  const analystLabel = useMemo(() => {
    if (!storedUser) return 'Me';
    const name = [storedUser.firstName, storedUser.lastName].filter(Boolean).join(' ').trim();
    return name || storedUser.email || 'Me';
  }, [storedUser]);

  const apiFilter: Filter = mailbox === 'inbox' ? 'all' : 'email';
  const canManageTrash = Boolean(data?.canManageTrash);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    try {
      const params = new URLSearchParams({
        filter: mailbox === 'inbox' ? 'all' : 'email',
        mailbox,
      });
      if (searchQuery) params.set('q', searchQuery);
      const [communications, summary] = await Promise.all([
        apiFetch<CommunicationsPayload>(
          `/triage/submissions/${submissionId}/communications?${params.toString()}`,
        ),
        apiFetch<CommunicationsSummary>(`/triage/submissions/${submissionId}/communications/summary`),
      ]);
      setData(communications);
      onSummaryChange?.({ unreadCount: summary.unreadCount || 0 });
    } catch (e) {
      if (!opts?.soft) {
        toast({
          variant: 'error',
          title: 'Unable to load communications',
          description: e instanceof Error ? e.message : 'Please try again.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [mailbox, onSummaryChange, searchQuery, submissionId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Quiet background poll so replies appear without waiting for the minute cron / manual check.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const result = await apiFetch<{
          poll?: { processed?: number };
          unreadCount?: number;
        }>(`/triage/submissions/${submissionId}/communications/check-inbox`, { method: 'POST' });
        if (cancelled) return;
        if (typeof result.unreadCount === 'number') {
          onSummaryChange?.({ unreadCount: result.unreadCount });
        }
        const processed = result.poll?.processed || 0;
        if (processed > 0) {
          setNewEmailBannerCount(processed);
          await load({ soft: true });
        }
      } catch {
        // Ignore background poll failures; manual Check inbox still surfaces errors.
      }
    };
    void poll();
    const timer = window.setInterval(poll, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, onSummaryChange, submissionId]);

  useEffect(() => {
    if (!initialAction) return;
    if (initialAction === 'compose') {
      openCompose();
    } else if (initialAction === 'call') {
      if (data?.client.hasPhone) window.location.href = `tel:${data.client.phone}`;
      else toast({ variant: 'error', title: 'No telephone number on this submission.' });
    } else if (initialAction === 'log-call') {
      setCallOpen(true);
    }
    onInitialActionHandled?.();
  }, [initialAction, data?.client.hasPhone, data?.client.phone, onInitialActionHandled]);

  const emailThreadRows = useMemo(() => {
    if (!data) return [];
    const rows: CommunicationThread[] = [...data.threads].filter((thread) =>
      thread.messages.some((message) => !message.type.includes('CALL')),
    );
    for (const message of data.standaloneMessages) {
      if (!message.type.includes('CALL')) {
        rows.push({
          id: message.threadId || message.id,
          threadNumber: '',
          subject: message.subject,
          unreadCount: message.isRead === false ? 1 : 0,
          messages: [message],
        });
      }
    }
    return rows.sort((a, b) => {
      const aTime = new Date(
        a.lastMessageAt ||
          a.messages[a.messages.length - 1]?.sentAt ||
          a.messages[a.messages.length - 1]?.receivedAt ||
          a.messages[a.messages.length - 1]?.createdAt ||
          0,
      ).getTime();
      const bTime = new Date(
        b.lastMessageAt ||
          b.messages[b.messages.length - 1]?.sentAt ||
          b.messages[b.messages.length - 1]?.receivedAt ||
          b.messages[b.messages.length - 1]?.createdAt ||
          0,
      ).getTime();
      return bTime - aTime;
    });
  }, [data]);

  const visibleEmailThreadRows = emailThreadRows;

  const callListItems = useMemo(() => {
    if (!data || mailbox !== 'inbox') return [];
    const items: CommunicationMessage[] = [];
    for (const thread of data.threads) {
      for (const message of thread.messages) {
        if (message.type.includes('CALL')) items.push(message);
      }
    }
    for (const message of data.standaloneMessages) {
      if (message.type.includes('CALL')) items.push(message);
    }
    return items.sort((a, b) => {
      const aTime = new Date(a.sentAt || a.receivedAt || a.createdAt).getTime();
      const bTime = new Date(b.sentAt || b.receivedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [data, mailbox]);

  const openThread = useMemo(() => {
    if (!openThreadId || !data) return null;
    const found = data.threads.find((t) => t.id === openThreadId);
    if (found) return found;
    const standalone = data.standaloneMessages.find((m) => (m.threadId || m.id) === openThreadId);
    if (standalone) {
      return {
        id: openThreadId,
        threadNumber: '',
        subject: standalone.subject,
        unreadCount: 0,
        messages: [standalone],
      } satisfies CommunicationThread;
    }
    return null;
  }, [data, openThreadId]);

  const triageReference = item?.assessment?.reference || item?.proposalReference || '';

  useEffect(() => {
    if (!composeOpen) return;
    const hasDraftContent =
      emailDraft.to.trim() ||
      emailDraft.subject.trim() ||
      emailDraft.message.trim() ||
      emailDraft.cc.trim() ||
      emailDraft.bcc.trim();
    if (!hasDraftContent) return;

    setDraftStatus('saving');
    if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => {
      saveLocalDraft(submissionId, emailDraft);
      setDraftStatus('saved');
    }, 1200);

    return () => {
      if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
    };
  }, [composeOpen, emailDraft, submissionId]);

  function openCompose(
    thread?: CommunicationThread,
    options?: { mode?: ComposeMode; message?: CommunicationMessage },
  ) {
    const clientEmail = data?.client.email || item.email || '';
    const clientDisplayName =
      data?.client.name || [item.firstName, item.lastName].filter(Boolean).join(' ').trim() || clientEmail;
    const mode = options?.mode || (thread ? 'reply' : 'new');
    const targetMessage = options?.message || (thread?.messages?.length ? thread.messages[thread.messages.length - 1] : null);

    let quoted = '';
    if (targetMessage && mode !== 'forward') {
      const body = (targetMessage.textBody || targetMessage.previewText || '').trim();
      const sender = messageSenderLabel(targetMessage, clientDisplayName);
      const when = targetMessage.sentAt || targetMessage.receivedAt || targetMessage.createdAt;
      if (body) {
        quoted = `\n\nOn ${fmtGmailThreadDate(when)}, ${sender} wrote:\n${body
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')}`;
      }
    }

    let to = formatRecipientChip(clientDisplayName, clientEmail);
    let cc = '';
    let subject = buildDefaultSubject(triageReference);
    let message = '';

    if (targetMessage) {
      const threadSubject = thread?.subject || targetMessage.subject || subject;
      if (mode === 'forward') {
        subject = forwardSubject(threadSubject);
        to = '';
        const body = (targetMessage.textBody || targetMessage.previewText || '').trim();
        const sender = messageSenderLabel(targetMessage, clientDisplayName);
        const when = targetMessage.sentAt || targetMessage.receivedAt || targetMessage.createdAt;
        message = `\n\n---------- Forwarded message ----------\nFrom: ${sender}\nDate: ${fmtGmailThreadDate(when)}\nSubject: ${threadSubject}\n\n${body}`;
        quoted = '';
      } else if (mode === 'reply-all') {
        subject = replySubject(threadSubject);
        if (targetMessage.direction === 'INBOUND') {
          to = formatRecipientChip(clientDisplayName, targetMessage.fromAddress);
          cc = targetMessage.toAddresses
            .filter((addr) => addr && !addr.includes('physicalrisk.com'))
            .join(', ');
        } else {
          to = formatRecipientChip(clientDisplayName, clientEmail);
        }
      } else {
        subject = replySubject(threadSubject);
        if (targetMessage.direction === 'INBOUND') {
          to = formatRecipientChip(clientDisplayName, targetMessage.fromAddress);
        }
      }
    } else {
      const saved = loadLocalDraft(submissionId);
      if (saved?.to || saved?.message || saved?.subject) {
        setComposeMode('new');
        setReplyThreadId(null);
        setComposeQuoted('');
        setShowComposeQuoted(false);
        setComposeMinimized(false);
        setComposeExpanded(false);
        setComposePoppedOut(true);
        setShowCc(Boolean(saved.cc));
        setShowBcc(Boolean(saved.bcc));
        setComposeAttachments([]);
        setEmailDraft(saved);
        setComposeOpen(true);
        return;
      }
      message = '';
    }

    setComposeMode(mode);
    setReplyThreadId(mode === 'forward' ? null : thread?.id || null);
    setComposeQuoted(quoted);
    setShowComposeQuoted(false);
    setComposeMinimized(false);
    setComposeExpanded(false);
    setComposePoppedOut(mode === 'new' || mode === 'forward');
    setShowCc(Boolean(cc));
    setShowBcc(false);
    setComposeAttachments([]);
    setEmailDraft({ to, cc, bcc: '', subject, message });
    setComposeOpen(true);
  }

  function closeCompose() {
    if (
      emailDraft.to.trim() ||
      emailDraft.subject.trim() ||
      emailDraft.message.trim() ||
      emailDraft.cc.trim() ||
      emailDraft.bcc.trim()
    ) {
      saveLocalDraft(submissionId, emailDraft);
    }
    setComposeOpen(false);
    setComposeMinimized(false);
    setComposeExpanded(false);
    setComposePoppedOut(false);
    setShowComposeQuoted(false);
    setDraftStatus('idle');
  }

  function discardCompose() {
    clearLocalDraft(submissionId);
    setComposeOpen(false);
    setComposeMinimized(false);
    setComposeExpanded(false);
    setComposePoppedOut(false);
    setShowComposeQuoted(false);
    setComposeAttachments([]);
    setEmailDraft({ to: '', cc: '', bcc: '', subject: '', message: '' });
    setDraftStatus('idle');
  }

  async function sendEmail(saveDraft = false, markContacted = false) {
    if (sending) return;
    if (saveDraft) {
      setBusy(true);
    } else {
      setSending(true);
    }
    try {
      const messageBody =
        showComposeQuoted && composeQuoted
          ? `${emailDraft.message.trim()}${composeQuoted}`
          : emailDraft.message;
      const cc = emailDraft.cc
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const bcc = emailDraft.bcc
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const form = new FormData();
      form.append('to', extractEmailFromChip(emailDraft.to));
      form.append('subject', emailDraft.subject);
      form.append('message', messageBody);
      form.append('saveDraft', saveDraft ? 'true' : 'false');
      if (cc.length) form.append('cc', JSON.stringify(cc));
      if (bcc.length) form.append('bcc', JSON.stringify(bcc));
      if (replyThreadId) form.append('threadId', replyThreadId);
      composeAttachments.forEach((file) => form.append('attachments', file));

      await apiFetch(`/triage/submissions/${submissionId}/communications/email`, {
        method: 'POST',
        body: form,
      });

      if (markContacted && !saveDraft) {
        await apiFetch(`/triage/submissions/${submissionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONTACTED' }),
        });
      }

      if (saveDraft) {
        toast({ title: 'Draft saved', description: 'Your draft was saved to the timeline.' });
      } else {
        clearLocalDraft(submissionId);
        setComposeOpen(false);
        setComposeMinimized(false);
        setComposeExpanded(false);
        setShowComposeQuoted(false);
        setComposeAttachments([]);
        toast({
          title: 'Email sent',
          description: 'The message was added to the conversation.',
        });
      }
      await load();
    } catch (e) {
      toast({
        variant: 'error',
        title: saveDraft ? 'Could not save draft' : 'Send failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
      setSending(false);
    }
  }

  async function checkInbox() {
    setBusy(true);
    try {
      const result = await apiFetch<{
        poll: { processed: number; duplicates: number; skipped: number };
        unreadCount?: number;
      }>(`/triage/submissions/${submissionId}/communications/check-inbox`, { method: 'POST' });
      const imported = result.poll?.processed || 0;
      if (typeof result.unreadCount === 'number') {
        onSummaryChange?.({ unreadCount: result.unreadCount });
      }
      if (imported > 0) {
        setNewEmailBannerCount(imported);
      }
      toast({
        title: imported > 0 ? `${imported} new reply imported` : 'Inbox checked',
        description:
          imported > 0
            ? 'Client replies were added to the timeline.'
            : 'No new client replies were found in the mailbox.',
      });
      await load({ soft: true });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Inbox check failed',
        description: e instanceof Error ? e.message : 'Unable to check the mailbox.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveCall() {
    setBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/communications/calls`, {
        method: 'POST',
        body: JSON.stringify({
          direction: callDraft.direction,
          outcome: callDraft.outcome,
          notes: callDraft.notes,
          durationSeconds: callDraft.durationSeconds ? Number(callDraft.durationSeconds) : undefined,
          followUpRequired: callDraft.followUpRequired,
          followUpDate: callDraft.followUpDate || undefined,
          telephoneNumber: data?.client.phone || item.phone,
          contactedPerson: data?.client.name,
        }),
      });
      setCallOpen(false);
      toast({ title: 'Call logged', description: 'The call was added to the communication timeline.' });
      await load();
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Could not log call',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  function openDraft(message: CommunicationMessage) {
    const to =
      message.toAddresses?.length
        ? message.toAddresses.map((addr) => formatRecipientChip('', addr)).join(', ')
        : data?.client.email
          ? formatRecipientChip(data.client.name, data.client.email)
          : '';
    setComposeMode('new');
    setReplyThreadId(message.threadId || null);
    setComposeQuoted('');
    setShowComposeQuoted(false);
    setComposeMinimized(false);
    setComposeExpanded(false);
    setShowCc(false);
    setShowBcc(false);
    setComposeAttachments([]);
    setEmailDraft({
      to,
      cc: '',
      bcc: '',
      subject: message.subject || buildDefaultSubject(triageReference),
      message: message.textBody || message.previewText || '',
    });
    setComposeOpen(true);
  }

  function trashTargetForThread(thread: CommunicationThread): { threadId?: string; messageId?: string } {
    const realThread = data?.threads.find((t) => t.id === thread.id);
    const message = thread.messages[0];
    const isDraftRow =
      mailbox === 'drafts'
      || Boolean(message?.isDraft)
      || message?.status === 'DRAFT';
    if (isDraftRow && message?.id) return { messageId: message.id };
    if (realThread) return { threadId: thread.id };
    if (message?.id) return { messageId: message.id };
    return { threadId: thread.id };
  }

  async function trashThread(thread: CommunicationThread) {
    setBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/communications/trash`, {
        method: 'POST',
        body: JSON.stringify(trashTargetForThread(thread)),
      });
      if (openThreadId === thread.id) setOpenThreadId(null);
      toast({ title: 'Moved to trash' });
      await load({ soft: true });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Could not move to trash',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function restoreThread(thread: CommunicationThread) {
    setBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/communications/restore`, {
        method: 'POST',
        body: JSON.stringify(trashTargetForThread(thread)),
      });
      if (openThreadId === thread.id) setOpenThreadId(null);
      toast({ title: 'Restored' });
      await load({ soft: true });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Could not restore',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function purgeThread(thread: CommunicationThread) {
    const ok = await confirm({
      title: 'Delete forever?',
      description: 'This permanently deletes the conversation from Trash. This cannot be undone.',
      confirmLabel: 'Delete forever',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/communications/purge`, {
        method: 'POST',
        body: JSON.stringify(trashTargetForThread(thread)),
      });
      if (openThreadId === thread.id) setOpenThreadId(null);
      toast({ title: 'Deleted forever' });
      await load({ soft: true });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Could not delete forever',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function markThreadRead(threadId: string) {
    await apiFetch(`/triage/submissions/${submissionId}/communications/threads/${threadId}/read`, {
      method: 'POST',
    });
    await load({ soft: true });
  }

  async function retryMessage(messageId: string) {
    setBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/communications/messages/${messageId}/retry`, {
        method: 'POST',
      });
      toast({ title: 'Email resent', description: 'The message was sent again.' });
      await load();
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Retry failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  function openThreadTrail(thread: CommunicationThread, messageId?: string) {
    if (mailbox === 'drafts') {
      const draft =
        thread.messages.find((m) => m.isDraft || m.status === 'DRAFT') || thread.messages[0];
      if (draft) openDraft(draft);
      return;
    }
    setOpenThreadId(thread.id);
    const target =
      messageId ||
      thread.messages[thread.messages.length - 1]?.id ||
      null;
    if (target) {
      setExpandedMessageIds((prev) => ({ ...prev, [thread.id]: target }));
    }
    if (thread.unreadCount > 0) {
      void markThreadRead(thread.id);
    }
  }

  function closeThreadTrail() {
    setOpenThreadId(null);
  }

  function toggleMessage(threadId: string, messageId: string) {
    setExpandedMessageIds((prev) => ({
      ...prev,
      [threadId]: prev[threadId] === messageId ? null : messageId,
    }));
  }

  function switchMailbox(next: Mailbox) {
    setMailbox(next);
    setOpenThreadId(null);
  }

  const showInlineReply =
    composeOpen
    && Boolean(openThread)
    && (composeMode === 'reply' || composeMode === 'reply-all')
    && !composePoppedOut;

  useEffect(() => {
    if (!openThread) return;
    const frame = window.requestAnimationFrame(() => {
      threadCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openThread?.id]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Loading communications…
      </div>
    );
  }

  const client = data?.client || {
    name: [item.firstName, item.lastName].filter(Boolean).join(' '),
    company: item.organisationName,
    email: item.email,
    phone: item.phone,
    hasEmail: Boolean(item.email),
    hasPhone: Boolean(item.phone),
  };

  const activeSearch = searchQuery.trim();
  const searchPlaceholder = 'Search emails...';
  const emptySearchLabel =
    apiFilter === 'email'
      ? `No emails found for "${activeSearch}".`
      : `No communications found for "${activeSearch}".`;
  const emptyDefaultLabel =
    mailbox === 'sent'
      ? 'No sent emails'
      : mailbox === 'drafts'
        ? 'No drafts'
        : mailbox === 'trash'
          ? 'Trash is empty'
          : 'No emails in inbox';
  const listHasRows =
    visibleEmailThreadRows.length > 0
    || (mailbox === 'inbox' && callListItems.length > 0);

  const mailboxTabs: { id: Mailbox; label: string }[] = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'sent', label: 'Sent' },
    { id: 'drafts', label: 'Drafts' },
    { id: 'trash', label: 'Trash' },
  ];

  const composerClientName =
    data?.client.name || [item.firstName, item.lastName].filter(Boolean).join(' ').trim() || 'Client';
  const composerClientEmail = data?.client.email || item.email || '';
  const showFloatingCompose = composeOpen && !showInlineReply;

  const composerSharedProps = {
    mode: composeMode,
    clientName: composerClientName,
    clientEmail: composerClientEmail,
    triageReference,
    draft: emailDraft,
    onDraftChange: setEmailDraft,
    minimized: composeMinimized,
    expanded: composeExpanded,
    showCc,
    showBcc,
    showQuoted: showComposeQuoted,
    quotedText: composeQuoted,
    attachments: composeAttachments,
    onAttachmentsChange: setComposeAttachments,
    busy,
    sending,
    draftStatus,
    onMinimize: () => setComposeMinimized(true),
    onRestore: () => setComposeMinimized(false),
    onExpand: () => setComposeExpanded((v) => !v),
    onClose: closeCompose,
    onDiscard: discardCompose,
    onToggleCc: () => setShowCc((v) => !v),
    onToggleBcc: () => setShowBcc((v) => !v),
    onToggleQuoted: () => setShowComposeQuoted((v) => !v),
    onSend: (options?: { markContacted?: boolean }) => void sendEmail(false, options?.markContacted),
    onSaveDraft: () => void sendEmail(true),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {newEmailBannerCount != null && newEmailBannerCount > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <span>
              New email received
              {newEmailBannerCount > 1 ? ` (${newEmailBannerCount})` : ''}
            </span>
            <button
              type="button"
              className="rounded p-1 text-sky-700 hover:bg-sky-100"
              onClick={() => setNewEmailBannerCount(null)}
              aria-label="Dismiss new email notification"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 border-slate-200 bg-white pl-9 pr-16"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {loading && data ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
              {searchInput ? (
                <button
                  type="button"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                  }}
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!client.hasEmail || busy}
              onClick={() => openCompose()}
            >
              <Mail className="size-4" />
              Compose email
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void checkInbox()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
              Check inbox
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-sm">
          {mailboxTabs.map((tab, index) => (
            <div key={tab.id} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="px-1 text-slate-300" aria-hidden="true">
                  |
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => switchMailbox(tab.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium transition-colors',
                  mailbox === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {tab.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {!listHasRows ? (
        <Card className="rounded-xl border-dashed border-slate-300 shadow-sm">
          <CardContent className="space-y-4 py-10 text-center">
            <MessageSquare className="mx-auto size-8 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {activeSearch ? emptySearchLabel : emptyDefaultLabel}
              </p>
              {!activeSearch && mailbox === 'inbox' ? (
                <p className="mt-1 text-sm text-slate-600">
                  Compose an email from this triage to start the conversation history.
                </p>
              ) : null}
            </div>
            {activeSearch ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
              >
                Clear search
              </Button>
            ) : mailbox === 'inbox' ? (
              <Button type="button" disabled={!client.hasEmail} onClick={() => openCompose()}>
                Compose email
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : openThread ? (
        <Card
          ref={threadCardRef}
          className="flex h-[min(44rem,calc(100dvh-13rem))] max-h-[calc(100dvh-13rem)] scroll-mt-20 flex-col overflow-hidden rounded-xl border-slate-200 shadow-sm"
        >
          <GmailThreadView
            submissionId={submissionId}
            thread={openThread}
            subject={openThread.subject || openThread.messages[openThread.messages.length - 1]?.subject || 'Conversation'}
            clientName={client.name}
            mailbox={mailbox}
            expandedMessageId={expandedMessageIds[openThread.id] || null}
            onToggleMessage={(messageId) => toggleMessage(openThread.id, messageId)}
            onReply={() => openCompose(openThread)}
            onReplyAll={() => openCompose(openThread, { mode: 'reply-all' })}
            onForward={() => openCompose(openThread, { mode: 'forward' })}
            onRetry={(messageId) => void retryMessage(messageId)}
            onBack={closeThreadTrail}
            busy={busy}
            replyOpen={showInlineReply}
            analystLabel={analystLabel}
            inlineComposer={
              showInlineReply ? (
                <EmailComposer
                  {...composerSharedProps}
                  variant="inline"
                  onPopOut={() => setComposePoppedOut(true)}
                />
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="flex h-[min(44rem,calc(100dvh-13rem))] max-h-[calc(100dvh-13rem)] flex-col overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-[#f1f3f4]">
            {visibleEmailThreadRows.map((thread) => (
              <GmailInboxRow
                key={thread.id}
                thread={thread}
                clientName={client.name}
                highlightQuery={activeSearch}
                mailbox={mailbox}
                canManageTrash={canManageTrash}
                busy={busy}
                onClick={() => openThreadTrail(thread)}
                onTrash={() => void trashThread(thread)}
                onRestore={() => void restoreThread(thread)}
                onPurge={() => void purgeThread(thread)}
              />
            ))}

            {mailbox === 'inbox' &&
              callListItems.map((message) => (
                <StandaloneCommRow
                  key={message.id}
                  message={message}
                  clientName={client.name}
                  highlightQuery={activeSearch}
                  onRetry={() => void retryMessage(message.id)}
                  busy={busy}
                />
              ))}
          </div>
        </Card>
      )}

      {showFloatingCompose ? (
        <EmailComposer
          {...composerSharedProps}
          variant="floating"
        />
      ) : null}

      <Sheet open={callOpen} onOpenChange={setCallOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Log client call</SheetTitle>
            <SheetDescription>Record the outcome of a telephone conversation with this client.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Telephone</label>
              <Input value={client.phone || ''} readOnly />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Direction</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={callDraft.direction}
                onChange={(e) => setCallDraft((d) => ({ ...d, direction: e.target.value }))}
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Outcome</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={callDraft.outcome}
                onChange={(e) => setCallDraft((d) => ({ ...d, outcome: e.target.value }))}
              >
                <option value="CLIENT_REACHED">Client reached</option>
                <option value="NO_ANSWER">No answer</option>
                <option value="VOICEMAIL">Voicemail</option>
                <option value="WRONG_NUMBER">Wrong number</option>
                <option value="CALLBACK_REQUESTED">Call back requested</option>
                <option value="MEETING_ARRANGED">Meeting arranged</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Duration (seconds)</label>
              <Input
                type="number"
                min={0}
                value={callDraft.durationSeconds}
                onChange={(e) => setCallDraft((d) => ({ ...d, durationSeconds: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Notes</label>
              <Textarea
                rows={5}
                value={callDraft.notes}
                onChange={(e) => setCallDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={callDraft.followUpRequired}
                onChange={(e) => setCallDraft((d) => ({ ...d, followUpRequired: e.target.checked }))}
              />
              Follow-up required
            </label>
            {callDraft.followUpRequired ? (
              <Input
                type="datetime-local"
                value={callDraft.followUpDate}
                onChange={(e) => setCallDraft((d) => ({ ...d, followUpDate: e.target.value }))}
              />
            ) : null}
          </div>
          <SheetFooter className="mt-6">
            <Button type="button" disabled={busy} onClick={() => void saveCall()}>
              Save call
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GmailInboxRow({
  thread,
  clientName,
  highlightQuery = '',
  mailbox,
  canManageTrash,
  busy,
  onClick,
  onTrash,
  onRestore,
  onPurge,
}: {
  thread: CommunicationThread;
  clientName: string;
  highlightQuery?: string;
  mailbox: Mailbox;
  canManageTrash: boolean;
  busy: boolean;
  onClick: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const [starred, setStarred] = useState(false);
  const emailMessages = thread.messages.filter((message) => !message.type.includes('CALL'));
  const lastMessage = emailMessages[emailMessages.length - 1];
  if (!lastMessage) return null;

  const unread = thread.unreadCount > 0 || lastMessage.isRead === false;
  const sender = messageSenderLabel(lastMessage, clientName);
  const subject = thread.subject || lastMessage.subject || 'Conversation';
  const snippet = messageSnippet(lastMessage);
  const when = lastMessage.sentAt || lastMessage.receivedAt || lastMessage.createdAt;
  const hasAttachments = emailMessages.some((message) => (message.attachments?.length || 0) > 0);
  const messageCount = emailMessages.length;
  const inTrash = mailbox === 'trash';

  return (
    <div
      className={cn(
        'group flex w-full cursor-pointer items-center gap-2 px-2 py-0 text-left transition-colors hover:z-10 hover:shadow-sm',
        unread ? 'bg-[#e8f0fe]/60 hover:bg-[#e8f0fe]' : 'bg-white hover:bg-[#f5f5f5]',
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex w-28 shrink-0 items-center gap-1 sm:w-32">
        <input
          type="checkbox"
          className="size-4 shrink-0 rounded border-[#dadce0] text-[#0b57d0]"
          onClick={(e) => e.stopPropagation()}
          onChange={() => undefined}
          aria-label="Select conversation"
        />
        <button
          type="button"
          className="rounded-full p-1.5 text-[#5f6368] hover:bg-black/5"
          onClick={(e) => {
            e.stopPropagation();
            setStarred((v) => !v);
          }}
          aria-label={starred ? 'Unstar' : 'Star'}
        >
          <Star className={cn('size-4', starred ? 'fill-amber-400 text-amber-400' : 'text-[#5f6368]')} />
        </button>
        <ChevronRight
          className={cn('size-4 shrink-0', unread ? 'text-amber-400' : 'text-[#dadce0]')}
          aria-hidden="true"
        />
      </div>

      <div className="w-[100px] shrink-0 truncate text-[14px] sm:w-[140px] lg:w-[180px]">
        <span className={cn(unread ? 'font-bold text-[#202124]' : 'font-normal text-[#202124]')}>
          {highlightMatch(sender, highlightQuery)}
        </span>
        {messageCount > 1 ? (
          <span className="ml-1 font-normal text-[#5f6368]">{messageCount}</span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 truncate py-3 text-[14px] leading-none">
        <span className={cn('text-[#202124]', unread ? 'font-bold' : 'font-normal')}>
          {highlightMatch(subject, highlightQuery)}
        </span>
        {snippet ? (
          <span className="font-normal text-[#5f6368]"> — {highlightMatch(snippet, highlightQuery)}</span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1 py-3 pr-2 text-[12px] text-[#5f6368]">
        <div
          className={cn(
            'mr-1 flex items-center gap-0.5',
            inTrash ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {inTrash ? (
            <>
              <button
                type="button"
                className="rounded-full p-1.5 text-[#5f6368] hover:bg-black/5 hover:text-[#202124]"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
                aria-label="Restore"
                title="Restore"
              >
                <RotateCcw className="size-4" />
              </button>
              {canManageTrash ? (
                <button
                  type="button"
                  className="rounded-full p-1.5 text-[#5f6368] hover:bg-black/5 hover:text-red-600"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPurge();
                  }}
                  aria-label="Delete forever"
                  title="Delete forever"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className="rounded-full p-1.5 text-[#5f6368] hover:bg-black/5 hover:text-red-600"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onTrash();
              }}
              aria-label="Move to trash"
              title="Move to trash"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
        {hasAttachments ? <Paperclip className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className="whitespace-nowrap tabular-nums">{fmtGmailDate(when)}</span>
      </div>
    </div>
  );
}

function GmailThreadView({
  submissionId,
  thread,
  subject,
  clientName,
  mailbox,
  expandedMessageId,
  onToggleMessage,
  onReply,
  onReplyAll,
  onForward,
  onRetry,
  onBack,
  busy,
  replyOpen,
  analystLabel,
  inlineComposer,
}: {
  submissionId: string;
  thread: CommunicationThread;
  subject: string;
  clientName: string;
  mailbox: Mailbox;
  expandedMessageId: string | null;
  onToggleMessage: (messageId: string) => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onRetry: (messageId: string) => void;
  onBack: () => void;
  busy: boolean;
  replyOpen?: boolean;
  analystLabel?: string;
  inlineComposer?: ReactNode;
}) {
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const mailboxLabel =
    mailbox === 'sent'
      ? 'Sent'
      : mailbox === 'drafts'
        ? 'Drafts'
        : mailbox === 'trash'
          ? 'Trash'
          : 'Inbox';

  const scrollThreadForReply = useCallback(() => {
    const scroll = messagesScrollRef.current;
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  }, []);

  useEffect(() => {
    if (!inlineComposer) return;
    const frame = window.requestAnimationFrame(() => {
      scrollThreadForReply();
    });
    const timeout = window.setTimeout(scrollThreadForReply, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [inlineComposer, thread.messages.length, expandedMessageId, scrollThreadForReply]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-100 px-3 pb-3 pt-2">
        <button
          type="button"
          className="mb-1 inline-flex items-center gap-1.5 rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100"
          onClick={onBack}
          aria-label="Back to list"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <div className="flex flex-wrap items-center gap-2 px-3">
          <h2 className="text-[22px] font-normal leading-tight text-slate-900">{subject}</h2>
          <Star className="size-[18px] shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {mailboxLabel}
          </span>
        </div>
      </div>

      <div
        ref={messagesScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="pb-2 pt-1">
          {thread.messages.map((message) => (
            <GmailThreadMessage
              key={message.id}
              submissionId={submissionId}
              message={message}
              clientName={clientName}
              expanded={expandedMessageId === message.id}
              onToggle={() => onToggleMessage(message.id)}
              onReply={onReply}
              onRetry={() => onRetry(message.id)}
              busy={busy}
            />
          ))}
        </div>

        {inlineComposer ? (
          <div
            ref={composerRef}
            className="sticky bottom-0 z-[1] border-t border-transparent bg-gradient-to-t from-white via-white to-white/95 px-4 pb-4 pt-2"
          >
            <div className="flex items-end gap-3">
              <span
                className={cn(
                  'mb-3 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  avatarColor('OUTBOUND'),
                )}
                title={analystLabel || 'Me'}
                aria-hidden="true"
              >
                {senderInitials(analystLabel || 'Me')}
              </span>
              <div className="min-w-0 flex-1" onInput={replyOpen ? scrollThreadForReply : undefined}>
                {inlineComposer}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-6 py-5">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={onReply}
            >
              <CornerUpLeft className="size-4" aria-hidden="true" />
              Reply
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={onReplyAll}
            >
              <CornerUpLeft className="size-4" aria-hidden="true" />
              Reply all
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={onForward}
            >
              <CornerUpRight className="size-4" aria-hidden="true" />
              Forward
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GmailThreadMessage({
  submissionId,
  message,
  clientName,
  expanded,
  onToggle,
  onReply,
  onRetry,
  busy,
}: {
  submissionId: string;
  message: CommunicationMessage;
  clientName: string;
  expanded: boolean;
  onToggle: () => void;
  onReply: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const { toast } = useToast();
  const [showQuoted, setShowQuoted] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const [preview, setPreview] = useState<{
    id: string;
    filename: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const sender = messageSenderLabel(message, clientName);
  const when = message.sentAt || message.receivedAt || message.createdAt;
  const whenLabel = fmtGmailThreadDateTime(when);
  const snippet = messageSnippet(message);
  const rawBody = (message.textBody || message.previewText || '').trim();
  const { main, quoted } = splitEmailBody(rawBody);
  const hasAttachments = (message.attachments?.length || 0) > 0;
  const toLabel =
    message.direction === 'INBOUND'
      ? 'to me'
      : message.toAddresses?.length
        ? `to ${message.toAddresses[0]}`
        : 'to client';

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  async function openAttachmentPreview(attachment: {
    id: string;
    filename: string;
    mimeType?: string | null;
  }) {
    setPreviewLoadingId(attachment.id);
    try {
      const blob = await apiFetchBlob(
        `/triage/submissions/${submissionId}/communications/attachments/${attachment.id}?disposition=inline`,
      );
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return {
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType || blob.type || 'application/octet-stream',
          url,
        };
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Unable to open attachment',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function downloadAttachment(attachmentId: string, filename: string) {
    try {
      const blob = await apiFetchBlob(
        `/triage/submissions/${submissionId}/communications/attachments/${attachmentId}?disposition=attachment`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Unable to download attachment',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 px-6 py-2 text-left transition-colors hover:bg-slate-50/80"
        onClick={onToggle}
      >
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            avatarColor(message.direction),
          )}
        >
          {senderInitials(sender)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-snug">
          <span className="font-semibold text-slate-900">{sender}</span>
          <span className="font-normal text-slate-600"> {snippet}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {hasAttachments ? <Paperclip className="size-3.5 shrink-0" aria-hidden="true" /> : null}
          <span className="hidden whitespace-nowrap sm:inline">{whenLabel}</span>
          <span className="whitespace-nowrap sm:hidden">{fmtGmailDate(when)}</span>
        </span>
      </button>
    );
  }

  const previewIsImage = Boolean(preview?.mimeType.startsWith('image/'));
  const previewIsPdf =
    Boolean(preview?.mimeType.includes('pdf')) || Boolean(preview?.filename.toLowerCase().endsWith('.pdf'));

  return (
    <div className="border-t border-slate-100 px-6 py-4">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            avatarColor(message.direction),
          )}
        >
          {senderInitials(sender)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] leading-snug text-slate-900">
                <span className="font-semibold">{sender}</span>
                <span className="ml-1 font-normal text-slate-500">&lt;{message.fromAddress}&gt;</span>
              </p>
              <button
                type="button"
                className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-slate-700"
                onClick={() => setShowRecipients((v) => !v)}
              >
                {toLabel}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
              {showRecipients ? (
                <div className="mt-2 space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p>
                    <span className="font-medium text-slate-500">from: </span>
                    {message.fromAddress}
                  </p>
                  <p>
                    <span className="font-medium text-slate-500">to: </span>
                    {message.toAddresses.join(', ') || '—'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-500">date: </span>
                    {whenLabel}
                  </p>
                  {message.subject ? (
                    <p>
                      <span className="font-medium text-slate-500">subject: </span>
                      {message.subject}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <span className="mr-2 hidden whitespace-nowrap text-xs text-slate-500 sm:inline">{whenLabel}</span>
              <button type="button" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Star">
                <Star className="size-4" />
              </button>
              <button type="button" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Add reaction">
                <Smile className="size-4" />
              </button>
              <button type="button" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Reply" onClick={onReply}>
                <CornerUpLeft className="size-4" />
              </button>
              <button type="button" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="More">
                <MoreVertical className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 text-[13px] leading-relaxed text-slate-800">
            {main ? <div className="whitespace-pre-wrap">{main}</div> : <span className="text-slate-500">—</span>}
            {quoted ? (
              <div className="mt-4">
                {!showQuoted ? (
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-500 hover:bg-slate-50"
                    onClick={() => setShowQuoted(true)}
                    aria-label="Show quoted text"
                  >
                    ···
                  </button>
                ) : (
                  <div className="mt-2 whitespace-pre-wrap border-l-2 border-slate-200 pl-3 text-slate-500">
                    {quoted}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {hasAttachments ? (
            <div className="mt-5 border-t border-dotted border-slate-300 pt-3">
              <p className="text-xs text-slate-500">
                {message.attachments!.length === 1
                  ? 'One attachment'
                  : `${message.attachments!.length} attachments`}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {message.attachments!.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    className="w-[112px] overflow-hidden rounded-md border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                    onClick={() => void openAttachmentPreview(attachment)}
                    disabled={previewLoadingId === attachment.id}
                    title={`Preview ${attachment.filename}`}
                  >
                    <div className="flex h-[72px] items-center justify-center bg-slate-50">
                      {previewLoadingId === attachment.id ? (
                        <Loader2 className="size-5 animate-spin text-slate-400" aria-hidden="true" />
                      ) : attachment.mimeType?.includes('pdf') ? (
                        <FileText className="size-8 text-red-500" aria-hidden="true" />
                      ) : (
                        <Paperclip className="size-6 text-slate-400" aria-hidden="true" />
                      )}
                    </div>
                    <div className="truncate border-t border-slate-100 px-2 py-1.5 text-[11px] text-slate-700">
                      {attachment.filename}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {message.status === 'FAILED' || message.canRetry ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dotted border-slate-200 pt-3">
              <Badge variant={message.status === 'FAILED' ? 'danger' : 'secondary'}>{message.statusLabel}</Badge>
              {message.canRetry ? (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRetry}>
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) {
            setPreview((prev) => {
              if (prev?.url) URL.revokeObjectURL(prev.url);
              return null;
            });
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(960px,95vw)] max-w-4xl flex-col gap-3 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.filename || 'Attachment'}</DialogTitle>
            <DialogDescription>Attachment preview</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-slate-50">
            {previewIsImage && preview ? (
              <img src={preview.url} alt={preview.filename} className="mx-auto max-h-[70vh] object-contain" />
            ) : previewIsPdf && preview ? (
              <iframe title={preview.filename} src={preview.url} className="h-[70vh] w-full" />
            ) : preview ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <FileText className="size-10 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-600">
                  Preview is not available for this file type. You can download it instead.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            {preview ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadAttachment(preview.id, preview.filename)}
              >
                Download
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() =>
                setPreview((prev) => {
                  if (prev?.url) URL.revokeObjectURL(prev.url);
                  return null;
                })
              }
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StandaloneCommRow({
  message,
  clientName,
  highlightQuery = '',
  onRetry,
  busy,
}: {
  message: CommunicationMessage;
  clientName: string;
  highlightQuery?: string;
  onRetry: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCall = message.type.includes('CALL');
  const sender = messageSenderLabel(message, clientName);
  const when = fmtGmailDate(message.sentAt || message.receivedAt || message.createdAt);
  const snippet = messageSnippet(message) || message.typeLabel;

  return (
    <div className="bg-white">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <Phone className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="w-[140px] shrink-0 truncate text-sm font-medium text-slate-700 sm:w-[180px]">
          {highlightMatch(sender, highlightQuery)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-slate-800">
            {highlightMatch(message.typeLabel, highlightQuery)}
          </span>
          <span className="text-slate-500"> — {highlightMatch(snippet, highlightQuery)}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-slate-500">{when}</span>
      </button>
      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 pl-11 text-sm text-slate-700">
          {message.telephoneNumber ? <p className="text-xs text-slate-500">{message.telephoneNumber}</p> : null}
          <p className="mt-1 whitespace-pre-wrap">{message.previewText || message.textBody || '—'}</p>
          {!isCall && message.canRetry ? (
            <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
