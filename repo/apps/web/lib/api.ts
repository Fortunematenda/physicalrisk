import { ApiError } from './api-error';
import { getSsoToken, isLoggingOut, isSsoEnabled, redirectToLogin } from './sso';
import { friendlyErrorMessage } from './user-errors';

/** Browser calls go through the Next.js BFF (`/api/gw`). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/gw';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('gateway_token');
}

async function prepareHeaders(options: RequestInit = {}): Promise<Headers> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const useBff = API_URL.includes('/api/gw');
  if (useBff) {
    // BFF authenticates via NextAuth session cookie and refreshes Keycloak tokens.
    // Never attach a stale local JWT — it causes intermittent "Invalid or expired token".
    headers.delete('Authorization');
    if (typeof window !== 'undefined' && (await isSsoEnabled())) {
      window.localStorage.removeItem('gateway_token');
    }
  } else {
    const token = await getSsoToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login') &&
    !isLoggingOut()
  ) {
    window.localStorage.removeItem('gateway_token');
    await redirectToLogin(window.location.pathname, true);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message ?? 'Request failed';
    const err = new ApiError(message, response.status, payload.code, payload.details);
    err.message = friendlyErrorMessage(err, message);
    throw err;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await prepareHeaders(options);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return handleResponse<T>(response);
}

/** Multipart upload via BFF (session cookie + automatic token refresh). */
export async function apiFormData<T = any>(path: string, body: FormData, init: RequestInit = {}): Promise<T> {
  const headers = await prepareHeaders({ ...init, body });
  headers.delete('Content-Type');
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method || 'POST',
    ...init,
    headers,
    body,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return handleResponse<T>(response);
}

export const formatDate = (value?: string | Date | null) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: typeof value === 'string' && value.includes('T') ? 'short' : undefined }).format(new Date(value)) : '—';
export const formatBytes = (value?: number) => {
  if (!value && value !== 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};
