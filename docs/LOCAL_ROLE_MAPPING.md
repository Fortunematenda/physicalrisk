# Local Role Mapping

## Keycloak → Application Role Mapping

Keycloak realm roles are included in access tokens via a custom protocol mapper (`realm_roles` claim). Each application maps these to its internal role system.

## MOSS Role Mapping

| Keycloak Realm Role | MOSS SystemRole | Description |
|---------------------|-----------------|-------------|
| `moss_admin` | `SUPER_ADMIN` | Full platform administration |
| `moss_analyst` | `ANALYST` | Assessment analyst |
| `moss_reviewer` | `REVIEWER` | Senior reviewer |
| `moss_client` | `CLIENT_EXECUTIVE` | Client user |
| (none of above) | `CLIENT_CONTRIBUTOR` | Default fallback |

## Repository Role Mapping

| Keycloak Realm Role | Repo UserRole | Description |
|---------------------|---------------|-------------|
| `repo_admin` | `ADMIN` | Full repository administration |
| `repo_importer` | `IMPORTER` | Can import documents |
| `repo_reviewer` | `REVIEWER` | Can review documents |
| `repo_viewer` | `VIEWER` | Read-only access |
| (none of above) | `VIEWER` | Default fallback |

## Assigning Multiple Roles

A user can have roles for both applications. Example:

```
admin@physicalrisk.local → portal_user, moss_admin, repo_admin
analyst@physicalrisk.local → portal_user, moss_analyst, repo_importer
```

## Portal Access

The `portal_user` role is the default role assigned to all realm users. It grants access to the application launcher at `http://apps.localhost`.

## Existing Database Records

When a user authenticates via SSO for the first time, the backends identify the user by their `email` field. If a matching local user exists, that record is used with its existing permissions. The Keycloak role provides a baseline, but application-specific permissions (e.g., MOSS organisation memberships, Repo project access) remain governed by each application's own database.
