@echo off
rem Build release: frontend dist + self-contained dotnet publish (no runtime needed on target)
setlocal
set ROOT=%~dp0..
set PATH=%USERPROFILE%\.tools\node;%USERPROFILE%\.tools\dotnet;%PATH%

where node >nul 2>&1 || (echo [ERR] node not found: %%USERPROFILE%%\.tools\node & exit /b 1)
where dotnet >nul 2>&1 || (echo [ERR] dotnet not found: %%USERPROFILE%%\.tools\dotnet & exit /b 1)

pushd "%ROOT%"
call npm run build || (popd & echo [ERR] frontend build failed & exit /b 1)
popd

dotnet publish "%ROOT%\app\CrtMonitor.csproj" -c Release -r win-x64 --self-contained true -o "%ROOT%\app\publish"

rem mirror frontend dist into publish wwwroot (removes stale hashed bundles)
robocopy "%ROOT%\dist" "%ROOT%\app\publish\wwwroot" /MIR /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (echo [ERR] wwwroot copy failed & exit /b 1)

rem C# plugin (Battery example): build separately, copy only the plugin dll
dotnet build "%ROOT%\plugins-src\BatteryPlugin\CrtMonitor.Plugin.Battery.csproj" -c Release
if not exist "%ROOT%\app\publish\plugins" mkdir "%ROOT%\app\publish\plugins"
xcopy /y "%ROOT%\plugins-src\BatteryPlugin\bin\Release\net8.0-windows10.0.19041.0\CrtMonitor.Plugin.Battery.dll" "%ROOT%\app\publish\plugins\" >nul

echo.
echo DONE: %ROOT%\app\publish
