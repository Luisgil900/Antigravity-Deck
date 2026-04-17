$ErrorActionPreference = 'Stop'
$DECK_DIR = 'c:\Users\luisg\Music\ANTIGRAVITY\Antigravity-Deck'
$AUTH_KEY = '8fa08b40314ae2554abdea8828924806'

Write-Host 'Iniciando Entorno Personalizado (Modo Ngrok Puro)...' -ForegroundColor Cyan
if (Test-Path $DECK_DIR) {
    Push-Location $DECK_DIR
    
    # 1. Servidor PWA Oculto
    $env:AUTH_KEY = $AUTH_KEY
    Start-Process cmd.exe -ArgumentList "/c set AUTH_KEY=$AUTH_KEY && cd /d $DECK_DIR && node start-tunnel.js --local --quiet" -WindowStyle Hidden
    
    # 2. Terminal de Ngrok Limpia (Una sola ventana)
    Start-Process cmd.exe -ArgumentList "/k title Mi-Dominio-Ngrok && ngrok http 9807" -WindowStyle Normal
    
    Start-Sleep -Seconds 5
    Pop-Location
    Write-Host 'Listo.' -ForegroundColor Green
}
