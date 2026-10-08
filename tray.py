# -*- coding: utf-8 -*-
"""电脑版入口（智学题库.exe）：后台起本地网页服务，在自己的窗口里显示界面（WebView2，和 Edge 同一个内核，
不用打开浏览器），托盘图标右键菜单操作。关窗口缩到托盘，托盘「退出」才真正退出。
参数：--tray 开机自启时只放进托盘；--updated 在线更新后重启（提示已更新）；--browser 不用窗口，改用浏览器。
没有 WebView2 的电脑自动退回浏览器方式。打包：build_exe.bat 或 release.py app。
"""
import ctypes
import datetime
import os
import sys
import threading
import urllib.parse
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
    # 以前登记的没有 --tray，也算开着（只比较程序本身）
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            return winreg.QueryValueEx(k, APP_NAME)[0].startswith(launch_command())
    except OSError:
        return False


def set_autostart(on):
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            # --tray：开机时只放进托盘，不弹窗口
            winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, launch_command() + ' --tray')
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


def ask_show(url):
    """已经开着时：请正在运行的那个把窗口调出来。成功返回 True（旧版本没有窗口，返回 False）"""
    try:
        req = urllib.request.Request(url + 'api/window/show', data=b'', method='POST')
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def running_version(url):
    """正在运行的那个智学题库是什么版本；很老的版本没有这个接口，返回 None"""
    try:
        import json
        with urllib.request.urlopen(url + 'api/app', timeout=2) as r:
            return json.loads(r.read().decode('utf-8')).get('version')
    except Exception:
        return None


def _ver(s):
    return tuple(int(x) if x.isdigit() else 0 for x in (s or '0').split('.')) + (0, 0, 0)


def take_over_old(url, old_version):
    """旧版本（没有独立窗口、调不出窗口）还开着、占着端口：问一下，同意就关掉它，由新版本接着运行。
    以前这种情况会直接用浏览器打开——打开的还是旧版本，看起来像“更新了也没用”。返回 True 表示旧版本已关掉"""
    import subprocess
    import time
    from version import APP_VERSION
    port = urllib.parse.urlparse(url).port or 80
    no_window = 0x08000000
    try:
        out = subprocess.run(['netstat', '-ano', '-p', 'TCP'], capture_output=True, text=True,
                             creationflags=no_window).stdout
    except OSError:
        return False
    pid = next((ln.split()[-1] for ln in out.splitlines()
                if 'LISTENING' in ln and ln.split()[1].endswith(':%d' % port)), None)
    if not pid or not pid.isdigit() or int(pid) == os.getpid():
        return False
    try:
        name = subprocess.run(['tasklist', '/FI', 'PID eq %s' % pid, '/FO', 'CSV', '/NH'], capture_output=True,
                              text=True, creationflags=no_window).stdout.split(',')[0].strip('"')
    except OSError:
        return False
    lname = name.lower()
    by_bat = False
    if lname in ('python.exe', 'pythonw.exe'):
        # 早期版本用 start.bat 启动：一个黑色命令行窗口里跑 python server.py，没有托盘图标，
        # 用户找不到也关不掉。只认运行的是 server.py 的那个 Python，别的 Python 程序不动
        try:
            cmd = subprocess.run(['powershell', '-NoProfile', '-Command',
                                  '(Get-CimInstance Win32_Process -Filter "ProcessId=%s").CommandLine' % pid],
                                 capture_output=True, text=True, creationflags=no_window).stdout
        except OSError:
            return False
        if 'server.py' not in cmd:
            return False
        by_bat = True
    elif not lname.endswith('.exe') or not ('智学' in name or 'zhixue' in lname):
        return False                         # 端口被别的程序占着，不动它
    text = ('检测到旧版本的智学题库（%s）还在运行%s，新版本 %s 打不开它的窗口。\n\n'
            '是否关闭旧版本，改用新版本？做题记录不受影响。' % (
                'v' + old_version if old_version else '很早的版本',
                '（用 start.bat 打开的黑色命令行窗口）' if by_bat else '', APP_VERSION))
    if ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, 0x4 | 0x20) != 6:     # 是 / 否；6 = 是
        return False
    subprocess.run(['taskkill', '/PID', pid, '/F'], capture_output=True, creationflags=no_window)
    for _ in range(20):                      # 等端口空出来
        if not already_running(url):
            return True
        time.sleep(0.3)
    return False


def main():
    # 无控制台时 stdout/stderr 是 None，服务日志和报错写到 server.log
    os.makedirs(appdir.HOME_DIR, exist_ok=True)
    appdir.ensure_data()
    if sys.stdout is None or getattr(sys, 'frozen', False):
        log = open(LOG_PATH, 'w', encoding='utf-8', buffering=1)
        sys.stdout = sys.stderr = log

    import server
    from version import APP_VERSION
    url = server.configured_url()
    if already_running(url):
        if ask_show(url):
            return
        old = running_version(url)
        # 开着的是更旧的版本（调不出窗口）：征得同意后关掉它，由这个新版本接着启动
        if not (_ver(old) < _ver(APP_VERSION) and take_over_old(url, old)):
            webbrowser.open(url)
            return
    try:
        srv, url = server.make_server()
    except Exception as e:
        message('启动失败：%s\n\n详细信息见 %s' % (e, LOG_PATH), error=True)
        raise
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    # 独立窗口（WebView2，和 Edge 同一个内核）。电脑上没有 WebView2 或 pywebview 出错时，退回浏览器打开
    try:
        import webview
    except Exception:
        webview = None
    if webview is not None and '--browser' not in sys.argv:
        try:
            return run_window(webview, srv, url, server)
        except Exception:
            import traceback
            traceback.print_exc()
            print('独立窗口打不开，改用浏览器')
    run_browser(srv, url)


def tray_icon(url, on_open, on_quit):
    import pystray
    from pystray import Menu, MenuItem as Item

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

    return pystray.Icon('quizbank', make_icon_image(), '%s · %s' % (APP_NAME, url), Menu(
        Item('打开题库', lambda icon, item: on_open(), default=True),
        Menu.SEPARATOR,
        Item('开机自启', toggle_autostart, checked=lambda item: is_autostart()),
        Item('打开数据文件夹', open_data),
        Item('备份数据到桌面', do_backup),
        Menu.SEPARATOR,
        Item('退出', lambda icon, item: on_quit()),
    ))


def run_window(webview, srv, url, server):
    """独立窗口：关窗口缩到托盘，托盘「退出」才真正退出。开机自启（--tray）时只放进托盘不弹窗。"""
    from version import APP_VERSION
    state = {'quitting': False, 'hint': False}
    # 本地存储（主题、翻译开关、没交卷的考试）要留着，不用无痕模式；存在数据目录旁边
    storage = os.path.join(appdir.HOME_DIR, 'webview')
    webview.settings['ALLOW_DOWNLOADS'] = True              # 导出错题本
    webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
    hidden = '--tray' in sys.argv
    win = webview.create_window(APP_NAME, url, width=1280, height=840, min_size=(400, 560), hidden=hidden,
                                background_color='#1a1a1a' if dark_mode() else '#eceef1')

    def show():
        win.show()
        win.restore()
        win.on_top = True                                    # 拉到最前面再放开，免得被别的窗口挡着
        win.on_top = False

    def quit_all():
        state['quitting'] = True
        icon.stop()
        win.destroy()

    def on_closing():
        if state['quitting']:
            return True
        win.hide()                                           # 关窗口 = 缩到托盘
        if not state['hint']:
            state['hint'] = True
            icon.notify('还在托盘里运行，点托盘图标就能打开；右键「退出」才会关闭', APP_NAME)
        return False

    win.events.closing += on_closing
    server.SHOW_WINDOW = show
    icon = tray_icon(url, show, quit_all)
    icon.run_detached()
    icon.visible = True
    if '--updated' in sys.argv:
        icon.notify('已更新到 v%s' % APP_VERSION, APP_NAME)
    webview.start(gui='edgechromium', private_mode=False, storage_path=storage)
    # 窗口全部关掉（退出）后
    server.SHOW_WINDOW = None
    try:
        icon.stop()
    except Exception:
        pass
    srv.shutdown()


def dark_mode():
    """系统是不是深色模式（窗口打开前先用对应的底色，免得闪白）"""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize') as k:
            return winreg.QueryValueEx(k, 'AppsUseLightTheme')[0] == 0
    except OSError:
        return False


def run_browser(srv, url):
    """没有独立窗口时的老办法：托盘 + 浏览器打开"""
    def open_app():
        webbrowser.open(url)

    def quit_app():
        icon.stop()
        srv.shutdown()

    icon = tray_icon(url, open_app, quit_app)

    def on_ready(icon):
        icon.visible = True
        if '--updated' in sys.argv:          # 在线更新后自动重启：原来的网页会自己刷新，不再新开一个
            from version import APP_VERSION
            icon.notify('已更新到 v%s' % APP_VERSION, APP_NAME)
        elif '--tray' not in sys.argv:
            open_app()
            icon.notify('已在后台运行，点托盘图标打开；右键可退出', APP_NAME)

    icon.run(setup=on_ready)


if __name__ == '__main__':
    main()
