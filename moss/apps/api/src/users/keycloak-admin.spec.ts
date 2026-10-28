import { describe, expect, it, vi } from 'vitest';
import { KeycloakAdminClient, KeycloakAdminError, resolveKeycloakAdminConfig } from './keycloak-admin';

const env = (vars: Record<string, string>) => (key: string) => vars[key];

describe('Keycloak admin config', () => {
  it('is off until both the client id and secret are set', () => {
    const base = { KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/physicalrisk/protocol/openid-connect/certs' };
    expect(resolveKeycloakAdminConfig(env(base))).toBeNull();
    expect(resolveKeycloakAdminConfig(env({ ...base, KEYCLOAK_ADMIN_CLIENT_ID: 'moss-user-admin' }))).toBeNull();
  });

  it('derives the internal realm URL from the JWKS URL, then the issuer', () => {
    const creds = { KEYCLOAK_ADMIN_CLIENT_ID: 'moss-user-admin', KEYCLOAK_ADMIN_CLIENT_SECRET: 's3cret' };
    expect(
      resolveKeycloakAdminConfig(
        env({
          ...creds,
          KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/physicalrisk/protocol/openid-connect/certs',
          KEYCLOAK_ISSUER: 'https://auth.physicalrisk.com/realms/physicalrisk',
        }),
      )?.realmUrl,
    ).toBe('http://keycloak:8080/realms/physicalrisk');
    expect(
      resolveKeycloakAdminConfig(env({ ...creds, KEYCLOAK_ISSUER: 'https://auth.physicalrisk.com/realms/physicalrisk' }))
        ?.realmUrl,
    ).toBe('https://auth.physicalrisk.com/realms/physicalrisk');
  });

  it('rejects unsafe URLs and only sends a redirect when one is configured', () => {
    const creds = { KEYCLOAK_ADMIN_CLIENT_ID: 'c', KEYCLOAK_ADMIN_CLIENT_SECRET: 's' };
    expect(resolveKeycloakAdminConfig(env({ ...creds, KEYCLOAK_ADMIN_API_URL: 'javascript:alert(1)' }))).toBeNull();
    const cfg = resolveKeycloakAdminConfig(
      env({ ...creds, KEYCLOAK_ISSUER: 'https://auth.example.com/realms/r', KEYCLOAK_CLIENT_ID: 'physicalrisk-moss' }),
    );
    expect(cfg?.inviteRedirectUrl).toBeUndefined();
    expect(cfg?.inviteClientId).toBeUndefined();
  });
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function client(routes: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/protocol/openid-connect/token')) return json({ access_token: 'tok', expires_in: 300 });
    calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return routes(url, init || {});
  });
  const kc = new KeycloakAdminClient(
    { realmUrl: 'http://keycloak:8080/realms/physicalrisk', clientId: 'c', clientSecret: 's', timeoutMs: 1000 },
    fetchImpl as unknown as typeof fetch,
  );
  return { kc, calls, fetchImpl };
}

describe('Keycloak admin client', () => {
  it('creates a user without a password and reads the id from Location', async () => {
    const { kc, calls } = client(
      () => new Response(null, { status: 201, headers: { Location: 'http://keycloak:8080/admin/realms/physicalrisk/users/abc-123' } }),
    );
    await expect(kc.createUser({ email: 'a@b.co', firstName: 'A', lastName: 'B' })).resolves.toBe('abc-123');
    expect(calls[0].url).toBe('http://keycloak:8080/admin/realms/physicalrisk/users');
    expect(calls[0].body).toEqual({
      username: 'a@b.co',
      email: 'a@b.co',
      firstName: 'A',
      lastName: 'B',
      enabled: true,
      emailVerified: false,
    });
    expect(JSON.stringify(calls[0].body)).not.toMatch(/credential|password/i);
  });

  it('grants the requested role and removes other managed roles only', async () => {
    const { kc, calls } = client((url, init) => {
      if (url.endsWith('/role-mappings/realm/available')) return json([{ id: 'r-an', name: 'moss_analyst' }]);
      if (url.endsWith('/role-mappings/realm') && (init.method || 'GET') === 'GET') {
        return json([
          { id: 'r-cl', name: 'moss_client' },
          { id: 'r-pu', name: 'portal_user' },
        ]);
      }
      return new Response(null, { status: 204 });
    });
    await kc.setManagedRealmRole('u1', 'moss_analyst', ['moss_analyst', 'moss_reviewer', 'moss_client']);
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes).toEqual([
      { url: expect.stringContaining('/users/u1/role-mappings/realm'), method: 'POST', body: [{ id: 'r-an', name: 'moss_analyst' }] },
      { url: expect.stringContaining('/users/u1/role-mappings/realm'), method: 'DELETE', body: [{ id: 'r-cl', name: 'moss_client' }] },
    ]);
  });

  it('turns a Keycloak permission failure into a plain message without the token', async () => {
    const { kc } = client(() => json({ error: 'unknown_error' }, 403));
    const error = await kc.findUserByEmail('a@b.co').catch((e) => e);
    expect(error).toBeInstanceOf(KeycloakAdminError);
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/service account is not allowed/);
    expect(error.message).not.toContain('tok');
  });

  it('explains a Keycloak email failure in plain words', async () => {
    const { kc } = client(() => json({ errorMessage: 'Failed to send execute actions email' }, 500));
    await expect(kc.sendActionsEmail('u1', ['UPDATE_PASSWORD'])).rejects.toThrow(
      'Keycloak could not send the email. Set up its email server in Keycloak under Realm settings → Email.',
    );
  });

  it('tells Keycloak the public https address so emailed links are not internal or http', async () => {
    const cfg = resolveKeycloakAdminConfig(
      env({
        KEYCLOAK_ADMIN_CLIENT_ID: 'c',
        KEYCLOAK_ADMIN_CLIENT_SECRET: 's',
        KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/physicalrisk/protocol/openid-connect/certs',
        KEYCLOAK_ISSUER: 'https://auth.physicalrisk.com/realms/physicalrisk',
      }),
    )!;
    expect(cfg.publicUrl).toBe('https://auth.physicalrisk.com');
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), ...(init?.headers as Record<string, string>) });
      if (String(input).endsWith('/token')) return json({ access_token: 'tok', expires_in: 300 });
      return new Response(null, { status: 204 });
    });
    await new KeycloakAdminClient(cfg, fetchImpl as unknown as typeof fetch).sendActionsEmail('u1', ['UPDATE_PASSWORD']);
    expect(seen).toHaveLength(2);
    for (const call of seen) {
      expect(call.url.startsWith('http://keycloak:8080/')).toBe(true);
      expect(call).toMatchObject({
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'auth.physicalrisk.com',
        'X-Forwarded-Port': '443',
      });
    }
  });

  it('sends the set-password email with a bounded lifespan', async () => {
    const { kc, calls } = client(() => new Response(null, { status: 204 }));
    await kc.sendActionsEmail('u1', ['UPDATE_PASSWORD', 'VERIFY_EMAIL']);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toContain('/users/u1/execute-actions-email?lifespan=259200');
    expect(calls[0].url).not.toContain('redirect_uri');
    expect(calls[0].body).toEqual(['UPDATE_PASSWORD', 'VERIFY_EMAIL']);
  });
});
