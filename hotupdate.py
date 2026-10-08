# -*- coding: utf-8 -*-
"""热更新：从 GitHub 仓库下载新的内容（界面 + 题库），不用重装程序，也不用重启。

1. 读仓库 main 分支上的 content.json（最新内容的清单，release.py content 发布时写的）
2. 和正在用的清单比对，只下载指纹变了的文件；文件从清单里的 Git 标签下载（发布后不会再变）
3. 没变的文件从正在用的内容里复制，凑成完整的一份放在 content/next/，每个文件都核对 SHA-256
4. 全部齐了才把 next/ 换成 current/（中途失败不影响正在用的那份），再让题库和界面生效

下载线路：GitHub 原站（raw.githubusercontent.com）连不上就换 jsDelivr 镜像；
每条线路又会在系统代理和直连之间切换（见 updater._open）。"""
import hashlib
import json
import os
import shutil
import threading
import time
import urllib.parse

import appdir
import content
import updater
from version import APP_VERSION, REPO

MIRRORS = [
    'https://raw.githubusercontent.com/%s/{ref}/{path}' % REPO,
    'https://cdn.jsdelivr.net/gh/%s@{ref}/{path}' % REPO,      # 国内一般能连（发布时会刷新 main 的缓存）
    'https://fastly.jsdelivr.net/gh/%s@{ref}/{path}' % REPO,   # jsDelivr 的其他节点，某个节点不通时换着试
    'https://gcore.jsdelivr.net/gh/%s@{ref}/{path}' % REPO,
]

_lock = threading.Lock()
_state = {'state': 'idle', 'done': 0, 'total': 0, 'files_done': 0, 'files_total': 0, 'speed': 0,
          'error': '', 'version': 0, 'notes': ''}


def _url(base, ref, path):
    return base.format(ref=ref, path='/'.join(urllib.parse.quote(p) for p in path.split('/')))


def _fetch(ref, path, timeout=20):
    """依次试各个镜像，返回文件内容（bytes）"""
    last = None
    for base in MIRRORS:
        try:
            with updater._open(_url(base, ref, path), timeout, tries=2) as r:
                return r.read()
        except Exception as e:
            last = e
    raise last


def check():
    """返回 {current, latest, has_update, compatible, min_app_version, files, bytes, notes}"""
    try:
        latest = json.loads(_fetch('main', content.CONTENT_FILE, 15).decode('utf-8'))
    except Exception as e:
        raise ValueError('连不上 GitHub 和镜像，检查一下网络（%s）' % e)
    cur = appdir.active()[1]
    changed = content.diff(latest, cur)
    newer = latest.get('content_version', 0) > appdir.content_version()
    ok = content.compatible(latest, APP_VERSION)
    return {'current': appdir.content_version(), 'latest': latest.get('content_version', 0),
            'has_update': newer and ok, 'compatible': ok, 'min_app_version': latest.get('min_app_version'),
            'files': len(changed), 'bytes': sum(c[2] for c in changed), 'notes': latest.get('notes', '')}


def progress():
    with _lock:
        return dict(_state)


def _set(**kw):
    with _lock:
        _state.update(kw)


def start():
    if not appdir.FROZEN:
        raise ValueError('源码运行时不做热更新，请用 git pull')
    with _lock:
        if _state['state'] == 'downloading':
            return dict(_state)
        _state.update(state='downloading', done=0, total=0, files_done=0, files_total=0, speed=0, error='')
    threading.Thread(target=_run, daemon=True).start()
    return progress()


def _run():
    try:
        latest = json.loads(_fetch('main', content.CONTENT_FILE, 15).decode('utf-8'))
        if not content.compatible(latest, APP_VERSION):
            raise ValueError('新内容需要程序 v%s 以上，请先更新程序' % latest.get('min_app_version'))
        if latest.get('content_version', 0) <= appdir.content_version():
            raise ValueError('界面和题库已经是最新的')
        install(latest, _fetch)
        _set(state='done', speed=0, version=latest['content_version'], notes=latest.get('notes', ''))
    except Exception as e:
        msg = str(e)
        if 'timed out' in msg or 'timeout' in msg.lower():
            msg = '网络太慢或断了，请重试'
        _set(state='error', error=msg, speed=0)


def _retry(fn, times=5):
    """文件夹改名：杀毒软件、正在读的网页偶尔会短暂占着文件，等一下再试"""
    for i in range(times):
        try:
            return fn()
        except OSError:
            if i == times - 1:
                raise
            time.sleep(0.4)


def install(latest, fetch):
    """按清单 latest 凑出完整的新内容并换上。fetch(ref, path) 返回文件内容（测试时可替换）。"""
    root, cur = appdir.active()
    changed = content.diff(latest, cur)
    nxt = os.path.join(appdir.CONTENT_DIR, 'next')
    shutil.rmtree(nxt, ignore_errors=True)
    os.makedirs(nxt)
    need = {c[0] for c in changed}
    # 没变的文件从正在用的内容里复制；丢了或坏了（指纹对不上）就改成下载
    for rel, (sha, size) in latest['files'].items():
        if rel in need:
            continue
        src = os.path.join(root, *rel.split('/'))
        dst = os.path.join(nxt, *rel.split('/'))
        if os.path.isfile(src) and os.path.getsize(src) == size and content.sha256_file(src) == sha:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
        else:
            need.add(rel)
    todo = sorted(need)
    total = sum(latest['files'][p][1] for p in todo)
    _set(total=total, files_total=len(todo), version=latest['content_version'])
    done, t_last, d_last = 0, time.time(), 0
    for i, rel in enumerate(todo):
        sha, size = latest['files'][rel]
        data = None
        for attempt in range(3):
            try:
                data = fetch(latest['tag'], rel)
            except Exception as e:
                if attempt == 2:
                    raise ValueError('下载 %s 失败：%s' % (rel, e))
                _set(error='网络断了一下，正在重试…')
                time.sleep(2)
                continue
            if hashlib.sha256(data).hexdigest() == sha:
                break
            data = None                              # 内容不对（镜像还没同步之类），重下
            if attempt == 2:
                raise ValueError('文件 %s 校验不通过，请稍后再试' % rel)
        dst = os.path.join(nxt, *rel.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, 'wb') as f:
            f.write(data)
        done += size
        now = time.time()
        if now - t_last >= 0.5:
            _set(speed=int((done - d_last) / (now - t_last)))
            t_last, d_last = now, done
        _set(done=done, files_done=i + 1, error='')
    content.write_manifest(os.path.join(nxt, content.CONTENT_FILE), latest)
    # 换上：current → old，next → current，再删 old。
    # Windows 上文件正被读取时改名会失败：哪一步失败都把原来的 current 放回去，正在用的内容不受影响
    cur_dir, old = os.path.join(appdir.CONTENT_DIR, 'current'), os.path.join(appdir.CONTENT_DIR, 'old')
    shutil.rmtree(old, ignore_errors=True)
    if os.path.isdir(old):
        raise ValueError('旧的临时文件夹删不掉，请重启题库程序后再更新')
    had_cur = os.path.isdir(cur_dir)
    if had_cur:
        _retry(lambda: os.replace(cur_dir, old))
    try:
        _retry(lambda: os.replace(nxt, cur_dir))
    except Exception:
        if had_cur:
            os.replace(old, cur_dir)
        raise ValueError('换上新内容时文件被占用，请稍后重试')
    shutil.rmtree(old, ignore_errors=True)
    # 生效：重新选内容（界面马上换）、新题库放进 data/、让 db 下次读取时合并
    appdir.refresh()
    import db
    db.reload()
