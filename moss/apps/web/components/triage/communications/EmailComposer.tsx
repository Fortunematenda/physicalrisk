'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  CornerUpLeft,
  Link2,
  Loader2,
  Minus,
  MoreVertical,
  Paperclip,
  SquareArrowOutUpRight,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AttachmentList } from './AttachmentList';
import { FormattingToolbar } from './FormattingToolbar';
import { LinkInsertPopover } from './LinkInsertPopover';
import { RecipientField } from './RecipientField';
import {
  FROM_EMAIL,
  FROM_NAME,
  type ComposeMode,
  type EmailDraft,
  insertAtCursor,
  isSafeAttachment,
  validateRecipients,
  wrapSelection,
} from './email-composer-utils';

export type EmailComposerProps = {
  mode: ComposeMode;
  clientName: string;
  clientEmail: string;
  triageReference?: string;
  draft: EmailDraft;
  onDraftChange: (draft: EmailDraft) => void;
  quotedText?: string;
  showQuoted?: boolean;
  onToggleQuoted?: () => void;
  attachments: File[];
  onAttachmentsChange: (files: File[]) => void;
  minimized: boolean;
  expanded: boolean;
  busy: boolean;
  sending: boolean;
  draftStatus: 'idle' | 'saving' | 'saved';
  showCc: boolean;
  showBcc: boolean;
  /** floating = Gmail popup for new mail; inline = reply box inside the thread */
  variant?: 'floating' | 'inline';
  onToggleCc: () => void;
  onToggleBcc: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onExpand: () => void;
  onClose: () => void;
  onDiscard: () => void;
  onSend: (options?: { markContacted?: boolean }) => void;
  onSaveDraft: () => void;
  /** Switch an inline reply into the floating compose window */
  onPopOut?: () => void;
};

function headerTitle(mode: ComposeMode, clientName: string) {
  switch (mode) {
    case 'reply':
      return `Reply to ${clientName}`;
    case 'reply-all':
      return `Reply all to ${clientName}`;
    case 'forward':
      return 'Forward message';
    default:
      return 'New message';
  }
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded p-1.5 text-[#444746] hover:bg-black/5 disabled:opacity-50"
          onClick={onClick}
          aria-label={label}
          disabled={disabled}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function EmailComposer({
  mode,
  clientName,
  clientEmail,
  triageReference,
  draft,
  onDraftChange,
  quotedText,
  showQuoted,
  onToggleQuoted,
  attachments,
  onAttachmentsChange,
  minimized,
  expanded,
  busy,
  sending,
  draftStatus,
  showCc,
  showBcc,
  variant = 'floating',
  onToggleCc,
  onToggleBcc,
  onMinimize,
  onRestore,
  onExpand,
  onClose,
  onDiscard,
  onSend,
  onSaveDraft,
  onPopOut,
}: EmailComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showRecipients, setShowRecipients] = useState(mode === 'new' || mode === 'forward');

  const isInline = variant === 'inline';
  const title = headerTitle(mode, clientName);
  const hasContent = Boolean(
    draft.to.trim() || draft.subject.trim() || draft.message.trim() || attachments.length,
  );
  const recipientLabel =
    draft.to.trim() || `${clientName}${clientEmail ? ` (${clientEmail})` : ''}`;

  useEffect(() => {
    if (minimized && !isInline) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [minimized, mode, isInline]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!textareaRef.current || document.activeElement !== textareaRef.current) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        applyFormat('**', '**');
      }
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        applyFormat('_', '_');
      }
      if (mod && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        applyFormat('<u>', '</u>');
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLinkOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && !discardOpen && !linkOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [discardOpen, linkOpen, onClose]);

  function updateMessage(next: string) {
    onDraftChange({ ...draft, message: next });
  }

  function applyFormat(before: string, after: string) {
    const next = wrapSelection(textareaRef.current, draft.message, before, after);
    updateMessage(next);
  }

  function applyPrefix(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.message.slice(start, end);
    const block = selected || 'List item';
    const lines = block.split('\n').map((line, i) => {
      if (prefix === '1. ') return `${i + 1}. ${line.replace(/^\d+\.\s*/, '')}`;
      if (prefix === '• ') return `• ${line.replace(/^•\s*/, '')}`;
      return line;
    });
    const next = `${draft.message.slice(0, start)}${lines.join('\n')}${draft.message.slice(end)}`;
    updateMessage(next);
  }

  function removeFormatting() {
    const cleaned = draft.message
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/<u>(.*?)<\/u>/g, '$1');
    updateMessage(cleaned);
  }

  function handleInsertLink(text: string, url: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.message.length;
    const end = textarea?.selectionEnd ?? draft.message.length;
    const selected = draft.message.slice(start, end);
    const label = selected || text;
    const insert = `[${label}](${url})`;
    const next = insertAtCursor(textarea, draft.message, insert);
    updateMessage(next);
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList?.length) return;
    const existing = new Set(attachments.map((f) => `${f.name}:${f.size}`));
    const next = [...attachments];
    for (const file of Array.from(fileList)) {
      const key = `${file.name}:${file.size}`;
      if (existing.has(key)) continue;
      if (!isSafeAttachment(file)) continue;
      existing.add(key);
      next.push(file);
    }
    onAttachmentsChange(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSend(markContacted = false) {
    const toError = validateRecipients(draft.to, true);
    const ccError = draft.cc ? validateRecipients(draft.cc) : null;
    const bccError = draft.bcc ? validateRecipients(draft.bcc) : null;
    const error = toError || ccError || bccError;
    if (error) {
      setValidationError(error);
      return;
    }
    if (!draft.subject.trim()) {
      setValidationError('Subject is required.');
      return;
    }
    setValidationError(null);
    onSend({ markContacted });
  }

  function handleTrashClick() {
    if (hasContent) {
      setDiscardOpen(true);
      return;
    }
    onDiscard();
  }

  function getSelectedLinkText() {
    const textarea = textareaRef.current;
    if (!textarea) return '';
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    return draft.message.slice(start, end);
  }

  const draftStatusLabel =
    draftStatus === 'saving' ? 'Saving…' : draftStatus === 'saved' ? 'Saved' : '';

  const toolbar = (
    <div
      className={cn(
        'relative z-20 shrink-0 overflow-visible bg-white',
        isInline ? 'px-0 pt-1' : 'border-t border-[#eceff1] px-3 py-2.5',
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        {isInline ? (
          <>
            <button
              type="button"
              disabled={busy || sending}
              onClick={() => handleSend(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0b57d0] px-4 text-[14px] font-medium text-white hover:bg-[#0b57d0]/90 disabled:opacity-60"
            >
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  Send
                  <Clock className="size-3.5 opacity-90" aria-hidden="true" />
                </>
              )}
            </button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy || sending}
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-[#dadce0] bg-white px-3.5 text-[14px] font-medium text-[#3c4043] hover:bg-[#f1f3f4] disabled:opacity-60"
                  aria-label="Send options"
                >
                  Send
                  <ChevronDown className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                sideOffset={12}
                collisionPadding={16}
                className="z-[10001] min-w-[200px]"
              >
                <DropdownMenuItem disabled={busy || sending} onSelect={() => handleSend(false)}>
                  Send
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || sending} onSelect={() => handleSend(true)}>
                  Send &amp; mark contacted
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || sending} onSelect={() => onSaveDraft()}>
                  Save draft
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <DropdownMenu modal={false}>
            <div className="relative inline-flex shrink-0 overflow-visible">
              <button
                type="button"
                disabled={busy || sending}
                onClick={() => handleSend(false)}
                className="inline-flex h-[36px] items-center gap-1.5 rounded-l-full bg-[#0b57d0] px-5 text-[14px] font-medium text-white hover:bg-[#0b57d0]/90 disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  'Send'
                )}
              </button>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy || sending}
                  className="inline-flex h-[36px] items-center rounded-r-full border-l border-white/20 bg-[#0b57d0] px-2 text-white hover:bg-[#0b57d0]/90 disabled:opacity-60"
                  aria-label="Send options"
                >
                  <ChevronDown className="size-4" />
                </button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={12}
              collisionPadding={16}
              className="z-[10001] min-w-[200px]"
            >
              <DropdownMenuItem disabled={busy || sending} onSelect={() => handleSend(false)}>
                Send
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy || sending} onSelect={() => handleSend(true)}>
                Send &amp; mark contacted
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy || sending} onSelect={() => onSaveDraft()}>
                Save draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button
          type="button"
          className={cn(
            'rounded-full p-2.5 text-[#444746] hover:bg-[#f1f3f4]',
            showFormatBar && 'bg-[#f1f3f4]',
          )}
          aria-label="Formatting options"
          aria-pressed={showFormatBar}
          onClick={() => {
            setShowFormatBar((v) => !v);
            textareaRef.current?.focus();
          }}
        >
          <Type className="size-[18px]" />
        </button>

        <button
          type="button"
          className="rounded-full p-2.5 text-[#444746] hover:bg-[#f1f3f4]"
          aria-label="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-[18px]" />
        </button>

        <LinkInsertPopover
          open={linkOpen}
          onOpenChange={setLinkOpen}
          defaultText={getSelectedLinkText()}
          onInsert={handleInsertLink}
        >
          <button
            type="button"
            className="rounded-full p-2.5 text-[#444746] hover:bg-[#f1f3f4]"
            aria-label="Insert link"
          >
            <Link2 className="size-[18px]" />
          </button>
        </LinkInsertPopover>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full p-2.5 text-[#444746] hover:bg-[#f1f3f4]"
              aria-label="More options"
            >
              <MoreVertical className="size-[18px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="z-[10001] min-w-[160px]">
            <DropdownMenuItem
              onSelect={() => {
                const emoji = window.prompt('Enter emoji or character to insert');
                if (emoji) {
                  const next = insertAtCursor(textareaRef.current, draft.message, emoji);
                  updateMessage(next);
                }
              }}
            >
              Insert emoji
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSaveDraft()}>Save draft</DropdownMenuItem>
            {!showRecipients && isInline ? (
              <DropdownMenuItem onSelect={() => setShowRecipients(true)}>
                Edit recipients / subject
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {draftStatusLabel ? (
          <span className="ml-auto text-[12px] text-[#5f6368]">{draftStatusLabel}</span>
        ) : (
          <span className="ml-auto" />
        )}

        <button
          type="button"
          className="rounded-full p-2.5 text-[#444746] hover:bg-[#f1f3f4]"
          onClick={handleTrashClick}
          aria-label="Discard draft"
        >
          <Trash2 className="size-[18px]" />
        </button>
      </div>
    </div>
  );

  const bodyFields = (
    <>
      {showRecipients || !isInline ? (
        <div className="shrink-0">
          {!isInline ? (
            <div className="flex items-center border-b border-[#eceff1] px-4 py-[9px] text-[14px] text-[#202124] sm:px-5">
              <span className="shrink-0 text-[#5f6368]">From</span>
              <span className="ml-2 min-w-0 truncate">
                {FROM_NAME} &lt;{FROM_EMAIL}&gt;
              </span>
            </div>
          ) : null}

          <RecipientField
            label="To"
            value={draft.to}
            onChange={(to) => onDraftChange({ ...draft, to })}
            chipName={clientName}
            showCcBcc
            onToggleCc={onToggleCc}
            onToggleBcc={onToggleBcc}
            autoFocus={mode === 'new' && !draft.to}
          />

          {showCc ? (
            <RecipientField
              label="Cc"
              value={draft.cc}
              onChange={(cc) => onDraftChange({ ...draft, cc })}
              placeholder="Add Cc recipients"
            />
          ) : null}

          {showBcc ? (
            <RecipientField
              label="Bcc"
              value={draft.bcc}
              onChange={(bcc) => onDraftChange({ ...draft, bcc })}
              placeholder="Add Bcc recipients"
            />
          ) : null}

          <div className="flex items-center border-b border-[#eceff1] px-4 py-[9px] sm:px-5">
            <span className="shrink-0 text-[14px] text-[#5f6368]">Subject</span>
            <input
              type="text"
              className="email-composer-subject ml-2 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[#202124] outline-none placeholder:text-[#70757a] focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none"
              value={draft.subject}
              onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })}
              placeholder="Subject"
            />
          </div>
        </div>
      ) : null}

        {validationError ? (
        <p className="shrink-0 bg-red-50 px-4 py-1.5 text-xs text-red-700 sm:px-5">{validationError}</p>
      ) : null}

      {showFormatBar ? (
        <FormattingToolbar
          onFormat={applyFormat}
          onPrefixLines={applyPrefix}
          onRemoveFormatting={removeFormatting}
        />
      ) : null}

      <div
        className={cn(
          'flex min-h-0 flex-col bg-white',
          isInline ? 'px-0 pt-1' : 'min-h-0 flex-1 overflow-y-auto px-4 pt-3 sm:px-5',
        )}
      >
        <textarea
          ref={textareaRef}
          className={cn(
            'email-composer-message w-full resize-none bg-white text-[14px] leading-relaxed text-[#202124]',
            'placeholder:text-[#70757a] focus:outline-none focus:ring-0',
            isInline
              ? 'email-composer-message--inline min-h-[88px] max-h-[180px]'
              : 'min-h-[280px] max-h-[min(42vh,360px)] rounded-[11px] border border-[#dadce0] px-[18px] py-4 hover:border-[#c0c4c8] focus:border-[#bdc1c6]',
          )}
          value={draft.message}
          onChange={(e) => updateMessage(e.target.value)}
          placeholder={isInline ? '' : 'Write your message…'}
          rows={isInline ? 4 : 12}
        />

        {quotedText ? (
          <div className={cn('shrink-0', isInline ? 'mt-1 pb-1' : 'mt-4 border-t border-[#eceff1] pb-3 pt-3.5')}>
            {!showQuoted ? (
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full border border-[#dadce0] text-xs text-[#5f6368] hover:bg-[#f1f3f4]"
                onClick={onToggleQuoted}
                aria-label="Show quoted text"
              >
                ···
              </button>
            ) : (
              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap border-l-2 border-[#dadce0] pl-3 text-xs leading-relaxed text-[#5f6368]">
                {quotedText.trim()}
              </div>
            )}
          </div>
        ) : (
          <div className={isInline ? 'h-1' : 'h-2'} aria-hidden="true" />
        )}
      </div>

      <AttachmentList
        attachments={attachments.map((file) => ({ file, status: 'ready' as const }))}
        onRemove={(index) => onAttachmentsChange(attachments.filter((_, i) => i !== index))}
      />

      {toolbar}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
    </>
  );

  const discardDialog = (
    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently discard your unsent message. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setDiscardOpen(false);
              onDiscard();
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isInline) {
    return (
      <TooltipProvider delayDuration={300}>
        <div
          className="rounded-[28px] border border-[#dadce0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)]"
          role="form"
          aria-label={title}
        >
          <div className="mb-1 flex items-center gap-1">
            <div className="flex shrink-0 items-center text-[#5f6368]">
              <CornerUpLeft className="size-4" aria-hidden="true" />
              <ChevronDown className="size-3.5 -ml-0.5" aria-hidden="true" />
            </div>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-[14px] text-[#202124] hover:underline"
              onClick={() => setShowRecipients((v) => !v)}
              title="Edit recipients"
            >
              {recipientLabel}
            </button>
            {onPopOut ? (
              <IconButton label="Pop out reply" onClick={onPopOut}>
                <SquareArrowOutUpRight className="size-4" />
              </IconButton>
            ) : null}
          </div>
          {bodyFields}
        </div>
        {discardDialog}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'fixed z-50 flex flex-col bg-white font-[Roboto,Arial,sans-serif]',
          expanded
            ? 'bottom-0 right-0 h-[min(90vh,720px)] w-full overflow-hidden rounded-none border-0 shadow-none sm:right-6 sm:w-[min(640px,calc(100vw-3rem))] sm:rounded-t-lg sm:border sm:border-[#dadce0] sm:shadow-[0_8px_10px_1px_rgba(0,0,0,0.14),0_3px_14px_2px_rgba(0,0,0,0.12)]'
            : 'bottom-4 right-4 w-[min(640px,calc(100vw-2rem))] overflow-visible rounded-lg border border-[#dadce0] shadow-[0_8px_10px_1px_rgba(0,0,0,0.14),0_3px_14px_2px_rgba(0,0,0,0.12)]',
          minimized ? 'h-auto overflow-hidden' : 'h-[min(560px,78vh)] overflow-hidden',
        )}
        role="dialog"
        aria-label={title}
      >
        <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#eceff1] bg-[#f2f6fc] px-3">
          <span className="truncate text-[14px] font-medium text-[#041e49]">{title}</span>
          <div className="flex shrink-0 items-center gap-0.5">
            {minimized ? (
              <IconButton label="Restore" onClick={onRestore}>
                <SquareArrowOutUpRight className="size-4" />
              </IconButton>
            ) : (
              <IconButton label="Minimise" onClick={onMinimize}>
                <Minus className="size-4" strokeWidth={1.75} />
              </IconButton>
            )}
            <IconButton label={expanded ? 'Restore size' : 'Open in new window'} onClick={onExpand}>
              <SquareArrowOutUpRight className="size-4" />
            </IconButton>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>

        {!minimized ? (
          <>
            {(clientName || triageReference) && mode === 'new' ? (
              <div className="shrink-0 border-b border-[#eceff1] bg-[#fafafa] px-[14px] py-1.5 text-[12px] text-[#5f6368]">
                {clientName}
                {triageReference ? <span className="ml-2 text-[#80868b]">{triageReference}</span> : null}
              </div>
            ) : null}
            {bodyFields}
          </>
        ) : null}
      </div>
      {discardDialog}
    </TooltipProvider>
  );
}
