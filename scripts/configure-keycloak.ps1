$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskConfig = @{}
foreach ($taskLine in Get-Content -LiteralPath (Join-Path $taskRoot '.env')) { if ($taskLine -match '^([A-Z_]+)=(.+)$') { $taskConfig[$Matches[1]] = $Matches[2] } }
$taskBase = 'https://localhost:8443/auth'
$taskTokenResponse = Invoke-RestMethod -Method Post -Uri ($taskBase + '/realms/master/protocol/openid-connect/token') -Body @{grant_type='password';client_id='admin-cli';username='neiroot-local-admin';password=$taskConfig.KEYCLOAK_ADMIN_PASSWORD}
$taskHeaders = @{Authorization=('Bearer ' + $taskTokenResponse.access_token)}
$taskProfile = Get-Content -LiteralPath (Join-Path $taskRoot 'infra/keycloak/user-profile.json') -Raw -Encoding utf8
Invoke-RestMethod -Method Put -Uri ($taskBase + '/admin/realms/neiroot/users/profile') -Headers $taskHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($taskProfile)) | Out-Null
# Registration validates required name components. Existing/provisioned accounts keep
# their full_name and must not acquire an unsolicited profile-completion screen.
$taskVerifyProfile = Invoke-RestMethod -Uri ($taskBase + '/admin/realms/neiroot/authentication/required-actions/VERIFY_PROFILE') -Headers $taskHeaders
$taskVerifyProfile.enabled = $false
$taskVerifyProfile.defaultAction = $false
Invoke-RestMethod -Method Put -Uri ($taskBase + '/admin/realms/neiroot/authentication/required-actions/VERIFY_PROFILE') -Headers $taskHeaders -ContentType 'application/json' -Body ($taskVerifyProfile | ConvertTo-Json -Depth 10 -Compress) | Out-Null
$taskClients=Invoke-RestMethod -Uri ($taskBase+'/admin/realms/neiroot/clients?clientId=neiroot-web') -Headers $taskHeaders
$taskScopes=Invoke-RestMethod -Uri ($taskBase+'/admin/realms/neiroot/client-scopes') -Headers $taskHeaders
$taskBasic=$taskScopes|Where-Object name -eq 'basic'
if(-not $taskBasic){throw 'Keycloak basic scope is missing; access tokens must include subject.'}
Invoke-RestMethod -Method Put -Uri ($taskBase+'/admin/realms/neiroot/clients/'+$taskClients[0].id+'/default-client-scopes/'+$taskBasic.id) -Headers $taskHeaders | Out-Null
$taskNameMapper = @{name='middle-name';protocol='openid-connect';protocolMapper='oidc-usermodel-attribute-mapper';config=@{'user.attribute'='middle_name';'claim.name'='middle_name';'jsonType.label'='String';'access.token.claim'='true';'id.token.claim'='true';'userinfo.token.claim'='true'}}
$taskMapperBase = $taskBase+'/admin/realms/neiroot/clients/'+$taskClients[0].id+'/protocol-mappers/models'
$taskExistingMappers = Invoke-RestMethod -Uri $taskMapperBase -Headers $taskHeaders
if (-not ($taskExistingMappers | Where-Object name -eq 'middle-name')) { Invoke-RestMethod -Method Post -Uri $taskMapperBase -Headers $taskHeaders -ContentType 'application/json' -Body ($taskNameMapper | ConvertTo-Json -Depth 10 -Compress) | Out-Null }
Write-Output 'Keycloak profile and phone/email authentication configuration are ready.'
