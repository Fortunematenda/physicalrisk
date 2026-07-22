# add-hosts.ps1 — Add local SSO hostnames to Windows hosts file
# Run as Administrator

$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$entries = @(
    "127.0.0.1 auth.localhost",
    "127.0.0.1 apps.localhost",
    "127.0.0.1 moss.localhost",
    "127.0.0.1 repo.localhost"
)

Write-Host "Checking hosts file entries..." -ForegroundColor Cyan
$content = Get-Content $hostsFile -ErrorAction Stop

foreach ($entry in $entries) {
    if ($content -notcontains $entry) {
        Add-Content -Path $hostsFile -Value $entry
        Write-Host "  Added: $entry" -ForegroundColor Green
    } else {
        Write-Host "  Already present: $entry" -ForegroundColor Yellow
    }
}

Write-Host "`nDone. Local SSO hostnames configured." -ForegroundColor Cyan
Write-Host "You can verify with: ping auth.localhost" -ForegroundColor Gray
