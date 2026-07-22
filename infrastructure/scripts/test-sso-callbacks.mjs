/**
 * Validates portal → MOSS / Repo SSO callback configuration (no network).
 * Run: node infrastructure/scripts/test-sso-callbacks.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const expectedIssuer = 'http://auth.localhost/realms/physicalrisk';
const callbackPath = '/api/auth/callback/keycloak';

const apps = [
  {
    name: 'portal',
    authFile: 'portal/lib/auth.ts',
    baseUrl: 'http://apps.localhost',
    clientId: 'physicalrisk-portal',
  },
  {
    name: 'moss',
    authFile: 'moss/apps/web/lib/auth.ts',
    baseUrl: 'http://moss.localhost',
    clientId: 'physicalrisk-moss',
  },
  {
    name: 'repo',
    authFile: 'repo/apps/web/lib/auth.ts',
    baseUrl: 'http://repo.localhost',
    clientId: 'physicalrisk-repo',
  },
];

for (const app of apps) {
  const src = readFileSync(join(root, app.authFile), 'utf8');
  assert.ok(
    !src.includes('KEYCLOAK_ISSUER_INTERNAL'),
    `${app.name}: must not use KEYCLOAK_ISSUER_INTERNAL for OIDC token exchange`,
  );
  assert.ok(
    src.includes('auth.localhost/realms/physicalrisk') || src.includes('KEYCLOAK_ISSUER'),
    `${app.name}: must configure public Keycloak issuer`,
  );
  assert.ok(
    src.includes("id: 'keycloak'"),
    `${app.name}: provider id must be keycloak → callback ${callbackPath}`,
  );
  console.log(`[OK] ${app.name} Auth.js provider keycloak → ${app.baseUrl}${callbackPath}`);
}

const realm = JSON.parse(
  readFileSync(join(root, 'auth/keycloak/realm/physicalrisk-realm.json'), 'utf8'),
);
for (const app of apps) {
  const client = realm.clients.find((c) => c.clientId === app.clientId);
  assert.ok(client, `realm missing client ${app.clientId}`);
  assert.equal(client.publicClient, false, `${app.clientId}: client auth must be ON`);
  assert.equal(client.standardFlowEnabled, true, `${app.clientId}: standard flow ON`);
  assert.equal(client.implicitFlowEnabled, false, `${app.clientId}: implicit OFF`);
  assert.equal(client.directAccessGrantsEnabled, false, `${app.clientId}: direct grants OFF`);
  const expected = `${app.baseUrl}${callbackPath}`;
  assert.ok(
    client.redirectUris.includes(expected),
    `${app.clientId}: redirectUris must include ${expected}`,
  );
  console.log(`[OK] Keycloak client ${app.clientId} redirect ${expected}`);
}

const compose = readFileSync(join(root, 'docker-compose.sso.yml'), 'utf8');
assert.ok(compose.includes('physicalrisk-network'), 'compose must use physicalrisk-network');
assert.ok(compose.includes('auth.localhost'), 'nginx must alias auth.localhost');
assert.ok(
  !compose.match(/moss-web:[\s\S]*?KEYCLOAK_ISSUER_INTERNAL/),
  'moss-web must not set KEYCLOAK_ISSUER_INTERNAL',
);
assert.ok(
  !compose.match(/repo-web:[\s\S]*?KEYCLOAK_ISSUER_INTERNAL/),
  'repo-web must not set KEYCLOAK_ISSUER_INTERNAL',
);

for (const app of ['moss', 'repo']) {
  const sso = readFileSync(join(root, `${app === 'moss' ? 'moss/apps/web' : 'repo/apps/web'}/lib/sso.ts`), 'utf8');
  assert.ok(
    !sso.includes('/api/auth/signin/keycloak?'),
    `${app}: must not GET /api/auth/signin/keycloak (NextAuth treats provider id as error when pages.signIn is set)`,
  );
  assert.ok(sso.includes("signIn('keycloak'"), `${app}: redirectToLogin must use signIn() POST`);
}
console.log('[OK] SSO helpers use signIn() POST, not GET signin URL');
console.log(`[OK] Expected issuer constant: ${expectedIssuer}`);
console.log('All portal→MOSS / portal→Repo callback config tests passed.');
