@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd is required but was not found in PATH.
  echo Install Node.js LTS, then open a new CMD window and run uninstall.cmd again.
  exit /b 1
)

echo Removing NPlan global command link...
call npm.cmd unlink -g nplan
if errorlevel 1 exit /b %errorlevel%

call npm.cmd list -g nplan --depth=0 >nul 2>nul
if errorlevel 1 (
echo.
echo Uninstall complete.
echo The local launcher still works from this folder:
echo   CMD:        nplan.cmd providers
echo   PowerShell: .\nplan.cmd providers
exit /b 0
)

echo.
echo npm still reports a global nplan package. Check your npm global prefix.
exit /b 1
