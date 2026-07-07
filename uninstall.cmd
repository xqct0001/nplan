@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd is required but was not found in PATH.
  echo Install Node.js LTS, then open a new CMD window and run uninstall.cmd again.
  exit /b 1
)

echo Removing NPlan global command...
call npm.cmd uninstall -g nplan
if errorlevel 1 exit /b %errorlevel%

for /f "delims=" %%P in ('npm.cmd prefix -g') do set "NPM_PREFIX=%%P"
if defined NPM_PREFIX (
  if exist "%NPM_PREFIX%\nplan" del /f /q "%NPM_PREFIX%\nplan" >nul 2>nul
  if exist "%NPM_PREFIX%\nplan.cmd" del /f /q "%NPM_PREFIX%\nplan.cmd" >nul 2>nul
  if exist "%NPM_PREFIX%\nplan.ps1" del /f /q "%NPM_PREFIX%\nplan.ps1" >nul 2>nul
)

call npm.cmd list -g nplan --depth=0 >nul 2>nul
if errorlevel 1 (
echo.
echo Uninstall complete.
exit /b 0
)

echo.
echo npm still reports a global nplan package. Check your npm global prefix.
exit /b 1
