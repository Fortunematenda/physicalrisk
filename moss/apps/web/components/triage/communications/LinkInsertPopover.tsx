'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultText?: string;
  onInsert: (text: string, url: string) => void;
  children: React.ReactNode;
};

export function LinkInsertPopover({ open, onOpenChange, defaultText, onInsert, children }: Props) {
  const [text, setText] = useState(defaultText || '');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (open) {
      setText(defaultText || '');
      setUrl('');
    }
  }, [open, defaultText]);

  function handleInsert() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    const label = text.trim() || trimmedUrl;
    onInsert(label, trimmedUrl);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="z-[10002] w-72 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Text to display</label>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Link text" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Web address</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleInsert();
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleInsert}>
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
