@echo off
rem Restart CRT-Monitor elevated (enables SMART / temps via LHM).
rem Click "Yes" on the UAC prompt that appears.
taskkill /im CrtMonitor.exe /f >nul 2>&1
cd /d "%~dp0..\app\publish"
start "" CrtMonitor.exe
echo CRT-Monitor restarting elevated (UAC prompt: click Yes).
