'use client';

import { useEffect, useState } from 'react';
import { API_URL, getToken } from '@/lib/api';
import { isInlineType } from '../helpers';
import type { VersionItem } from '../types';

export function useVersionPreview(version: VersionItem | null | undefined) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      if (!version?.id || !isInlineType(version.mimeType)) {
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
        if (!response.ok) throw new Error('Preview could not be loaded.');
        const blob = await response.blob();
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
  }, [version?.id, version?.mimeType]);

  return { previewUrl, loading, error };
}
