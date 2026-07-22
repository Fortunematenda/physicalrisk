# Keycloak Configuration

This folder contains the Keycloak identity provider configuration for the Physical Risk SSO platform.

## Structure

```
keycloak/
â”œâ”€â”€ realm/
â”‚   â””â”€â”€ physicalrisk-realm.json   # Full realm export with clients, roles, and test users
â””â”€â”€ themes/
    â””â”€â”€ physicalrisk/             # Custom login theme
```

## Realm: physicalrisk

### Clients

| Client ID | Application | Redirect URIs |
|-----------|-------------|---------------|
| `physicalrisk-portal` | Application Launcher | `http://apps.localhost/*` |
| `physicalrisk-moss` | MOSS | `http://moss.localhost/*` |
| `physicalrisk-repo` | Enterprise Repository | `http://repo.localhost/*` |

### Realm Roles

| Role | Description |
|------|-------------|
| `portal_user` | Access the launcher (default for all users) |
| `moss_admin` | MOSS administrator â†’ maps to SUPER_ADMIN |
| `moss_analyst` | MOSS analyst â†’ maps to ANALYST |
| `moss_reviewer` | MOSS senior reviewer â†’ maps to REVIEWER |
| `moss_client` | MOSS client â†’ maps to CLIENT_EXECUTIVE |
| `repo_admin` | Repository administrator â†’ maps to ADMIN |
| `repo_importer` | Repository importer â†’ maps to IMPORTER |
| `repo_reviewer` | Repository reviewer â†’ maps to REVIEWER |
| `repo_viewer` | Repository viewer â†’ maps to VIEWER |

### Test Users

| Email | Password | Roles |
|-------|----------|-------|
| `admin@physicalrisk.com` | `REDACTED_KEYCLOAK_ADMIN_PASSWORD` | All admin roles |
| `analyst@physicalrisk.local` | `REDACTED_SEED_ADMIN_PASSWORD` | Analyst + importer |
| `client@physicalrisk.local` | `REDACTED_SEED_ADMIN_PASSWORD` | Client + viewer |

## Admin Console

Access Keycloak admin at: http://auth.localhost/admin

- Username: `admin`
- Password: `REDACTED_KEYCLOAK_ADMIN_PASSWORD` (from `.env.sso` `KEYCLOAK_ADMIN_PASSWORD`)
