@echo off
cd /d %~dp0
powershell -NoProfile -Command "$ts = Get-Date -Format yyyyMMdd-HHmm; $dest = Join-Path $env:USERPROFILE ('Desktop\quiz-app-backup-' + $ts + '.zip'); Compress-Archive -Path ('%~dp0*') -DestinationPath $dest -Force; Write-Host ('Backup saved: ' + $dest)"
echo.
echo Unzip it anywhere on the new PC and double-click start.bat (questions + progress included).
pause
