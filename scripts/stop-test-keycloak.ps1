$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskEntry=(Get-Content -LiteralPath (Join-Path $taskRoot '.local/native-tests/processes.json') -Raw -Encoding utf8|ConvertFrom-Json)|Where-Object name -eq 'keycloak'
if(-not $taskEntry){throw 'Managed native test Keycloak process not found.'}
$taskProcess=Get-Process -Id $taskEntry.id -ErrorAction Stop
if($taskProcess.Path -ne $taskEntry.path -or [math]::Abs(($taskProcess.StartTime-[datetime]$taskEntry.started).TotalSeconds)-gt 2){throw 'Process identity changed. Refusing to stop an unrelated process.'}
$taskChildren=Get-CimInstance Win32_Process|Where-Object ParentProcessId -eq $taskEntry.id
foreach($taskChild in $taskChildren){Stop-Process -Id $taskChild.ProcessId -ErrorAction SilentlyContinue}
Stop-Process -Id $taskEntry.id -ErrorAction SilentlyContinue
Write-Output 'Managed test Keycloak stopped for failure verification.'
