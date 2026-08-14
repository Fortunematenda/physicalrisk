#!/usr/bin/env bash
# Additive SSO deploy for /opt/physicalrisk — never deletes server files.
# Preserves live WordPress tree, .env.sso, and any extra files already on the VPS.
set -euo pipefail

ROOT="${1:-/opt/physicalrisk}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO_URL="${DEPLOY_REPO_URL:-https://github.com/Fortunematenda/physicalrisk.git}"
PULL_DIR="${DEPLOY_PULL_DIR:-/tmp/physicalrisk-pull}"

cd "$ROOT"
cp -a .env.sso /root/.env.sso.bak

rm -rf "$PULL_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$PULL_DIR"

# Additive only: update/overwrite tracked app files. Do NOT use --delete.
# Never touch wordpress/, .env.sso, .git, build caches, or server-only extras.
rsync -a \
  --exclude '.env.sso' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'wordpress/' \
  "$PULL_DIR/" "$ROOT/"

cp -a /root/.env.sso.bak .env.sso

echo "Synced (additive, no deletes). Example:"
echo "  docker compose -f docker-compose.sso.yml --env-file .env.sso up -d --build"
echo "Live wordpress/, .env.sso, and any extra server files were left untouched."
