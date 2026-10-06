# -*- coding: utf-8 -*-
"""程序用到的各个目录，以及“现在用哪份内容”。

APP_DIR      程序所在目录：直接跑 .py 时是源码目录；打包成 exe 后是 exe 所在目录
RES_DIR      打包进 exe 的只读资源；直接跑 .py 时同 APP_DIR
HOME_DIR     可写的工作目录，下面放 data/、content/、config.json、server.log：
             - exe 旁边已经有 data/（便携用法，比如开发这台电脑）→ 就用 exe 所在目录
             - 否则（只拿到一个 exe）→ %LOCALAPPDATA%\\智学题库
DATA_DIR     用户数据：bank.json（题库，会合并更新）、progress.json（做题记录，永远不动）、media/、skills/

内容（界面 + 题库，见 content.py）有两份来源：
  - 程序自带：exe 里的 content/（打包时的版本）
  - 热更新下载的：HOME_DIR/content/current/
启动时用版本更高、并且和当前程序兼容的那份（active()）。界面直接从那份内容里读；
题库在版本变高时复制进 DATA_DIR（bank.json 交给 db 逐卷合并，做题记录不动）。
直接跑源码时一律用源码目录里的 static/ 和 data/，不做热更新（开发者用 git pull）。
"""
import os
import shutil
import sys

import content
from version import APP_VERSION

FROZEN = getattr(sys, 'frozen', False)
APP_DIR = os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__))
RES_DIR = getattr(sys, '_MEIPASS', APP_DIR)

if not FROZEN or os.path.isdir(os.path.join(APP_DIR, 'data')):
    HOME_DIR = APP_DIR
else:
    HOME_DIR = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), '智学题库')

DATA_DIR = os.path.join(HOME_DIR, 'data')
CONFIG_PATH = os.path.join(HOME_DIR, 'config.json')
LOG_PATH = os.path.join(HOME_DIR, 'server.log')
CONTENT_DIR = os.path.join(HOME_DIR, 'content')            # 热更新：current/ 正在用的，next/ 正在下载的
BUNDLED_DIR = os.path.join(RES_DIR, 'content') if FROZEN else APP_DIR

SEED_ITEMS = ('bank.json', 'media', 'skills')      # data/ 下属于题库的文件；progress.json（做题记录）永远不在这里

_active = None


def active():
    """(内容根目录, 清单)。根目录下有 static/、data/ 等，和仓库布局一样。"""
    global _active
    if _active is None:
        bundled = content.read_manifest(os.path.join(BUNDLED_DIR, content.CONTENT_FILE))
        _active = (BUNDLED_DIR, bundled)
        if FROZEN:
            cur = os.path.join(CONTENT_DIR, 'current')
            dl = content.read_manifest(os.path.join(cur, content.CONTENT_FILE))
            if dl and content.compatible(dl, APP_VERSION) and \
                    dl['content_version'] > (bundled or {}).get('content_version', 0):
                _active = (cur, dl)
    return _active


def refresh():
    """热更新装好新内容后调用：重新选内容、把新题库放进 DATA_DIR"""
    global _active
    _active = None
    ensure_data()


def static_dir():
    return os.path.join(active()[0], 'static')


def content_version():
    m = active()[1]
    return m['content_version'] if m else 0


def _read_ver(path):
    try:
        with open(path, encoding='utf-8') as f:
            return int(f.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def ensure_data():
    """把正在用的那份内容里的题库放到 DATA_DIR（exe 才做；源码运行时 data/ 就是题库本身）"""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not FROZEN:
        return
    root, m = active()
    seed_data(os.path.join(root, 'data'), m['content_version'] if m else 0)


def seed_data(seed, version):
    """- 第一次运行：全部放进去
    - 内容版本比已装的高：只替换题库文件（SEED_ITEMS），做题记录不动
    题目用固定 key（卷子key#序号）关联做题记录，所以换题库后记录照样对得上。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.isdir(seed):
        return
    mark = os.path.join(DATA_DIR, 'data_version.txt')
    upgrade = version > _read_ver(mark)
    for name in SEED_ITEMS:
        src, dst = os.path.join(seed, name), os.path.join(DATA_DIR, name)
        if not os.path.exists(src) or (os.path.exists(dst) and not upgrade):
            continue
        if name == 'bank.json' and os.path.exists(dst):
            # 题库不整个覆盖：放成 bank.seed.json，由 db 逐卷合并，用户自己导入的卷子保留
            shutil.copy(src, os.path.join(DATA_DIR, 'bank.seed.json'))
            continue
        if os.path.isdir(src):
            tmp = dst + '.new'
            shutil.rmtree(tmp, ignore_errors=True)
            shutil.copytree(src, tmp)
            shutil.rmtree(dst, ignore_errors=True)
            os.replace(tmp, dst)
        else:
            shutil.copy(src, dst + '.new')
            os.replace(dst + '.new', dst)
    if upgrade:
        with open(mark, 'w', encoding='utf-8') as f:
            f.write(str(version))
