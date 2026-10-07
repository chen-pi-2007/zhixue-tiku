# -*- coding: utf-8 -*-
"""HTTP 层测试：同一条 keep-alive 连接上连续发请求"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db       # noqa: E402
import server   # noqa: E402


class KeepAliveTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        db.DATA_DIR = self.dir
        db.BANK_PATH = os.path.join(self.dir, 'bank.json')
        db.PROGRESS_PATH = os.path.join(self.dir, 'progress.json')
        db.MEDIA_DIR = os.path.join(self.dir, 'media')
        db._bank = db._prog = None
        db.init()
        self.srv = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.conn = http.client.HTTPConnection('127.0.0.1', self.srv.server_address[1], timeout=5)

    def tearDown(self):
        self.conn.close()
        self.srv.shutdown()
        self.srv.server_close()
        db._bank = db._prog = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def req(self, method, path, body=None):
        self.conn.request(method, path, body=body, headers={'Content-Type': 'application/json'} if body else {})
        r = self.conn.getresponse()
        return r.status, json.loads(r.read().decode('utf-8'))

    def test_unread_body_does_not_break_next_request(self):
        # 不存在的接口不会读正文；以前剩下的 "{}" 会粘到下一个请求开头，把 POST 读成 "{}POST" 报 501
        self.assertEqual(self.req('POST', '/api/nope', b'{"a": 1}')[0], 404)
        status, data = self.req('POST', '/api/settings', b'{"new_per_day": 15}')
        self.assertEqual((status, data['ok']), (200, True))
        status, data = self.req('GET', '/api/dashboard')
        self.assertEqual((status, data['data']['settings']['new_per_day']), (200, 15))

    def test_every_route_leaves_connection_clean(self):
        """每个接口都用 GET、带正文的 POST、DELETE 各打一次，后面紧跟一个正常请求：
        不管接口读不读正文、成功还是报错，都不能让下一个请求坏掉，也不能报 500/501"""
        routes = ['/api/app', '/api/dashboard', '/api/data/clear', '/api/exam/start', '/api/exam/submit',
                  '/api/exams', '/api/exams/1', '/api/llm_status', '/api/papers', '/api/papers/999',
                  '/api/practice', '/api/questions', '/api/record', '/api/review', '/api/settings',
                  '/api/stats', '/api/update/download', '/api/update/install', '/api/update/progress',
                  '/api/upload?name=x.txt', '/api/wrong', '/api/wrong/mark', '/api/skills', '/api/skills/nope',
                  '/api/skills/nope/word/check', '/api/nope', '/nope.html', '/media/../server.py']
        bodies = [None, b'{"x": 1}', b'not json', b'[]']
        for path in routes:
            for method, body in [('GET', None)] + [('POST', b) for b in bodies] + [('DELETE', b'{}')]:
                self.conn.request(method, path, body=body)
                r = self.conn.getresponse()
                r.read()
                self.assertLess(r.status, 500, '%s %s %r -> %d' % (method, path, body, r.status))
                status, data = self.req('GET', '/api/app')       # 同一条连接上的下一个请求
                self.assertEqual((status, data['ok']), (200, True), 'after %s %s %r' % (method, path, body))

    def test_bad_params_return_400_and_keep_connection(self):
        self.assertEqual(self.req('POST', '/api/record', b'{"question_id": 999999}')[0], 400)
        self.assertEqual(self.req('GET', '/api/practice?paper_id=abc')[0], 400)
        self.assertEqual(self.req('GET', '/api/papers')[0], 200)

    def test_static_revalidates_so_hot_update_shows_at_once(self):
        # 图片和界面文件每次都要确认有没有变：没变回 304，换了就拿到新的（以前图片缓存一天，热更新后看到的还是旧图）
        os.makedirs(db.MEDIA_DIR, exist_ok=True)
        img = os.path.join(db.MEDIA_DIR, 'a.png')
        with open(img, 'wb') as f:
            f.write(b'old')
        self.conn.request('GET', '/media/a.png')
        r = self.conn.getresponse()
        self.assertEqual((r.status, r.read(), r.getheader('Cache-Control')), (200, b'old', 'no-cache'))
        etag = r.getheader('ETag')
        self.conn.request('GET', '/media/a.png', headers={'If-None-Match': etag})
        r = self.conn.getresponse()
        self.assertEqual((r.status, r.read()), (304, b''))
        with open(img, 'wb') as f:
            f.write(b'new image')
        self.conn.request('GET', '/media/a.png', headers={'If-None-Match': etag})
        r = self.conn.getresponse()
        self.assertEqual((r.status, r.read()), (200, b'new image'))
        self.assertEqual(self.req('GET', '/api/app')[0], 200)   # 304 之后连接照常能用


if __name__ == '__main__':
    unittest.main()
