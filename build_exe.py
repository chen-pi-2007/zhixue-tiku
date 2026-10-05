# -*- coding: utf-8 -*-
"""打包托盘版 exe：用 _build/venv 里的 PyInstaller（Anaconda 自带的旧 pathlib 包和 PyInstaller 冲突）。
运行 build_exe.bat 即可，生成本目录下的 智学题库.exe。

exe 是单文件、可以直接发给别人：界面（static/）和一份干净的题库（data/ 里的 bank.json、media/、skills/，
不含 progress.json 做题记录）都打包在里面。别人第一次运行时释放到 %LOCALAPPDATA%\\智学题库\\data。
本机 exe 旁边有 data/ 时照旧用旁边的 data/（见 appdir.py）。"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, '_build')
NAME = '智学题库'
from appdir import SEED_ITEMS                    # 打进 exe 的题库文件；不含做题记录和练习文件
from version import DATA_VERSION


def make_seed():
    seed = os.path.join(BUILD, 'seed')
    shutil.rmtree(seed, ignore_errors=True)
    os.makedirs(seed)
    for name in SEED_ITEMS:
        src = os.path.join(HERE, 'data', name)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(seed, name))
        elif os.path.exists(src):
            shutil.copy(src, seed)
    with open(os.path.join(seed, 'data_version.txt'), 'w', encoding='utf-8') as f:
        f.write(str(DATA_VERSION))
    return seed


def main():
    os.chdir(HERE)
    sys.path.insert(0, HERE)
    import tray
    os.makedirs(BUILD, exist_ok=True)
    ico = os.path.join(BUILD, 'icon.ico')
    tray.make_icon_image(256).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    seed = make_seed()
    subprocess.check_call([
        sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile', '--windowed',
        '--name', NAME, '--icon', ico,
        '--distpath', os.path.join(BUILD, 'dist'), '--workpath', os.path.join(BUILD, 'work'),
        '--specpath', BUILD,
        '--add-data', '%s%sstatic' % (os.path.join(HERE, 'static'), os.pathsep),
        '--add-data', '%s%sseed' % (seed, os.pathsep),
        '--hidden-import', 'llm', '--hidden-import', 'updater', '--hidden-import', 'pystray._win32',
        'tray.py',
    ])
    shutil.copy(os.path.join(BUILD, 'dist', NAME + '.exe'), os.path.join(HERE, NAME + '.exe'))
    print('\n完成：%s' % os.path.join(HERE, NAME + '.exe'))


if __name__ == '__main__':
    main()
