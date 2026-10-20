# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""网页版：放在同步服务器同一个域名的 /web/ 下，必须用账号登录才能用（记录都在账号里）。

和安卓 App 一样，界面 static/ + 本地后端 mobile/local.js 在浏览器里跑，题库 bank.json、图片 media/ 是静态文件，
做题记录存在浏览器 localStorage，并通过账号同步到服务器（同步服务就是电脑版 / 手机「账号同步」那个）。

    python web/build_web.py            → _build/web/（整个文件夹传到服务器）和 _build/zhixue-web.tar.gz

index.html 里插一句 window.ZX_WEB = {v: 内容版本}，界面据此加载 local.js、要求登录；
js / css / bank.json 的地址带 ?v=内容版本，EdgeOne 和浏览器缓存了旧的也会换新。
部署：把 tar.gz 和 web/deploy_web.sh 传到服务器 /root/zhixue-web-upload/，运行 bash deploy_web.sh 域名。
"""
import json
import os
import re
import shutil
import tarfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, '_build', 'web')


def build():
    with open(os.path.join(ROOT, 'content.json'), encoding='utf-8') as f:
        ver = json.load(f).get('content_version', 0)
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, 'static'), OUT)
    shutil.copy(os.path.join(ROOT, 'mobile', 'local.js'), OUT)
    shutil.copy(os.path.join(ROOT, 'data', 'bank.json'), OUT)
    shutil.copy(os.path.join(ROOT, 'content.json'), OUT)          # 网页上看现在是第几版、有没有新版
    shutil.copytree(os.path.join(ROOT, 'data', 'media'), os.path.join(OUT, 'media'))

    path = os.path.join(OUT, 'index.html')
    with open(path, encoding='utf-8') as f:
        html = f.read()
    head = '<meta charset="utf-8">'
    assert html.count(head) == 1
    # 离线缓存（web/sw.js）：弱网、断网也能打开、接着做
    html = html.replace(head, head + '\n<script>window.ZX_WEB = { v: %d };\n'
                        "if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));"
                        '</script>' % ver)
    html, n = re.subn(r'(src|href)="(app\.js|word\.js|skills\.js|style\.css)"', r'\1="\2?v=%d"' % ver, html)
    assert n == 4, n
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(html)

    files = ['./', 'index.html'] + ['%s?v=%d' % (n, ver) for n in ('app.js', 'word.js', 'skills.js', 'style.css', 'local.js', 'bank.json')]
    with open(os.path.join(HERE, 'sw.js'), encoding='utf-8') as f:
        sw = f.read()
    assert '__V__' in sw and '__FILES__' in sw
    sw = sw.replace('__V__', str(ver)).replace('__FILES__', json.dumps(files))
    with open(os.path.join(OUT, 'sw.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(sw)

    tar = os.path.join(ROOT, '_build', 'zhixue-web.tar.gz')
    with tarfile.open(tar, 'w:gz') as t:
        t.add(OUT, arcname='web')
    print('网页版（内容第 %d 版）：%s\n打包：%s（%.1f MB）' % (ver, OUT, tar, os.path.getsize(tar) / 1e6))
    return tar


if __name__ == '__main__':
    build()
