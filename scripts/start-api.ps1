# Inicia a API BC Taxi (porta 3000)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Push-Location "$Root\apps\api"
Write-Host "API em http://localhost:3000 (Ctrl+C para parar)" -ForegroundColor Cyan
& npm.cmd run dev
