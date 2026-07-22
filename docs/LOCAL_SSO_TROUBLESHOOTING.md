# Local SSO Troubleshooting

## Common Issues

### "Cannot find issuer" or OIDC discovery fails

**Cause**: Keycloak not ready or hostname not resolving.

**Fix**:
1. Check Keycloak health: `curl http://auth.localhost/health/ready`
2. Verify hosts file: `ping auth.localhost` should resolve to 127.0.0.1
3. Wait 30-60s after starting — Keycloak takes time to boot

### Infinite redirect loop on login

**Cause**: NextAuth callback URL mismatch or missing session cookie.

**Fix**:
1. Verify `NEXTAUTH_URL` matches the actual access URL
2. Check that Keycloak client has correct redirect URIs
3. Clear browser cookies for `*.localhost`
4. Ensure `SSO_COOKIE_SECURE=false` for HTTP development

### "Invalid or expired token" from API

**Cause**: Issuer mismatch between browser-facing URL and internal URL.

**Fix**:
- The API's `KEYCLOAK_ISSUER` must match what Keycloak puts in the token's `iss` claim
- Tokens issued via `http://auth.localhost` have issuer `http://auth.localhost/realms/physicalrisk`
- The JWKS URL can be internal (`http://keycloak:8080/...`) for Docker-to-Docker communication

### Port conflicts

**Fix**: Stop existing services that use ports 80, 3000, 3001, 3002, 4001, 4002, 8085.

```powershell
netstat -ano | findstr "LISTENING" | findstr "80 3000 3001 3002"
```

### Switching between SSO and standalone mode

Set `KEYCLOAK_ENABLED=false` in the app's environment to disable SSO and use local JWT auth.

### Resetting everything

```powershell
.\infrastructure\scripts\stop-local-sso.ps1 -Volumes
.\infrastructure\scripts\start-local-sso.ps1 -Build -Detach
```

## Logs

```powershell
# All services
docker compose -f docker-compose.sso.yml logs -f

# Specific service
docker compose -f docker-compose.sso.yml logs -f keycloak
docker compose -f docker-compose.sso.yml logs -f portal
docker compose -f docker-compose.sso.yml logs -f moss-web
docker compose -f docker-compose.sso.yml logs -f repo-api
```
