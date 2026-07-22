# stop-local-sso.ps1 — Stop the Physical Risk SSO environment
param(
    [switch]$Volumes
)

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root ".env.sso"
$composeFile = Join-Path $root "docker-compose.sso.yml"

Write-Host "Stopping Physical Risk SSO services..." -ForegroundColor Cyan

$composeArgs = @("-f", $composeFile)
if (Test-Path $envFile) { $composeArgs += @("--env-file", $envFile) }

$downArgs = $composeArgs + @("down")
if ($Volumes) {
    $downArgs += "-v"
    Write-Host "  (Including volumes)" -ForegroundColor Yellow
}

docker compose @downArgs

Write-Host "Done." -ForegroundColor Green
