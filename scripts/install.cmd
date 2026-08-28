@echo off
rem Per-user install (no admin): copy to %%LOCALAPPDATA%%\CrtMonitor, HKCU Run autostart, Start Menu shortcut
setlocal
set SRC=%~dp0..\app\publish
set DEST=%LOCALAPPDATA%\CrtMonitor

if not exist "%SRC%\CrtMonitor.exe" (
  echo [ERR] publish not found. Run scripts\build-release.cmd first.
  exit /b 1
)

taskkill /im CrtMonitor.exe /f >nul 2>&1
robocopy "%SRC%" "%DEST%" /MIR /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (echo [ERR] copy failed & exit /b 1)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v CrtMonitor /t REG_SZ /d "\"%DEST%\CrtMonitor.exe\"" /f >nul

powershell -NoProfile -Command ^
  "$lnk=[IO.Path]::Combine($env:APPDATA,'Microsoft\Windows\Start Menu\Programs\CRT Monitor.lnk');$s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk);$s.TargetPath='%DEST%\CrtMonitor.exe';$s.WorkingDirectory='%DEST%';$s.Save()"

start "" "%DEST%\CrtMonitor.exe"
echo INSTALLED: %DEST%
echo - autostart: HKCU Run (toggle at runtime with key A)
echo - shortcut : Start Menu ^> CRT Monitor
echo - uninstall : scripts\uninstall.cmd
