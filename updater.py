# -*- coding: utf-8 -*-
"""在线更新：从 GitHub Releases 检查、下载新版 exe，替换后重启。

只换 exe，不碰用户数据目录（%LOCALAPPDATA%\\智学题库\\data 或 exe 旁边的 data/）；
新 exe 第一次启动时 appdir.ensure_data() 会按 DATA_VERSION 换上新题库，做题记录保留。

流程分三步，界面能显示进度：
  start_download()  后台线程开始下载（已经在下或已下好就不重复开）
  progress()        当前状态：idle / downloading / done / error，已下载字节、总字节、速度
  install(on_exit)  下载完成后：写批处理等本程序退出 → 覆盖 exe → 重新启动"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

from version import APP_VERSION, REPO, EXE_NAME

API = 'https://api.github.com/repos/%s/releases/latest' % REPO
# GitHub 连不上（国内常见）时，从这些地址读 release.json（release.py 发布时写的：版本号、说明、安装包的大小和 SHA-256）
RELEASE_MIRRORS = [
    'https://raw.githubusercontent.com/%s/main/release.json' % REPO,
    'https://cdn.jsdelivr.net/gh/%s@main/release.json' % REPO,
    'https://fastly.jsdelivr.net/gh/%s@main/release.json' % REPO,
    'https://gcore.jsdelivr.net/gh/%s@main/release.json' % REPO,
]
# 安装包放在 GitHub Release 里；直连不通就经国内的 GitHub 下载加速站下载（第三方站点，所以下完一定核对 SHA-256）
DOWNLOAD_PROXIES = ['', 'https://ghproxy.net/']
STALL_SECONDS = 30          # 这么久一个字节都没收到，就算网络断了

_lock = threading.Lock()
_state = {'state': 'idle', 'done': 0, 'total': 0, 'speed': 0, 'error': '', 'version': '', 'page': ''}
_file = None                # 下载好的新 exe


def _ver(s):
    out = []
    for part in (s or '').lstrip('vV').split('.'):
        try:
            out.append(int(part))
        except ValueError:
            out.append(0)
    return tuple(out + [0] * (3 - len(out)))


# 连 GitHub 的两条路：按系统设置（开了代理就走代理）、直连。国内网络或代理偶尔握手超时，
# 一条路失败就换另一条再试，比让用户反复点「检查更新」靠谱
_ROUTES = None              # 测试时可以塞固定的线路；平时每次联网现建，见 _routes()
_good_route = 0             # 上次成功的那条路先试


def _routes():
    """每次联网都重新读一遍系统代理设置。程序常驻托盘，启动时代理可能还没开；
    以前只在启动时读一次，之后开了代理也不走，更新一直卡在“正在连接 GitHub”"""
    if _ROUTES:
        return _ROUTES
    return [urllib.request.build_opener(urllib.request.ProxyHandler(urllib.request.getproxies())),
            urllib.request.build_opener(urllib.request.ProxyHandler({}))]


def _open(url, timeout, headers=None, tries=4):
    """依次换路重试打开 url，返回响应；全失败时抛出最后一个错误"""
    global _good_route
    last = None
    for i in range(tries):
        routes = _routes()
        k = (_good_route + i) % len(routes)
        req = urllib.request.Request(url, headers=dict({'User-Agent': 'zhixue-tiku'}, **(headers or {})))
        try:
            r = routes[k].open(req, timeout=timeout)
            _good_route = k
            return r
        except urllib.error.HTTPError as e:
            if e.code not in (403, 429, 500, 502, 503, 504):   # 404 之类换路也没用
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(min(1 + i, 3))
    raise last


def _release_json():
    """从 GitHub 原站或 jsDelivr 读 release.json；都读不到返回 None"""
    for url in RELEASE_MIRRORS:
        try:
            with _open(url, 15, tries=1) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception:
            continue
    return None


def check():
    """返回 {current, latest, has_update, notes, url, urls, size, sha256, page}"""
    rel = None
    try:
        with _open(API, 15, {'Accept': 'application/vnd.github+json'}, tries=2) as r:
            rel = json.loads(r.read().decode('utf-8'))
    except Exception:
        pass
    info = _release_json()                 # 有它才有 SHA-256；GitHub 连不上时版本信息也从这里来
    if rel:
        asset = next((a for a in rel.get('assets', []) if a.get('name', '').lower().endswith('.exe')), None)
        latest = rel.get('tag_name', '').lstrip('vV')
        url, size, notes, page = (asset['browser_download_url'] if asset else None, asset.get('size') if asset else None,
                                  rel.get('body') or '', rel.get('html_url'))
    elif info:
        exe = (info.get('assets') or {}).get('exe') or {}
        latest, url, size, notes, page = (info.get('version', ''), exe.get('url'), exe.get('size'),
                                          info.get('notes', ''), info.get('page'))
    else:
        raise ValueError('连不上 GitHub，也读不到国内镜像上的版本信息，检查一下网络')
    sha = None
    if info and info.get('version', '').lstrip('vV') == latest:
        sha = ((info.get('assets') or {}).get('exe') or {}).get('sha256')
    return {'current': APP_VERSION, 'latest': latest,
            'has_update': bool(url) and _ver(latest) > _ver(APP_VERSION),
            'notes': notes, 'url': url, 'urls': [p + url for p in DOWNLOAD_PROXIES] if url else [],
            'size': size, 'sha256': sha, 'page': page}


def progress():
    with _lock:
        return dict(_state)


def _set(**kw):
    with _lock:
        _state.update(kw)


def start_download():
    """开始在后台下载新版本；正在下载或已经下好就直接返回当前状态。"""
    if not getattr(sys, 'frozen', False):
        raise ValueError('只有 exe 版本能在线更新；源码版请用 git pull')
    with _lock:
        if _state['state'] in ('downloading', 'done'):
            return dict(_state)
        _state.update(state='downloading', done=0, total=0, speed=0, error='', version='', page='')
    threading.Thread(target=_download, daemon=True).start()
    return progress()


def _download():
    global _file
    try:
        info = check()
        _set(version=info['latest'], page=info['page'] or '')
        if not info['has_update']:
            raise ValueError('已经是最新版本 %s' % info['current'])
        _set(total=info['size'] or 0)
        new_exe = os.path.join(tempfile.mkdtemp(prefix='zhixue-update-'), EXE_NAME)
        done, t0, last_t, last_done = 0, time.time(), time.time(), 0
        retries = 0
        urls, ui = info['urls'], 0        # 先试 GitHub，失败就换加速站接着下（Range 续传）
        with open(new_exe, 'wb') as f:
            while True:
                try:
                    # 断了就带 Range 从已下载的位置接着下；timeout 对每次读都生效，STALL_SECONDS 收不到数据就算断
                    hdr = {'Range': 'bytes=%d-' % done} if done else {}
                    with _open(urls[ui % len(urls)], STALL_SECONDS, hdr, tries=2) as r:
                        if done and r.status != 206:      # 服务器不支持续传，只能从头来
                            f.seek(0)
                            f.truncate()
                            done = last_done = 0
                        if not done:
                            _set(total=int(r.headers.get('Content-Length') or 0) or info['size'] or 0)
                        while True:
                            chunk = r.read(1 << 16)
                            if not chunk:
                                break
                            f.write(chunk)
                            done += len(chunk)
                            now = time.time()
                            if now - last_t >= 0.5:
                                _set(done=done, speed=int((done - last_done) / (now - last_t)), error='')
                                last_t, last_done = now, done
                    if not info['size'] or done >= info['size']:
                        break
                    raise IOError('连接提前断开')
                except Exception as e:
                    retries += 1
                    if retries > 3 * len(urls):
                        raise
                    ui += 1                   # 换一条线路
                    _set(error='网络断了一下，正在换线路第 %d 次重连，从 %.1f MB 处接着下…' % (retries, done / 1048576.0), speed=0)
                    time.sleep(2)
        if info['size'] and os.path.getsize(new_exe) != info['size']:
            raise ValueError('下载不完整（%d / %d 字节），请重试' % (os.path.getsize(new_exe), info['size']))
        if info.get('sha256'):
            h = hashlib.sha256()
            with open(new_exe, 'rb') as f:
                for block in iter(lambda: f.read(1 << 20), b''):
                    h.update(block)
            if h.hexdigest() != info['sha256']:
                os.remove(new_exe)
                raise ValueError('下载的安装包校验不通过（可能下载出错或被改动过），已经删掉，请重试')
        _file = new_exe
        _set(state='done', done=done, speed=int(done / max(time.time() - t0, 0.001)))
    except Exception as e:
        msg = str(e)
        if 'timed out' in msg or 'timeout' in msg.lower():
            msg = '网络太慢或断了，%d 秒没收到数据' % STALL_SECONDS
        elif not isinstance(e, ValueError):
            msg = '下载失败：%s' % msg
        _set(state='error', error=msg, speed=0)


def install(on_exit):
    """下载完成后调用：写一个批处理，等本程序退出 → 覆盖 exe → 重新启动。on_exit() 负责让程序退出。"""
    if not _file or progress()['state'] != 'done':
        raise ValueError('新版本还没下载完')
    exe = os.path.abspath(sys.executable)
    bat = os.path.join(os.path.dirname(_file), 'update.bat')
    # 批处理只用英文和路径变量，避免 cmd 读中文出错；路径通过环境变量传入
    with open(bat, 'w', encoding='ascii') as f:
        f.write('@echo off\r\n'
                ':wait\r\n'
                'tasklist /FI "PID eq %OLD_PID%" 2>nul | find "%OLD_PID%" >nul && (timeout /t 1 /nobreak >nul & goto wait)\r\n'
                'copy /Y "%NEW_EXE%" "%OLD_EXE%" >nul || (timeout /t 2 /nobreak >nul & copy /Y "%NEW_EXE%" "%OLD_EXE%" >nul)\r\n'
                'start "" "%OLD_EXE%" --updated\r\n')      # --updated：新版启动后不再新开网页，原页面自己刷新
    # 单文件 exe 有两个进程：外层启动进程（父）占着 exe 文件，等它退出再覆盖
    # 去掉 PyInstaller 留给子进程的环境变量（_MEIPASS2、_PYI_*），否则新 exe 会去旧的临时目录找 python39.dll
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('_MEI', '_PYI'))}
    env.update(OLD_PID=str(os.getppid()), NEW_EXE=_file, OLD_EXE=exe)
    subprocess.Popen(['cmd', '/c', bat], env=env, creationflags=0x08000000)   # CREATE_NO_WINDOW
    threading.Timer(0.5, on_exit).start()
    return {'version': progress()['version']}
