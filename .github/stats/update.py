# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""下载 / 使用统计：GitHub Action 每天跑一次（.github/workflows/stats.yml），结果放在 stats 分支，
README 里的图就是这里画的 SVG。

记的数（history.csv，一天一行）：
  exe / apk   GitHub Release 里电脑版、手机版安装包累计被下载的次数（所有版本加起来；
              经 ghproxy.net 国内加速下载的也算，因为它是从 GitHub 拉的；QQ 群里直接传的文件统计不到）
  cdn         当天 jsDelivr 上本仓库文件被请求的次数：国内同学检查更新、热更新都走它，
              可以看成“当天有多少次在用”的粗略指标（同一台设备一天可能检查好几次）
只用 Python 标准库。用法：python update.py <输出目录>（目录里已有 history.csv 就接着记）"""
import csv
import datetime
import json
import os
import sys
import urllib.request

REPO = 'chen-pi-2007/zhixue-tiku'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
CSV_PATH = os.path.join(OUT, 'history.csv')
FIELDS = ['date', 'exe', 'apk', 'cdn']


def get(url, token=None):
    req = urllib.request.Request(url, headers={'User-Agent': 'zhixue-stats', 'Accept': 'application/vnd.github+json'})
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def release_downloads(token):
    exe = apk = 0
    page = 1
    while True:
        rels = get('https://api.github.com/repos/%s/releases?per_page=100&page=%d' % (REPO, page), token)
        if not rels:
            break
        for rel in rels:
            for a in rel.get('assets', []):
                n = a.get('name', '').lower()
                if n.endswith('.exe'):
                    exe += a.get('download_count', 0)
                elif n.endswith('.apk'):
                    apk += a.get('download_count', 0)
        page += 1
    return exe, apk


def cdn_daily():
    """jsDelivr 最近一个月每天的请求数 {日期: 次数}（它的统计一般晚一两天，最近两天的数会被后面的运行补上）"""
    try:
        d = get('https://data.jsdelivr.com/v1/stats/packages/gh/%s?period=month' % REPO)
        return {k: int(v) for k, v in d['hits']['dates'].items()}
    except Exception as e:
        print('jsDelivr 统计读取失败：%s' % e)
        return {}


def load():
    rows = {}
    if os.path.exists(CSV_PATH):
        with open(CSV_PATH, encoding='utf-8') as f:
            for r in csv.DictReader(f):
                rows[r['date']] = {k: (r[k] if k == 'date' else (int(r[k]) if r[k] != '' else None)) for k in FIELDS}
    return rows


def save(rows):
    os.makedirs(OUT, exist_ok=True)
    with open(CSV_PATH, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        for d in sorted(rows):
            w.writerow({k: ('' if rows[d][k] is None else rows[d][k]) for k in FIELDS})


# ---------------------------------------------------------------- 画图：一张卡片（上面三个大数字，下面每天的趋势）
# 卡片自带底色，GitHub 浅色 / 深色主题、系统深色模式下都看得清；颜色取自同一套配色的浅色、深色两档
W, H = 840, 380
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"
STYLE = """<style>
  text{font-family:%s}
  .bg{fill:#ffffff;stroke:#d8dee4}
  .h{font-size:18px;font-weight:600;fill:#1f2328}
  .m{font-size:12px;fill:#656d76}
  .k{font-size:13px;fill:#656d76}
  .big{font-size:34px;font-weight:700;fill:#1f2328}
  .unit{font-size:14px;fill:#656d76}
  .ax{font-size:11px;fill:#8c959f}
  .tile{fill:#f6f8fa}
  .grid{stroke:#eaeef2;stroke-width:1;stroke-dasharray:3 4}
  .base{stroke:#d0d7de;stroke-width:1}
  .ln{stroke:#2a78d6;stroke-width:2.5;fill:none;stroke-linejoin:round;stroke-linecap:round}
  .dot{fill:#2a78d6;stroke:#ffffff;stroke-width:2.5}
  .accent{fill:#2a78d6}
  .stop1{stop-color:#2a78d6;stop-opacity:.22}.stop2{stop-color:#2a78d6;stop-opacity:0}
  .lab{font-size:12px;font-weight:600;fill:#1f2328}
  @media (prefers-color-scheme: dark){
    .bg{fill:#0d1117;stroke:#30363d}
    .h,.big,.lab{fill:#e6edf3}.m,.k,.unit{fill:#8d96a0}.ax{fill:#6e7681}
    .tile{fill:#161b22}.grid{stroke:#21262d}.base{stroke:#30363d}
    .ln{stroke:#3987e5}.dot{fill:#3987e5;stroke:#0d1117}.accent{fill:#3987e5}
    .stop1{stop-color:#3987e5;stop-opacity:.30}.stop2{stop-color:#3987e5;stop-opacity:0}
  }
</style>""" % FONT


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def nice_max(v):
    v = max(v, 1)
    for m in (4, 8, 10, 20, 40, 50, 80, 100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 10000, 20000, 50000, 100000):
        if v <= m:
            return m
    return v


def smooth(pts):
    """穿过各点的平滑曲线（单调三次插值的简化版：控制点水平放，曲线不会冲到 0 以下）"""
    if len(pts) == 1:
        return 'M%.1f %.1f' % pts[0]
    d = 'M%.1f %.1f' % pts[0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        cx = (x1 - x0) / 2
        d += ' C%.1f %.1f %.1f %.1f %.1f %.1f' % (x0 + cx, y0, x1 - cx, y1, x1, y1)
    return d


def card(rows, path, today):
    """三个数字 + 每天更新检查次数的趋势（从第一天有数据开始，至少画 7 天）"""
    dl = [d for d in sorted(rows) if rows[d]['exe'] is not None]
    exe, apk = (rows[dl[-1]]['exe'], rows[dl[-1]]['apk']) if dl else (0, 0)
    # jsDelivr 的统计晚一两天才出来：还没出来的日子（cdn 为空）不画，免得曲线最后掉到 0 像是没人用了
    days = [d for d in sorted(rows) if rows[d]['cdn'] is not None] or [today]
    cdn = {d: rows[d]['cdn'] or 0 for d in days}
    nz = [d for d in days if cdn[d]]
    last7 = sum(cdn[d] for d in days[-7:])
    last30 = sum(cdn[d] for d in days[-30:])

    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="智学题库使用情况">'
           % (W, H, W, H), STYLE,
           '<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop1"/><stop offset="1" class="stop2"/></linearGradient></defs>',
           '<rect class="bg" x="0.5" y="0.5" width="%d" height="%d" rx="12"/>' % (W - 1, H - 1),
           '<rect class="accent" x="28" y="28" width="4" height="20" rx="2"/>',
           '<text class="h" x="42" y="44">智学题库 · 使用情况</text>',
           '<text class="m" x="%d" y="44" text-anchor="end">每天自动更新 · %s</text>' % (W - 28, esc(today))]

    # 三个数字
    tiles = [('安装包下载', '%d' % (exe + apk), '次', '电脑版 %d · 手机版 %d' % (exe, apk)),
             ('近 7 天打开使用', '%d' % last7, '次', '检查更新、下载新题库都算'),
             ('近 30 天打开使用', '%d' % last30, '次', '统计晚一两天，最近的数会补上')]
    tw, gap, ty = (W - 56 - 2 * 16) / 3.0, 16, 68
    for i, (k, v, u, note) in enumerate(tiles):
        x = 28 + i * (tw + gap)
        out.append('<rect class="tile" x="%.1f" y="%d" width="%.1f" height="96" rx="10"/>' % (x, ty, tw))
        out.append('<text class="k" x="%.1f" y="%d">%s</text>' % (x + 18, ty + 26, k))
        out.append('<text x="%.1f" y="%d"><tspan class="big">%s</tspan><tspan class="unit" dx="6">%s</tspan></text>' % (x + 18, ty + 66, v, u))
        out.append('<text class="m" x="%.1f" y="%d">%s</text>' % (x + 18, ty + 86, esc(note)))

    # 趋势
    cx0, cx1, cy0, cy1 = 58, W - 40, 214, H - 44
    out.append('<text class="k" x="28" y="200">每天打开使用次数</text>')
    span = days[days.index(nz[0]):] if nz else days[-7:]
    if len(span) < 7:
        first = datetime.datetime.strptime(span[-1] if span else today, '%Y-%m-%d')
        span = [(first - datetime.timedelta(days=6 - i)).strftime('%Y-%m-%d') for i in range(7)]
    vals = [cdn.get(d, 0) for d in span]
    vmax = nice_max(max(vals))
    for i in range(3):
        y = cy1 - (cy1 - cy0) * i / 2
        out.append('<line class="%s" x1="%d" x2="%d" y1="%.1f" y2="%.1f"/>' % ('base' if i == 0 else 'grid', cx0, cx1, y, y))
        out.append('<text class="ax" x="%d" y="%.1f" text-anchor="end">%g</text>' % (cx0 - 10, y + 4, vmax * i / 2))
    n = len(span)
    pts = [(cx0 + (cx1 - cx0) * i / max(n - 1, 1), cy1 - (cy1 - cy0) * v / vmax) for i, v in enumerate(vals)]
    line = smooth(pts)
    out.append('<path d="%s L%.1f %.1f L%.1f %.1f Z" fill="url(#fill)"/>' % (line, pts[-1][0], cy1, pts[0][0], cy1))
    out.append('<path class="ln" d="%s"/>' % line)
    step = max(1, (n + 6) // 7)
    for i, d in enumerate(span):
        if i % step == 0 or i == n - 1:
            out.append('<text class="ax" x="%.1f" y="%d" text-anchor="middle">%s</text>' % (pts[i][0], H - 22, '%d/%d' % (int(d[5:7]), int(d[8:]))))
    # 最高的一天标出来
    k = max(range(n), key=lambda i: vals[i])
    if vals[k]:
        x, y = pts[k]
        out.append('<circle class="dot" cx="%.1f" cy="%.1f" r="5"/>' % (x, y))
        anchor = 'end' if x > cx1 - 60 else 'middle'
        out.append('<text class="lab" x="%.1f" y="%.1f" text-anchor="%s">%d 次</text>' % (x if anchor == 'middle' else x - 8, y - 12, anchor, vals[k]))
    out.append('</svg>')
    open(path, 'w', encoding='utf-8').write('\n'.join(out))


def main():
    token = os.environ.get('GITHUB_TOKEN')
    rows = load()
    today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    for d, v in cdn_daily().items():                     # jsDelivr 有历史：补齐 / 更新最近一个月
        rows.setdefault(d, {'date': d, 'exe': None, 'apk': None, 'cdn': None})['cdn'] = v
    exe, apk = release_downloads(token)
    rows.setdefault(today, {'date': today, 'exe': None, 'apk': None, 'cdn': None})
    rows[today]['exe'], rows[today]['apk'] = exe, apk
    save(rows)
    card(rows, os.path.join(OUT, 'stats.svg'), today)
    print('%s 电脑版 %d 手机版 %d，jsDelivr 今天 %s' % (today, exe, apk, rows[today]['cdn']))


if __name__ == '__main__':
    main()
