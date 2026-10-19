# -*- coding: utf-8 -*-
"""1.7.0 起程序自带的内容接在 exe 末尾（build_exe.append_content），第一次运行解压一次（appdir._unpack_bundled）"""
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import appdir   # noqa: E402
import content  # noqa: E402


def fake_exe(path, version, extra=b''):
    """一个“exe”：前面随便一段字节（代表 PyInstaller 的部分），后面接内容 zip"""
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(content.CONTENT_FILE, json.dumps({'content_version': version, 'files': {}}))
        z.writestr('static/index.html', '<html>%d</html>' % version)
        z.writestr('data/bank.json', '{}')
    with open(path, 'wb') as f:
        f.write(b'MZ' + b'\0' * 5000 + extra)
        f.write(b.getvalue())


class UnpackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = (sys.executable, appdir.CONTENT_DIR)
        appdir.CONTENT_DIR = os.path.join(self.tmp, 'content')
        sys.executable = os.path.join(self.tmp, 'zx.exe')

    def tearDown(self):
        sys.executable, appdir.CONTENT_DIR = self.old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_unpack_once_and_switch_version(self):
        fake_exe(sys.executable, 71)
        d1 = appdir._unpack_bundled()
        self.assertTrue(d1.startswith(os.path.join(appdir.CONTENT_DIR, 'bundled', '71-')))
        with open(os.path.join(d1, 'static', 'index.html'), encoding='utf-8') as f:
            self.assertEqual(f.read(), '<html>71</html>')
        stamp = os.path.getmtime(os.path.join(d1, '.ok'))
        self.assertEqual(appdir._unpack_bundled(), d1)            # 第二次启动：不再解压
        self.assertEqual(os.path.getmtime(os.path.join(d1, '.ok')), stamp)
        fake_exe(sys.executable, 72)                              # 换了新版 exe：解压新的，旧的删掉
        d2 = appdir._unpack_bundled()
        self.assertNotEqual(d1, d2)
        self.assertFalse(os.path.exists(d1))
        with open(os.path.join(d2, 'static', 'index.html'), encoding='utf-8') as f:
            self.assertEqual(f.read(), '<html>72</html>')

    def test_half_unpacked_is_redone(self):
        fake_exe(sys.executable, 71)
        d = appdir._unpack_bundled()
        os.remove(os.path.join(d, '.ok'))                         # 上次解压到一半被打断
        os.remove(os.path.join(d, 'static', 'index.html'))
        self.assertEqual(appdir._unpack_bundled(), d)
        self.assertTrue(os.path.exists(os.path.join(d, 'static', 'index.html')))

    def test_old_style_exe_falls_back(self):
        with open(sys.executable, 'wb') as f:                     # 末尾没有 zip（老的打包方式）
            f.write(b'MZ' + b'\0' * 100)
        self.assertEqual(appdir._unpack_bundled(), os.path.join(appdir.RES_DIR, 'content'))


if __name__ == '__main__':
    unittest.main()
