@echo off
title Skipr - Auto Intro Skip for Stremio
cd /d "%~dp0"
echo ===================================================
echo   Starting Skipr on http://localhost:7005
echo   Open your browser to configure your streams!
echo ===================================================
node server.js
pause
