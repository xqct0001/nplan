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
call npm.cmd link
if errorlevel 1 exit /b %errorlevel%

echo.
echo Install complete.
echo Next:
echo   nplan setup
echo   nplan
