@echo off
title Genshin Sim Manager

cd /d "%~dp0"

echo Installing/checking dependencies...
call npm install

echo Starting server...
start "Server" cmd /c "npm start"

echo Waiting for server to initialize...
timeout /t 5 >nul

echo Opening browser...
start http://localhost:3000

echo Done! Server is running in a separate window.
pause
