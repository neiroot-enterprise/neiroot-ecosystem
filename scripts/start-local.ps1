$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24.14.1 is required in PATH. Install Node.js and reopen PowerShell.' }
$taskDocker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $taskDocker) {
    foreach ($taskPath in @("$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin",'C:\Program Files\Docker\Docker\resources\bin')) { if (Test-Path -LiteralPath (Join-Path $taskPath 'docker.exe')) { $env:Path = $taskPath + ';' + $env:Path; break } }
    $taskDocker = Get-Command docker -ErrorAction SilentlyContinue
}
if (-not $taskDocker) { throw 'Docker Desktop is not installed or docker.exe was not found.' }
function Get-NeirootDockerVersion {
    # Windows PowerShell 5 treats native stderr as an error; an initial failed probe is expected.
    $ErrorActionPreference = 'Continue'
    $taskProbe = & $taskDocker.Source info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -eq 0) { return $taskProbe }
}
$taskVersion = Get-NeirootDockerVersion
if (-not $taskVersion) {
    Write-Output 'Starting Docker Desktop...'
    & $taskDocker.Source desktop start --timeout 120
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop could not start. Check WSL 2 and Docker Desktop status.' }
    $taskDeadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $taskVersion = Get-NeirootDockerVersion
        if ($taskVersion) { break }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $taskDeadline)
    if (-not $taskVersion) { throw 'Docker Engine did not become ready within two minutes.' }
}
Write-Output ('Docker Engine ready: ' + $taskVersion)
& (Join-Path $PSScriptRoot 'setup-local.ps1')
& node (Join-Path $PSScriptRoot 'sync-design.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Design token synchronization failed.' }
& docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration is invalid.' }
& docker compose up -d --build --wait --wait-timeout 300
if ($LASTEXITCODE -ne 0) { throw 'Startup incomplete. Use docker compose ps and docker compose logs --tail 80.' }
& (Join-Path $PSScriptRoot 'configure-keycloak.ps1')
Write-Output 'Neiroot is ready at https://localhost:8443'
