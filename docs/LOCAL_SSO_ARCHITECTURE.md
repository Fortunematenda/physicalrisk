# Local SSO Architecture

## Overview

The Physical Risk platform uses Keycloak as a central identity provider with OpenID Connect (OIDC) Authorization Code Flow + PKCE for all three applications.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx Reverse Proxy                       │
│   auth.localhost  apps.localhost  moss.localhost  repo.localhost  │
└────────┬──────────────┬───────────────┬──────────────┬──────────┘
         │              │               │              │
    ┌────▼────┐   ┌─────▼─────┐   ┌────▼────┐   ┌────▼────┐
    │Keycloak │   │  Portal   │   │  MOSS   │   │  Repo   │
    │  (IdP)  │   │ (Launcher)│   │Web + API│   │Web + API│
    └────┬────┘   └───────────┘   └────┬────┘   └────┬────┘
         │                              │              │
    ┌────▼────┐                   ┌────▼────┐   ┌────▼────┐
    │KC Postgres│                  │MOSS DB  │   │Repo DB  │
    └──────────┘                   └─────────┘   └─────────┘
```

## SSO Flow

1. User navigates to `http://apps.localhost` (Portal)
2. Portal middleware detects no session → redirects to Keycloak login
3. User authenticates once at `http://auth.localhost/realms/physicalrisk/...`
4. Keycloak issues authorization code → Portal exchanges for tokens
5. Portal stores session in httpOnly cookie (NextAuth.js)
6. User clicks MOSS card → navigates to `http://moss.localhost`
7. MOSS detects no local session → redirects to Keycloak
8. Keycloak has active SSO session → immediately issues code (no login prompt)
9. MOSS frontend gets session with access token
10. MOSS frontend sends access token as Bearer header to MOSS API
11. MOSS API validates token against Keycloak JWKS endpoint

## Key Design Decisions

- **No shared cookies**: Each app has its own session cookie on its own subdomain
- **No localStorage tokens**: All token storage is in httpOnly session cookies via NextAuth
- **No token copying**: Each app independently obtains its own tokens from Keycloak
- **SSO via Keycloak session**: The browser's Keycloak session cookie enables silent auth
- **Backward compatible**: Both apps still accept local JWT for standalone development
- **Separate databases**: User records remain independent in each application

## Token Flow per Application

```
Browser → App Frontend → /api/auth/session → accessToken
Browser → App Frontend → Authorization: Bearer {accessToken} → App Backend
App Backend → Keycloak JWKS (cached) → validate signature → extract roles
```

## Logout Flow

1. User clicks "Sign out" in any application
2. NextAuth signOut triggers → POST to Keycloak end-session endpoint
3. Keycloak invalidates SSO session
4. Keycloak sends backchannel logout to all registered clients
5. All applications' sessions become invalid

## Role Mapping

| Keycloak Role | MOSS SystemRole | Repo UserRole |
|---------------|-----------------|---------------|
| moss_admin | SUPER_ADMIN | — |
| moss_analyst | ANALYST | — |
| moss_reviewer | REVIEWER | — |
| moss_client | CLIENT_EXECUTIVE | — |
| repo_admin | — | ADMIN |
| repo_importer | — | IMPORTER |
| repo_reviewer | — | REVIEWER |
| repo_viewer | — | VIEWER |
