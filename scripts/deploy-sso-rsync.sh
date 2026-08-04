#!/usr/bin/env bash
# Safe SSO deploy for /opt/physicalrisk — preserves live WordPress tree and env.
set -euo pipefail

ROOT="${1:-/opt/physicalrisk}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO_URL="${DEPLOY_REPO_URL:-https://github.com/Fortunematenda/physicalrisk.git}"
PULL_DIR="${DEPLOY_PULL_DIR:-/tmp/physicalrisk-pull}"

cd "$ROOT"
cp -a .env.sso /root/.env.sso.bak

rm -rf "$PULL_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$PULL_DIR"

rsync -a --delete \
  --exclude '.env.sso' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'wordpress/' \
  "$PULL_DIR/" "$ROOT/"

cp -a /root/.env.sso.bak .env.sso

# Only drop CRM nginx config when its dedicated cert is missing — otherwise
# crm.physicalrisk.com falls through to the apps cert and Chrome shows
# ERR_CERT_COMMON_NAME_INVALID (HSTS).
CRM_CERT="/etc/letsencrypt/live/crm.physicalrisk.com/fullchain.pem"
if [[ ! -f "$CRM_CERT" ]]; then
  rm -f infrastructure/nginx/conf.d/crm.conf
  echo "Note: crm.conf removed (no cert at $CRM_CERT). Issue one with certbot, then restore crm.conf."
else
  echo "Keeping crm.conf (found $CRM_CERT)."
fi

echo "Synced. Example: docker compose -f docker-compose.sso.yml --env-file .env.sso build --no-cache repo-api"
echo "Live wordpress/ tree was left untouched."
