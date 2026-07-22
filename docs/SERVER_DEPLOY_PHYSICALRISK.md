# Server deploy — physicalrisk.com (client testing)

Use this when deploying the SSO stack for client demos on **physicalrisk.com**.

## Hostnames

Create DNS A/AAAA records (all pointing at the VPS):

| Hostname | App |
|----------|-----|
| `auth.physicalrisk.com` | Keycloak |
| `apps.physicalrisk.com` | Portal launcher |
| `moss.physicalrisk.com` | MOSS |
| `repo.physicalrisk.com` | Repository |

Keep `https://physicalrisk.com` for the WordPress/marketing site.

## Important: port 80 conflict

If WordPress/Apache already owns port 80 on the same server, do **not** bind compose nginx to `:80` without a plan. Options:

1. Put Cloudflare / host nginx / Caddy in front; proxy the four subdomains into Docker (compose can listen on `127.0.0.1:8080` via `NGINX_HTTP_PORT=8080`).
2. Or run the platform stack on a separate VPS.

## Deploy steps

```bash
# On the server
cp .env.sso.production.example .env.sso
# Edit .env.sso — replace every REPLACE_WITH_* value

docker compose -f docker-compose.sso.yml --env-file .env.sso up -d --build
```

## TLS

Terminate HTTPS in front of the compose nginx (Cloudflare Flexible/Full, Caddy, or host nginx). Forward:

- `Host`
- `X-Forwarded-Proto: https`
- `X-Forwarded-For`

`SSO_COOKIE_SECURE=true` requires real HTTPS to the browser.

## Keycloak clients

Realm import runs on **first** Keycloak DB only. If Keycloak already has data:

1. Open `https://auth.physicalrisk.com/admin`
2. Realm **physicalrisk** → clients `physicalrisk-portal`, `physicalrisk-moss`, `physicalrisk-repo`
3. Ensure redirect URIs include:
   - `https://apps.physicalrisk.com/api/auth/callback/keycloak`
   - `https://moss.physicalrisk.com/api/auth/callback/keycloak`
   - `https://repo.physicalrisk.com/api/auth/callback/keycloak`
4. Set client secrets to match `.env.sso`
5. Change admin and demo user passwords before sharing with the client

## Client-facing links

| Purpose | URL |
|---------|-----|
| Portal login | https://apps.physicalrisk.com |
| Public questionnaire | https://moss.physicalrisk.com/start?source=wordpress |
| MOSS app | https://moss.physicalrisk.com |
| Repository | https://repo.physicalrisk.com |
| Keycloak admin | https://auth.physicalrisk.com/admin |

Point the WordPress CTA to the questionnaire URL above.

## After deploy checklist

1. Portal login works
2. Launch MOSS + Repo from portal (no second login)
3. Submit `/start` questionnaire
4. SMTP test + send a report (PDF attached)
5. Logout returns cleanly to portal
