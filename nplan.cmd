@echo off
setlocal
set "ROOT=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found in PATH.
  echo Install Node.js LTS, then open a new CMD window and try again.
  exit /b 1
)

node "%ROOT%src\cli.js" %*
