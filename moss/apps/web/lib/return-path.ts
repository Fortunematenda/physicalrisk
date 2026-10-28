/** Default post-login / app-home route — Executive Governance Triage, not Cost Leakage. */
export const DEFAULT_HOME_PATH = '/triage';

/** Safe in-app return path after SSO (never auth/login intermediates or another origin). */
export function sanitizeReturnPath(raw?: string | null): string {
  if (!raw) return DEFAULT_HOME_PATH;
  let path = raw.trim();
  if (/^https?:/i.test(path)) {
    try {
      const url = new URL(path);
      path = `${url.pathname || '/'}${url.search}${url.hash}`;
    } catch {
      return DEFAULT_HOME_PATH;
    }
  }
  // Browsers treat "/\host" like "//host" (protocol-relative) — never allow either.
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return DEFAULT_HOME_PATH;
  const lower = path.toLowerCase();
  if (
    lower === '/login' ||
    lower.startsWith('/login?') ||
    lower.startsWith('/login#') ||
    lower === '/auth/complete' ||
    lower.startsWith('/auth/complete?') ||
    lower.startsWith('/api/auth')
  ) {
    return DEFAULT_HOME_PATH;
  }
  return path;
}

/** Current in-app location (path + query + hash) to resume after sign-in. */
export function currentReturnPath(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> | null | undefined,
  fallbackPath?: string | null,
): string {
  if (!location) return sanitizeReturnPath(fallbackPath);
  return sanitizeReturnPath(`${location.pathname || fallbackPath || ''}${location.search || ''}${location.hash || ''}`);
}
