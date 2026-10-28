# Managing MOSS users through Keycloak

With this set up, MOSS administrators can add users and analysts, change their MOSS role,
deactivate them and send password emails from **User administration**, **Consultants & Analysts**
and the triage **Add analyst** picker. MOSS updates Keycloak through its Admin REST API; nobody
needs to open the Keycloak console for day-to-day changes.

Until it is configured, MOSS keeps showing the **Manage users in Keycloak** link and changes nothing in Keycloak.

## What MOSS does and does not do

| Action in MOSS | What happens in Keycloak |
| --- | --- |
| Add user | Creates the account (no password), assigns the realm role, emails a link to set a password and verify the email. If the email already has an account, MOSS only assigns the role and sends nothing. |
| Change role | Adds the new `moss_*` role and removes the other `moss_analyst` / `moss_reviewer` / `moss_client` roles. Other roles (`portal_user`, `repo_*`) are untouched. |
| Deactivate | Disables the account and signs out its sessions. |
| Send password email | Emails a link to choose a new password. The current password keeps working until then. |

Limits enforced by the MOSS API:

- MOSS can only grant **Analyst** (`moss_analyst`), **Senior Reviewer** (`moss_reviewer`),
  **Client Executive** (`moss_client`) and **Client Contributor** (no role).
- MOSS never creates, edits, deactivates or emails users who hold `moss_admin`. Administrators stay in the Keycloak console.
- An administrator cannot change their own role or deactivate themselves from MOSS.
- MOSS never sees or sets passwords. Every change is recorded in the MOSS audit log.
- If Keycloak rejects a change, the MOSS record is left as it was. If role assignment fails for a new
  account, MOSS deletes that new account so no half-configured users are left behind.

## One-time Keycloak setup (realm `physicalrisk`)

Do this as a Keycloak administrator. It is not applied automatically.

1. **Clients → Create client**
   - Client type: OpenID Connect. Client ID: `moss-user-admin`.
   - Client authentication: **On**. Authorization: Off.
   - Authentication flow: tick only **Service accounts roles** (untick Standard flow and Direct access grants).
   - Save.
2. **moss-user-admin → Service account roles → Assign role → Filter by clients**, pick from `realm-management`:
   - `manage-users`
   - `view-users`
   - `query-users`

   Do not add `realm-admin`, `manage-realm` or `manage-clients`.
3. **moss-user-admin → Credentials**: copy the client secret.
4. **Realm settings → Email**: set the From address and SMTP server, then **Test connection**.
   Without this, accounts are still created but the set-password email fails, and MOSS shows a warning.
5. On the server, add to `.env.sso` (never commit this file):

   ```
   MOSS_KEYCLOAK_ADMIN_CLIENT_ID=moss-user-admin
   MOSS_KEYCLOAK_ADMIN_CLIENT_SECRET=<secret from step 3>
   # Optional: page people land on after setting their password. Must be an allowed
   # redirect URI of the physicalrisk-moss client, otherwise leave empty.
   MOSS_KEYCLOAK_INVITE_REDIRECT_URL=
   ```

6. Restart the API: `docker compose -f docker-compose.sso.yml --env-file .env.sso up -d moss-api`.

7. **Realm settings → Themes → Email theme**: `physicalrisk` (branded emails from
   `auth/keycloak/themes/physicalrisk/email`). Deploy the theme folder first; the realm JSON only applies to new installs.

The API reaches Keycloak on the internal URL derived from `KEYCLOAK_JWKS_URL`
(`http://keycloak:8080/realms/physicalrisk`). Set `KEYCLOAK_ADMIN_API_URL` only if that is not reachable.
Emailed links use the public address from `KEYCLOAK_ISSUER` (production: `https://auth.physicalrisk.com`):
MOSS sends it to Keycloak as `X-Forwarded-*` headers, which Keycloak honours because it runs with
`KC_PROXY_HEADERS=xforwarded`. A link emailed from a local stack always points at `auth.localhost`.

## Security notes

- Keycloak's `manage-users` permission is broad: in Keycloak itself it allows assigning any
  non-administrative realm role, including `moss_admin`. MOSS refuses to do that, but the client
  secret must be protected like an administrator password. To enforce the limit inside Keycloak as
  well, use fine-grained admin permissions to restrict which roles this service account may map.
- Rotate the secret in **Credentials → Regenerate** if it may have leaked, then update `.env.sso`.
- To switch the feature off, clear the two variables and restart `moss-api`. MOSS returns to the console link.

## Checking it works

1. Sign in to MOSS as an administrator and open **User administration**. The button reads **Add user**
   (not "Manage users in Keycloak") and the page says changes update Keycloak.
2. Add a test analyst with an email address you control. Confirm the email arrives, set a password,
   and sign in to MOSS. The user should land with the Analyst role.
3. Change their role to Senior Reviewer, sign out and back in, and confirm the new role.
4. Deactivate them and confirm they can no longer sign in.
