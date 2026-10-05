@echo off
cd /d %~dp0
if not exist _build\venv\Scripts\python.exe (
  echo Creating build environment...
  python -m venv _build\venv
  _build\venv\Scripts\python -m pip install pyinstaller pystray pillow
)
_build\venv\Scripts\python build_exe.py
pause
