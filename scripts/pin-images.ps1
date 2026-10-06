# Run intentionally when updating container versions; normal startup uses the saved digests.
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskImages=@(@('golang','1.27.1-bookworm'),@('node','24.14.1-bookworm-slim'),@('alpine','3.23.4'),@('nginx','1.30.5-alpine'),@('postgres','18.6-bookworm'),@('traefik','v3.7.13'))
$taskEntries=@()
foreach($taskImage in $taskImages){
 $taskSource='https://hub.docker.com/v2/repositories/library/'+$taskImage[0]+'/tags/'+$taskImage[1]
 $taskTag=Invoke-RestMethod -Uri $taskSource -TimeoutSec 30
 if(-not($taskTag.images|Where-Object {$_.os -eq 'linux' -and $_.architecture -eq 'amd64'})){throw 'Required linux/amd64 image is absent.'}
 if($taskTag.digest -notmatch '^sha256:[0-9a-f]{64}$'){throw 'Invalid registry digest.'}
 $taskEntries+=@{image=($taskImage[0]+':'+$taskImage[1]);digest=$taskTag.digest;source=$taskSource}
}
$taskSource='https://quay.io/api/v1/repository/keycloak/keycloak/tag/?specificTag=26.8.0'
$taskTag=(Invoke-RestMethod -Uri $taskSource -TimeoutSec 30).tags|Where-Object name -eq '26.8.0'
if($taskTag.manifest_digest -notmatch '^sha256:[0-9a-f]{64}$'){throw 'Invalid Keycloak registry digest.'}
$taskEntries+=@{image='quay.io/keycloak/keycloak:26.8.0';digest=$taskTag.manifest_digest;source=$taskSource}
foreach($taskRelative in @('compose.yml','infra/Dockerfile.service','infra/Dockerfile.web')){
 $taskFile=Join-Path $taskRoot $taskRelative
 $taskText=Get-Content -LiteralPath $taskFile -Raw -Encoding utf8
 foreach($taskEntry in $taskEntries){$taskPattern=[regex]::Escape($taskEntry.image)+'(?:@sha256:[0-9a-f]{64})?(?=\s|$)';$taskText=[regex]::Replace($taskText,$taskPattern,($taskEntry.image+'@'+$taskEntry.digest))}
 [IO.File]::WriteAllText($taskFile,$taskText,[Text.UTF8Encoding]::new($false))
}
$taskLock=@{schemaVersion=1;images=$taskEntries}|ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $taskRoot 'infra/image-lock.json'),$taskLock+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
Write-Output 'Seven container image versions are pinned to verified registry digests.'
