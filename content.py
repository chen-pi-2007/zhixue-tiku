# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""内容包：可以热更新（不重装程序）的那部分文件，以及描述它们的清单 content.json。

内容 = 界面 static/ + 手机版本地逻辑 mobile/local.js + 题库 data/bank.json、data/media/、data/skills/
     + 电脑版的后端逻辑（HOT_PY：server.py、db.py 等，exe 启动时用 hotpy.py 加载，代替 exe 里自带的）。
外壳（tray.py 窗口托盘、appdir/content/hotupdate/updater 更新机制、version.py）和安卓的 Java 壳不在内容里，
改了它们要发新版程序；外壳和后端之间的接口变了要把 version.SHELL_API 加 1（旧外壳就不会加载新后端）。

content.json 的格式：
    {"content_version": 5,              整数，每发一次内容加 1
     "min_app_version": "1.4.0",        电脑版程序至少要这个版本才能用这份内容（界面要用到的接口）
     "min_android_version": "1.4.0",    安卓 App 至少要这个版本（local.js 要用到的 ZXStore 接口）
     "py_shell_api": 1,                 里面的后端代码要求的外壳接口版本（version.SHELL_API），对不上就不加载
     "tag": "content-5",                Git 标签：文件从这个标签下载，发布后不会再变
     "created": "...", "notes": "...",
     "files": {"static/app.js": ["sha256", 字节数], ...}}

清单里的路径就是仓库里的路径。客户端拿新清单和自己正在用的清单比对，只下载指纹变了的文件。
"""
import hashlib
import json
import os
import time

from version import SHELL_API

CONTENT_FILE = 'content.json'
# 可以热更新的后端代码（顶层模块 / 包名）；外壳模块不在这里
HOT_PY = ('server', 'db', 'srs', 'exam', 'docparse', 'llm', 'skills', 'sync')
# 属于内容的路径（仓库根目录下）；目录以 / 结尾
INCLUDE = ('static/', 'mobile/local.js', 'data/bank.json', 'data/media/', 'data/skills/') +     tuple(m + '.py' for m in HOT_PY if m != 'skills') + ('skills/',)
SKIP_NAMES = ('Thumbs.db', 'desktop.ini', '.DS_Store')


def is_hot_py(rel):
    """清单里的这个路径是不是热更新的后端代码"""
    return rel.endswith('.py') and rel.split('/')[0].replace('.py', '') in HOT_PY


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def list_files(root):
    """仓库（或任何同样布局的目录）里属于内容的文件，返回相对路径（用 /）"""
    out = []
    for inc in INCLUDE:
        p = os.path.join(root, *inc.rstrip('/').split('/'))
        if inc.endswith('/'):
            for d, _, names in os.walk(p):
                if '__pycache__' in d:
                    continue
                for n in names:
                    if n in SKIP_NAMES or n.endswith(('.tmp', '.bak', '.pyc')):
                        continue
                    out.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, '/'))
        elif os.path.isfile(p):
            out.append(inc)
    return sorted(out)


def build_manifest(root, content_version, min_app, min_android, tag='', notes=''):
    return {
        'content_version': int(content_version),
        'min_app_version': min_app,
        'min_android_version': min_android,
        'py_shell_api': SHELL_API,
        'tag': tag or 'content-%d' % int(content_version),
        'created': time.strftime('%Y-%m-%d %H:%M:%S'),
        'notes': notes,
        'files': {rel: [sha256_file(os.path.join(root, *rel.split('/'))), os.path.getsize(os.path.join(root, *rel.split('/')))]
                  for rel in list_files(root)},
    }


def read_manifest(path):
    try:
        with open(path, encoding='utf-8') as f:
            m = json.load(f)
        return m if isinstance(m, dict) and isinstance(m.get('files'), dict) else None
    except (OSError, ValueError):
        return None


def write_manifest(path, m):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)


def ver_tuple(s):
    out = []
    for part in str(s or '').lstrip('vV').split('.'):
        try:
            out.append(int(part))
        except ValueError:
            out.append(0)
    return tuple((out + [0, 0, 0])[:3])


def compatible(m, app_version, key='min_app_version'):
    """这份内容能不能在这个版本的程序上用"""
    return bool(m) and ver_tuple(app_version) >= ver_tuple(m.get(key) or '0')


def diff(new, old):
    """新清单里哪些文件和旧清单不同（要下载的），返回 [(路径, sha, 大小)]"""
    of = (old or {}).get('files') or {}
    return [(p, v[0], v[1]) for p, v in sorted(new['files'].items()) if of.get(p, [None])[0] != v[0]]
