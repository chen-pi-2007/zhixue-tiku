# -*- coding: utf-8 -*-
"""智学题库 本地服务(纯标准库,Python 3.6+ 可运行)
启动:  python server.py   然后浏览器打开 http://127.0.0.1:8788
"""
import json
import os
import re
import socketserver
import sys
import threading
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, unquote

import db
import docparse
from skills import service as skill_service

_skills = None


def skills_service():
    global _skills
    if _skills is None:
        _skills = skill_service.Skills(db.DATA_DIR, db)
    return _skills

import appdir
MAX_UPLOAD = 30 * 1024 * 1024
SHOW_WINDOW = None          # 独立窗口模式下由 tray.py 设成“把窗口调出来”的函数

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
}


def load_server_config():
    path = appdir.CONFIG_PATH
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except (ValueError, OSError):
            pass
    return {}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'QuizServer/1.0'

    # ---- 基础工具
    def log_message(self, fmt, *args):
        try:
            sys.stdout.write('%s - %s\n' % (self.address_string(), fmt % args))
        except Exception:
            pass

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, msg, status=400):
        self.send_json({'ok': False, 'error': msg}, status)

    def read_body(self):
        if getattr(self, '_body', None) is not None:      # 已经读过（或已丢弃）
            return self._body
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0:
            self._body = b''
            return self._body
        if length > MAX_UPLOAD:
            self.close_connection = True                   # 正文没读，这条连接不能再用
            raise ValueError('文件过大(超过30MB)')
        self._body = self.rfile.read(length)
        return self._body

    def read_json_body(self):
        raw = self.read_body()
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode('utf-8'))
        except ValueError:
            raise ValueError('请求内容格式不对')
        if not isinstance(data, dict):            # 接口都按对象取字段，数组之类当成格式不对
            raise ValueError('请求内容格式不对')
        return data

    # ---- 路由
    def do_GET(self):
        self._run('GET')

    def do_POST(self):
        self._run('POST')

    def do_DELETE(self):
        self._run('DELETE')

    def _run(self, method):
        self._body = None
        try:
            self.route(method)
        except (ValueError, KeyError, TypeError) as e:     # 参数格式不对、题目或卷子不存在
            msg = e.args[0] if e.args and isinstance(e.args[0], str) else ''
            if not msg or isinstance(e, TypeError) or msg.isascii():
                traceback.print_exc()                       # 不是我们自己抛的提示，留个记录方便查
                msg = '参数不对'
            self.send_error_json(msg, 400)
        except Exception:
            traceback.print_exc()
            self.send_error_json('服务器内部错误', 500)
        finally:
            # 没用到的请求正文也要读掉：浏览器会在同一条连接上发下一个请求，
            # 剩下的字节会粘到下一个请求开头（曾经因此把 POST 读成 "{}POST" 报 501）
            if self._body is None and not self.close_connection:
                try:
                    self.read_body()
                except Exception:
                    self.close_connection = True

    def route(self, method):
        u = urlparse(self.path)
        path = unquote(u.path)
        qs = parse_qs(u.query)

        if path.startswith('/api/'):
            return self.api(method, path, qs)

        if method == 'GET':
            return self.static(path)
        self.send_error_json('不支持的请求', 405)

    # ---- 静态文件(/media/ 为题目图片)
    def static(self, path):
        if path == '/' or not path:
            path = '/index.html'
        root = appdir.static_dir()               # 热更新后会换成新内容里的界面
        if path.startswith('/media/skill/'):              # 技能题：素材、参考答案、PDF、插图
            root, path = os.path.join(db.DATA_DIR, 'skills'), path[len('/media/skill'):]
        elif path.startswith('/media/'):
            root, path = db.MEDIA_DIR, path[len('/media'):]
        elif path.startswith('/work/'):                   # 练习文件夹里的网页（浏览器预览）
            root, path = os.path.join(db.DATA_DIR, 'skill_work'), path[len('/work'):]
        # 防目录穿越
        fp = os.path.normpath(os.path.join(root, path.lstrip('/')))
        if not fp.startswith(root + os.sep) or not os.path.isfile(fp):
            return self.send_error_json('文件不存在', 404)
        ext = os.path.splitext(fp)[1].lower()
        # 浏览器每次都来问一下（no-cache），文件没变就回 304 不重传；热更新换了图片或界面马上就能看到
        st = os.stat(fp)
        etag = '"%x-%x"' % (st.st_mtime_ns, st.st_size)
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        with open(fp, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', MIME.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('ETag', etag)
        self.send_header('Cache-Control', 'no-cache')
        if ext == '.pdf':
            self.send_header('Content-Disposition', 'inline')
        self.end_headers()
        self.wfile.write(body)

    # ---- API
    def api(self, method, path, qs):
        m = None

        # 上传解析(原始文件体,文件名放 query)
        if method == 'POST' and path == '/api/upload':
            return self.api_upload(qs)

        if path.startswith('/api/skills'):
            return self.api_skills(method, path)

        if method == 'GET' and path == '/api/papers':
            return self.send_json({'ok': True, 'papers': db.list_papers()})

        m = re.match(r'^/api/papers/(\d+)$', path)
        if m and method == 'DELETE':
            db.delete_paper(int(m.group(1)))
            return self.send_json({'ok': True})

        def arg(name, default=''):
            return qs.get(name, [default])[0] or default

        def iarg(name, default=0):
            return int(arg(name, str(default)) or default)

        if method == 'GET' and path == '/api/questions':
            items, total = db.get_questions(iarg('paper_id') or None, arg('type') or None,
                                            arg('q') or None, min(iarg('limit', 50), 200),
                                            iarg('offset'), arg('subject') or None)
            return self.send_json({'ok': True, 'items': items, 'total': total})

        if method == 'GET' and path == '/api/practice':
            items = db.practice_set(iarg('paper_id') or None, arg('scope', 'all'),
                                    shuffle=arg('order', 'random') == 'random',
                                    subject=arg('subject') or None, qtype=arg('type') or None)
            return self.send_json({'ok': True, 'items': items})

        if method == 'GET' and path == '/api/review':
            new = arg('new')
            return self.send_json(dict(ok=True, **db.review_queue(arg('subject') or None,
                                                                  int(new) if new else None)))

        if method == 'GET' and path == '/api/dashboard':
            return self.send_json({'ok': True, 'data': db.dashboard()})

        if method == 'POST' and path == '/api/settings':
            data = self.read_json_body()
            if 'new_per_day' in data:
                db.set_setting('new_per_day', max(0, min(200, int(data['new_per_day']))))
            if re.match(r'^\d{4}-\d{2}-\d{2}$', str(data.get('exam_date', ''))):
                db.set_setting('exam_date', data['exam_date'])
            if isinstance(data.get('hidden_subjects'), list):     # 不学的科目
                db.set_setting('hidden_subjects', sorted({str(s) for s in data['hidden_subjects']
                                                          if re.match(r'^[\w:-]{1,40}$', str(s))}))
            return self.send_json({'ok': True})

        if method == 'GET' and path == '/api/wrong':
            return self.send_json({'ok': True, 'items': db.wrong_list(iarg('mastered'),
                                                                      arg('subject') or None)})

        if method == 'POST' and path == '/api/record':
            data = self.read_json_body()
            qid = int(data.get('question_id') or 0)
            if not qid:
                return self.send_error_json('缺少 question_id')
            card, event = db.record_answer(qid, bool(data.get('correct')), data.get('mode') or 'practice')
            return self.send_json({'ok': True, 'record': card, 'event': event})

        if method == 'POST' and path == '/api/exam/start':
            data = self.read_json_body()
            try:
                e = db.exam_start(data.get('subject') or '', data.get('preset') or 'standard')
            except ValueError as ex:
                return self.send_error_json(str(ex))
            return self.send_json({'ok': True, 'exam': e})

        if method == 'POST' and path == '/api/exam/submit':
            data = self.read_json_body()
            try:
                e = db.exam_submit(int(data.get('id') or 0), data.get('answers') or {},
                                   data.get('used_seconds') or 0)
            except KeyError as ex:
                return self.send_error_json(str(ex.args[0]), 404)
            return self.send_json({'ok': True, 'exam': e})

        if method == 'GET' and path == '/api/exams':
            return self.send_json({'ok': True, 'items': db.exam_list()})

        m = re.match(r'^/api/exams/(\d+)$', path)
        if m and method == 'GET':
            try:
                return self.send_json({'ok': True, 'exam': db.exam_get(int(m.group(1)))})
            except KeyError as ex:
                return self.send_error_json(str(ex.args[0]), 404)

        if method == 'POST' and path == '/api/wrong/mark':
            data = self.read_json_body()
            qid = int(data.get('question_id') or 0)
            if not qid:
                return self.send_error_json('缺少 question_id')
            db.mark_mastered(qid, bool(data.get('mastered', True)))
            return self.send_json({'ok': True})

        if method == 'GET' and path == '/api/app':
            import version
            return self.send_json({'ok': True, 'version': version.APP_VERSION, 'content_version': appdir.content_version(),
                                   'frozen': bool(getattr(sys, 'frozen', False)), 'data_dir': db.DATA_DIR,
                                   'window': SHOW_WINDOW is not None, 'open_data': sys.platform == 'win32',
                                   'repo': 'https://github.com/%s' % version.REPO})

        # 设置页点「我的数据」：在资源管理器里打开数据文件夹
        if method == 'POST' and path == '/api/open-data':
            if sys.platform != 'win32':
                return self.send_error_json('只能在 Windows 上打开文件夹')
            os.startfile(db.DATA_DIR)
            return self.send_json({'ok': True})

        # 已经开着时又双击了 exe：新启动的那个调这个接口，让这边把窗口调到前面，然后自己退出
        if method == 'POST' and path == '/api/window/show':
            if SHOW_WINDOW is None:
                return self.send_error_json('没有窗口', 404)
            SHOW_WINDOW()
            return self.send_json({'ok': True})

        if method == 'GET' and path == '/api/update/check':
            import updater
            try:
                return self.send_json(dict(ok=True, **updater.check()))
            except ValueError as e:
                return self.send_error_json(str(e))

        # 更新分三步，界面轮询 progress 显示进度条
        if method == 'POST' and path == '/api/update/download':
            import updater
            return self.send_json(dict(ok=True, **updater.start_download()))

        # 热更新（界面 + 题库）：检查、开始下载、查进度
        if method == 'GET' and path == '/api/content/check':
            import hotupdate
            return self.send_json(dict(ok=True, **hotupdate.check()))

        if method == 'POST' and path == '/api/content/update':
            import hotupdate
            return self.send_json(dict(ok=True, **hotupdate.start()))

        if method == 'GET' and path == '/api/content/progress':
            import hotupdate
            return self.send_json(dict(ok=True, **hotupdate.progress()))

        if method == 'GET' and path == '/api/update/progress':
            import updater
            return self.send_json(dict(ok=True, **updater.progress()))

        if method == 'POST' and path == '/api/update/install':
            import updater
            return self.send_json(dict(ok=True, **updater.install(on_exit=lambda: os._exit(0))))

        if method == 'POST' and path == '/api/data/clear':
            data = self.read_json_body()
            if data.get('confirm') != '清除':
                return self.send_error_json('需要确认')
            return self.send_json({'ok': True, 'backup': db.clear_progress()})

        if method == 'GET' and path == '/api/stats':
            return self.send_json({'ok': True, 'stats': db.stats()})

        if method == 'GET' and path == '/api/export/wrong':
            return self.export_wrong()

        if method == 'GET' and path == '/api/llm_status':
            import llm
            return self.send_json({'ok': True, 'available': llm.available()})

        self.send_error_json('接口不存在', 404)

    def api_skills(self, method, path):
        """技能实操。/api/skills、/api/skills/<卷>、/api/skills/<卷>/<模块>/<动作>"""
        sk = skills_service()
        try:
            if method == 'GET' and path == '/api/skills':
                return self.send_json({'ok': True, 'items': sk.summary(),
                                       'can_open': {e: skill_service.can_open(e) for e in ('.docx', '.xlsx', '.pptx')},
                                       'dreamweaver': bool(skill_service.find_dreamweaver())})
            m = re.match(r'^/api/skills/([\w-]+)$', path)
            if m and method == 'GET':
                return self.send_json({'ok': True, 'skill': sk.detail(m.group(1)),
                                       'can_open': {e: skill_service.can_open(e) for e in ('.docx', '.xlsx', '.pptx')},
                                       'dreamweaver': bool(skill_service.find_dreamweaver())})
            m = re.match(r'^/api/skills/([\w-]+)/(\w+)/(\w+)$', path)
            if not m or method != 'POST':
                return self.send_error_json('接口不存在', 404)
            key, mod, action = m.groups()
            data = self.read_json_body()
            if action == 'start':
                f = sk.start(key, mod, reset=bool(data.get('reset', True)))
                opened = sk.open(key, mod, 'work') if data.get('open', True) else None
                return self.send_json({'ok': True, 'file': f, 'opened': opened})
            if action == 'open':
                return self.send_json({'ok': True, 'opened': sk.open(key, mod, data.get('what', 'work'))})
            if action == 'check':
                if mod == 'program':
                    r = sk.check_program(key, data.get('answers') or [])
                elif mod == 'typing':
                    r = sk.typing(key, data.get('typed') or '', float(data.get('seconds') or 0))
                elif mod == 'netcfg':
                    r = sk.check_net(key, data.get('configs') or {}, data.get('manual') or {})
                elif data.get('checked') is not None:
                    r = sk.card(key, mod, data.get('checked') or {})
                else:
                    r = sk.check(key, mod)
                return self.send_json({'ok': True, 'result': r})
            return self.send_error_json('接口不存在', 404)
        except (ValueError, KeyError) as e:
            return self.send_error_json(str(e.args[0]) if e.args else str(e))

    def api_upload(self, qs):
        import llm
        filename = unquote(qs.get('name', [''])[0] or '未命名.docx')
        engine = qs.get('engine', ['auto'])[0]
        subject = qs.get('subject', ['general'])[0] or 'general'
        data = self.read_body()
        if not data:
            return self.send_error_json('上传内容为空')

        parsed = None
        rule_failed = False
        err = None
        if engine in ('auto', 'rules'):
            try:
                parsed = docparse.parse_bytes(data, filename)
                if not parsed['questions']:
                    rule_failed = True
            except Exception as e:
                err = e
                rule_failed = True
        if (engine == 'llm' or (rule_failed and engine == 'auto')) and llm.available():
            text = ''
            try:
                paras = docparse.extract_any(data, filename)
                text = '\n'.join(paras)
            except Exception as e:
                text = data.decode('utf-8', 'replace')
            parsed = llm.llm_parse(text)
            parsed['engine'] = 'llm'
        elif rule_failed:
            if err:
                raise err
            return self.send_error_json(
                '规则解析未识别出题目' + ('(可在 config.json 配置大模型Key后用 AI 解析)' if not llm.available() else ''))

        qs_count = len(parsed['questions'])
        if not qs_count:
            return self.send_error_json('未识别出任何题目,请确认文档格式')

        pid, name = db.add_upload(filename, parsed, subject)
        no_ans = sum(1 for q in parsed['questions'] if not q['answer'])
        return self.send_json({
            'ok': True,
            'paper': {'id': pid, 'name': name, 'total': qs_count},
            'by_type': parsed['by_type'],
            'no_answer': no_ans,
            'engine': parsed.get('engine', 'rules'),
        })

    def export_wrong(self):
        items = db.wrong_list(0)
        lines = ['===== 错题本导出 %s =====' % db.now(), '']
        for it in items:
            tname = {'single': '单选', 'multi': '多选', 'judge': '判断', 'qa': '问答',
                     'reading': '阅读', 'poem': '古诗文', 'dictation': '默写',
                     'essay': '作文'}.get(it['type'], it['type'])
            lines.append('【%s】%s 第%d题 (做错%d次)' % (
                tname, it['paper_name'], it['qno'], it['wrong_count']))
            lines.append(it['stem'])
            for k, v in it['options']:
                lines.append('%s. %s' % (k, v))
            if it['type'] == 'judge':
                lines.append('对 / 错')
            lines.append('正确答案: %s' % it['answer'])
            if it.get('analysis'):
                lines.append('解析: %s' % it['analysis'])
            lines.append('')
        body = ('\n'.join(lines)).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Disposition',
                         'attachment; filename="wrong_questions.txt"')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        # 浏览器会预开连接、用不上就直接断开,这不是错误,不打印
        if isinstance(sys.exc_info()[1], (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def configured_url():
    cfg = load_server_config()
    return 'http://%s:%d/' % (cfg.get('host', '127.0.0.1'), int(cfg.get('port', 8788)))


def make_server():
    """返回 (server, url)。端口被占用时改用下一个端口。"""
    db.init()
    cfg = load_server_config()
    port = int(cfg.get('port', 8788))
    host = cfg.get('host', '127.0.0.1')
    try:
        srv = ThreadingHTTPServer((host, port), Handler)
    except OSError:
        port += 1
        srv = ThreadingHTTPServer((host, port), Handler)
    return srv, 'http://%s:%d/' % (host, port)


def main():
    srv, url = make_server()
    print('=' * 46)
    print('  ZhiXue Quiz Bank running -> %s' % url)
    print('  press Ctrl+C to stop')
    print('=' * 46)
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')


if __name__ == '__main__':
    main()
