$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'generate-icons.cjs')
exit $LASTEXITCODE
