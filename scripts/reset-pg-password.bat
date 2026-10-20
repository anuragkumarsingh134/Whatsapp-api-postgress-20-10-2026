@echo off
REM PostgreSQL Password Reset Launcher for Windows
echo Launching elevated PowerShell to reset PostgreSQL password to 'postgres'...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0reset-pg-password.ps1\"'"
