#!/usr/bin/env bash
# Fix ChatGPT connector: grant offline_access (client scope + user roles).
# Avoids bulk client JSON updates that hit Keycloak varchar(255) errors.
#
#   cd /opt/physicalrisk && bash scripts/keycloak-fix-repo-chatgpt-app.sh
set -euo pipefail

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
  --password "$KEYCLOAK_ADMIN_PASSWORD"

echo "==> offline_access on realm default roles…"
kcadm add-roles -r physicalrisk --rname default-roles-physicalrisk --rolename offline_access 2>/dev/null || true

CLIENT_ID="$(
  kcadm get clients -r physicalrisk -q clientId=repo-chatgpt-app --format csv --fields id --noquotes \
    | awk 'NR==1{print; exit}' | tr -d '\r'
)"
if [[ -z "$CLIENT_ID" || "$CLIENT_ID" == "id" ]]; then
  echo "ERROR: repo-chatgpt-app not found" >&2
  exit 1
fi
echo "==> Client UUID: $CLIENT_ID"

SCOPE_ID="$(
  kcadm get client-scopes -r physicalrisk --format csv --fields id,name --noquotes \
    | awk -F',' '$2=="offline_access"{print $1; exit}' | tr -d '\r'
)"
if [[ -z "${SCOPE_ID:-}" ]]; then
  echo "ERROR: offline_access client scope not found in realm" >&2
  exit 1
fi
echo "==> offline_access scope UUID: $SCOPE_ID"

echo "==> Assign offline_access as OPTIONAL client scope…"
set +e
kcadm create "clients/$CLIENT_ID/optional-client-scopes/$SCOPE_ID" -r physicalrisk
CREATE_RC=$?
set -e
if [[ $CREATE_RC -eq 0 ]]; then
  echo "    assigned."
else
  echo "    create returned $CREATE_RC (often already assigned) — verifying…"
fi

echo "==> Currently assigned optional scopes:"
kcadm get "clients/$CLIENT_ID/optional-client-scopes" -r physicalrisk --format csv --fields name --noquotes || true

echo "==> Grant offline_access realm role to every user…"
COUNT=0
while read -r UID; do
  [[ -z "$UID" || "$UID" == "id" ]] && continue
  if kcadm add-roles -r physicalrisk --uid "$UID" --rolename offline_access 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
done < <(kcadm get users -r physicalrisk --format csv --fields id --noquotes --max 500 | tr -d '\r')
echo "    updated ~$COUNT users"

# Explicit user from prior CODE_TO_TOKEN_ERROR logs
echo "==> Ensure user 88c58b81-3492-408d-9b6b-4fc6de90e1bf has offline_access…"
kcadm add-roles -r physicalrisk --uid 88c58b81-3492-408d-9b6b-4fc6de90e1bf --rolename offline_access 2>/dev/null || true

echo ""
echo "=========================================="
echo "SCRIPT DONE — finish these 2 UI steps:"
echo "=========================================="
echo "1) Keycloak → Clients → repo-chatgpt-app → Login settings"
echo "   Valid redirect URIs (one per line):"
echo "     https://chatgpt.com/connector/oauth/*"
echo "     https://chatgpt.com/connector_platform_oauth_redirect"
echo "   Web origins:"
echo "     https://chatgpt.com"
echo "   Save"
echo ""
echo "2) Client scopes tab → confirm offline_access is under Assigned (Optional)"
echo "   If not: Add → offline_access → Optional → Add"
echo ""
echo "3) ChatGPT → Disconnect BretuneTech → Connect → SSO login"
echo "4) New chat → @bretunetech → List repository projects"
echo ""
echo "Then: ${COMPOSE[*]} logs keycloak --tail 20"
echo "Expect NO: Offline tokens not allowed"
