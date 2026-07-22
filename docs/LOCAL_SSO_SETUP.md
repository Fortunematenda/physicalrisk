# Local SSO Setup Guide

## Prerequisites

- Docker Desktop (with Docker Compose v2)
- Windows 10/11
- PowerShell 5.1+
- Node.js 20+ (for local development outside Docker)

## Quick Start

### 1. Add local hostnames

Run as Administrator:

```powershell
.\infrastructure\scripts\add-hosts.ps1
```

This adds `auth.localhost`, `apps.localhost`, `moss.localhost`, `repo.localhost` to your hosts file.

### 2. Create environment file

```powershell
Copy-Item .env.sso.example .env.sso
```

Edit `.env.sso` to change passwords if desired. Defaults work for local development.

### 3. Start everything

```powershell
.\infrastructure\scripts\start-local-sso.ps1 -Build -Detach
```

First run will build all containers (~5-10 minutes).

### 4. Verify

```powershell
.\infrastructure\scripts\test-sso.ps1
```

### 5. Access

| Application | URL |
|-------------|-----|
| Portal | http://apps.localhost |
| Keycloak Admin | http://auth.localhost/admin |
| MOSS | http://moss.localhost |
| Repository | http://repo.localhost |

### 6. Login credentials

| User | Password | Access |
|------|----------|--------|
| admin@physicalrisk.local | ChangeMe123! | All applications (admin) |
| analyst@physicalrisk.local | ChangeMe123! | MOSS analyst, Repo importer |
| client@physicalrisk.local | ChangeMe123! | MOSS client, Repo viewer |

Keycloak admin console: `admin` / value of `KEYCLOAK_ADMIN_PASSWORD` in `.env.sso`

## Stopping

```powershell
.\infrastructure\scripts\stop-local-sso.ps1
```

To also remove volumes (reset all data):

```powershell
.\infrastructure\scripts\stop-local-sso.ps1 -Volumes
```

## Direct Port Access (Debugging)

| Service | Port |
|---------|------|
| Keycloak | http://localhost:8085 |
| Portal | http://localhost:3000 |
| MOSS Web | http://localhost:3001 |
| MOSS API | http://localhost:4001 |
| Repo Web | http://localhost:3002 |
| Repo API | http://localhost:4002 |

## Standalone Development

Both MOSS and Repo can still run independently using their original `docker-compose.yml` files. The SSO integration is additive — when `KEYCLOAK_ENABLED` is not set to `true`, both backends fall back to local JWT authentication.
