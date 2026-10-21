# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""账号同步服务（内测）。纯 Python 标准库 + SQLite，跑在服务器上，前面挂 nginx / EdgeOne。

数据只有两种，合并规则都不会丢数据：
- 事件（作答记录、手动“已掌握 / 重新加入错题本”）：每条有全局唯一的 id，服务器按 (用户, id) 去重只增不改。
  客户端拿到全部事件后按时间重放出复习卡片，所以两台设备各自断网做题，联网后结果完全一致。
- 键值（设置、模拟考试、技能成绩、练习存档）：每个键带客户端写入时间 t，新的覆盖旧的（时间相同按内容比较，保证各端一致）。

增量：客户端带上次的游标，只收发游标之后的变化。每次同步还会比对两边的事件总数和校验值，
对不上就走全量核对（/v1/ids + /v1/fetch），中途断网、丢包都能自己补齐。

管理（账号只能由管理员建，没有公开注册）：
    python3 sync_server.py adduser 用户名 密码
    python3 sync_server.py passwd 用户名 新密码
    python3 sync_server.py deluser 用户名
    python3 sync_server.py rename 旧用户名 新用户名      （记录不动；设备靠账号 ID 认人，改名后自动换成新名字）
    python3 sync_server.py users                      （登录设备按网页 / 手机 / 电脑分开数）
    python3 sync_server.py devices 用户名             （这个账号登录着的每台设备、最后一次用的时间）
    python3 sync_server.py mincontent N               （强制更新：内容低于第 N 版的客户端登录 / 同步时被拒，并立刻自动更新；0 = 关掉）
    python3 sync_server.py serve [--port 8790]
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get('ZX_SYNC_DB', os.path.join(HERE, 'sync.db'))
MAX_BODY = 16 * 1024 * 1024
MAX_EVENTS_PER_REQ = 20000
PBKDF2_ROUNDS = 200000

_local = threading.local()
_write_lock = threading.Lock()


def conn():
    c = getattr(_local, 'c', None)
    if c is None:
        c = sqlite3.connect(DB_PATH, timeout=30)
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('PRAGMA synchronous=NORMAL')
        _local.c = c
    return c


def init_db():
    c = conn()
    c.executescript('''
    CREATE TABLE IF NOT EXISTS users (
        uid INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
        salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens (
        th TEXT PRIMARY KEY, uid INTEGER NOT NULL, device TEXT, created INTEGER, seen INTEGER);
    CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, id TEXT NOT NULL,
        body TEXT NOT NULL, UNIQUE(uid, id));
    CREATE TABLE IF NOT EXISTS kv (
        uid INTEGER NOT NULL, k TEXT NOT NULL, t INTEGER NOT NULL, v TEXT NOT NULL,
        seq INTEGER NOT NULL, PRIMARY KEY(uid, k));
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE INDEX IF NOT EXISTS ev_uid_seq ON events(uid, seq);
    CREATE INDEX IF NOT EXISTS kv_uid_seq ON kv(uid, seq);
    ''')
    # 账号 ID（aid）：随机生成、永远不变。设备按它认“本机记录是谁的”，改用户名不影响；
    # 不用自增的 uid，免得数据库重建后新账号撞上老编号，把一个人的记录认成另一个人的
    if 'aid' not in [r[1] for r in c.execute('PRAGMA table_info(users)')]:
        c.execute('ALTER TABLE users ADD COLUMN aid TEXT')
    for (uid,) in c.execute('SELECT uid FROM users WHERE aid IS NULL OR aid=?', ('',)).fetchall():
        c.execute('UPDATE users SET aid=? WHERE uid=?', (secrets.token_hex(12), uid))
    c.commit()


def _hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt.encode('ascii'), PBKDF2_ROUNDS).hex()


def _next_kv_seq(c):
    row = c.execute("SELECT v FROM meta WHERE k='kvseq'").fetchone()
    n = int(row[0]) + 1 if row else 1
    c.execute("INSERT OR REPLACE INTO meta(k, v) VALUES('kvseq', ?)", (str(n),))
    return n


def digest(c, uid):
    """事件总数 + 全部 id 排序后的 sha256（客户端用同样的算法比对）"""
    ids = sorted(r[0] for r in c.execute('SELECT id FROM events WHERE uid=?', (uid,)))
    return len(ids), hashlib.sha256('\n'.join(ids).encode('utf-8')).hexdigest()


# ---------------------------------------------------------------- 管理命令

def adduser(name, pw):
    init_db()
    c = conn()
    salt = secrets.token_hex(16)
    c.execute('INSERT INTO users(name, salt, hash, created, aid) VALUES(?,?,?,?,?)',
              (name, salt, _hash_pw(pw, salt), int(time.time()), secrets.token_hex(12)))
    c.commit()
    print('已创建账号', name)


def passwd(name, pw):
    init_db()
    c = conn()
    salt = secrets.token_hex(16)
    n = c.execute('UPDATE users SET salt=?, hash=? WHERE name=?', (salt, _hash_pw(pw, salt), name)).rowcount
    uid = c.execute('SELECT uid FROM users WHERE name=?', (name,)).fetchone()
    if uid:
        c.execute('DELETE FROM tokens WHERE uid=?', (uid[0],))   # 改密码后所有设备要重新登录
    c.commit()
    print('已改密码' if n else '没有这个账号', name)


def rename(old, new):
    init_db()
    c = conn()
    new = new.strip()
    if not valid_name(new):
        print('用户名 1～32 个字，只能用汉字、字母、数字、下划线、点、减号')
        return
    if c.execute('SELECT 1 FROM users WHERE name=?', (new,)).fetchone():
        print('已经有账号叫', new)
        return
    n = c.execute('UPDATE users SET name=? WHERE name=?', (new, old)).rowcount
    c.commit()
    print('已改名 %s → %s' % (old, new) if n else '没有这个账号 ' + old)


def deluser(name):
    init_db()
    c = conn()
    row = c.execute('SELECT uid FROM users WHERE name=?', (name,)).fetchone()
    if not row:
        print('没有这个账号', name)
        return
    for t in ('tokens', 'events', 'kv'):
        c.execute('DELETE FROM %s WHERE uid=?' % t, (row[0],))
    c.execute('DELETE FROM users WHERE uid=?', (row[0],))
    c.commit()
    print('已删除账号和数据', name)


def device_kind(device):
    """登录时客户端报的设备名：网页版是 web-xxxxxx，安卓 App 是 android-xxxxxx，电脑版是“电脑名-xxxxxx”"""
    d = device or ''
    return '网页' if d.startswith('web-') else '手机' if d.startswith('android-') else '电脑'


def users():
    init_db()
    c = conn()
    for uid, name, created in c.execute('SELECT uid, name, created FROM users ORDER BY uid').fetchall():
        n = c.execute('SELECT COUNT(*) FROM events WHERE uid=?', (uid,)).fetchone()[0]
        k = {'网页': 0, '手机': 0, '电脑': 0}
        for (dev,) in c.execute('SELECT device FROM tokens WHERE uid=?', (uid,)):
            k[device_kind(dev)] += 1
        print('%-16s 事件 %6d  登录中：网页 %d · 手机 %d · 电脑 %d  创建于 %s' % (
            name, n, k['网页'], k['手机'], k['电脑'], time.strftime('%Y-%m-%d', time.localtime(created))))


def devices(name):
    init_db()
    c = conn()
    row = c.execute('SELECT uid FROM users WHERE name=?', (name,)).fetchone()
    if not row:
        print('没有这个账号', name)
        return
    rows = c.execute('SELECT device, created, seen FROM tokens WHERE uid=? ORDER BY seen DESC', (row[0],)).fetchall()
    if not rows:
        print(name, '没有登录中的设备')
    fmt = lambda t: time.strftime('%Y-%m-%d %H:%M', time.localtime(t)) if t else '-'
    for dev, created, seen in rows:
        print('%s  %-40s 登录于 %s  最后使用 %s' % (device_kind(dev), dev or '(没报名字)', fmt(created), fmt(seen)))


# ---------------------------------------------------------------- 接口

_fails = {}          # ip -> [次数, 第一次失败时间]：登录失败太多就先挡一会儿


def _too_many(ip):
    n, t0 = _fails.get(ip, (0, 0))
    if time.time() - t0 > 600:
        _fails.pop(ip, None)
        return False
    return n >= 10


def _failed(ip):
    n, t0 = _fails.get(ip, (0, time.time()))
    _fails[ip] = (n + 1, t0)


def min_content():
    row = conn().execute("SELECT v FROM meta WHERE k='min_content'").fetchone()
    return int(row[0]) if row else 0


def mincontent(n):
    init_db()
    c = conn()
    c.execute("INSERT OR REPLACE INTO meta(k, v) VALUES('min_content', ?)", (str(int(n)),))
    c.commit()
    print('已设置：内容低于第 %d 版的客户端必须先更新' % int(n) if int(n) else '已关掉强制更新')


def too_old(d):
    """客户端在请求里带 cv（内容版本，旧版本不带算 0）。低于管理员设的门槛就拒绝，客户端收到 426 会马上去更新"""
    m = min_content()
    if m and int(d.get('cv') or 0) < m:
        return 426, {'error': '这个版本太旧了，需要先更新（会自动更新，也可以在设置里点「检查更新」）', 'need_update': m}
    return None


def api_login(d, ip):
    if _too_many(ip):
        return 429, {'error': '登录失败次数太多，10 分钟后再试'}
    old = too_old(d)
    if old:
        return old
    name, pw = str(d.get('user') or '').strip(), str(d.get('pass') or '')
    c = conn()
    row = c.execute('SELECT uid, salt, hash, aid FROM users WHERE name=?', (name,)).fetchone()
    if not row or not hmac.compare_digest(_hash_pw(pw, row[1]), row[2]):
        _failed(ip)
        return 401, {'error': '用户名或密码不对'}
    tok = secrets.token_urlsafe(32)
    now = int(time.time())
    with _write_lock:
        c.execute('INSERT INTO tokens(th, uid, device, created, seen) VALUES(?,?,?,?,?)',
                  (hashlib.sha256(tok.encode()).hexdigest(), row[0], str(d.get('device') or '')[:80], now, now))
        c.commit()
    return 200, {'token': tok, 'user': name, 'aid': row[3] or ''}


def auth(headers):
    h = headers.get('Authorization') or ''
    if not h.startswith('Bearer '):
        return None
    th = hashlib.sha256(h[7:].strip().encode()).hexdigest()
    c = conn()
    row = c.execute('SELECT uid FROM tokens WHERE th=?', (th,)).fetchone()
    if row:
        c.execute('UPDATE tokens SET seen=? WHERE th=?', (int(time.time()), th))
    return (row[0], th) if row else None


def _clean_event(e):
    if not isinstance(e, dict):
        return None
    i = str(e.get('id') or '')
    if not i or len(i) > 80 or not isinstance(e.get('k'), str) or not isinstance(e.get('t'), str):
        return None
    return i, json.dumps(e, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def api_sync(uid, d):
    """收客户端的新事件和改过的键值，回 游标之后 别的设备写的东西 + 两边对账用的校验值"""
    old = too_old(d)
    if old:
        return old
    c = conn()
    evs = d.get('events') or []
    kv = d.get('kv') or {}
    if len(evs) > MAX_EVENTS_PER_REQ:
        return 413, {'error': '一次传的记录太多'}
    with _write_lock:
        added = 0
        for e in evs:
            ce = _clean_event(e)
            if ce:
                added += c.execute('INSERT OR IGNORE INTO events(uid, id, body) VALUES(?,?,?)', (uid, ce[0], ce[1])).rowcount
        changed = 0
        for k, tv in kv.items():
            if not isinstance(k, str) or len(k) > 200 or not isinstance(tv, list) or len(tv) != 2:
                continue
            t, v = int(tv[0] or 0), json.dumps(tv[1], ensure_ascii=False, separators=(',', ':'), sort_keys=True)
            old = c.execute('SELECT t, v FROM kv WHERE uid=? AND k=?', (uid, k)).fetchone()
            if old and (old[0], old[1]) >= (t, v):        # 旧的更新（或一模一样）：不动
                continue
            c.execute('INSERT OR REPLACE INTO kv(uid, k, t, v, seq) VALUES(?,?,?,?,?)', (uid, k, t, v, _next_kv_seq(c)))
            changed += 1
        c.commit()
    ec, kc = int(d.get('ecursor') or 0), int(d.get('kcursor') or 0)
    rows = c.execute('SELECT seq, body FROM events WHERE uid=? AND seq>? ORDER BY seq LIMIT ?',
                     (uid, ec, MAX_EVENTS_PER_REQ)).fetchall()
    out_ev = [json.loads(b) for _, b in rows]
    new_ec = rows[-1][0] if rows else ec
    more = len(rows) == MAX_EVENTS_PER_REQ
    krows = c.execute('SELECT seq, k, t, v FROM kv WHERE uid=? AND seq>? ORDER BY seq', (uid, kc)).fetchall()
    out_kv = {k: [t, json.loads(v)] for _, k, t, v in krows}
    new_kc = krows[-1][0] if krows else kc
    n, h = digest(c, uid)
    me = c.execute('SELECT name, aid FROM users WHERE uid=?', (uid,)).fetchone() or ('', '')
    return 200, {'events': out_ev, 'ecursor': new_ec, 'more': more, 'kv': out_kv, 'kcursor': new_kc,
                 'count': n, 'hash': h, 'added': added, 'kv_changed': changed, 'server_time': int(time.time() * 1000),
                 'user': me[0], 'aid': me[1] or ''}       # 现在的用户名（管理员可能改过名）和账号 ID


def api_ids(uid, d):
    """全量核对第一步：服务器上全部事件 id"""
    c = conn()
    return 200, {'ids': [r[0] for r in c.execute('SELECT id FROM events WHERE uid=?', (uid,))]}


def api_fetch(uid, d):
    """全量核对第二步：按 id 取事件"""
    ids = [str(i) for i in (d.get('ids') or [])][:MAX_EVENTS_PER_REQ]
    c = conn()
    out = []
    for i in range(0, len(ids), 500):
        part = ids[i:i + 500]
        q = 'SELECT body FROM events WHERE uid=? AND id IN (%s)' % ','.join('?' * len(part))
        out += [json.loads(b) for (b,) in c.execute(q, [uid] + part)]
    return 200, {'events': out}


def api_logout(uid, th):
    c = conn()
    with _write_lock:
        c.execute('DELETE FROM tokens WHERE th=?', (th,))
        c.commit()
    return 200, {'ok': True}


def api_password(uid, d):
    old, new = str(d.get('old') or ''), str(d.get('new') or '')
    if len(new) < 6:
        return 400, {'error': '新密码至少 6 位'}
    c = conn()
    row = c.execute('SELECT salt, hash FROM users WHERE uid=?', (uid,)).fetchone()
    if not row or not hmac.compare_digest(_hash_pw(old, row[0]), row[1]):
        return 401, {'error': '原密码不对'}
    salt = secrets.token_hex(16)
    with _write_lock:
        c.execute('UPDATE users SET salt=?, hash=? WHERE uid=?', (salt, _hash_pw(new, salt), uid))
        c.commit()
    return 200, {'ok': True}


def valid_name(name):
    """用户名：1～32 个字，汉字、字母、数字、下划线、点、减号（不能有空格，免得登录时看不出来）"""
    return bool(re.fullmatch(r'[\w.\-]{1,32}', name or ''))


def api_rename(uid, d):
    """自己改用户名（要输当前密码）。记录按账号存，设备按账号 ID 认人，改名不影响做题记录"""
    new, pw = str(d.get('name') or '').strip(), str(d.get('pass') or '')
    if not valid_name(new):
        return 400, {'error': '用户名 1～32 个字，只能用汉字、字母、数字、下划线、点、减号'}
    c = conn()
    row = c.execute('SELECT name, salt, hash, aid FROM users WHERE uid=?', (uid,)).fetchone()
    if not row or not hmac.compare_digest(_hash_pw(pw, row[1]), row[2]):
        return 401, {'error': '密码不对'}
    if new != row[0]:
        with _write_lock:
            if c.execute('SELECT 1 FROM users WHERE name=? AND uid<>?', (new, uid)).fetchone():
                return 409, {'error': '这个用户名已经有人用了'}
            c.execute('UPDATE users SET name=? WHERE uid=?', (new, uid))
            c.commit()
    return 200, {'ok': True, 'user': new, 'aid': row[3] or ''}


class H(BaseHTTPRequestHandler):
    server_version = 'zx-sync'
    sys_version = ''

    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        # 手机 App 的页面不是同一个源，要允许跨域；带的是 Bearer 令牌，不用 cookie
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self.path.split('?')[0] == '/v1/ping':
            return self._send(200, {'ok': True, 'time': int(time.time() * 1000)})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        path = self.path.split('?')[0]
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            return self._send(413, {'error': '数据太大'})
        try:
            d = json.loads(self.rfile.read(n) or b'{}')
        except ValueError:
            return self._send(400, {'error': '格式不对'})
        ip = (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()
        try:
            if path == '/v1/login':
                return self._send(*api_login(d, ip))
            a = auth(self.headers)
            if not a:
                return self._send(401, {'error': '登录已失效，请重新登录'})
            uid, th = a
            if path == '/v1/sync':
                return self._send(*api_sync(uid, d))
            if path == '/v1/ids':
                return self._send(*api_ids(uid, d))
            if path == '/v1/fetch':
                return self._send(*api_fetch(uid, d))
            if path == '/v1/logout':
                return self._send(*api_logout(uid, th))
            if path == '/v1/password':
                return self._send(*api_password(uid, d))
            if path == '/v1/rename':
                return self._send(*api_rename(uid, d))
            self._send(404, {'error': 'not found'})
        except Exception as e:      # noqa: BLE001  出错只回这一个请求，服务不挂
            sys.stderr.write('error %s %r\n' % (path, e))
            self._send(500, {'error': '服务器出错了'})

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (time.strftime('%m-%d %H:%M:%S'), fmt % args))


def serve(port=8790, host='127.0.0.1'):
    init_db()
    s = ThreadingHTTPServer((host, port), H)
    s.daemon_threads = True
    print('同步服务 http://%s:%d  数据库 %s' % (host, port, DB_PATH), flush=True)
    s.serve_forever()


if __name__ == '__main__':
    a = sys.argv[1:] or ['serve']
    if a[0] == 'serve':
        port = int(a[a.index('--port') + 1]) if '--port' in a else 8790
        host = a[a.index('--host') + 1] if '--host' in a else '127.0.0.1'
        serve(port, host)
    elif a[0] == 'adduser' and len(a) == 3:
        adduser(a[1], a[2])
    elif a[0] == 'passwd' and len(a) == 3:
        passwd(a[1], a[2])
    elif a[0] == 'rename' and len(a) == 3:
        rename(a[1], a[2])
    elif a[0] == 'deluser' and len(a) == 2:
        deluser(a[1])
    elif a[0] == 'mincontent' and len(a) == 2:
        mincontent(a[1])
    elif a[0] == 'devices' and len(a) == 2:
        devices(a[1])
    elif a[0] == 'users':
        users()
    else:
        print(__doc__)
