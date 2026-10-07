@echo off
rem Starter run.ps1 uden at Windows' script-politik blokerer den. Argumenter sendes videre, fx: run -Prod
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
