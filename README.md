# Physical Risk Platform

Unified development environment for the Physical Risk platform applications with centralized Single Sign-On.

## Applications

| Application | Description | Port |
|-------------|-------------|------|
| **Portal** | Application launcher (SSO entry point) | 3000 |
| **MOSS** | Management Operating Security System | 3001 / 4001 |
| **Enterprise Repository** | Document repository gateway | 3002 / 4002 |

## Architecture

All applications authenticate through **Keycloak** using OpenID Connect Authorization Code Flow with PKCE. Users sign in once and access all applications without re-authentication.

See [docs/LOCAL_SSO_ARCHITECTURE.md](docs/LOCAL_SSO_ARCHITECTURE.md) for full architecture details.

## Quick Start

```powershell
# 1. Add local hostnames (run as Administrator)
.\infrastructure\scripts\add-hosts.ps1

# 2. Create environment file
Copy-Item .env.sso.example .env.sso

# 3. Build and start all services
.\infrastructure\scripts\start-local-sso.ps1 -Build -Detach

# 4. Open portal
Start-Process http://apps.localhost
```

## Project Structure

```
physicalrisk/
├── auth/                           # Identity provider configuration
│   └── keycloak/
│       ├── realm/                  # Realm export JSON
│       └── themes/                 # Custom login theme
├── portal/                         # Application launcher (Next.js)
├── moss/                           # MOSS application (existing)
├── repo/                           # Enterprise Repository (existing)
├── infrastructure/
│   ├── nginx/                      # Reverse proxy configuration
│   │   ├── nginx.conf
│   │   └── conf.d/                # Per-host server blocks
│   └── scripts/                    # PowerShell utility scripts
├── docs/                           # Documentation
├── docker-compose.sso.yml          # Full SSO environment
├── .env.sso.example                # Environment template
└── .gitignore
```

## Documentation

- [Local SSO Setup](docs/LOCAL_SSO_SETUP.md) — Getting started guide
- [Server deploy (physicalrisk.com)](docs/SERVER_DEPLOY_PHYSICALRISK.md) — Client-test / VPS checklist
- [Architecture](docs/LOCAL_SSO_ARCHITECTURE.md) — System design and flows
- [Keycloak Setup](docs/KEYCLOAK_LOCAL_SETUP.md) — IdP configuration
- [Role Mapping](docs/LOCAL_ROLE_MAPPING.md) — How Keycloak roles map to app roles
- [Troubleshooting](docs/LOCAL_SSO_TROUBLESHOOTING.md) — Common issues and fixes

## Local Hostnames

| Hostname | Service |
|----------|---------|
| auth.localhost | Keycloak |
| apps.localhost | Portal |
| moss.localhost | MOSS |
| repo.localhost | Repository |
