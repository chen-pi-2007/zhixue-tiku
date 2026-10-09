# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""电脑版后端代码的热更新：exe 启动时，用热更新下载的 server.py、db.py 等代替 exe 里自带的。

以前改一行后端代码也要发新版 exe（58 MB）；现在后端代码跟着内容一起发（content.HOT_PY），
用户只下载改动的几个 .py，重启题库就生效。外壳（本文件、tray、appdir、hotupdate、updater、version）不热更新，
免得一次坏的更新连更新功能本身都弄坏。

规则：
  - 只在 exe 里、并且正在用的是热更新下载的内容（不是 exe 自带的）时才加载
  - 内容清单的 py_shell_api 要等于 version.SHELL_API（外壳和后端的接口对得上）
  - 先把这些 .py 复制到 content/py/<内容版本>/ 再加载：之后再热更新会整个换掉 content/current/，
    正在运行的程序后面才 import 的模块也不会读到半新半旧的代码
  - 加载出错（语法错误、exe 里缺新代码要用的标准库模块……）时 fallback()：退回 exe 自带的后端，
    并在那份目录里留个 bad 标记，以后不再试这一版
"""
import importlib.util
import os
import shutil
import sys

import appdir
import content
from version import SHELL_API

_finder = None
state = {'active': 0, 'error': ''}         # active：正在用的热更新后端是第几版内容（0 = exe 自带的）


class _Finder:
    """排在 sys.meta_path 最前面：HOT_PY 里的模块从热更新目录加载，其余照旧"""

    def __init__(self, root):
        self.root = root

    def find_spec(self, fullname, path=None, target=None):
        parts = fullname.split('.')
        if parts[0] not in content.HOT_PY:
            return None
        base = os.path.join(self.root, *parts)
        init = os.path.join(base, '__init__.py')
        if os.path.isfile(init):
            return importlib.util.spec_from_file_location(fullname, init, submodule_search_locations=[base])
        if os.path.isfile(base + '.py'):
            return importlib.util.spec_from_file_location(fullname, base + '.py')
        return None


def _prepare(root, m):
    """把内容里的后端代码复制到 content/py/<版本>/（已经有就直接用），返回目录；不能用返回 None"""
    rels = [r for r in m['files'] if content.is_hot_py(r)]
    if 'server.py' not in rels or 'db.py' not in rels:
        return None
    base = os.path.join(appdir.CONTENT_DIR, 'py')
    dst = os.path.join(base, str(m['content_version']))
    if os.path.exists(os.path.join(dst, 'bad')):
        return None
    if not os.path.exists(os.path.join(dst, 'ok')):
        tmp = dst + '.tmp'
        shutil.rmtree(tmp, ignore_errors=True)
        for rel in rels:
            src = os.path.join(root, *rel.split('/'))
            sha, size = m['files'][rel]
            if not os.path.isfile(src) or content.sha256_file(src) != sha:
                shutil.rmtree(tmp, ignore_errors=True)
                return None
            out = os.path.join(tmp, *rel.split('/'))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copyfile(src, out)
        open(os.path.join(tmp, 'ok'), 'w').close()
        shutil.rmtree(dst, ignore_errors=True)
        os.replace(tmp, dst)
    # 旧版本的目录删掉（正在用的和标了 bad 的留着）
    for name in os.listdir(base):
        p = os.path.join(base, name)
        if p != dst and not os.path.exists(os.path.join(p, 'bad')):
            shutil.rmtree(p, ignore_errors=True)
    return dst


def install():
    """tray.py 在 import server 之前调用。返回是否用上了热更新的后端"""
    global _finder
    if not appdir.FROZEN or _finder:
        return bool(_finder)
    root, m = appdir.active()
    if not m or root == appdir.BUNDLED_DIR or m.get('py_shell_api') != SHELL_API:
        return False
    try:
        d = _prepare(root, m)
    except OSError as e:
        state['error'] = '复制后端代码失败：%s' % e
        return False
    if not d:
        return False
    sys.dont_write_bytecode = True               # 不在热更新目录里生成 __pycache__
    _finder = _Finder(d)
    sys.meta_path.insert(0, _finder)
    state['active'] = m['content_version']
    return True


def fallback(err):
    """热更新的后端加载或启动失败：退回 exe 自带的后端，这一版以后不再试"""
    global _finder
    if not _finder:
        return False
    try:
        open(os.path.join(_finder.root, 'bad'), 'w').close()
    except OSError:
        pass
    sys.meta_path.remove(_finder)
    _finder = None
    for name in list(sys.modules):
        if name.split('.')[0] in content.HOT_PY:
            del sys.modules[name]
    state.update(active=0, error=str(err)[:300])
    print('热更新的后端代码用不了，改用程序自带的：%s' % err)
    return True
