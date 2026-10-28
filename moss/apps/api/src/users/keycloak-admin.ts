/**
 * Minimal Keycloak Admin REST client used by MOSS user administration.
 *
 * Authenticates with a dedicated confidential client (service account, client
 * credentials grant). MOSS never sees or sets user passwords: new users get a
 * Keycloak "execute actions" email to set their own password.
 */

/** MOSS platform roles that MOSS may grant through Keycloak, and their realm role. */
export const PROVISIONABLE_ROLES: Record<string, string | null> = {
  ANALYST: 'moss_analyst',
  REVIEWER: 'moss_reviewer',
  CLIENT_EXECUTIVE: 'moss_client',
  CLIENT_CONTRIBUTOR: null,
};

/** Realm roles MOSS adds or removes when changing a platform role. */
export const MANAGED_REALM_ROLES = ['moss_analyst', 'moss_reviewer', 'moss_client'];

/** Users holding any of these are administered in Keycloak only. */
export const PROTECTED_REALM_ROLES = ['moss_admin'];

export type KeycloakAdminConfig = {
  /** Realm URL reachable from the API, e.g. http://keycloak:8080/realms/physicalrisk */
  realmUrl: string;
  clientId: string;
  clientSecret: string;
  inviteClientId?: string;
  inviteRedirectUrl?: string;
  /** Public Keycloak origin (from KEYCLOAK_ISSUER) that emailed links must use. */
  publicUrl?: string;
  timeoutMs: number;
};

export type KeycloakUser = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
};

type RoleRep = { id: string; name: string };

export class KeycloakAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'KeycloakAdminError';
  }
}

type Env = (key: string) => string | undefined;

/**
 * Returns null unless the admin client id and secret are both set and the realm
 * URL is a plain http(s) URL. Defaults the realm URL to the API's JWKS/issuer URL.
 */
export function resolveKeycloakAdminConfig(env: Env): KeycloakAdminConfig | null {
  const clientId = (env('KEYCLOAK_ADMIN_CLIENT_ID') || '').trim();
  const clientSecret = (env('KEYCLOAK_ADMIN_CLIENT_SECRET') || '').trim();
  if (!clientId || !clientSecret) return null;

  const candidates = [
    env('KEYCLOAK_ADMIN_API_URL'),
    env('KEYCLOAK_JWKS_URL')?.replace(/\/protocol\/openid-connect\/certs\/?$/, ''),
    env('KEYCLOAK_ISSUER'),
  ];
  let realmUrl: string | null = null;
  for (const raw of candidates) {
    realmUrl = realmBaseUrl(raw);
    if (realmUrl) break;
  }
  if (!realmUrl) return null;

  const timeout = Number(env('KEYCLOAK_ADMIN_TIMEOUT') || 10000);
  const inviteRedirectUrl = httpUrl(env('KEYCLOAK_INVITE_REDIRECT_URL')) || undefined;
  const issuer = httpUrl(env('KEYCLOAK_ISSUER'));
  return {
    realmUrl,
    clientId,
    clientSecret,
    publicUrl: issuer ? new URL(issuer).origin : undefined,
    inviteClientId: inviteRedirectUrl ? (env('KEYCLOAK_CLIENT_ID') || '').trim() || undefined : undefined,
    inviteRedirectUrl,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
  };
}

function httpUrl(raw?: string | null): string | null {
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

function realmBaseUrl(raw?: string | null): string | null {
  const url = httpUrl(raw);
  if (!url) return null;
  const match = new URL(url).pathname.match(/^(.*\/realms\/[^/]+)/);
  if (!match) return null;
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}${match[1]}`;
}

export class KeycloakAdminClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly adminBase: string;
  private readonly forwarded: Record<string, string>;

  constructor(
    private readonly cfg: KeycloakAdminConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const url = new URL(cfg.realmUrl);
    const realm = url.pathname.match(/\/realms\/([^/]+)/)![1];
    const prefix = url.pathname.slice(0, url.pathname.indexOf('/realms/'));
    this.adminBase = `${url.protocol}//${url.host}${prefix}/admin/realms/${realm}`;
    this.forwarded = forwardedHeaders(cfg.publicUrl);
  }

  async findUserByEmail(email: string): Promise<KeycloakUser | null> {
    const params = new URLSearchParams({ email, exact: 'true', briefRepresentation: 'true' });
    const users = await this.request<KeycloakUser[]>('GET', `/users?${params}`);
    const wanted = email.toLowerCase();
    return users.find((u) => (u.email || '').toLowerCase() === wanted) || null;
  }

  async createUser(input: { email: string; firstName: string; lastName: string }): Promise<string> {
    const res = await this.send('POST', '/users', {
      username: input.email,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: false,
    });
    const location = res.headers.get('location') || '';
    const id = location.split('/').pop();
    if (id) return id;
    const created = await this.findUserByEmail(input.email);
    if (!created) throw new KeycloakAdminError('Keycloak created the account but did not return its id.', 502);
    return created.id;
  }

  async updateUser(id: string, changes: { firstName?: string; lastName?: string; enabled?: boolean }) {
    await this.send('PUT', `/users/${encodeURIComponent(id)}`, changes);
  }

  async deleteUser(id: string) {
    await this.send('DELETE', `/users/${encodeURIComponent(id)}`);
  }

  async logoutUser(id: string) {
    await this.send('POST', `/users/${encodeURIComponent(id)}/logout`);
  }

  async realmRoleNames(id: string): Promise<string[]> {
    const roles = await this.request<RoleRep[]>('GET', `/users/${encodeURIComponent(id)}/role-mappings/realm`);
    return roles.map((r) => r.name);
  }

  /** Grants `grant` (if any) and removes every other realm role in `managed`. */
  async setManagedRealmRole(id: string, grant: string | null, managed: string[]) {
    const path = `/users/${encodeURIComponent(id)}/role-mappings/realm`;
    const current = await this.request<RoleRep[]>('GET', path);
    const remove = current.filter((r) => managed.includes(r.name) && r.name !== grant);
    if (grant && !current.some((r) => r.name === grant)) {
      const available = await this.request<RoleRep[]>('GET', `${path}/available`);
      const role = available.find((r) => r.name === grant);
      if (!role) throw new KeycloakAdminError(`The Keycloak role "${grant}" is missing or cannot be assigned.`, 400);
      await this.send('POST', path, [{ id: role.id, name: role.name }]);
    }
    if (remove.length) {
      await this.send('DELETE', path, remove.map((r) => ({ id: r.id, name: r.name })));
    }
  }

  /** Asks Keycloak to email the user links for the given required actions. */
  async sendActionsEmail(id: string, actions: string[]) {
    const params = new URLSearchParams({ lifespan: String(72 * 3600) });
    if (this.cfg.inviteClientId && this.cfg.inviteRedirectUrl) {
      params.set('client_id', this.cfg.inviteClientId);
      params.set('redirect_uri', this.cfg.inviteRedirectUrl);
    }
    await this.send('PUT', `/users/${encodeURIComponent(id)}/execute-actions-email?${params}`, actions);
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.realmUrl}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...this.forwarded },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch {
      throw new KeycloakAdminError('Keycloak could not be reached.', 503);
    }
    if (!res.ok) {
      throw new KeycloakAdminError('Keycloak rejected the MOSS service account credentials.', 502);
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new KeycloakAdminError('Keycloak returned no access token.', 502);
    const ttl = Math.max(10, (data.expires_in || 60) - 30) * 1000;
    this.token = { value: data.access_token, expiresAt: Date.now() + ttl };
    return data.access_token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.send(method, path, body);
    return (await res.json()) as T;
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.adminBase}${path}`, {
        method,
        headers: {
          ...this.forwarded,
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch {
      throw new KeycloakAdminError('Keycloak could not be reached.', 503);
    }
    if (res.status === 401) this.token = null;
    if (!res.ok) throw new KeycloakAdminError(await describeFailure(res), res.status);
    return res;
  }
}

/**
 * The API calls Keycloak on its internal address, but emailed links must use the public one.
 * Keycloak runs with KC_PROXY_HEADERS=xforwarded, so it builds links from these headers.
 */
function forwardedHeaders(publicUrl?: string): Record<string, string> {
  if (!publicUrl) return {};
  const url = new URL(publicUrl);
  const proto = url.protocol.replace(':', '');
  return {
    'X-Forwarded-Proto': proto,
    'X-Forwarded-Host': url.hostname,
    'X-Forwarded-Port': url.port || (proto === 'https' ? '443' : '80'),
  };
}

async function describeFailure(res: Response): Promise<string> {
  let detail = '';
  try {
    const data = (await res.json()) as { errorMessage?: string; error_description?: string; error?: string };
    detail = String(data.errorMessage || data.error_description || data.error || '').slice(0, 160);
  } catch {
    // Non-JSON body; the status alone is enough.
  }
  if (res.status === 401 || res.status === 403) {
    return 'The MOSS service account is not allowed to do this in Keycloak. Check its realm-management roles.';
  }
  if (/send .*email/i.test(detail)) {
    return 'Keycloak could not send the email. Set up its email server in Keycloak under Realm settings → Email.';
  }
  if (res.status === 409) return detail || 'A Keycloak account with this email or username already exists.';
  if (res.status === 404) return 'The account was not found in Keycloak.';
  return detail ? `Keycloak error: ${detail}` : `Keycloak returned HTTP ${res.status}.`;
}
