# VRCSocial Server Watcher
# This script watches for .restart file and restarts the server
# Run this on the server: powershell -ExecutionPolicy Bypass -File server-watcher.ps1

$AppDir = "C:\server\vrcsocial"
$TriggerFile = "$AppDir\.restart"
$Port = 3000
$LastRestartTime = $null

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VRCSocial Server Watcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "App Directory: $AppDir"
Write-Host "Watching: $TriggerFile"
Write-Host "Port: $Port"
Write-Host ""

function Start-App {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting app..." -ForegroundColor Yellow
    
    # Kill existing process on port
    $processId = netstat -ano | Select-String ":$Port\s+.*LISTENING" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Select-Object -First 1
    
    if ($processId) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Stopping existing process (PID: $processId)..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # Start new process
    $env:NODE_ENV = "production"
    Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $AppDir -WindowStyle Hidden
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] App started!" -ForegroundColor Green
}

# Initial start
Start-App

Write-Host ""
Write-Host "Watching for restart triggers... (Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host ""

# Watch loop
while ($true) {
    if (Test-Path $TriggerFile) {
        $triggerTime = (Get-Item $TriggerFile).LastWriteTime
        
        if ($LastRestartTime -eq $null -or $triggerTime -gt $LastRestartTime) {
            $content = Get-Content $TriggerFile -Raw
            Write-Host ""
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Restart triggered: $content" -ForegroundColor Magenta
            
            Start-App
            $LastRestartTime = $triggerTime
            
            Write-Host ""
        }
    }
    
    Start-Sleep -Seconds 2
}
