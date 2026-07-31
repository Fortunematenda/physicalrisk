#!/usr/bin/env bash
# Fix Keycloak client repo-chatgpt-app for ChatGPT Connectors.
# Fixes: CODE_TO_TOKEN_ERROR — Offline tokens not allowed for the user or client
#
#   cd /opt/physicalrisk && bash scripts/keycloak-fix-repo-chatgpt-app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.sso.yml --env-file .env.sso)

KEYCLOAK_ADMIN="$(grep -E '^KEYCLOAK_ADMIN=' .env.sso | head -1 | cut -d= -f2- | tr -d '\r"' )"
KEYCLOAK_ADMIN_PASSWORD="$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' .env.sso | head -1 | cut -d= -f2- | tr -d '\r"' )"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
if [[ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
  echo "KEYCLOAK_ADMIN_PASSWORD not found in .env.sso" >&2
  exit 1
fi

kcadm() {
  "${COMPOSE[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@"
}

echo "==> Admin login…"
kcadm config credentials \
  --server http://127.0.0.1:8080 \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

echo "==> Add offline_access to realm default roles…"
kcadm add-roles -r physicalrisk --rname default-roles-physicalrisk --rolename offline_access 2>/dev/null || true

echo "==> Find client repo-chatgpt-app…"
CLIENT_ID="$(
  kcadm get clients -r physicalrisk -q clientId=repo-chatgpt-app --format csv --fields id --noquotes 2>/dev/null | tail -n +1 | head -1 | tr -d '\r'
)"
if [[ -z "$CLIENT_ID" || "$CLIENT_ID" == "id" ]]; then
  echo "ERROR: Client repo-chatgpt-app not found. Create it in Keycloak UI first." >&2
  exit 1
fi
echo "    CLIENT_ID=$CLIENT_ID"

echo "==> Redirect URIs + PKCE + confidential client…"
kcadm update "clients/$CLIENT_ID" -r physicalrisk \
  -s 'redirectUris=["https://chatgpt.com/connector/oauth/*","https://chatgpt.com/connector_platform_oauth_redirect","https://chat.openai.com/connector/oauth/*"]' \
  -s 'webOrigins=["https://chatgpt.com","https://chat.openai.com"]' \
  -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false \
  -s publicClient=false \
  -s fullScopeAllowed=true \
  -s 'attributes.pkce.code.challenge.method=S256'

echo "==> Attach offline_access as optional client scope…"
SCOPE_ID="$(
  kcadm get client-scopes -r physicalrisk --format csv --fields id,name --noquotes 2>/dev/null \
    | awk -F',' '$2=="offline_access"{print $1; exit}'
)"
if [[ -n "${SCOPE_ID:-}" ]]; then
  echo "    SCOPE_ID=$SCOPE_ID"
  kcadm create "clients/$CLIENT_ID/optional-client-scopes/$SCOPE_ID" -r physicalrisk 2>/dev/null || \
    echo "    (scope may already be assigned — OK)"
else
  echo "WARNING: could not find offline_access scope via CLI — assign it in UI (Client scopes tab)." >&2
fi

echo "==> Grant offline_access role to all users (best-effort)…"
kcadm get users -r physicalrisk --format csv --fields id --noquotes --max 500 2>/dev/null \
  | tail -n +2 \
  | while read -r UID; do
      [[ -z "$UID" || "$UID" == "id" ]] && continue
      kcadm add-roles -r physicalrisk --uid "$UID" --rolename offline_access 2>/dev/null || true
    done

echo ""
echo "OK. Now in ChatGPT:"
echo "  1) Disconnect BretuneTech (if listed)"
echo "  2) Connect again → complete SSO"
echo "  3) New chat → @bretunetech → List repository projects"
echo ""
echo "Watch for success (no Offline tokens error):"
echo "  ${COMPOSE[*]} logs keycloak --tail 40"
