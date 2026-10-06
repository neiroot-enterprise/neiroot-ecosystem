param([Parameter(Mandatory=$true)][ValidateSet('java','postgres','keycloak','traefik')][string]$Component)
$ErrorActionPreference = 'Stop'
$taskRuntime = Join-Path $env:LOCALAPPDATA 'Neiroot\test-runtime'
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
$taskChecksum = ''
switch ($Component) {
 'java' { $taskURL='https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.4.1%2B1/OpenJDK25U-jdk_x64_windows_hotspot_25.0.4.1_1.zip'; $taskChecksum='00c847d804f4a78e9f04f2683faf14fed898535b177b7fc704486cb0284e9283'; $taskVersion='25.0.4.1+1' }
 'postgres' { $taskURL='https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip';$taskVersion='18.6' }
 'keycloak' { $taskURL='https://github.com/keycloak/keycloak/releases/download/26.8.0/keycloak-26.8.0.zip';$taskVersion='26.8.0';$taskRelease=Invoke-RestMethod 'https://api.github.com/repos/keycloak/keycloak/releases/tags/26.8.0';$taskAsset=$taskRelease.assets|Where-Object name -eq 'keycloak-26.8.0.zip';if($taskAsset.digest -like 'sha256:*'){$taskChecksum=$taskAsset.digest.Substring(7)} }
 'traefik' { $taskURL='https://github.com/traefik/traefik/releases/download/v3.7.13/traefik_v3.7.13_windows_amd64.zip';$taskVersion='3.7.13';$taskRelease=Invoke-RestMethod 'https://api.github.com/repos/traefik/traefik/releases/tags/v3.7.13';$taskAsset=$taskRelease.assets|Where-Object name -eq 'traefik_v3.7.13_windows_amd64.zip';if($taskAsset.digest -like 'sha256:*'){$taskChecksum=$taskAsset.digest.Substring(7)} }
}
$taskZip=Join-Path $taskRuntime ($Component + '-' + $taskVersion + '.zip')
$taskDestination=Join-Path $taskRuntime $Component
if(-not(Test-Path -LiteralPath $taskZip)){Invoke-WebRequest -Uri $taskURL -OutFile $taskZip}
$taskActual=(Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
if($taskChecksum -and $taskActual -ne $taskChecksum){throw ($Component + ' checksum mismatch')}
if(-not(Test-Path -LiteralPath (Join-Path $taskDestination '.extracted'))){New-Item -ItemType Directory -Force -Path $taskDestination|Out-Null;Expand-Archive -LiteralPath $taskZip -DestinationPath $taskDestination -Force;[IO.File]::WriteAllText((Join-Path $taskDestination '.extracted'),$taskActual)}
@{component=$Component;version=$taskVersion;url=$taskURL;sha256=$taskActual;upstreamChecksumVerified=[bool]$taskChecksum}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskRuntime ($Component + '.json')) -Encoding utf8
Write-Output ($Component + ' test runtime ready: ' + $taskVersion)
