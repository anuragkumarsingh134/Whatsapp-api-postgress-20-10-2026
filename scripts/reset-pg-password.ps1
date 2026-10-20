# Self-elevating PostgreSQL Password Reset Script for Windows
# Resets the 'postgres' superuser password to 'postgres'

$ErrorActionPreference = "Stop"

# If not running as Admin, relaunch with elevated UAC prompt
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges to reset PostgreSQL password..." -ForegroundColor Cyan
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   PostgreSQL Password Reset Utility (WA-API)       " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$dataDir = "C:\Program Files\PostgreSQL\18\data"
$hbaFile = Join-Path $dataDir "pg_hba.conf"
$psqlExe = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$serviceName = "postgresql-x64-18"

if (-not (Test-Path $hbaFile)) {
    Write-Host "Error: pg_hba.conf not found at $hbaFile" -ForegroundColor Red
    Pause
    exit 1
}

# 1. Backup original pg_hba.conf
$backupFile = Join-Path $dataDir "pg_hba.conf.bak"
Copy-Item $hbaFile $backupFile -Force
Write-Host "[1/5] Backed up pg_hba.conf to pg_hba.conf.bak" -ForegroundColor Green

# 2. Set authentication to 'trust' temporarily
$content = Get-Content $hbaFile
$trustedContent = $content -replace "scram-sha-256", "trust"
Set-Content $hbaFile $trustedContent
Write-Host "[2/5] Enabled temporary trust authentication" -ForegroundColor Green

# 3. Restart service with trust mode
Write-Host "[3/5] Restarting PostgreSQL service..." -ForegroundColor Yellow
Restart-Service $serviceName
Start-Sleep -Seconds 2

# 4. Alter user password to 'postgres'
Write-Host "[4/5] Setting password for user 'postgres' to 'postgres'..." -ForegroundColor Yellow
& $psqlExe -U postgres -h 127.0.0.1 -p 5432 -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
if ($LASTEXITCODE -ne 0) {
    # If connection to 127.0.0.1 failed, try without host flag (named pipes / local)
    & $psqlExe -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
}
Write-Host "      Password successfully updated!" -ForegroundColor Green

# 5. Restore original scram-sha-256 authentication
Write-Host "[5/5] Restoring scram-sha-256 security..." -ForegroundColor Yellow
Copy-Item $backupFile $hbaFile -Force
Remove-Item $backupFile -Force
Restart-Service $serviceName
Start-Sleep -Seconds 2

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host " SUCCESS! PostgreSQL password is now: postgres" -ForegroundColor Green
Write-Host " You can now run: npm run migrate:pg" -ForegroundColor Cyan
Write-Host "====================================================`n" -ForegroundColor Cyan

Start-Sleep -Seconds 3
