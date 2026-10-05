@echo off
cd /d %~dp0
echo ==============================================
echo   Quiz Bank starting... browser will open
echo   Close this window to stop the server
echo ==============================================
python server.py
pause
