@echo off
title Skipr - Disable Auto-Start on Boot
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Skipr.lnk" 2>nul
echo.
echo  [SUCCESS] Auto-start on boot has been disabled.
echo.
pause
