@echo off
rem One-click update: rebuild release and restart CRT-Monitor.
rem NOTE: if the app is running ELEVATED, exit it first (tray icon -> exit),
rem       otherwise the build cannot replace the locked exe.
taskkill /im CrtMonitor.exe /f >nul 2>&1
call "%~dp0build-release.cmd"
if errorlevel 1 (
  echo [ERR] build failed - is the app running elevated? Exit via tray first.
  pause
  exit /b 1
)
start "" "%~dp0..\app\publish\CrtMonitor.exe"
echo CRT-Monitor updated and restarted.
