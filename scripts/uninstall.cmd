@echo off
rem Uninstall: remove autostart key, shortcut, app dir
setlocal
set DEST=%LOCALAPPDATA%\CrtMonitor

taskkill /im CrtMonitor.exe /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v CrtMonitor /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\CRT Monitor.lnk" >nul 2>&1
rd /s /q "%DEST%" >nul 2>&1

echo UNINSTALLED.
