#!/usr/bin/env sh
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$STAMP
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-moss}" "${POSTGRES_DB:-moss}" > "backups/$STAMP/moss.sql"
docker run --rm -v moss-platform_minio_data:/data -v "$PWD/backups/$STAMP:/backup" alpine tar czf /backup/minio-data.tgz -C /data .
echo "Backup created in backups/$STAMP"
