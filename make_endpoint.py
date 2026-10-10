# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""把同步服务器地址混淆后写进打包用的代码：zx_endpoint.py（电脑版）和 Endpoint.java（手机版）。

地址放在 sync_endpoint.txt（一行，比如 https://xxx.example.com），这个文件和生成的代码都在 .gitignore 里，
不进 GitHub。打包脚本（build_exe.py、mobile/build_apk.py）会先调这里；没有 sync_endpoint.txt 就生成空地址，
那一版程序不带同步功能。

混淆：每次打包随机生成密钥，地址按字节和密钥流异或后切成几段、打乱顺序、混进几段假数据。
挡得住直接在 exe / apk 里搜字符串，挡不住专门逆向的人 —— 真正保护服务器 IP 的是 EdgeOne：程序里只有域名。
"""
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
SECRET = os.path.join(HERE, 'sync_endpoint.txt')


def read_url():
    try:
        with open(SECRET, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def _parts(url):
    rnd = random.SystemRandom()
    data = url.encode('utf-8')
    seed = rnd.randrange(1, 2 ** 31 - 1)
    mul = rnd.choice([48271, 69621, 16807])
    stream, x = [], seed
    for _ in data:
        x = (x * mul) % 2147483647
        stream.append(x & 0xFF)
    enc = [b ^ k for b, k in zip(data, stream)]
    n = max(1, min(4, len(enc)))
    cut = sorted(rnd.sample(range(1, len(enc)), n - 1)) if len(enc) > n else []
    chunks = [enc[a:b] for a, b in zip([0] + cut, cut + [len(enc)])]
    order = list(range(len(chunks)))
    rnd.shuffle(order)                       # order[i] = 第 i 个存放位置放的是第几段
    store = [chunks[i] for i in order]
    decoys = [[rnd.randrange(256) for _ in range(rnd.randrange(3, 12))] for _ in range(rnd.randrange(2, 4))]
    slots = store + decoys
    pos = list(range(len(slots)))
    rnd.shuffle(pos)
    table = [None] * len(slots)
    for i, p in enumerate(pos):
        table[p] = slots[i]
    real = [pos[order.index(k)] for k in range(len(chunks))]   # 第 k 段在 table 里的位置
    return seed, mul, table, real


def write_python(path, url):
    if not url:
        body = 'def url():\n    return ""\n'
    else:
        seed, mul, table, real = _parts(url)
        body = (
            '# 自动生成，不要提交（见 make_endpoint.py）\n'
            '_T = %r\n_R = %r\n\n\n'
            'def url():\n'
            '    b = [v for i in _R for v in _T[i]]\n'
            '    x, out = %d, []\n'
            '    for c in b:\n'
            '        x = (x * %d) %% 2147483647\n'
            '        out.append(c ^ (x & 0xFF))\n'
            '    return bytes(out).decode("utf-8")\n' % (table, real, seed, mul))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(body)


def write_java(path, url):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not url:
        inner = 'return "";'
    else:
        seed, mul, table, real = _parts(url)
        arr = ', '.join('{%s}' % ', '.join(str(v) for v in t) for t in table)
        inner = ('int[][] t = {%s}; int[] r = {%s}; long x = %dL; java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();\n'
                 '        for (int i : r) for (int c : t[i]) { x = (x * %dL) %% 2147483647L; o.write(c ^ (int) (x & 0xFF)); }\n'
                 '        try { return o.toString("UTF-8"); } catch (Exception e) { return ""; }'
                 % (arr, ', '.join(map(str, real)), seed, mul))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// 自动生成，不要提交（见 make_endpoint.py）\npackage com.zhixue.tiku;\n\n'
                'final class Endpoint {\n    static String url() {\n        %s\n    }\n}\n' % inner)


if __name__ == '__main__':
    u = read_url()
    write_python(os.path.join(HERE, 'zx_endpoint.py'), u)
    print('zx_endpoint.py：' + ('已生成' if u else '没有 sync_endpoint.txt，地址为空'))
