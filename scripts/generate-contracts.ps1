$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$taskGo = Get-Command go -ErrorAction SilentlyContinue
if (-not $taskGo) { $taskGoPath = Join-Path $env:LOCALAPPDATA 'Neiroot\tools\go\bin'; $env:Path = $taskGoPath + ';' + $env:Path }
$taskSource = & go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0 -generate types -package contracts docs/api/openapi.json
if ($LASTEXITCODE -ne 0) { throw 'Go contract generation failed' }
[IO.File]::WriteAllLines((Join-Path (Get-Location) 'internal/contracts/api.gen.go'),$taskSource,[Text.UTF8Encoding]::new($false))
go fmt ./internal/contracts
Push-Location 'tools/contracts'
try { npm ci; if ($LASTEXITCODE -ne 0) { throw 'Contract tool installation failed' } } finally { Pop-Location }
Push-Location 'apps/web'
try { npm run generate:api; if ($LASTEXITCODE -ne 0) { throw 'TypeScript contract generation failed' } } finally { Pop-Location }
