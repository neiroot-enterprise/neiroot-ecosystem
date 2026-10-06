$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
New-Item -ItemType Directory -Force -Path '.local' | Out-Null
$taskVolumeName = 'neiroot_pgdata'
if ($env:COMPOSE_PROJECT_NAME) { $taskVolumeName = $env:COMPOSE_PROJECT_NAME + '_pgdata' }
function New-LocalSecret { $taskBytes = New-Object byte[] 32; $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $taskRng.GetBytes($taskBytes) } finally { $taskRng.Dispose() }; return ([BitConverter]::ToString($taskBytes)).Replace('-','').ToLowerInvariant() }
if (-not (Test-Path -LiteralPath '.env')) {
    $taskPreviousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & docker volume inspect $taskVolumeName *> $null
    $taskVolumeExit = $LASTEXITCODE
    $ErrorActionPreference = $taskPreviousErrorPreference
    if ($taskVolumeExit -eq 0) { throw 'Existing neiroot_pgdata volume found with incomplete .env. Restore its original .env; passwords must not be regenerated.' }
    $taskKeys = @('POSTGRES_PASSWORD','AUTH_PASSWORD','CORE_OWNER_PASSWORD','CORE_APP_PASSWORD','BFF_OWNER_PASSWORD','BFF_APP_PASSWORD','KEYCLOAK_ADMIN_PASSWORD','KEYCLOAK_WEB_SECRET','KEYCLOAK_PROVISIONER_SECRET','SESSION_ENCRYPTION_KEY')
    $taskLines = foreach ($taskKey in $taskKeys) { $taskKey + '=' + (New-LocalSecret) }
    [IO.File]::WriteAllLines((Join-Path $taskRoot '.env'),$taskLines,[Text.UTF8Encoding]::new($false))
}
# A copied template is supported: generate only missing/empty documented secrets.
$taskKeys = @('POSTGRES_PASSWORD','AUTH_PASSWORD','CORE_OWNER_PASSWORD','CORE_APP_PASSWORD','BFF_OWNER_PASSWORD','BFF_APP_PASSWORD','KEYCLOAK_ADMIN_PASSWORD','KEYCLOAK_WEB_SECRET','KEYCLOAK_PROVISIONER_SECRET','SESSION_ENCRYPTION_KEY')
$taskEnvLines = @(Get-Content -LiteralPath '.env')
$taskMissingKeys = @($taskKeys | Where-Object { $taskKey = $_; -not ($taskEnvLines | Where-Object { $_ -match ('^' + $taskKey + '=.+$') }) })
if ($taskMissingKeys.Count -gt 0) {
    $taskPreviousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & docker volume inspect $taskVolumeName *> $null
    $taskVolumeExit = $LASTEXITCODE
    $ErrorActionPreference = $taskPreviousErrorPreference
    if ($taskVolumeExit -eq 0) { throw 'Existing neiroot_pgdata volume found with incomplete .env. Restore its original .env; passwords must not be regenerated.' }
    foreach ($taskKey in $taskMissingKeys) {
        $taskEnvLines = @($taskEnvLines | Where-Object { $_ -notmatch ('^' + $taskKey + '=$') })
        $taskEnvLines += $taskKey + '=' + (New-LocalSecret)
    }
    [IO.File]::WriteAllLines((Join-Path $taskRoot '.env'),$taskEnvLines,[Text.UTF8Encoding]::new($false))
}
$taskConfig = @{}
foreach ($taskLine in Get-Content -LiteralPath '.env') { if ($taskLine -match '^([A-Z_]+)=(.+)$') { $taskConfig[$Matches[1]] = $Matches[2] } }
foreach ($taskKey in @('POSTGRES_PASSWORD','AUTH_PASSWORD','CORE_OWNER_PASSWORD','CORE_APP_PASSWORD','BFF_OWNER_PASSWORD','BFF_APP_PASSWORD','KEYCLOAK_ADMIN_PASSWORD','KEYCLOAK_WEB_SECRET','KEYCLOAK_PROVISIONER_SECRET','SESSION_ENCRYPTION_KEY')) { if ($taskConfig[$taskKey] -notmatch '^[a-f0-9]{64}$') { throw ('Invalid generated setting: ' + $taskKey) } }
$taskSQL = @"
CREATE ROLE auth_app LOGIN PASSWORD '$($taskConfig.AUTH_PASSWORD)';
CREATE DATABASE auth OWNER auth_app;
CREATE ROLE core_owner LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$($taskConfig.CORE_OWNER_PASSWORD)';
CREATE ROLE core_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$($taskConfig.CORE_APP_PASSWORD)';
CREATE DATABASE core OWNER core_owner;
CREATE ROLE bff_owner LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$($taskConfig.BFF_OWNER_PASSWORD)';
CREATE ROLE bff_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '$($taskConfig.BFF_APP_PASSWORD)';
CREATE DATABASE bff OWNER bff_owner;
REVOKE ALL ON DATABASE auth FROM PUBLIC;
REVOKE ALL ON DATABASE core FROM PUBLIC;
REVOKE ALL ON DATABASE bff FROM PUBLIC;
GRANT CONNECT ON DATABASE auth TO auth_app;
GRANT CONNECT ON DATABASE core TO core_app,core_owner;
GRANT CONNECT ON DATABASE bff TO bff_app,bff_owner;
"@
[IO.File]::WriteAllText((Join-Path $taskRoot '.local/pg-init.sql'),$taskSQL,[Text.UTF8Encoding]::new($false))
$taskRealm = Get-Content -LiteralPath 'infra/keycloak/realm-template.json' -Raw
$taskRealm = $taskRealm.Replace('__WEB_SECRET__',$taskConfig.KEYCLOAK_WEB_SECRET).Replace('__PROVISIONER_SECRET__',$taskConfig.KEYCLOAK_PROVISIONER_SECRET)
[IO.File]::WriteAllText((Join-Path $taskRoot '.local/neiroot-realm.json'),$taskRealm,[Text.UTF8Encoding]::new($false))
$taskToolsRoot = Join-Path $env:LOCALAPPDATA 'Neiroot/tools'
New-Item -ItemType Directory -Force -Path $taskToolsRoot | Out-Null
$taskMkcert = Join-Path $taskToolsRoot 'mkcert.exe'
if (-not (Test-Path -LiteralPath $taskMkcert)) { Invoke-WebRequest 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe' -OutFile $taskMkcert }
if (-not (Test-Path -LiteralPath '.local/localhost.pem')) {
    & $taskMkcert -install
    if ($LASTEXITCODE -ne 0) { throw 'Local CA installation failed.' }
    & $taskMkcert -cert-file '.local/localhost.pem' -key-file '.local/localhost-key.pem' localhost 127.0.0.1 ::1
    if ($LASTEXITCODE -ne 0) { throw 'Local certificate creation failed.' }
}
Write-Output 'Private configuration and localhost certificates are ready. Existing secrets were preserved.'
