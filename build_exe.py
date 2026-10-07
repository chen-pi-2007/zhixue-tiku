# -*- coding: utf-8 -*-
"""打包托盘版 exe：用 _build/venv 里的 PyInstaller（Anaconda 自带的旧 pathlib 包和 PyInstaller 冲突）。
运行 build_exe.bat（或 release.py app）即可，生成 _build/dist/智学题库.exe，并尽量复制一份到本目录。

exe 是单文件、可以直接发给别人。里面带一份完整的内容（content/：界面 static/、题库 data/ 里的
bank.json、media/、skills/，以及描述它们的 content.json），不含做题记录。
别人第一次运行时题库释放到 %LOCALAPPDATA%\\智学题库\\data；以后的内容更新走热更新（hotupdate.py）。"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, '_build')
NAME = '智学题库'
sys.path.insert(0, HERE)
import content                                   # noqa: E402
from version import CONTENT_VERSION, CONTENT_MIN_APP, CONTENT_MIN_ANDROID   # noqa: E402


def make_content():
    """_build/content：按 content.py 的规则复制内容文件，并生成清单"""
    out = os.path.join(BUILD, 'content')
    shutil.rmtree(out, ignore_errors=True)
    for rel in content.list_files(HERE):
        dst = os.path.join(out, *rel.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(HERE, *rel.split('/')), dst)
    m = content.build_manifest(out, CONTENT_VERSION, CONTENT_MIN_APP, CONTENT_MIN_ANDROID)
    content.write_manifest(os.path.join(out, content.CONTENT_FILE), m)
    print('内容 v%d：%d 个文件' % (CONTENT_VERSION, len(m['files'])))
    return out


def main():
    os.chdir(HERE)
    import tray
    os.makedirs(BUILD, exist_ok=True)
    ico = os.path.join(BUILD, 'icon.ico')
    tray.make_icon_image(256).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    bundled = make_content()
    subprocess.check_call([
        sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile', '--windowed',
        '--name', NAME, '--icon', ico,
        '--distpath', os.path.join(BUILD, 'dist'), '--workpath', os.path.join(BUILD, 'work'),
        '--specpath', BUILD,
        '--add-data', '%s%scontent' % (bundled, os.pathsep),
        '--hidden-import', 'llm', '--hidden-import', 'updater', '--hidden-import', 'hotupdate',
        '--hidden-import', 'pystray._win32',
        # 独立窗口：pywebview 用 WebView2（Edge 内核），靠 pythonnet 调 .NET；把它们的 DLL 一起打进去
        '--collect-all', 'webview', '--collect-all', 'clr_loader', '--collect-all', 'pythonnet',
        'tray.py',
    ])
    dist = os.path.join(BUILD, 'dist', NAME + '.exe')
    try:
        shutil.copy(dist, os.path.join(HERE, NAME + '.exe'))
        print('\n完成：%s' % os.path.join(HERE, NAME + '.exe'))
    except PermissionError:
        # 本目录的 exe 正开着（托盘没退出），复制不过去；发布用 _build/dist 里的就行
        print('\n完成：%s（本目录的 %s.exe 正在运行，没有覆盖）' % (dist, NAME))


if __name__ == '__main__':
    main()
