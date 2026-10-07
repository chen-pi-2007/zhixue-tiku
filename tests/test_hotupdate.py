# -*- coding: utf-8 -*-
"""热更新：只下载变了的文件、全部齐了才换上、出错不动正在用的内容、做题记录不受影响"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import appdir      # noqa: E402
import content     # noqa: E402
import db          # noqa: E402
import hotupdate   # noqa: E402


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data if isinstance(data, bytes) else data.encode('utf-8'))


def bank(stem):
    return json.dumps({'version': 2, 'papers': [{'id': 1, 'key': 'politics-1', 'name': '政治1', 'subject': 'politics'}],
                       'questions': [{'id': 1, 'key': 'politics-1#1', 'paper_id': 1, 'qno': 1, 'type': 'single',
                                      'stem': stem, 'options': [['A', '1'], ['B', '2']], 'answer': 'A',
                                      'analysis': '', 'material': ''}]}, ensure_ascii=False)


class HotUpdateTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.saved = {k: getattr(appdir, k) for k in ('FROZEN', 'BUNDLED_DIR', 'CONTENT_DIR', 'DATA_DIR')}
        self.saved_db = {k: getattr(db, k) for k in ('DATA_DIR', 'BANK_PATH', 'PROGRESS_PATH', 'MEDIA_DIR')}
        bundled = os.path.join(self.dir, 'bundled')
        data = os.path.join(self.dir, 'home', 'data')
        appdir.FROZEN = True
        appdir.BUNDLED_DIR = bundled
        appdir.CONTENT_DIR = os.path.join(self.dir, 'home', 'content')
        appdir.DATA_DIR = data
        db.DATA_DIR, db.BANK_PATH = data, os.path.join(data, 'bank.json')
        db.PROGRESS_PATH, db.MEDIA_DIR = os.path.join(data, 'progress.json'), os.path.join(data, 'media')
        # 程序自带的内容 v4
        write(os.path.join(bundled, 'static', 'app.js'), 'old ui')
        write(os.path.join(bundled, 'static', 'style.css'), 'css')
        write(os.path.join(bundled, 'data', 'bank.json'), bank('旧题干'))
        write(os.path.join(bundled, 'data', 'media', 'p', '001.png'), b'\x89PNG old')
        content.write_manifest(os.path.join(bundled, 'content.json'),
                               content.build_manifest(bundled, 4, '1.0.0', '1.0.0'))
        appdir._active = None
        appdir.ensure_data()                                  # 第一次运行：题库放进 data/
        db._bank = db._prog = None
        db.init()
        db.record_answer(1, False)                            # 做错一题，进错题本
        # 仓库里的新内容 v5：界面改了、题库题干改了、加了一张图，style.css 没变
        repo = os.path.join(self.dir, 'repo')
        shutil.copytree(bundled, repo)
        os.remove(os.path.join(repo, 'content.json'))
        write(os.path.join(repo, 'static', 'app.js'), 'new ui')
        write(os.path.join(repo, 'data', 'bank.json'), bank('新题干'))
        write(os.path.join(repo, 'data', 'media', 'p', '002.png'), b'\x89PNG new')
        self.repo = repo
        self.latest = content.build_manifest(repo, 5, '1.0.0', '1.0.0')
        self.fetched = []

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(appdir, k, v)
        for k, v in self.saved_db.items():
            setattr(db, k, v)
        appdir._active = None
        db._bank = db._prog = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def fetch(self, ref, path):
        self.fetched.append(path)
        with open(os.path.join(self.repo, *path.split('/')), 'rb') as f:
            return f.read()

    def test_downloads_only_changed_files_and_keeps_progress(self):
        hotupdate.install(self.latest, self.fetch)
        self.assertEqual(sorted(self.fetched), ['data/bank.json', 'data/media/p/002.png', 'static/app.js'])
        root, m = appdir.active()
        self.assertEqual(m['content_version'], 5)
        self.assertEqual(open(os.path.join(appdir.static_dir(), 'app.js')).read(), 'new ui')
        self.assertEqual(open(os.path.join(appdir.static_dir(), 'style.css')).read(), 'css')   # 没变的复制过来
        self.assertTrue(os.path.exists(os.path.join(appdir.DATA_DIR, 'media', 'p', '002.png')))
        q = db.get_questions()[0][0]
        self.assertEqual(q['stem'], '新题干')                   # 新题库合并进来了
        self.assertEqual(q['wrong_count'], 1)                    # 做题记录还在
        self.assertTrue(db.wrong_list(0))

    def test_bad_download_leaves_current_content(self):
        def bad(ref, path):
            return b'broken'                                     # 指纹对不上
        with mock.patch.object(hotupdate.time, 'sleep', lambda s: None):
            with self.assertRaises(ValueError):
                hotupdate.install(self.latest, bad)
        appdir._active = None
        self.assertEqual(appdir.content_version(), 4)            # 还在用原来的
        self.assertEqual(open(os.path.join(appdir.static_dir(), 'app.js')).read(), 'old ui')
        self.assertFalse(os.path.exists(os.path.join(appdir.CONTENT_DIR, 'current')))
        self.assertEqual(db.get_questions()[0][0]['wrong_count'], 1)

    def test_incompatible_content_is_ignored_at_startup(self):
        hotupdate.install(self.latest, self.fetch)
        m = content.read_manifest(os.path.join(appdir.CONTENT_DIR, 'current', 'content.json'))
        m['min_app_version'] = '99.0.0'                          # 假装这份内容要更新的程序
        content.write_manifest(os.path.join(appdir.CONTENT_DIR, 'current', 'content.json'), m)
        appdir._active = None
        self.assertEqual(appdir.content_version(), 4)

    def test_corrupted_unchanged_file_is_downloaded_again(self):
        # 正在用的内容里 style.css 坏了但大小没变：不能原样复制过去
        with open(os.path.join(appdir.BUNDLED_DIR, 'static', 'style.css'), 'w') as f:
            f.write('CSS')
        hotupdate.install(self.latest, self.fetch)
        self.assertIn('static/style.css', self.fetched)
        self.assertEqual(open(os.path.join(appdir.static_dir(), 'style.css')).read(), 'css')

    def test_failed_swap_restores_current(self):
        hotupdate.install(self.latest, self.fetch)               # 先装好 v5
        v6 = dict(self.latest, content_version=6, files=dict(self.latest['files']))
        real = os.replace

        def flaky(src, dst):
            if src.endswith('next'):                             # next → current 这一步被占用
                raise PermissionError('占用')
            return real(src, dst)
        with mock.patch.object(hotupdate.os, 'replace', flaky), mock.patch.object(hotupdate.time, 'sleep', lambda s: None):
            with self.assertRaises(ValueError):
                hotupdate.install(v6, self.fetch)
        appdir._active = None
        self.assertEqual(appdir.content_version(), 5)            # v5 原样放回去了
        self.assertEqual(open(os.path.join(appdir.static_dir(), 'app.js')).read(), 'new ui')

    def test_local_media_folders_are_kept(self):
        # 本机自己导入的题库包图片不在内容包里，更新题库时不能被删
        write(os.path.join(appdir.DATA_DIR, 'media', 'my-pack', '1.png'), b'mine')
        hotupdate.install(self.latest, self.fetch)
        self.assertTrue(os.path.exists(os.path.join(appdir.DATA_DIR, 'media', 'my-pack', '1.png')))
        self.assertTrue(os.path.exists(os.path.join(appdir.DATA_DIR, 'media', 'p', '002.png')))

    def test_diff(self):
        old = {'files': {'a': ['1', 1], 'b': ['2', 1]}}
        new = {'files': {'a': ['1', 1], 'b': ['3', 1], 'c': ['4', 1]}}
        self.assertEqual([d[0] for d in content.diff(new, old)], ['b', 'c'])


if __name__ == '__main__':
    unittest.main()
