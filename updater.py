# -*- coding: utf-8 -*-
"""在线更新：从 GitHub Releases 检查、下载新版 exe，替换后重启。

只换 exe，不碰用户数据目录（%LOCALAPPDATA%\\智学题库\\data 或 exe 旁边的 data/）；
新 exe 第一次启动时 appdir.ensure_data() 会按 DATA_VERSION 换上新题库，做题记录保留。"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request

from version import APP_VERSION, REPO, EXE_NAME

API = 'https://api.github.com/repos/%s/releases/latest' % REPO


def _ver(s):
    out = []
    for part in (s or '').lstrip('vV').split('.'):
        try:
            out.append(int(part))
        except ValueError:
            out.append(0)
    return tuple(out + [0] * (3 - len(out)))


def check():
    """返回 {current, latest, has_update, notes, url, size}"""
    req = urllib.request.Request(API, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'zhixue-tiku'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            rel = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        raise ValueError('连不上 GitHub，检查一下网络（%s）' % e)
    asset = next((a for a in rel.get('assets', []) if a.get('name', '').lower().endswith('.exe')), None)
    latest = rel.get('tag_name', '')
    return {'current': APP_VERSION, 'latest': latest.lstrip('vV'),
            'has_update': bool(asset) and _ver(latest) > _ver(APP_VERSION),
            'notes': rel.get('body') or '', 'url': asset['browser_download_url'] if asset else None,
            'size': asset.get('size') if asset else None, 'page': rel.get('html_url')}


def apply(on_exit):
    """下载新 exe，写一个批处理：等本程序退出 → 覆盖 exe → 重新启动。on_exit() 负责让程序退出。"""
    if not getattr(sys, 'frozen', False):
        raise ValueError('只有 exe 版本能在线更新；源码版请用 git pull')
    info = check()
    if not info['has_update']:
        raise ValueError('已经是最新版本 %s' % info['current'])
    exe = os.path.abspath(sys.executable)
    tmp_dir = tempfile.mkdtemp(prefix='zhixue-update-')
    new_exe = os.path.join(tmp_dir, EXE_NAME)
    req = urllib.request.Request(info['url'], headers={'User-Agent': 'zhixue-tiku'})
    with urllib.request.urlopen(req, timeout=60) as r, open(new_exe, 'wb') as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    if info['size'] and os.path.getsize(new_exe) != info['size']:
        raise ValueError('下载不完整，请重试')
    bat = os.path.join(tmp_dir, 'update.bat')
    # 批处理只用英文和路径变量，避免 cmd 读中文出错；路径通过环境变量传入
    with open(bat, 'w', encoding='ascii') as f:
        f.write('@echo off\r\n'
                ':wait\r\n'
                'tasklist /FI "PID eq %OLD_PID%" 2>nul | find "%OLD_PID%" >nul && (timeout /t 1 /nobreak >nul & goto wait)\r\n'
                'copy /Y "%NEW_EXE%" "%OLD_EXE%" >nul || (timeout /t 2 /nobreak >nul & copy /Y "%NEW_EXE%" "%OLD_EXE%" >nul)\r\n'
                'start "" "%OLD_EXE%"\r\n')
    # 单文件 exe 有两个进程：外层启动进程（父）占着 exe 文件，等它退出再覆盖
    # 去掉 PyInstaller 留给子进程的环境变量（_MEIPASS2、_PYI_*），否则新 exe 会去旧的临时目录找 python39.dll
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('_MEI', '_PYI'))}
    env.update(OLD_PID=str(os.getppid()), NEW_EXE=new_exe, OLD_EXE=exe)
    subprocess.Popen(['cmd', '/c', bat], env=env, creationflags=0x08000000)   # CREATE_NO_WINDOW
    threading.Timer(0.5, on_exit).start()
    return {'version': info['latest']}
