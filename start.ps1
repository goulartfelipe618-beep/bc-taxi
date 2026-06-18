# BC Taxi — inicia API + apps Flutter (passageiro e motorista)
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Flutter = "C:\flutter\bin\flutter.bat"

Write-Host "=== BC Taxi Dev ===" -ForegroundColor Cyan

Write-Host "Iniciando API (porta 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\apps\api'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "Compilando apps Flutter..." -ForegroundColor Yellow
Push-Location "$Root\apps\flutter"
& $Flutter pub get --no-example 2>&1 | Out-Null
& $Flutter build web -t lib/main_passenger.dart -o build/web-passenger --no-wasm-dry-run 2>&1
& $Flutter build web -t lib/main_driver.dart -o build/web-driver --no-wasm-dry-run 2>&1
Pop-Location

Write-Host "Passageiro: http://127.0.0.1:8085" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\apps\flutter\build\web-passenger'; python -m http.server 8085 --bind 127.0.0.1"

Write-Host "Motorista:  http://127.0.0.1:8086" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\apps\flutter\build\web-driver'; python -m http.server 8086 --bind 127.0.0.1"

Start-Sleep -Seconds 3
try {
  $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
  Write-Host "API OK: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
  Write-Host "API ainda iniciando... aguarde alguns segundos." -ForegroundColor Yellow
}

Write-Host "`nPronto! Abra os links acima no navegador." -ForegroundColor Cyan
