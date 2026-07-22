$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body '{"email":"admin@physicalrisk.com","password":"CHANGE_ME_DEMO_PASSWORD"}'
$token = $login.accessToken
$headers = @{ 'Authorization' = "Bearer $token" }

$projects = Invoke-RestMethod -Uri "$base/projects" -Headers $headers
$sources = Invoke-RestMethod -Uri "$base/source-systems" -Headers $headers
$projectId = $projects[0].id
$sourceId = $sources[0].id

$fixtureA = 'test-import-a.txt'
$fixtureB = 'test-import-b.txt'
$fixtureC = 'test-import-c.txt'
Set-Content -Path $fixtureA -Value "Approved alpha version 1.0" -NoNewline
Set-Content -Path $fixtureB -Value "Approved alpha version 1.1" -NoNewline
Set-Content -Path $fixtureC -Value "Approved alpha version 0.9" -NoNewline

function Invoke-Upload($file, $title, $version, $code) {
  $fields = @(
    "projectId=$projectId",
    "sourceSystemId=$sourceId",
    "title=$title",
    "documentType=Release Notes",
    "versionNo=$version",
    "approvedBy=Tester",
    "approvalDate=2026-07-18",
    "approvalStatus=APPROVED"
  )
  if ($code) { $fields += "documentCode=$code" }
  $uploadArgs = @('-s', '-w', "\n%{http_code}", '-X', 'POST', "$base/imports/upload", '-H', "Authorization: Bearer $token")
  foreach ($field in $fields) { $uploadArgs += '-F'; $uploadArgs += $field }
  $uploadArgs += '-F'; $uploadArgs += "file=@$file"
  $output = curl.exe @uploadArgs
  $lines = $output -split "\r?\n"
  $statusCode = $lines[-1].Trim()
  $json = $lines[0..($lines.Length - 2)] -join "\n"
  $payload = $json | ConvertFrom-Json
  return @{ StatusCode = $statusCode; Payload = $payload }
}

function Assert-Error($result, $expectedCode) {
  if ($result.StatusCode -eq '200' -or -not $result.Payload.code) {
    throw "Expected error $expectedCode but import succeeded"
  }
  if ($result.Payload.code -ne $expectedCode) {
    throw "Expected error $expectedCode but got $($result.Payload.code): $($result.Payload.message)"
  }
  return $result.Payload
}

function Assert-Imported($result) {
  if ($result.Payload.status -ne 'IMPORTED') {
    throw "Expected IMPORTED but got status $($result.Payload.status) (HTTP $($result.StatusCode))"
  }
  return $result.Payload
}

# Scenario A: brand new document and version
$new = Assert-Imported (Invoke-Upload -file $fixtureA -title 'Release Alpha' -version '1.0')
$docCode = $new.document.code
$docId = $new.document.id
Write-Host "Scenario A passed: imported $($new.document.code) version $($new.version.versionNo)"

# Scenario B: same document, same content, version changed -> rejected
$b = Assert-Error (Invoke-Upload -file $fixtureA -title 'Release Alpha' -version '1.2' -code $docCode) 'DUPLICATE_DOCUMENT_CONTENT'
Write-Host "Scenario B passed: duplicate content rejected with code $($b.code)"

# Scenario C: same document, same version number, different content -> rejected
$c = Assert-Error (Invoke-Upload -file $fixtureC -title 'Release Alpha' -version '1.0' -code $docCode) 'DUPLICATE_VERSION_NUMBER'
Write-Host "Scenario C passed: duplicate version number rejected with code $($c.code)"

# Scenario D: same document, newer version, different content -> accepted
$updated = Assert-Imported (Invoke-Upload -file $fixtureB -title 'Release Alpha' -version '1.1' -code $docCode)
if ($updated.version.versionNo -ne '1.1') { throw "Scenario D failed: expected 1.1, got $($updated.version.versionNo)" }
if ($updated.document.currentVersionNo -ne '1.1') { throw "Scenario D failed: document currentVersionNo not updated" }
Write-Host "Scenario D passed: new version 1.1 imported and current version updated"

# Scenario E: same document, older version (new content) -> rejected
$e = Assert-Error (Invoke-Upload -file $fixtureC -title 'Release Alpha' -version '0.9' -code $docCode) 'VERSION_NOT_NEWER'
Write-Host "Scenario E passed: older version rejected with code $($e.code)"

# Scenario F: verify document history lists two versions
$document = Invoke-RestMethod -Uri "$base/documents/$docId" -Headers $headers
if ($document.versions.Count -lt 2) { throw "Scenario F failed: expected 2 versions, found $($document.versions.Count)" }
Write-Host "Scenario F passed: document history contains $($document.versions.Count) versions"

# Cleanup fixture files
Remove-Item -Path $fixtureA, $fixtureB, $fixtureC -ErrorAction SilentlyContinue
Write-Host 'All import versioning scenarios passed.'
