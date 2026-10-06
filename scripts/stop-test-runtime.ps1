$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskManifest=Join-Path $taskRoot '.local\native-tests\processes.json'
if(Test-Path -LiteralPath $taskManifest){foreach($taskEntry in (Get-Content -LiteralPath $taskManifest -Raw -Encoding utf8|ConvertFrom-Json)){
 $taskProcess=Get-Process -Id $taskEntry.id -ErrorAction SilentlyContinue
 if($taskProcess -and $taskProcess.Path -eq $taskEntry.path -and [math]::Abs(($taskProcess.StartTime-[datetime]$taskEntry.started).TotalSeconds)-lt 2){
  $taskChildren=Get-CimInstance Win32_Process|Where-Object ParentProcessId -eq $taskEntry.id
  foreach($taskChild in $taskChildren){Stop-Process -Id $taskChild.ProcessId -ErrorAction SilentlyContinue}
  Stop-Process -Id $taskEntry.id -ErrorAction SilentlyContinue
 }
}}
$taskPG=Join-Path $env:LOCALAPPDATA 'Neiroot\test-runtime\postgres\pgsql\bin\pg_ctl.exe'
$taskData=Join-Path $taskRoot '.local\native-tests\pgdata'
if(Test-Path -LiteralPath (Join-Path $taskData 'postmaster.pid')){& $taskPG -D $taskData -m fast -w stop}
Write-Output 'Native test processes stopped. Test data is retained; no volumes or source files were deleted.'
