# reset-keycloak.ps1 — Reset Keycloak database and re-import realm
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root ".env.sso"
$composeFile = Join-Path $root "docker-compose.sso.yml"

Write-Host "Resetting Keycloak..." -ForegroundColor Cyan

$composeArgs = @("-f", $composeFile)
if (Test-Path $envFile) { $composeArgs += @("--env-file", $envFile) }

# Stop keycloak and its database
docker compose @composeArgs stop keycloak keycloak-db
docker compose @composeArgs rm -f keycloak keycloak-db

# Remove keycloak volume
docker volume rm physicalrisk_keycloak_postgres 2>$null

# Restart
docker compose @composeArgs up -d keycloak-db
Start-Sleep -Seconds 5
docker compose @composeArgs up -d keycloak

Write-Host "Keycloak reset complete. Realm will re-import on startup." -ForegroundColor Green
Write-Host "Wait ~30s for Keycloak to be healthy." -ForegroundColor Gray
