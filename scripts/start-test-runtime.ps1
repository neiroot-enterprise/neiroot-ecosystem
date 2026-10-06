# Disposable native integration environment. Production/local application startup uses start-local.ps1.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskRuntime = Join-Path $env:LOCALAPPDATA 'Neiroot\test-runtime'
$taskLocal = Join-Path $taskRoot '.local\native-tests'
New-Item -ItemType Directory -Force -Path $taskLocal | Out-Null
$taskConfig = @{}
foreach ($taskLine in Get-Content -LiteralPath '.env') { if ($taskLine -match '^([A-Z_]+)=(.+)$') { $taskConfig[$Matches[1]]=$Matches[2] } }
$taskJava = (Get-ChildItem -LiteralPath (Join-Path $taskRuntime 'java') -Directory | Select-Object -First 1).FullName
$taskPG = Join-Path $taskRuntime 'postgres\pgsql\bin'
$taskKC = Join-Path $taskRuntime 'keycloak\keycloak-26.8.0'
$taskProxy = Join-Path $taskRuntime 'traefik\traefik.exe'
$taskGo = Join-Path $env:LOCALAPPDATA 'Neiroot\tools\go\bin\go.exe'
foreach($taskExecutable in @((Join-Path $taskJava 'bin\java.exe'),(Join-Path $taskPG 'pg_ctl.exe'),$taskProxy,$taskGo)) { if(-not(Test-Path -LiteralPath $taskExecutable)){throw 'Install all four test runtime components before starting.'} }
foreach($taskPort in @(8443,5173,28000,28001,28080,25432)){if(Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue){throw ('Test port already in use: '+$taskPort)}}
$taskData = Join-Path $taskLocal 'pgdata'
if(-not(Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))){
 $taskPasswordFile=Join-Path $taskLocal 'pg-password.txt'
 [IO.File]::WriteAllText($taskPasswordFile,$taskConfig.POSTGRES_PASSWORD,[Text.UTF8Encoding]::new($false))
 & (Join-Path $taskPG 'initdb.exe') -D $taskData -U postgres -A scram-sha-256 --encoding=UTF8 --locale-provider=icu --icu-locale=ru-RU --pwfile=$taskPasswordFile
 if($LASTEXITCODE -ne 0){throw 'Test PostgreSQL initialization failed'}
}
& (Join-Path $taskPG 'pg_ctl.exe') -D $taskData -l (Join-Path $taskLocal 'postgres.log') -o '-h 127.0.0.1 -p 25432' -w start
if($LASTEXITCODE -ne 0){throw 'Test PostgreSQL startup failed'}
$env:PGPASSWORD=$taskConfig.POSTGRES_PASSWORD
$taskDatabaseExists=& (Join-Path $taskPG 'psql.exe') -h 127.0.0.1 -p 25432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='core'"
if($taskDatabaseExists -ne '1'){& (Join-Path $taskPG 'psql.exe') -h 127.0.0.1 -p 25432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f (Join-Path $taskRoot '.local\pg-init.sql');if($LASTEXITCODE -ne 0){throw 'Test database provisioning failed'}}
Remove-Item Env:PGPASSWORD
$taskCoreExe=Join-Path $taskLocal 'core.exe';$taskBffExe=Join-Path $taskLocal 'bff.exe'
& $taskGo build -o $taskCoreExe ./services/core;if($LASTEXITCODE -ne 0){throw 'Core build failed'}
& $taskGo build -o $taskBffExe ./services/bff;if($LASTEXITCODE -ne 0){throw 'BFF build failed'}
$env:MIGRATE_ONLY='true'
$env:MIGRATION_DATABASE_URL='postgres://core_owner:'+ $taskConfig.CORE_OWNER_PASSWORD+'@127.0.0.1:25432/core?sslmode=disable'
& $taskCoreExe;if($LASTEXITCODE -ne 0){throw 'Core migration failed'}
$env:MIGRATION_DATABASE_URL='postgres://bff_owner:'+ $taskConfig.BFF_OWNER_PASSWORD+'@127.0.0.1:25432/bff?sslmode=disable'
& $taskBffExe;if($LASTEXITCODE -ne 0){throw 'BFF migration failed'}
Remove-Item Env:MIGRATE_ONLY;Remove-Item Env:MIGRATION_DATABASE_URL
New-Item -ItemType Directory -Force -Path (Join-Path $taskKC 'data\import') | Out-Null
Copy-Item -LiteralPath '.local\neiroot-realm.json' -Destination (Join-Path $taskKC 'data\import\neiroot-realm.json') -Force
Copy-Item -LiteralPath 'infra\keycloak\themes\neiroot' -Destination (Join-Path $taskKC 'themes') -Recurse -Force
$env:JAVA_HOME=$taskJava;$env:JAVA_OPTS_APPEND='-Xms256m -Xmx1024m'
$env:KC_CACHE='local';$env:KC_HTTP_MANAGEMENT_HOST='127.0.0.1'
$env:KC_DB='postgres';$env:KC_DB_URL='jdbc:postgresql://127.0.0.1:25432/auth';$env:KC_DB_USERNAME='auth_app';$env:KC_DB_PASSWORD=$taskConfig.AUTH_PASSWORD
$env:KC_HTTP_ENABLED='true';$env:KC_HTTP_HOST='127.0.0.1';$env:KC_HTTP_PORT='28080';$env:KC_HTTP_RELATIVE_PATH='/auth';$env:KC_HTTP_MANAGEMENT_PORT='29000';$env:KC_HTTP_MANAGEMENT_RELATIVE_PATH='/';$env:KC_HOSTNAME='https://localhost:8443/auth';$env:KC_PROXY_HEADERS='xforwarded';$env:KC_HEALTH_ENABLED='true';$env:KC_BOOTSTRAP_ADMIN_USERNAME='neiroot-local-admin';$env:KC_BOOTSTRAP_ADMIN_PASSWORD=$taskConfig.KEYCLOAK_ADMIN_PASSWORD
$taskProcesses = @()
function Start-TestProcess($taskName,$taskFile,$taskArguments,$taskWorkingDirectory){$taskOptions=@{FilePath=$taskFile;WorkingDirectory=$taskWorkingDirectory;WindowStyle='Hidden';RedirectStandardOutput=(Join-Path $taskLocal ($taskName+'.stdout.log'));RedirectStandardError=(Join-Path $taskLocal ($taskName+'.stderr.log'));PassThru=$true};if($taskArguments){$taskOptions.ArgumentList=$taskArguments};$taskProcess=Start-Process @taskOptions;return @{name=$taskName;id=$taskProcess.Id;path=$taskFile;started=$taskProcess.StartTime.ToString('o')}}
$taskProcesses+=Start-TestProcess 'keycloak' $env:ComSpec ('/d /s /c ""'+(Join-Path $taskKC 'bin\kc.bat')+'" start --import-realm"') $taskKC
$env:PUBLIC_URL='https://localhost:8443';$env:OIDC_ISSUER='https://localhost:8443/auth/realms/neiroot';$env:OIDC_INTERNAL_ISSUER='http://127.0.0.1:28080/auth/realms/neiroot';$env:KEYCLOAK_INTERNAL_URL='http://127.0.0.1:28080/auth';$env:KEYCLOAK_PROVISIONER_SECRET=$taskConfig.KEYCLOAK_PROVISIONER_SECRET
$env:DATABASE_URL='postgres://core_app:'+ $taskConfig.CORE_APP_PASSWORD+'@127.0.0.1:25432/core?sslmode=disable';$env:LISTEN_ADDR='127.0.0.1:28001'
$taskProcesses+=Start-TestProcess 'core' $taskCoreExe '' $taskRoot
$env:DATABASE_URL='postgres://bff_app:'+ $taskConfig.BFF_APP_PASSWORD+'@127.0.0.1:25432/bff?sslmode=disable';$env:LISTEN_ADDR='127.0.0.1:28000';$env:CORE_URL='http://127.0.0.1:28001';$env:KEYCLOAK_WEB_SECRET=$taskConfig.KEYCLOAK_WEB_SECRET;$env:SESSION_ENCRYPTION_KEY=$taskConfig.SESSION_ENCRYPTION_KEY
$taskProcesses+=Start-TestProcess 'bff' $taskBffExe '' $taskRoot
$taskNode=(Get-Command node).Source
$taskProcesses+=Start-TestProcess 'web' $taskNode ('"'+(Join-Path $taskRoot 'apps\web\node_modules\vite\bin\vite.js')+'" preview --host 127.0.0.1 --port 5173 --strictPort') (Join-Path $taskRoot 'apps\web')
$taskRoutes=(Get-Content -LiteralPath 'infra\routes.yml' -Raw).Replace('http://keycloak:8080','http://127.0.0.1:28080').Replace('http://bff:8080','http://127.0.0.1:28000').Replace('http://web:8080','http://127.0.0.1:5173').Replace('/certs/localhost.pem',(Join-Path $taskRoot '.local\localhost.pem').Replace('\','/')).Replace('/certs/localhost-key.pem',(Join-Path $taskRoot '.local\localhost-key.pem').Replace('\','/'))
[IO.File]::WriteAllText((Join-Path $taskLocal 'routes.yml'),$taskRoutes,[Text.UTF8Encoding]::new($false))
$taskProxyConfig=(Get-Content -LiteralPath 'infra\traefik.yml' -Raw).Replace("address: ':8443'","address: '127.0.0.1:8443'").Replace('/etc/traefik/routes.yml',(Join-Path $taskLocal 'routes.yml').Replace('\','/'))
[IO.File]::WriteAllText((Join-Path $taskLocal 'traefik.yml'),$taskProxyConfig,[Text.UTF8Encoding]::new($false))
$taskProcesses+=Start-TestProcess 'traefik' $taskProxy ('--configFile="'+(Join-Path $taskLocal 'traefik.yml')+'"') $taskRoot
$taskProcesses|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskLocal 'processes.json') -Encoding utf8
$taskDeadline=[DateTime]::UtcNow.AddSeconds(120)
do {
 $taskReady=$false
 try {$taskReady=(Invoke-WebRequest -UseBasicParsing -Uri 'https://localhost:8443/auth/realms/neiroot/.well-known/openid-configuration' -TimeoutSec 3).StatusCode -eq 200} catch {}
 if(-not $taskReady){Start-Sleep -Seconds 2}
} until($taskReady -or [DateTime]::UtcNow -gt $taskDeadline)
if(-not $taskReady){throw 'Keycloak test runtime did not become ready. Inspect the private runtime logs.'}
& (Join-Path $PSScriptRoot 'configure-keycloak.ps1')
Write-Output 'Native integration environment is ready. This environment contains only synthetic test data.'
