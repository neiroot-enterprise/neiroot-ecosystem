param([switch]$SkipWindowsInstall)
$ErrorActionPreference = 'Stop'
$taskToolsRoot = Join-Path $env:LOCALAPPDATA 'Neiroot\tools'
New-Item -ItemType Directory -Path $taskToolsRoot -Force | Out-Null
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    $taskRelease = (Invoke-RestMethod 'https://go.dev/dl/?mode=json&include=all') | Where-Object version -eq 'go1.27.1' | Select-Object -First 1
    $taskArchive = $taskRelease.files | Where-Object { $_.os -eq 'windows' -and $_.arch -eq 'amd64' -and $_.kind -eq 'archive' }
    if (-not $taskArchive) { throw 'Go 1.27.1 archive not available from official release metadata.' }
    $taskZip = Join-Path $taskToolsRoot $taskArchive.filename
    if (-not (Test-Path -LiteralPath $taskZip)) { Invoke-WebRequest ('https://go.dev/dl/' + $taskArchive.filename) -OutFile $taskZip }
    if ((Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskArchive.sha256) { throw 'Go checksum mismatch.' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskToolsRoot 'go\bin\go.exe'))) { Expand-Archive -LiteralPath $taskZip -DestinationPath $taskToolsRoot }
    $taskGoBin = Join-Path $taskToolsRoot 'go\bin'
    $taskUserPath = [Environment]::GetEnvironmentVariable('Path','User')
    if ($taskUserPath -notlike "*$taskGoBin*") { [Environment]::SetEnvironmentVariable('Path', ($taskUserPath + ';' + $taskGoBin), 'User') }
    $env:Path = $taskGoBin + ';' + $env:Path
}
go version
if (-not $SkipWindowsInstall) {
    $taskAdminScript = Join-Path $PSScriptRoot 'install-wsl-admin.ps1'
    Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $taskAdminScript + '"'))
}
Write-Output 'Go ready. Windows prerequisite progress is recorded in .local/wsl-install.log; a restart is never performed automatically.'
