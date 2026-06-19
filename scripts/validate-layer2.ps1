# Valida Camada 2 - Windows PowerShell
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "=== BC Taxi - validate Layer 2 ===" -ForegroundColor Cyan

Push-Location "$Root\apps\api"
try {
  & npm.cmd run test:layer2
  if ($LASTEXITCODE -ne 0) { throw "test:layer2 failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Layer 2 OK" -ForegroundColor Green
