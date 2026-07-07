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

call npm.cmd list -g nplan --depth=0 >nul 2>nul
if errorlevel 1 (
  echo npm did not report a global nplan link after installation.
  echo You can still run the local launcher with nplan.cmd from this folder.
  exit /b 1
)

echo.
echo Install complete.
echo Next:
echo   nplan setup
echo   nplan
echo.
echo If an existing terminal cannot find nplan, open a new terminal or run the
echo local launcher from this folder:
echo   CMD:        nplan.cmd providers
echo   PowerShell: .\nplan.cmd providers
echo.
echo To remove the global command later:
echo   CMD:        uninstall
echo   PowerShell: .\uninstall.cmd
