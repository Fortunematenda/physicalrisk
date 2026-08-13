import { getSsoToken, isSsoEnabled } from './sso';

/** Browser calls go through the Next.js BFF (`/api/gw`) so the Keycloak access token is attached server-side. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/gw';

export class ApiError extends Error {
  status: number;
  details: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details ?? {};
  }
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('moss_token');
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  // BFF mode: rely on session cookie; do not send stale localStorage Bearer.
  const useBff = API_BASE.includes('/api/gw');
  if (useBff) {
    if (typeof window !== 'undefined' && (await isSsoEnabled())) {
      window.localStorage.removeItem('moss_token');
    }
  } else {
    const token = await getSsoToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    window.localStorage.removeItem('moss_token');
    const { isLoggingOut, redirectToLogin } = await import('./sso');
    // Cooldown stops post-login blink loops when APIs briefly reject a valid SSO token.
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem('moss_401_redirect_at') || '0');
    if (!isLoggingOut() && now - last > 8000) {
      window.sessionStorage.setItem('moss_401_redirect_at', String(now));
      await redirectToLogin(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        true,
      );
    }
  }
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.message || 'Request failed.';
    throw new ApiError(Array.isArray(message) ? message.join(', ') : message, response.status, typeof payload === 'object' ? payload : undefined);
  }
  return payload as T;
}

/** Authenticated binary download (PDF etc.) via the same BFF/session path as apiFetch. */
export async function apiFetchBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers || {});
  const useBff = API_BASE.includes('/api/gw');
  if (useBff) {
    if (typeof window !== 'undefined' && (await isSsoEnabled())) {
      window.localStorage.removeItem('moss_token');
    }
  } else {
    const token = await getSsoToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    const message = typeof payload === 'string' ? payload : payload.message || 'Download failed.';
    throw new ApiError(Array.isArray(message) ? message.join(', ') : message, response.status);
  }
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'application/pdf';
  return new Blob([bytes], { type: contentType.includes('pdf') ? 'application/pdf' : contentType });
}

export const money = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0);
export const pct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
