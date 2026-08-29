@echo off
rem Build single-exe package: publish-single\CrtMonitor.exe (+ wwwroot/themes/plugins beside it)
setlocal
set ROOT=%~dp0..
set PATH=%USERPROFILE%\.tools\node;%USERPROFILE%\.tools\dotnet;%PATH%

pushd "%ROOT%"
call npm run build || (popd & echo [ERR] frontend build failed & exit /b 1)
popd

dotnet publish "%ROOT%\app\CrtMonitor.csproj" -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true ^
  -o "%ROOT%\app\publish-single"

robocopy "%ROOT%\dist" "%ROOT%\app\publish-single\wwwroot" /MIR /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (echo [ERR] wwwroot copy failed & exit /b 1)

robocopy "%ROOT%\themes" "%ROOT%\app\publish-single\themes" /MIR /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (echo [ERR] themes copy failed & exit /b 1)

if not exist "%ROOT%\app\publish-single\plugins" mkdir "%ROOT%\app\publish-single\plugins"
copy /y "%ROOT%\plugins\battery.js" "%ROOT%\app\publish-single\plugins\" >nul
dotnet build "%ROOT%\plugins-src\BatteryPlugin\CrtMonitor.Plugin.Battery.csproj" -c Release
copy /y "%ROOT%\plugins-src\BatteryPlugin\bin\Release\net8.0-windows10.0.19041.0\CrtMonitor.Plugin.Battery.dll" "%ROOT%\app\publish-single\plugins\" >nul

del "%ROOT%\app\publish-single\CrtMonitor.pdb" >nul 2>&1
del "%ROOT%\app\publish-single\*.xml" >nul 2>&1

echo.
echo DONE: %ROOT%\app\publish-single
