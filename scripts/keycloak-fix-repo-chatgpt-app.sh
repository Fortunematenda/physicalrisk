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

echo "==> Listing client-scopes (debug)…"
SCOPES_RAW="$(kcadm get client-scopes -r physicalrisk 2>&1)" || true
echo "$SCOPES_RAW" | head -c 2000
echo ""

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

echo "==> Assign as OPTIONAL client scope…"
if kcadm create "clients/$CLIENT_ID/optional-client-scopes/$SCOPE_ID" -r physicalrisk 2>&1; then
  echo "    assigned OK"
else
  echo "    already assigned or create failed — checking list…"
fi

echo "==> Optional scopes now:"
kcadm get "clients/$CLIENT_ID/optional-client-scopes" -r physicalrisk 2>&1 | tr -d '\r' | grep -E '"name"|offline' || \
  kcadm get "clients/$CLIENT_ID/optional-client-scopes" -r physicalrisk 2>&1 | head -40

echo "==> Default scopes now:"
kcadm get "clients/$CLIENT_ID/default-client-scopes" -r physicalrisk 2>&1 | tr -d '\r' | grep -E '"name"|offline' || true

# Also try as DEFAULT scope (stronger — always included)
echo "==> Also try assign as DEFAULT client scope…"
kcadm create "clients/$CLIENT_ID/default-client-scopes/$SCOPE_ID" -r physicalrisk 2>&1 || true

echo "==> Grant offline_access realm role to users…"
COUNT=0
while read -r UID; do
  [[ -z "$UID" || "$UID" == "id" ]] && continue
  if kcadm add-roles -r physicalrisk --uid "$UID" --rolename offline_access 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
done < <(kcadm get users -r physicalrisk --format csv --fields id --noquotes --max 500 2>/dev/null | tr -d '\r')
echo "    role grants attempted for $COUNT users"

kcadm add-roles -r physicalrisk --uid 88c58b81-3492-408d-9b6b-4fc6de90e1bf --rolename offline_access 2>/dev/null || true

echo ""
echo "=========================================="
echo "DONE — finish Login settings in UI:"
echo "=========================================="
echo "Clients → repo-chatgpt-app → Settings/Login:"
echo "  Valid redirect URIs:"
echo "    https://chatgpt.com/connector/oauth/*"
echo "    https://chatgpt.com/connector_platform_oauth_redirect"
echo "  Web origins: https://chatgpt.com"
echo "  Save"
echo ""
echo "ChatGPT: Disconnect → Connect → SSO"
echo "New chat: @bretunetech List repository projects"
echo ""
echo "Verify logs after Connect:"
echo "  docker compose -f docker-compose.sso.yml --env-file .env.sso logs keycloak --tail 15"
