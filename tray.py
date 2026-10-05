# -*- coding: utf-8 -*-
"""系统托盘版启动器：后台跑服务，托盘图标右键菜单操作，没有黑窗口。
打包：build_exe.bat（生成 智学题库.exe，放在本目录，读写旁边的 data/ 和 static/）。
"""
import ctypes
import datetime
import os
import sys
import threading
import urllib.request
import webbrowser
import winreg
import zipfile

import appdir

APP_NAME = '智学题库'
RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'
LOG_PATH = appdir.LOG_PATH


def message(text, error=False):
    ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, 0x10 if error else 0x40)


def make_icon_image(size=64):
    """蓝底圆角方块 + 白色“题”字。"""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=(79, 110, 247, 255))
    font = None
    for f in ('msyhbd.ttc', 'msyh.ttc', 'simhei.ttf'):
        try:
            font = ImageFont.truetype(os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', f), int(size * 0.62))
            break
        except OSError:
            continue
    font = font or ImageFont.load_default()
    box = d.textbbox((0, 0), '题', font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), '题', font=font, fill='white')
    return img


# ---------------------------------------------------------------- 开机自启

def launch_command():
    if getattr(sys, 'frozen', False):
        return '"%s"' % sys.executable
    pyw = os.path.join(os.path.dirname(sys.executable), 'pythonw.exe')
    return '"%s" "%s"' % (pyw if os.path.exists(pyw) else sys.executable, os.path.abspath(__file__))


def is_autostart():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            return winreg.QueryValueEx(k, APP_NAME)[0] == launch_command()
    except OSError:
        return False


def set_autostart(on):
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, launch_command())
        else:
            try:
                winreg.DeleteValue(k, APP_NAME)
            except OSError:
                pass


# ---------------------------------------------------------------- 备份

def desktop_dir():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r'Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') as k:
            return os.path.expandvars(winreg.QueryValueEx(k, 'Desktop')[0])
    except OSError:
        return os.path.join(os.path.expanduser('~'), 'Desktop')


def backup_data():
    """把 data/ 打包成桌面上的 zip。服务运行中也能备份：写文件用的是先写临时文件再替换。"""
    import db
    data = db.DATA_DIR
    dest = os.path.join(desktop_dir(), '智学题库备份-%s.zip' % datetime.datetime.now().strftime('%Y%m%d-%H%M'))
    with db._lock, zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(data):
            for f in files:
                if f.endswith('.tmp'):
                    continue
                p = os.path.join(root, f)
                z.write(p, os.path.join('data', os.path.relpath(p, data)))
    return dest


# ---------------------------------------------------------------- 主程序

def already_running(url):
    try:
        with urllib.request.urlopen(url + 'api/stats', timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    # 无控制台时 stdout/stderr 是 None，服务日志和报错写到 server.log
    os.makedirs(appdir.HOME_DIR, exist_ok=True)
    appdir.ensure_data()
    if sys.stdout is None or getattr(sys, 'frozen', False):
        log = open(LOG_PATH, 'w', encoding='utf-8', buffering=1)
        sys.stdout = sys.stderr = log

    import server
    url = server.configured_url()
    if already_running(url):
        webbrowser.open(url)
        return
    try:
        srv, url = server.make_server()
    except Exception as e:
        message('启动失败：%s\n\n详细信息见 %s' % (e, LOG_PATH), error=True)
        raise
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    import pystray
    from pystray import Menu, MenuItem as Item

    def open_app(icon=None, item=None):
        webbrowser.open(url)

    def toggle_autostart(icon, item):
        try:
            set_autostart(not is_autostart())
        except OSError as e:
            message('设置开机自启失败：%s' % e, error=True)

    def open_data(icon, item):
        os.startfile(appdir.DATA_DIR)

    def do_backup(icon, item):
        try:
            icon.notify('已备份到：%s' % backup_data(), APP_NAME)
        except Exception as e:
            message('备份失败：%s' % e, error=True)

    def quit_app(icon, item):
        icon.stop()
        srv.shutdown()

    icon = pystray.Icon('quizbank', make_icon_image(), '%s · %s' % (APP_NAME, url), Menu(
        Item('打开题库', open_app, default=True),
        Menu.SEPARATOR,
        Item('开机自启', toggle_autostart, checked=lambda item: is_autostart()),
        Item('打开数据文件夹', open_data),
        Item('备份数据到桌面', do_backup),
        Menu.SEPARATOR,
        Item('退出', quit_app),
    ))

    def on_ready(icon):
        icon.visible = True
        open_app()
        icon.notify('已在后台运行，点托盘图标打开；右键可退出', APP_NAME)

    icon.run(setup=on_ready)


if __name__ == '__main__':
    main()
