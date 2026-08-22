'use client';

import { useEffect, useState } from 'react';
import { API_URL, getToken } from '@/lib/api';
import { isInlineType } from './helpers';
import type { VersionItem } from './types';

export function useVersionPreview(version: VersionItem | null | undefined) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      if (!version?.id || !isInlineType(version.mimeType, version.originalFileName)) {
        setPreviewUrl(null);
        setError('');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      setPreviewUrl(null);
      try {
        const response = await fetch(`${API_URL}/versions/${version.id}/view`, {
          headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
          credentials: 'same-origin',
        });
        if (!response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = await response.json().catch(() => null) as { message?: string } | null;
            throw new Error(body?.message || 'Preview could not be loaded.');
          }
          throw new Error('Preview could not be loaded.');
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/html')) {
          throw new Error('Preview returned an error body instead of the file.');
        }
        const blob = await response.blob();
        const contentLength = response.headers.get('content-length');
        if (contentLength && blob.size !== Number(contentLength)) {
          throw new Error('Preview download was truncated.');
        }
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPreviewUrl(objectUrl);
      } catch (caught) {
        if (!cancelled) {
          setPreviewUrl(null);
          setError(caught instanceof Error ? caught.message : 'Preview could not be loaded.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [version?.id, version?.mimeType, version?.originalFileName]);

  return { previewUrl, loading, error };
}
