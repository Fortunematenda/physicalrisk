'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
  /** Cap editor body height; content scrolls inside. */
  maxHeightClassName?: string;
  disabled?: boolean;
};

type RichTextFlushFn = () => void;

const richTextFlushers = new Set<RichTextFlushFn>();

function registerRichTextFlush(fn: RichTextFlushFn) {
  richTextFlushers.add(fn);
  return () => {
    richTextFlushers.delete(fn);
  };
}

/**
 * Push every mounted TipTap editor's current HTML into its React onChange.
 * Call before Save / Preview so last keystrokes are not left only in the editor DOM.
 */
export function flushAllRichTextEditors() {
  richTextFlushers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore individual editor failures
    }
  });
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // Keep selection / avoid focus thrash that feels "sticky"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'rounded p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900',
        active && 'bg-slate-100 text-slate-900',
      )}
    >
      {children}
    </button>
  );
}

/** Convert plain text (legacy proposal fields) into simple paragraph HTML. */
export function plainTextToHtml(value: string): string {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function normalizeHtml(html: string): string {
  const trimmed = String(html || '').trim();
  if (!trimmed || trimmed === '<p></p>' || trimmed === '<p><br></p>' || trimmed === '<p><br/></p>') {
    return '';
  }
  // Normalize empty paragraph variants so controlled re-renders don't fight TipTap,
  // and intentional blank lines between paragraphs survive as <p><br></p>.
  return trimmed
    .replace(/<p>\s*<\/p>/gi, '<p><br></p>')
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '<p><br></p>');
}

/** Compare HTML ignoring empty-paragraph spelling so setContent does not thrash. */
function htmlEquiv(a: string, b: string): boolean {
  const norm = (v: string) =>
    normalizeHtml(v)
      .replace(/<p><br><\/p>/gi, '<p><br></p>')
      .replace(/\s+/g, ' ')
      .trim();
  return norm(a) === norm(b);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text…',
  className,
  minHeightClassName = 'min-h-[120px]',
  maxHeightClassName,
  disabled = false,
}: RichTextEditorProps) {
  const lastEmittedRef = useRef(normalizeHtml(value));
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: plainTextToHtml(value) || '',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'max-w-none px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none',
          'break-words [overflow-wrap:anywhere] [&_p]:my-1 [&_p]:min-h-[1.25em] [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
          '[&_strong]:font-semibold [&_em]:italic [&_u]:underline',
          minHeightClassName,
        ),
      },
      handleDOMEvents: {
        // Stop the dialog scroll container from jumping when the editor is focused.
        focus: (_view, event) => {
          const target = event.target as HTMLElement | null;
          const scroller = target?.closest?.('.overflow-y-auto') as HTMLElement | null;
          if (scroller) {
            scrollParentRef.current = scroller;
            const top = scroller.scrollTop;
            requestAnimationFrame(() => {
              if (scrollParentRef.current) scrollParentRef.current.scrollTop = top;
            });
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Always accept keystrokes from a focused editor. Skipping updates when a
      // Radix ancestor had [hidden] made Understanding appear "not editable".
      if (!ed.isFocused) {
        const dom = ed.view?.dom as HTMLElement | undefined;
        if (dom?.closest?.('[hidden], .hidden, .proposal-tab-inactive')) return;
      }
      const html = normalizeHtml(ed.getHTML());
      lastEmittedRef.current = html;
      onChangeRef.current(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = normalizeHtml(plainTextToHtml(value));
    const current = normalizeHtml(editor.getHTML());
    // Never clobber an in-progress blank line the user just inserted.
    if (htmlEquiv(next, current) || htmlEquiv(next, lastEmittedRef.current)) return;
    if (editor.isFocused) return;
    editor.commands.setContent(next || '', { emitUpdate: false });
    lastEmittedRef.current = next;
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    return registerRichTextFlush(() => {
      // Always flush — including force-mounted / visually hidden tab panels —
      // so blank lines and last keystrokes are not dropped on tab switch.
      const html = normalizeHtml(editor.getHTML());
      // Never flush an empty shell over content we already emitted / were given.
      if (!html && lastEmittedRef.current) return;
      if (htmlEquiv(html, lastEmittedRef.current)) return;
      lastEmittedRef.current = html;
      onChangeRef.current(html);
    });
  }, [editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-md border border-slate-200 bg-white',
          minHeightClassName,
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm',
        'transition-[border-color,box-shadow] duration-150',
        'focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-300',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-2 py-1">
        <ToolbarButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
      </div>

      {/* Cap height when requested; chain wheel to the page at scroll edges. */}
      <div
        className={cn(
          'min-h-0 min-w-0 [overflow-anchor:none]',
          maxHeightClassName ? 'overflow-y-auto overscroll-y-auto' : 'overflow-visible',
          minHeightClassName,
          maxHeightClassName,
        )}
        onWheel={(e) => {
          if (!maxHeightClassName) return;
          const el = e.currentTarget;
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
            // Let the page scroll instead of trapping the wheel in an empty editor scroll.
            window.scrollBy({ top: e.deltaY, left: 0, behavior: 'auto' });
          }
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor.commands.focus('end');
          }
        }}
      >
        <EditorContent editor={editor} className="min-w-0 [&_.ProseMirror]:min-h-[inherit]" />
      </div>
    </div>
  );
}
