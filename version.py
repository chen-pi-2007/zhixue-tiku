# -*- coding: utf-8 -*-
"""版本号。
APP_VERSION   程序版本，和 GitHub Release 的 tag（去掉开头的 v）对应，检查更新时比较它
DATA_VERSION  打包进 exe 的题库版本：题库（bank.json、media/、skills/）有改动就加 1，
              用户装了新 exe 后会自动换上新题库，做题记录（progress.json）不动"""
APP_VERSION = '1.3.1'
DATA_VERSION = 3
REPO = 'chen-pi-2007/zhixue-tiku'
EXE_NAME = '智学题库.exe'
