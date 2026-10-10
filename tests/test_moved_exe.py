# -*- coding: utf-8 -*-
"""exe 挪了位置不丢做题记录（appdir.follow_moved_exe）：2026-10-10 把 exe 从 quiz-app 文件夹挪到桌面，
数据目录从“exe 旁边的 data/”变成 %LOCALAPPDATA%，看起来做题记录全没了"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import appdir      # noqa: E402


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)


def read(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


class MovedExeTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.saved = {k: getattr(appdir, k) for k in ('FROZEN', 'APP_DIR', 'HOME_DIR', 'DATA_DIR', 'LOCAL_HOME', 'PORTABLE_POINTER')}
        self.portable = os.path.join(self.dir, 'quiz-app')
        self.local = os.path.join(self.dir, 'LocalAppData', '智学题库')
        appdir.FROZEN = True
        appdir.LOCAL_HOME = self.local
        appdir.PORTABLE_POINTER = os.path.join(self.local, 'portable_home.txt')
        self.old = {'cards': {'a#1': {'box': 3, 'last': '2026-10-09 10:00:00'}, 'a#2': {'box': 0, 'last': '2026-10-09 10:01:00'}},
                    'attempts': [{'k': 'a#1', 'ok': True, 't': '2026-10-09 10:00:00'},
                                 {'k': 'a#2', 'ok': False, 't': '2026-10-09 10:01:00'}],
                    'exams': [{'id': 1}], 'settings': {'new_per_day': 30}}
        write(os.path.join(self.portable, 'data', 'progress.json'), self.old)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(appdir, k, v)
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_at(self, exe_dir, home):
        appdir.APP_DIR, appdir.HOME_DIR = exe_dir, home
        appdir.DATA_DIR = os.path.join(home, 'data')
        return appdir.follow_moved_exe()

    def test_portable_remembers_then_moved_exe_finds_records(self):
        self.run_at(self.portable, self.portable)                       # 在 quiz-app 里便携运行：记下位置
        self.assertEqual(open(appdir.PORTABLE_POINTER, encoding='utf-8').read(), self.portable)
        # 挪到桌面后，先在新位置做了 1 题（新卡片），又把以前做过的 a#2 重做对了
        write(os.path.join(self.local, 'data', 'progress.json'),
              {'cards': {'b#9': {'box': 3, 'last': '2026-10-10 16:49:00'}, 'a#2': {'box': 1, 'last': '2026-10-10 16:50:00'}},
               'attempts': [{'k': 'b#9', 'ok': True, 't': '2026-10-10 16:49:00'},
                            {'k': 'a#2', 'ok': True, 't': '2026-10-10 16:50:00'}],
               'exams': [], 'settings': {'new_per_day': 20}})
        got = self.run_at(os.path.join(self.dir, 'Desktop'), self.local)
        self.assertEqual(got, self.portable)
        p = read(os.path.join(self.local, 'data', 'progress.json'))
        self.assertEqual(len(p['attempts']), 4)
        self.assertEqual(sorted(p['cards']), ['a#1', 'a#2', 'b#9'])
        self.assertEqual(p['cards']['a#2']['box'], 1)                    # 两边都做过：用最后做的那份
        self.assertEqual(p['exams'], [{'id': 1}])
        self.assertEqual(p['settings'], {'new_per_day': 30})
        self.assertTrue(os.listdir(os.path.join(self.local, 'data', 'backups')))       # 合并前备份了
        self.assertIsNone(self.run_at(os.path.join(self.dir, 'Desktop'), self.local))   # 再启动不会重复合并
        self.assertEqual(len(read(os.path.join(self.local, 'data', 'progress.json'))['attempts']), 4)

    def test_fresh_install_without_pointer_does_nothing(self):
        self.assertIsNone(self.run_at(os.path.join(self.dir, 'Desktop'), self.local))
        self.assertFalse(os.path.exists(os.path.join(self.local, 'data', 'progress.json')))


if __name__ == '__main__':
    unittest.main()
