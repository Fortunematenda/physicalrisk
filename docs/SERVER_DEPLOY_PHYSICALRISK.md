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

**Do not delete anything on the VPS.** Prefer `scripts/deploy-sso-rsync.sh` (additive rsync — no `--delete`). It never removes server-only files, never touches `wordpress/`, and restores `.env.sso`.

```bash
# On the server
cd /opt/physicalrisk

# Additive sync from GitHub main (safe — no deletes)
bash scripts/deploy-sso-rsync.sh /opt/physicalrisk

# First time only: copy and edit env
# cp .env.sso.production.example .env.sso
# Edit .env.sso — replace every REPLACE_WITH_* value
# Also set connector vars for Repo external imports:
#   CONNECTOR_ENCRYPTION_KEY=   # 64-char hex (32 bytes)
#   GOOGLE_CLIENT_ID=
#   GOOGLE_CLIENT_SECRET=
#   GOOGLE_REDIRECT_URI=https://repo.physicalrisk.com/api/connectors/google-drive/callback
#   MCP_ENABLED=true

docker compose -f docker-compose.sso.yml --env-file .env.sso up -d --build
```

Repo MCP public endpoint after deploy:

```text
https://repo.physicalrisk.com/mcp
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

## WordPress “Book MOSS Assessment” form

The MetForm on `test.physicalrisk.com` posts to `https://moss.physicalrisk.com/api/public/contact`.

Required on the VPS (`.env.sso` + recreate `moss-api` / `wordpress`):

```bash
# In .env.sso — append WordPress origins if missing
MOSS_CORS_ORIGINS=https://moss.physicalrisk.com,https://apps.physicalrisk.com,https://test.physicalrisk.com,https://physicalrisk.com,https://www.physicalrisk.com
CONTACT_ALLOWED_ORIGINS=https://test.physicalrisk.com,https://physicalrisk.com,https://www.physicalrisk.com
CONTACT_ALLOWED_HOSTS=test.physicalrisk.com,physicalrisk.com,www.physicalrisk.com
TURNSTILE_SITE_KEY=...your Cloudflare Turnstile site key...
TURNSTILE_SECRET_KEY=...your Cloudflare Turnstile secret...
```

`deploy-sso-rsync.sh` **does not** sync `wordpress/` (by design). Copy the contact MU-plugin manually when it changes:

```bash
# From a fresh GitHub pull on the VPS:
cp /tmp/physicalrisk-pull/wordpress/wp-content/mu-plugins/moss-contact-api.php \
  /opt/physicalrisk/wordpress/wp-content/mu-plugins/moss-contact-api.php
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d --force-recreate moss-api wordpress
```

## After deploy checklist

1. Portal login works
2. Launch MOSS + Repo from portal (no second login)
3. Submit `/start` questionnaire
4. SMTP test + send a report (PDF attached)
5. Logout returns cleanly to portal
