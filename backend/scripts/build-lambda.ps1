param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDirectory = Split-Path -Parent $ScriptDirectory
$FunctionDirectory = Join-Path $BackendDirectory "lambda\game-api"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $BackendDirectory "dist\MiniGameJoinApiHandler.zip"
}

$ResolvedFunctionDirectory = [System.IO.Path]::GetFullPath($FunctionDirectory)
$ResolvedBackendDirectory = [System.IO.Path]::GetFullPath($BackendDirectory)

if (-not $ResolvedFunctionDirectory.StartsWith($ResolvedBackendDirectory)) {
  throw "Lambda source directory escaped the backend directory."
}

Push-Location $ResolvedFunctionDirectory
try {
  npm.cmd install --omit=dev
} finally {
  Pop-Location
}

$OutputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

Compress-Archive `
  -Path (Join-Path $ResolvedFunctionDirectory "src"), (Join-Path $ResolvedFunctionDirectory "node_modules"), (Join-Path $ResolvedFunctionDirectory "package.json") `
  -DestinationPath $OutputPath `
  -CompressionLevel Optimal

Write-Output "Created Lambda package: $OutputPath"
