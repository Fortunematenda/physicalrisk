# Keycloak Local Setup

## Realm Import

The `physicalrisk` realm is automatically imported on first Keycloak startup from:

```
auth/keycloak/realm/physicalrisk-realm.json
```

## Clients

Three OIDC clients are pre-configured:

| Client | Purpose | PKCE | Backchannel Logout |
|--------|---------|------|-------------------|
| physicalrisk-portal | Application launcher | Yes (S256) | Yes |
| physicalrisk-moss | MOSS application | Yes (S256) | Yes |
| physicalrisk-repo | Repository application | Yes (S256) | Yes |

## Adding Users

### Via Keycloak Admin Console

1. Go to http://auth.localhost/admin
2. Select realm "physicalrisk"
3. Users → Add user
4. Set email, first name, last name
5. Credentials tab → Set password
6. Role mapping tab → Assign realm roles

### Via Realm Export

Edit `auth/keycloak/realm/physicalrisk-realm.json` and add to the `users` array, then reset Keycloak:

```powershell
.\infrastructure\scripts\reset-keycloak.ps1
```

## Custom Theme

A minimal Physical Risk login theme is at `auth/keycloak/themes/physicalrisk/`. It extends the default Keycloak theme with brand colors.

## Troubleshooting

### Realm not importing

Keycloak only imports on first boot with an empty database. To re-import:

```powershell
.\infrastructure\scripts\reset-keycloak.ps1
```

### Token validation failing

Check that the issuer URL matches between what the browser sees and what the backend validates against. In Docker, backends use the internal JWKS URL (`http://keycloak:8080/...`) but validate the issuer as `http://auth.localhost/realms/physicalrisk`.
