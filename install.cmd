@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found in PATH.
  echo Install Node.js LTS, then open a new CMD window and run install.cmd again.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd is required but was not found in PATH.
  echo Install Node.js LTS, then open a new CMD window and run install.cmd again.
  exit /b 1
)

echo Installing NPlan command...
call npm.cmd install -g .
if errorlevel 1 exit /b %errorlevel%

call npm.cmd list -g nplan --depth=0 >nul 2>nul
if errorlevel 1 (
  echo npm did not report a global nplan installation.
  exit /b 1
)

for /f "delims=" %%P in ('npm.cmd prefix -g') do set "NPM_PREFIX=%%P"
if defined NPM_PREFIX if exist "%NPM_PREFIX%\nplan.ps1" (
  del /f /q "%NPM_PREFIX%\nplan.ps1" >nul 2>nul
)

echo.
echo Install complete.
echo Open CMD and run:
echo   nplan providers
echo   nplan setup
echo   nplan
echo.
echo To remove the global command later:
echo   uninstall
