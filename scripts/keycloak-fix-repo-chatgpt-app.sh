#!/usr/bin/env bash
# Fix ChatGPT connector: grant offline_access (client scope + user roles).
#   cd /opt/physicalrisk && bash scripts/keycloak-fix-repo-chatgpt-app.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.sso.yml --env-file .env.sso)

KEYCLOAK_ADMIN="$(grep -E '^KEYCLOAK_ADMIN=' .env.sso | head -1 | cut -d= -f2- | tr -d '\r"' )"
KEYCLOAK_ADMIN_PASSWORD="$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' .env.sso | head -1 | cut -d= -f2- | tr -d '\r"' )"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
[[ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]] || { echo "KEYCLOAK_ADMIN_PASSWORD missing in .env.sso" >&2; exit 1; }

kcadm() {
  "${COMPOSE[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@"
}

echo "==> Admin login…"
kcadm config credentials \
  --server http://127.0.0.1:8080 \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD" || exit 1

echo "==> offline_access on realm default roles…"
kcadm add-roles -r physicalrisk --rname default-roles-physicalrisk --rolename offline_access || true

CLIENT_ID="$(
  kcadm get clients -r physicalrisk -q clientId=repo-chatgpt-app --format csv --fields id --noquotes 2>/dev/null \
    | head -1 | tr -d '\r' | tr -d ' '
)"
if [[ -z "$CLIENT_ID" || "$CLIENT_ID" == "id" ]]; then
  echo "ERROR: repo-chatgpt-app not found" >&2
  exit 1
fi
echo "==> Client UUID: $CLIENT_ID"

echo "==> Resolving offline_access client-scope…"
SCOPES_RAW="$(kcadm get client-scopes -r physicalrisk 2>&1)" || true

SCOPE_ID="$(
  echo "$SCOPES_RAW" \
    | tr -d '\r' \
    | python3 -c '
import json,sys
raw=sys.stdin.read()
# find first JSON array
i=raw.find("[")
if i<0:
  sys.exit(0)
data=json.loads(raw[i:])
for item in data:
  if item.get("name")=="offline_access":
    print(item.get("id",""))
    break
' 2>/dev/null || true
)"

if [[ -z "${SCOPE_ID:-}" ]]; then
  SCOPE_ID="$(
    echo "$SCOPES_RAW" | tr -d '\r' \
      | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"|"name"[[:space:]]*:[[:space:]]*"offline_access"' \
      | paste - - \
      | grep offline_access \
      | head -1 \
      | grep -oE '[0-9a-f-]{36}' \
      | head -1 || true
  )"
fi

if [[ -z "${SCOPE_ID:-}" ]]; then
  echo ""
  echo "ERROR: Could not resolve offline_access scope id via CLI."
  echo "Do this in Keycloak Admin UI (2 minutes):"
  echo "  Clients → repo-chatgpt-app → Client scopes"
  echo "  Add client scope → offline_access → Optional → Add"
  echo "  Users → your user → Role mapping → Assign role → offline_access"
  echo "  Login settings → redirect: https://chatgpt.com/connector/oauth/*"
  exit 1
fi
echo "==> offline_access scope UUID: $SCOPE_ID"

echo "==> Default scopes now:"
DEFAULT_SCOPES="$(kcadm get "clients/$CLIENT_ID/default-client-scopes" -r physicalrisk 2>&1 | tr -d '\r' || true)"
echo "$DEFAULT_SCOPES" | grep -E '"name"|offline' || true

if echo "$DEFAULT_SCOPES" | grep -q '"name"[[:space:]]*:[[:space:]]*"offline_access"'; then
  echo "    offline_access already on DEFAULT scopes — OK"
else
  echo "==> Assign offline_access as DEFAULT client scope…"
  kcadm create "clients/$CLIENT_ID/default-client-scopes/$SCOPE_ID" -r physicalrisk 2>&1 || \
    kcadm create "clients/$CLIENT_ID/optional-client-scopes/$SCOPE_ID" -r physicalrisk 2>&1 || true
fi

echo "==> Grant offline_access realm role to users…"
# Do not use UID — bash treats UID as readonly.
COUNT=0
while read -r USER_UUID; do
  [[ -z "$USER_UUID" || "$USER_UUID" == "id" ]] && continue
  if kcadm add-roles -r physicalrisk --uid "$USER_UUID" --rolename offline_access 2>/dev/null; then
    COUNT=$((COUNT + 1))
    echo "    granted → $USER_UUID"
  fi
done < <(kcadm get users -r physicalrisk --format csv --fields id --noquotes --max 500 2>/dev/null | tr -d '\r')
echo "    role grants succeeded for $COUNT users"

# Known ChatGPT SSO user from prior CODE_TO_TOKEN_ERROR logs
KNOWN_USER=88c58b81-3492-408d-9b6b-4fc6de90e1bf
echo "==> Ensure role on known ChatGPT user $KNOWN_USER…"
kcadm add-roles -r physicalrisk --uid "$KNOWN_USER" --rolename offline_access 2>&1 || true
echo "==> Roles for known user (must include offline_access):"
kcadm get-roles -r physicalrisk --uid "$KNOWN_USER" 2>&1 | tr -d '\r' | grep -E '"name"|offline' || \
  kcadm get-roles -r physicalrisk --uid "$KNOWN_USER" 2>&1 | head -40

echo "==> Set ChatGPT redirect URIs / web origins (fixes invalid_redirect_uri)…"
# Only touch these fields — full client PUT historically failed on this realm.
if kcadm update "clients/$CLIENT_ID" -r physicalrisk \
  -s 'redirectUris=["https://chatgpt.com/connector/oauth/*","https://chatgpt.com/connector_platform_oauth_redirect"]' \
  -s 'webOrigins=["https://chatgpt.com"]' 2>&1; then
  echo "    redirect URIs updated OK"
else
  echo "    CLI update failed — set in UI: Clients → repo-chatgpt-app → Login settings"
fi

echo "==> Client login settings now:"
kcadm get "clients/$CLIENT_ID" -r physicalrisk --fields redirectUris,webOrigins,clientId 2>&1 | tr -d '\r' | head -40

echo ""
echo "=========================================="
echo "DONE — next in ChatGPT (fresh SSO required):"
echo "=========================================="
echo "1. Disconnect the connector completely"
echo "2. Connect again → complete SSO login (new code; old retries will keep failing)"
echo "3. New chat: @bretunetech List repository projects"
echo ""
echo "Fresh logs only (after Connect):"
echo "  docker compose -f docker-compose.sso.yml --env-file .env.sso logs keycloak --since 2m"
