#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
REPOSITORY_PATH="${VPS_REPOSITORY_PATH:-${PROJECT_DIR}/storage}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${BACKUP_DIR}"

cd "${PROJECT_DIR}"
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-gateway}" \
  "${POSTGRES_DB:-gateway}" \
  | gzip > "${BACKUP_DIR}/gateway-db-${STAMP}.sql.gz"

tar -czf "${BACKUP_DIR}/gateway-repository-${STAMP}.tar.gz" \
  -C "$(dirname "${REPOSITORY_PATH}")" \
  "$(basename "${REPOSITORY_PATH}")"

printf 'Database backup: %s\n' "${BACKUP_DIR}/gateway-db-${STAMP}.sql.gz"
printf 'Repository backup: %s\n' "${BACKUP_DIR}/gateway-repository-${STAMP}.tar.gz"
