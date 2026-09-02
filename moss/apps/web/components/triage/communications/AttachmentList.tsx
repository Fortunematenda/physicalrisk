'use client';

import { Loader2, Paperclip, X } from 'lucide-react';
import { formatFileSize } from './email-composer-utils';

type AttachmentItem = {
  file: File;
  status?: 'uploading' | 'ready' | 'failed';
};

type Props = {
  attachments: AttachmentItem[];
  onRemove: (index: number) => void;
};

export function AttachmentList({ attachments, onRemove }: Props) {
  if (!attachments.length) return null;

  return (
    <div className="shrink-0 border-t border-[#eceff1] px-4 py-2">
      <div className="flex flex-wrap gap-2">
        {attachments.map((item, index) => (
          <div
            key={`${item.file.name}-${item.file.size}-${index}`}
            className="inline-flex max-w-[240px] items-center gap-2 rounded-md border border-[#dadce0] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#202124]"
          >
            <Paperclip className="size-3.5 shrink-0 text-[#5f6368]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.file.name}</p>
              <p className="text-[11px] text-[#5f6368]">
                {item.status === 'failed' ? (
                  <span className="text-red-600">Upload failed</span>
                ) : item.status === 'uploading' ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    Uploading…
                  </span>
                ) : (
                  formatFileSize(item.file.size)
                )}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full p-1 text-[#5f6368] hover:bg-[#e8eaed]"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${item.file.name}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
