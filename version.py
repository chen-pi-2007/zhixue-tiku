# -*- coding: utf-8 -*-
"""版本号。不用手改，用 release.py 发布时它会改（见 MAINTAINING.md）。

APP_VERSION          程序版本（电脑版 exe 和安卓 App 共用），和 GitHub Release 的 tag vX.Y.Z 对应。
                     改了 Python 代码或安卓 Java 代码，就要发新版程序。
CONTENT_VERSION      内容版本（界面 + 题库 + 手机本地逻辑），整数，每发一次内容加 1。
                     内容可以热更新：用户点「检查更新」只下载变了的文件，不用重装程序。
CONTENT_MIN_APP      这份内容要求的最低电脑版程序版本：界面用到了新接口时，改成提供这个接口的程序版本。
CONTENT_MIN_ANDROID  这份内容要求的最低安卓 App 版本：local.js 用到了新的 ZXStore 接口时改。
                     程序太旧的用户不会收到这份内容，会被提示先更新程序。"""
APP_VERSION = '1.5.1'
CONTENT_VERSION = 31
CONTENT_MIN_APP = '1.4.0'      # 1.4.0～1.4.3 配新内容实测能用（只是导入时丢掉选项说明、词组），让连不上 GitHub、装不了新程序的同学也能收到改正后的题库
CONTENT_MIN_ANDROID = '1.4.0'
# 外壳（exe 里固定的 tray/appdir/hotupdate/updater 等）和热更新后端（content.HOT_PY）之间的接口版本。
# 后端要用外壳的新函数、或外壳改了调用后端的方式时加 1，并发新版程序；旧外壳遇到不一样的号就不加载新后端
SHELL_API = 1
DATA_VERSION = CONTENT_VERSION       # 旧名字，1.3.x 及以前的数据文件夹里 data_version.txt 记的就是它
REPO = 'chen-pi-2007/zhixue-tiku'
# 作者署名：设置页「关于」、接口返回头、exe 文件属性都从这里取
AUTHORS = '十三（xiabanghao13）、chen_pi（chen-pi-2007）'
AUTHORS_ASCII = 'xiabanghao13 & chen_pi (chen-pi-2007); https://github.com/chen-pi-2007/zhixue-tiku'
COPYRIGHT = '© 2026 十三、chen_pi。智学题库由十三和 chen_pi 共同开发，保留所有权利。'
EXE_NAME = '智学题库.exe'
