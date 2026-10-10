# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""账号同步（内测）客户端：后台线程把本机进度和服务器对齐。合并规则见 db.py「账号同步」一节。

- 本地优先：做题只写本机，同步失败只在设置页显示，不影响任何功能；断网照常用，联网后自动补传。
- 触发：启动后、每答完题 10 秒后、每 5 分钟、手动「立即同步」。失败按 30 秒、1 分、2 分……最多 15 分钟重试。
- 每次同步后比对两边的事件总数和校验值，对不上就全量核对（取服务器全部 id，缺的互相补）。
- 服务器地址不写在源码里：打包时由不进仓库的 zx_endpoint.py 提供（混淆过），开发时可在 config.json 里写 sync_url。
- 登录令牌存在数据目录的 sync_account.json（不放进 progress.json，备份、分享进度文件时不会带出去）。
"""
import json
import os
import platform
import socket
import threading
import time
import urllib.error
import urllib.request

import appdir
import db

ACCOUNT_PATH = os.path.join(appdir.DATA_DIR, 'sync_account.json')
PERIOD = 300            # 秒：定时同步
AFTER_CHANGE = 10       # 秒：做题后多久同步
TIMEOUT = 20

_lock = threading.Lock()          # 同一时间只跑一个同步
_kick = threading.Event()
_state = {'running': False, 'last_ok': '', 'last_err': '', 'last_got': 0, 'fails': 0, 'next': 0.0}
_thread = None


# ---------------------------------------------------------------- 地址和账号

def endpoint():
    try:
        with open(appdir.CONFIG_PATH, encoding='utf-8') as f:
            u = (json.load(f) or {}).get('sync_url')
            if u:
                return u.rstrip('/')
    except (OSError, ValueError, AttributeError):
        pass
    try:
        import zx_endpoint
        return zx_endpoint.url().rstrip('/')
    except Exception:       # noqa: BLE001  没有打包地址：这一版不带同步
        return ''


def account():
    try:
        with open(ACCOUNT_PATH, encoding='utf-8') as f:
            a = json.load(f)
        return a if a.get('token') else None
    except (OSError, ValueError):
        return None


def _save_account(a):
    tmp = ACCOUNT_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(a, f, ensure_ascii=False)
    os.replace(tmp, ACCOUNT_PATH)


def _drop_account():
    try:
        os.remove(ACCOUNT_PATH)
    except OSError:
        pass


# ---------------------------------------------------------------- 网络

class SyncError(Exception):
    def __init__(self, msg, code=0):
        Exception.__init__(self, msg)
        self.code = code


def _openers():
    # 先按系统代理走，不通再直连（有的同学开着代理软件，有的没开）
    return [urllib.request.build_opener(), urllib.request.build_opener(urllib.request.ProxyHandler({}))]


def _post(path, body, token=None):
    url = endpoint()
    if not url:
        raise SyncError('这个版本没有配置同步服务器')
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    headers = {'Content-Type': 'application/json', 'User-Agent': 'zhixue-tiku'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    last = None
    for op in _openers():
        req = urllib.request.Request(url + path, data=data, headers=headers, method='POST')
        try:
            with op.open(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode('utf-8')).get('error') or ''
            except Exception:       # noqa: BLE001
                msg = ''
            if not msg and (e.code >= 500 or e.code == 407):
                last = '服务器返回 %d' % e.code      # 多半是代理软件回的，换直连再试
                continue
            raise SyncError(msg or '服务器返回 %d' % e.code, e.code)
        except (urllib.error.URLError, socket.timeout, OSError, ValueError) as e:
            last = e
    raise SyncError('连不上同步服务器（%s）' % (getattr(last, 'reason', None) or last))


# ---------------------------------------------------------------- 登录 / 退出

def login(user, pw):
    user = (user or '').strip()
    if not user or not pw:
        raise SyncError('请输入用户名和密码')
    dev = '%s-%s' % (platform.node()[:30], os.urandom(3).hex())
    r = _post('/v1/login', {'user': user, 'pass': pw, 'device': dev})
    _save_account({'user': r.get('user') or user, 'token': r['token'], 'device': dev})
    db.sync_start_account()      # 本机已有的记录全部（再）传一遍，服务器按 id 去重
    kick(0)
    return status()


def logout():
    a = account()
    if a:
        try:
            _post('/v1/logout', {}, a['token'])
        except SyncError:
            pass                 # 断网也能退出：令牌在服务器上留着无害，改密码时会清掉
    _drop_account()
    db.sync_stop_account()
    _state.update({'last_ok': '', 'last_err': '', 'fails': 0})
    return status()


def change_password(old, new):
    a = account()
    if not a:
        raise SyncError('还没登录')
    _post('/v1/password', {'old': old, 'new': new}, a['token'])
    return {'ok': True}


def _on_cleared():
    _drop_account()


db.on_progress_cleared.append(_on_cleared)


# ---------------------------------------------------------------- 同步

def sync_once():
    """跑一轮同步：推本机新的、拉别处新的，直到两边一致。出错抛 SyncError（调用方记状态）"""
    a = account()
    if not a:
        return {'skipped': True}
    with _lock:
        _state['running'] = True
        try:
            got = 0
            reconciled = False
            for _ in range(50):
                out = db.sync_outbox()
                try:
                    resp = _post('/v1/sync', out, a['token'])
                except SyncError as e:
                    if e.code == 401:
                        _drop_account()
                        db.sync_stop_account()
                        raise SyncError('登录已失效，请重新登录')
                    raise
                r = db.sync_apply(out, resp)
                got += r['got'] + r['kv']
                if r['more'] or db.sync_pending():
                    continue
                if r['match'] or reconciled:
                    break
                # 两边对不上（中途断过、或者本机的数据是从别处拷来的）：全量核对一次
                reconciled = True
                ids = _post('/v1/ids', {}, a['token']).get('ids') or []
                missing = db.sync_reconcile(ids)
                for i in range(0, len(missing), 2000):
                    evs = _post('/v1/fetch', {'ids': missing[i:i + 2000]}, a['token']).get('events') or []
                    got += db.sync_merge_fetched(evs)
            _state.update({'last_ok': db.now(), 'last_err': '', 'last_got': got, 'fails': 0})
            return {'got': got}
        finally:
            _state['running'] = False


def _loop():
    while True:
        wait = max(0.0, _state['next'] - time.time())
        _kick.wait(wait if wait > 0 else PERIOD)
        if _kick.is_set():
            _kick.clear()
            if _state['next'] > time.time() and _state['fails']:
                continue                   # 正在退避，等到点再说
        if not account() or not endpoint():
            _state['next'] = time.time() + PERIOD
            continue
        try:
            sync_once()
            _state['next'] = time.time() + PERIOD
        except Exception as e:      # noqa: BLE001  任何错误都只记下来，不影响做题
            _state['fails'] += 1
            _state['last_err'] = str(e) or e.__class__.__name__
            _state['next'] = time.time() + min(900, 30 * 2 ** (_state['fails'] - 1))


def kick(delay=AFTER_CHANGE):
    """做完题调一下：delay 秒后同步（多次调用合并成一次）"""
    if not account():
        return
    start()
    t = time.time() + delay
    if not _state['fails'] and (_state['next'] <= time.time() or t < _state['next']):
        _state['next'] = t
    _kick.set()


def start():
    global _thread
    if _thread is None and endpoint():
        _thread = threading.Thread(target=_loop, name='sync', daemon=True)
        _state['next'] = time.time() + 3
        _thread.start()


def sync_now():
    """设置页「立即同步」：同步跑完再返回结果"""
    _state['fails'] = 0
    try:
        r = sync_once()
        _state['next'] = time.time() + PERIOD
        return dict(status(), result=r)
    except SyncError as e:
        _state['last_err'] = str(e)
        raise


def status():
    a = account()
    return {'available': bool(endpoint()), 'user': a['user'] if a else '', 'running': _state['running'],
            'last_ok': _state['last_ok'], 'last_err': _state['last_err'], 'last_got': _state['last_got'],
            'pending': db.sync_pending() if a else 0}
