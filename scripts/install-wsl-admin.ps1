$ErrorActionPreference = 'Stop'
$taskLocal = Join-Path (Split-Path $PSScriptRoot -Parent) '.local'
New-Item -ItemType Directory -Path $taskLocal -Force | Out-Null
Start-Transcript -Path (Join-Path $taskLocal 'wsl-install.log') -Force
try {
    & wsl.exe --install --no-distribution --no-launch
    $taskWslCode = $LASTEXITCODE
    "WSL_INSTALL_EXIT=$taskWslCode"
    Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform | Select-Object FeatureName,State
    'No automatic restart. If Windows reports restart required, restart manually before starting Docker.'
} finally { Stop-Transcript }
