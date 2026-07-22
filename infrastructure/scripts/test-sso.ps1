# test-sso.ps1 — SSO health + OIDC discovery + in-container reachability
$ErrorActionPreference = "Continue"
$ComposeFile = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "docker-compose.sso.yml"
if (-not (Test-Path $ComposeFile)) {
    $ComposeFile = "docker-compose.sso.yml"
}

Write-Host "=== Physical Risk SSO Health Check ===" -ForegroundColor Cyan

$services = @(
    @{ Name = "Keycloak";   Url = "http://auth.localhost/health/ready" },
    @{ Name = "Portal";     Url = "http://apps.localhost" },
    @{ Name = "MOSS Web";   Url = "http://moss.localhost" },
    @{ Name = "MOSS API";   Url = "http://moss.localhost/api/health" },
    @{ Name = "Repo Web";   Url = "http://repo.localhost" },
    @{ Name = "Repo API";   Url = "http://repo.localhost/api/health" }
)

$allOk = $true
foreach ($svc in $services) {
    try {
        $response = Invoke-WebRequest -Uri $svc.Url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 5 -ErrorAction Stop
        if ($response.StatusCode -lt 500) {
            Write-Host "  [OK] $($svc.Name) ($($svc.Url)) [$($response.StatusCode)]" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] $($svc.Name) - Status $($response.StatusCode)" -ForegroundColor Yellow
            $allOk = $false
        }
    } catch {
        # Next.js auth gates often 307/302; treat redirect-capable responses as up
        $status = $null
        try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        if ($status -ge 300 -and $status -lt 500) {
            Write-Host "  [OK] $($svc.Name) ($($svc.Url)) [$status]" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $($svc.Name) ($($svc.Url))" -ForegroundColor Red
            $allOk = $false
        }
    }
}

Write-Host "`nChecking OIDC discovery (host)..." -ForegroundColor Cyan
$expectedIssuer = "http://auth.localhost/realms/physicalrisk"
try {
    $discovery = Invoke-RestMethod -Uri "$expectedIssuer/.well-known/openid-configuration" -TimeoutSec 5
    if ($discovery.issuer -ne $expectedIssuer) {
        Write-Host "  [FAIL] Issuer mismatch: $($discovery.issuer)" -ForegroundColor Red
        $allOk = $false
    } elseif ($discovery.token_endpoint -notlike "http://auth.localhost/*") {
        Write-Host "  [FAIL] Token endpoint not on auth.localhost: $($discovery.token_endpoint)" -ForegroundColor Red
        $allOk = $false
    } else {
        Write-Host "  [OK] Issuer: $($discovery.issuer)" -ForegroundColor Green
        Write-Host "  Token: $($discovery.token_endpoint)" -ForegroundColor Gray
        Write-Host "  Auth:  $($discovery.authorization_endpoint)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [FAIL] Cannot reach OIDC discovery endpoint" -ForegroundColor Red
    $allOk = $false
}

Write-Host "`nChecking auth.localhost from app containers..." -ForegroundColor Cyan
foreach ($svc in @("moss-web", "repo-web", "portal")) {
    try {
        $out = docker compose -f $ComposeFile exec -T $svc wget -qO- "http://auth.localhost/realms/physicalrisk/.well-known/openid-configuration" 2>&1
        if ($LASTEXITCODE -eq 0 -and ($out -match '"issuer"\s*:\s*"http://auth.localhost/realms/physicalrisk"')) {
            Write-Host "  [OK] $svc can reach auth.localhost discovery" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $svc discovery check failed" -ForegroundColor Red
            Write-Host "    $out" -ForegroundColor DarkGray
            $allOk = $false
        }
    } catch {
        Write-Host "  [FAIL] $svc exec failed: $_" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host "`nChecking Auth.js callback providers..." -ForegroundColor Cyan
foreach ($pair in @(
    @{ Name = "MOSS"; Url = "http://moss.localhost/api/auth/providers" },
    @{ Name = "Repo"; Url = "http://repo.localhost/api/auth/providers" },
    @{ Name = "Portal"; Url = "http://apps.localhost/api/auth/providers" }
)) {
    try {
        $providers = Invoke-RestMethod -Uri $pair.Url -TimeoutSec 5
        if ($providers.keycloak) {
            Write-Host "  [OK] $($pair.Name) keycloak provider present (callback /api/auth/callback/keycloak)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $($pair.Name) missing keycloak provider" -ForegroundColor Red
            $allOk = $false
        }
    } catch {
        Write-Host "  [FAIL] $($pair.Name) providers: $_" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""
if ($allOk) {
    Write-Host "All automated SSO checks passed." -ForegroundColor Green
    Write-Host "Manual: portal login → open MOSS → open Repo (no second password). Then global logout." -ForegroundColor Gray
    exit 0
} else {
    Write-Host "Some SSO checks failed. Inspect docker compose logs." -ForegroundColor Yellow
    exit 1
}
