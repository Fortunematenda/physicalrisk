# start-local-sso.ps1 — Start the full Physical Risk SSO development environment
param(
    [switch]$Build,
    [switch]$Detach
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "=== Physical Risk Local SSO ===" -ForegroundColor Cyan
Write-Host "Root: $root" -ForegroundColor Gray

# Check for .env.sso
$envFile = Join-Path $root ".env.sso"
if (-not (Test-Path $envFile)) {
    Write-Host "Creating .env.sso from .env.sso.example..." -ForegroundColor Yellow
    Copy-Item (Join-Path $root ".env.sso.example") $envFile
}

# Build arguments
$composeArgs = @("-f", (Join-Path $root "docker-compose.sso.yml"), "--env-file", $envFile)

if ($Build) {
    Write-Host "`nBuilding containers..." -ForegroundColor Yellow
    docker compose @composeArgs build
}

Write-Host "`nStarting services..." -ForegroundColor Yellow
$upArgs = $composeArgs + @("up")
if ($Detach) { $upArgs += "-d" }
docker compose @upArgs

if ($Detach) {
    Write-Host "`n=== Services Started ===" -ForegroundColor Green
    Write-Host "  Portal:    http://apps.localhost" -ForegroundColor White
    Write-Host "  Keycloak:  http://auth.localhost" -ForegroundColor White
    Write-Host "  MOSS:      http://moss.localhost" -ForegroundColor White
    Write-Host "  Repo:      http://repo.localhost" -ForegroundColor White
    Write-Host "`n  Keycloak Admin: http://auth.localhost/admin" -ForegroundColor Gray
    Write-Host "  Direct ports: :3000 (portal), :3001 (moss), :3002 (repo), :8085 (keycloak)" -ForegroundColor Gray
}
