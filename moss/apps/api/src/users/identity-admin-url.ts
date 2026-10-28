/**
 * Link to the Keycloak admin console user list for the MOSS realm.
 *
 * Prefers an explicit KEYCLOAK_ADMIN_CONSOLE_URL; otherwise derives it from the
 * existing KEYCLOAK_ISSUER (https://<host>/realms/<realm>). The default targets
 * the master-realm console, which is where the existing Keycloak administrator
 * signs in; set KEYCLOAK_ADMIN_CONSOLE_URL to use a realm-scoped console instead.
 * Only plain http(s) URLs are returned.
 */
export function resolveIdentityAdminUrl(input: { explicit?: string | null; issuer?: string | null }): string | null {
  const explicit = safeHttpUrl(input.explicit);
  if (explicit) return explicit;

  const issuer = safeHttpUrl(input.issuer);
  if (!issuer) return null;
  const url = new URL(issuer);
  const realm = url.pathname.match(/\/realms\/([^/]+)/)?.[1];
  if (!realm) return null;
  const base = url.pathname.slice(0, url.pathname.indexOf('/realms/'));
  return `${url.protocol}//${url.host}${base}/admin/master/console/#/${encodeURIComponent(decodeURIComponent(realm))}/users`;
}

function safeHttpUrl(raw?: string | null): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
