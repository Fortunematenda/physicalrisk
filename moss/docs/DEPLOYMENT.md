# VPS Deployment Guide

## Recommended VPS baseline

- Ubuntu LTS
- 4 vCPU
- 8 GB RAM
- 160 GB SSD
- Docker Engine and Docker Compose plugin
- HTTPS reverse proxy or load balancer

## Install

```bash
unzip moss-platform.zip
cd moss-platform
cp .env.example .env
nano .env
docker compose up -d --build
```

## Firewall

Expose only:

- 22/tcp from approved administration sources
- 80/tcp for certificate validation or redirect
- 443/tcp for the production portal

Do not expose PostgreSQL, Redis or MinIO API ports publicly. The MinIO console mapping on port 9001 is useful during initial setup and should be firewall-restricted or removed for production.

## DNS

Recommended pattern:

```text
moss.physicalrisk.com → MOSS VPS public IP
```

EspoCRM remains at its existing domain.

## HTTPS

Place the Docker Nginx endpoint behind the VPS's existing TLS reverse proxy, or replace the included Nginx service with the organisation's approved Caddy/Traefik/Nginx certificate setup.

## Backup

Back up:

- PostgreSQL database
- MinIO data volume
- `.env` secrets using an approved secret backup process
- Application source and release tag

Use `scripts/backup.sh` as a starting point.

## Upgrade

1. Create database and object-storage backups.
2. Pull or upload the new tagged release.
3. Review environment changes.
4. Build and restart services.
5. Run health and UAT checks.
