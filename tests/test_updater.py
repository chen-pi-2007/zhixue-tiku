# -*- coding: utf-8 -*-
"""程序更新：GitHub 连不上时改读 release.json、换下载线路、核对 SHA-256"""
import hashlib
import http.server
import io
import json
import os
import sys
import threading
import time
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import updater  # noqa: E402

PAYLOAD = b'new-exe-content' * 5000


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        data = PAYLOAD
        rng = self.headers.get('Range')
        if rng:
            start = int(rng.split('=')[1].split('-')[0])
            self.send_response(206)
            data = data[start:]
        else:
            self.send_response(200)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class _Resp(io.BytesIO):
    status = 200
    headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def release_json(sha):
    return {'version': '9.9.9', 'notes': '测试', 'page': 'p',
            'assets': {'exe': {'name': 'zhixue-tiku.exe', 'size': len(PAYLOAD), 'sha256': sha,
                               'url': 'https://github.com/x/y/releases/download/v9.9.9/zhixue-tiku.exe'}}}


class UpdaterFallbackTest(unittest.TestCase):
    def fake_open(self, sha):
        def _open(url, timeout, headers=None, tries=4):
            if 'api.github.com' in url:
                raise urllib.error.URLError('GitHub 连不上')
            if url.endswith('release.json'):
                if 'raw.githubusercontent.com' in url:
                    raise urllib.error.URLError('GitHub 连不上')
                return _Resp(json.dumps(release_json(sha)).encode('utf-8'))
            raise AssertionError(url)
        return _open

    def test_check_falls_back_to_release_json(self):
        with mock.patch.object(updater, '_open', self.fake_open('abc')):
            info = updater.check()
        self.assertEqual(info['latest'], '9.9.9')
        self.assertTrue(info['has_update'])
        self.assertEqual(info['sha256'], 'abc')
        self.assertEqual(info['urls'][0], info['url'])
        self.assertTrue(info['urls'][1].startswith('https://ghproxy.net/https://github.com/'))

    def run_download(self, sha):
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), _Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        good = 'http://127.0.0.1:%d/zhixue-tiku.exe' % srv.server_port
        info = {'current': '0.0.1', 'latest': '9.9.9', 'has_update': True, 'notes': '', 'page': '',
                'url': 'http://127.0.0.1:1/bad', 'urls': ['http://127.0.0.1:1/bad', good],     # 第一条线路不通
                'size': len(PAYLOAD), 'sha256': sha}
        updater._state.update(state='idle')
        with mock.patch.object(updater, 'check', return_value=info), mock.patch.object(updater.time, 'sleep'):
            updater._download()
        srv.shutdown()
        return updater.progress()

    def test_download_switches_route_and_verifies_sha(self):
        st = self.run_download(hashlib.sha256(PAYLOAD).hexdigest())
        self.assertEqual(st['state'], 'done', st)
        with open(updater._file, 'rb') as f:
            self.assertEqual(f.read(), PAYLOAD)

    def test_download_rejects_wrong_sha(self):
        st = self.run_download('0' * 64)
        self.assertEqual(st['state'], 'error')
        self.assertIn('校验不通过', st['error'])


if __name__ == '__main__':
    unittest.main()
