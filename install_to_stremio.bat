@echo off
title Skipr - Install to Stremio
echo Opening Stremio to install Skipr...

powershell -Command "try { $info = Invoke-RestMethod -Uri 'http://127.0.0.1:7005/api/info' -TimeoutSec 3; $url = $info.publicUrl; if ($url -and $url.StartsWith('https://')) { $sUrl = 'stremio://' + ($url -replace '^https?://', '') + '/manifest.json'; Start-Process $sUrl; Write-Host 'Opening Stremio install prompt...' } else { Start-Process 'http://localhost:7005' } } catch { Start-Process 'http://localhost:7005' }"
