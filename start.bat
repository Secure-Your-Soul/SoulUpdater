@echo off
title SoulUpdater
chcp 65001 > nul

echo.
echo ====================================
echo Wybierz wersję modułu do uruchomienia:
echo ====================================
echo [1] app.mjs (ES Modules)
echo [2] app.cjs (CommonJS)
echo [3] Anuluj i zamknij
echo.

set /p CHOICE="Wybierz opcję (domyślnie 2): "

if not defined CHOICE set CHOICE=2

if "%CHOICE%"=="1" goto START_MJS
if "%CHOICE%"=="2" goto START_CJS
if "%CHOICE%"=="3" goto END

echo.
echo Niepoprawny wybór. Uruchamiam domyślne app.mjs.
goto START_MJS

:START_MJS
echo.
echo Uruchamiam app.mjs...
node app.mjs
goto END

:START_CJS
echo.
echo Uruchamiam app.cjs...
node app.cjs
goto END

:END
chcp 852 > nul  & REM
pause