# -*- coding: utf-8 -*-
"""程序用到的各个目录。

APP_DIR     程序所在目录：直接跑 .py 时是源码目录；打包成 exe 后是 exe 所在目录
RES_DIR     打包进 exe 的只读资源（界面 static/、初始题库 seed/）；直接跑 .py 时同 APP_DIR
HOME_DIR    可写的工作目录，下面放 data/、config.json、server.log：
            - exe 旁边已经有 data/（便携用法，比如开发这台电脑）→ 就用 exe 所在目录
            - 否则（只拿到一个 exe）→ %LOCALAPPDATA%\\智学题库，第一次运行时从 exe 里释放初始题库
STATIC_DIR  界面文件：exe 旁边有 static/ 就用它（改界面不用重新打包），否则用 exe 里打包的
"""
import os
import shutil
import sys

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
STATIC_DIR = os.path.join(APP_DIR, 'static') if os.path.isdir(os.path.join(APP_DIR, 'static')) \
    else os.path.join(RES_DIR, 'static')


SEED_ITEMS = ('bank.json', 'media', 'skills')      # 题库文件；progress.json（做题记录）永远不在这里


def _read_ver(path):
    try:
        with open(path, encoding='utf-8') as f:
            return int(f.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def ensure_data():
    """把 exe 里打包的题库放到 DATA_DIR：
    - 第一次运行：全部释放
    - 装了带新题库的 exe（打包的题库版本 > 已安装的）：只替换题库文件（SEED_ITEMS），做题记录不动
    题目用固定 key（卷子key#序号）关联做题记录，所以换题库后记录照样对得上。"""
    seed = os.path.join(RES_DIR, 'seed')
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.isdir(seed):
        return
    bundled = _read_ver(os.path.join(seed, 'data_version.txt'))
    mark = os.path.join(DATA_DIR, 'data_version.txt')
    installed = _read_ver(mark)
    upgrade = bundled > installed
    for name in SEED_ITEMS:
        src, dst = os.path.join(seed, name), os.path.join(DATA_DIR, name)
        if not os.path.exists(src) or (os.path.exists(dst) and not upgrade):
            continue
        if name == 'bank.json' and os.path.exists(dst):
            # 题库不整个覆盖：放成 bank.seed.json，由 db 启动时逐卷合并，用户自己导入的卷子保留
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
            f.write(str(bundled))
