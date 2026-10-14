@echo off
title Skipr - Enable Auto-Start on Windows Boot
echo =======================================================
echo   Enabling Skipr to run silently in background on boot
echo =======================================================

set SCRIPT_DIR=%~dp0
set TARGET=%SCRIPT_DIR%start_hidden.vbs
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Skipr.lnk

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo  [SUCCESS] Done! Skipr will now run automatically on PC startup.
    echo  No command windows will pop up.
) else (
    echo.
    echo  [NOTICE] Could not place shortcut in Startup folder.
)
echo =======================================================
pause
