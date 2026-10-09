# -*- coding: utf-8 -*-
"""后端代码热更新（hotpy.py）：能加载新代码、接口版本对不上不加载、文件被改过不加载、出错能退回自带的"""
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import appdir      # noqa: E402
import content     # noqa: E402
import hotpy       # noqa: E402
from version import SHELL_API   # noqa: E402

# 测试用的假后端模块：真正的 server / db 已经被别的测试 import 过了，换个名字测加载机制
HOT = ('server', 'db', 'zxprobe')


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


class HotPyTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.saved = {k: getattr(appdir, k) for k in ('FROZEN', 'BUNDLED_DIR', 'CONTENT_DIR')}
        appdir.FROZEN = True
        appdir.BUNDLED_DIR = os.path.join(self.dir, 'bundled')
        appdir.CONTENT_DIR = os.path.join(self.dir, 'content')
        self.cur = os.path.join(appdir.CONTENT_DIR, 'current')
        write(os.path.join(self.cur, 'server.py'), '# server')
        write(os.path.join(self.cur, 'db.py'), '# db')
        write(os.path.join(self.cur, 'zxprobe.py'), 'VALUE = "hot"\n')
        write(os.path.join(self.cur, 'static', 'app.js'), 'ui')
        self.patches = [mock.patch.object(content, 'HOT_PY', HOT),
                        mock.patch.object(content, 'INCLUDE', ('static/', 'server.py', 'db.py', 'zxprobe.py'))]
        for p in self.patches:
            p.start()
        self.manifest = content.build_manifest(self.cur, 30, '1.0.0', '1.0.0')
        content.write_manifest(os.path.join(self.cur, 'content.json'), self.manifest)
        appdir._active = None
        hotpy._finder = None
        hotpy.state.update(active=0, error='')
        sys.modules.pop('zxprobe', None)
        # fallback() 会把 server、db 也从 sys.modules 删掉：测完放回去，别影响其他测试
        self.mods = {k: v for k, v in sys.modules.items() if k.split('.')[0] in ('server', 'db')}

    def tearDown(self):
        sys.modules.update(self.mods)
        if hotpy._finder:
            sys.meta_path.remove(hotpy._finder)
        hotpy._finder = None
        sys.modules.pop('zxprobe', None)
        for p in self.patches:
            p.stop()
        for k, v in self.saved.items():
            setattr(appdir, k, v)
        appdir._active = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_loads_hot_code_from_versioned_copy(self):
        self.assertTrue(hotpy.install())
        import zxprobe
        self.assertEqual(zxprobe.VALUE, 'hot')
        py = os.path.join(appdir.CONTENT_DIR, 'py', '30')
        self.assertTrue(os.path.isfile(os.path.join(py, 'ok')))
        self.assertEqual(os.path.dirname(zxprobe.__file__), py)       # 从复制出来的目录加载，不是 current/
        self.assertEqual(hotpy.state['active'], 30)

    def test_shell_api_mismatch_is_ignored(self):
        self.manifest['py_shell_api'] = SHELL_API + 1
        content.write_manifest(os.path.join(self.cur, 'content.json'), self.manifest)
        self.assertFalse(hotpy.install())

    def test_tampered_file_is_ignored(self):
        write(os.path.join(self.cur, 'zxprobe.py'), 'VALUE = "evil"\n')
        self.assertFalse(hotpy.install())

    def test_bundled_content_never_loads_hot_code(self):
        appdir.CONTENT_DIR = os.path.join(self.dir, 'nothing')       # 没有下载过内容：用的是 exe 自带的
        os.makedirs(appdir.BUNDLED_DIR)
        appdir._active = None
        self.assertFalse(hotpy.install())

    def test_fallback_marks_bad_and_unloads(self):
        self.assertTrue(hotpy.install())
        import zxprobe  # noqa: F401
        self.assertTrue(hotpy.fallback(RuntimeError('boom')))
        self.assertNotIn('zxprobe', sys.modules)
        self.assertEqual(hotpy.state, {'active': 0, 'error': 'boom'})
        self.assertTrue(os.path.isfile(os.path.join(appdir.CONTENT_DIR, 'py', '30', 'bad')))
        self.assertFalse(hotpy.install())                             # 坏掉的这一版以后不再试

    def test_hot_py_paths(self):
        self.assertTrue(content.is_hot_py('server.py'))
        self.assertTrue(content.is_hot_py('zxprobe.py'))
        self.assertFalse(content.is_hot_py('tray.py'))
        self.assertFalse(content.is_hot_py('static/app.js'))


class RealManifestTest(unittest.TestCase):
    def test_backend_code_is_in_content_but_shell_is_not(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        files = content.list_files(root)
        for f in ('server.py', 'db.py', 'srs.py', 'exam.py', 'skills/service.py'):
            self.assertIn(f, files)
        for f in ('tray.py', 'appdir.py', 'hotpy.py', 'hotupdate.py', 'updater.py', 'version.py', 'content.py'):
            self.assertNotIn(f, files)
        self.assertFalse([f for f in files if f.endswith('.pyc')])


if __name__ == '__main__':
    unittest.main()
