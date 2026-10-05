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


def ensure_data():
    """只拿到 exe 时：第一次运行把打包的初始题库（题目、图片、技能题）释放到 DATA_DIR。
    已有的文件不覆盖，做题记录从空开始。"""
    seed = os.path.join(RES_DIR, 'seed')
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.isdir(seed):
        return
    for name in os.listdir(seed):
        src, dst = os.path.join(seed, name), os.path.join(DATA_DIR, name)
        if os.path.exists(dst):
            continue
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy(src, dst)
