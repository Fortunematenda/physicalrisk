# VPS Deployment Guide

## 1. Prepare the server directory

```bash
sudo mkdir -p /opt/physical-risk/repository-gateway-data/{incoming,repository}
sudo chown -R $USER:$USER /opt/physical-risk/repository-gateway-data
```

## 2. Configure environment

```bash
cp .env.example .env
```

Set at minimum:

```env
POSTGRES_PASSWORD=use-a-strong-password
JWT_SECRET=use-a-long-random-secret
DEFAULT_ADMIN_PASSWORD=change-the-seeded-password
VPS_REPOSITORY_PATH=/opt/physical-risk/repository-gateway-data
CORS_ORIGIN=https://gateway.physicalrisk.com
GATEWAY_HTTP_PORT=8080
NEXT_PUBLIC_API_URL=/api
```

## 3. Start the stack

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

## 4. Reverse proxy and TLS

Point the public domain to the VPS and proxy HTTPS traffic to `127.0.0.1:8080`. The bundled Nginx container already combines the frontend and API under one origin; the VPS-level proxy only needs to terminate TLS and forward traffic.

## 5. Backup

Back up both components:

```bash
# PostgreSQL
docker compose exec -T postgres pg_dump -U gateway gateway | gzip > gateway-db-$(date +%F).sql.gz

# Repository files
tar -czf gateway-repository-$(date +%F).tar.gz -C /opt/physical-risk repository-gateway-data
```

A database-only backup is incomplete because approved document files are stored on the VPS filesystem.

## 6. Restore

Restore the repository directory first, then restore PostgreSQL. Keep the same relative file paths. The host mount itself may be placed at a different absolute path by changing `VPS_REPOSITORY_PATH`.
