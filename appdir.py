# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
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

LOCAL_HOME = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), '智学题库')
if not FROZEN or os.path.isdir(os.path.join(APP_DIR, 'data')):
    HOME_DIR = APP_DIR
else:
    HOME_DIR = LOCAL_HOME
# 便携用法（exe 旁边有 data/）时把位置记在这里；exe 被挪到别处、旁边没有 data/ 了，启动时就从这里找回以前的做题记录
PORTABLE_POINTER = os.path.join(LOCAL_HOME, 'portable_home.txt')

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


def _load_json(path):
    import json
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def follow_moved_exe():
    """exe 挪了地方也不丢做题记录。
    - 便携用法：记下数据在哪（PORTABLE_POINTER）
    - 不是便携用法（数据在 %LOCALAPPDATA%）：如果以前在别处便携用过、那边的做题记录比这边多，
      就把那边的记录合并过来（这边已经做的几题也留着），合并前两边都备份。2026-10-10 真出过这事：
      exe 从 quiz-app 文件夹挪到桌面，数据目录跟着变了，看起来做题记录全没了"""
    import json
    import time
    if not FROZEN:
        return None
    if HOME_DIR == APP_DIR:
        try:
            os.makedirs(LOCAL_HOME, exist_ok=True)
            with open(PORTABLE_POINTER, 'w', encoding='utf-8') as f:
                f.write(APP_DIR)
        except OSError:
            pass
        return None
    try:
        old_home = open(PORTABLE_POINTER, encoding='utf-8').read().strip()
    except OSError:
        return None
    old_p = os.path.join(old_home, 'data', 'progress.json')
    new_p = os.path.join(DATA_DIR, 'progress.json')
    old = _load_json(old_p)
    if not old or not old.get('attempts') or os.path.normcase(old_home) == os.path.normcase(HOME_DIR):
        return None
    new = _load_json(new_p) or {}
    seen = {(a.get('k'), a.get('t')) for a in new.get('attempts', [])}
    if all((a.get('k'), a.get('t')) in seen for a in old['attempts']):
        return None                                   # 已经合并过了
    stamp = time.strftime('%Y%m%d-%H%M%S')
    for path in (old_p, new_p):
        if os.path.exists(path):
            bdir = os.path.join(os.path.dirname(path), 'backups')
            os.makedirs(bdir, exist_ok=True)
            shutil.copy(path, os.path.join(bdir, 'progress-%s-exe挪位置合并前.json' % stamp))
    merged = dict(old)
    merged['cards'] = dict(old.get('cards') or {})
    old_seen = {(a.get('k'), a.get('t')) for a in old['attempts']}
    extra = [a for a in new.get('attempts', []) if (a.get('k'), a.get('t')) not in old_seen]
    merged['attempts'] = list(old['attempts']) + extra
    for k, c in (new.get('cards') or {}).items():        # 两边都做过的题，用最后做的那份
        if k not in merged['cards'] or (c.get('last') or '') > (merged['cards'][k].get('last') or ''):
            merged['cards'][k] = c
    ids = {e.get('id') for e in merged.get('exams') or []}
    merged['exams'] = list(merged.get('exams') or []) + [e for e in new.get('exams') or [] if e.get('id') not in ids]
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(new_p + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False)
    os.replace(new_p + '.tmp', new_p)
    print('exe 换了位置：从 %s 找回做题记录 %d 条（这边新做的 %d 条也留着）' % (old_home, len(old['attempts']), len(extra)))
    return old_home


def ensure_data():
    """把正在用的那份内容里的题库放到 DATA_DIR（exe 才做；源码运行时 data/ 就是题库本身）"""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not FROZEN:
        return
    try:
        follow_moved_exe()
    except Exception as e:                           # 找回失败也不能让程序打不开
        print('找回以前的做题记录失败：%s' % e)
    root, m = active()
    seed_data(os.path.join(root, 'data'), m['content_version'] if m else 0)


def _replace_children(src, dst):
    """把 src 下的每个子文件夹（一份卷子的图片、一套技能卷）换进 dst。
    只换内容包里有的，dst 里多出来的（本机自己导入的题库包的图片）保留。
    整个换不了（文件正被打开）就逐个文件覆盖，不让更新卡在半路。"""
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if not os.path.isdir(s):
            shutil.copy(s, d)
            continue
        tmp = d + '.new'
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(s, tmp)
        shutil.rmtree(d, ignore_errors=True)
        try:
            os.replace(tmp, d)
        except OSError:
            shutil.copytree(tmp, d, dirs_exist_ok=True)
            shutil.rmtree(tmp, ignore_errors=True)


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
            _replace_children(src, dst)
        else:
            shutil.copy(src, dst + '.new')
            os.replace(dst + '.new', dst)
    if upgrade:
        with open(mark, 'w', encoding='utf-8') as f:
            f.write(str(version))
