# -*- coding: utf-8 -*-
"""账号同步：两台设备各自离线做题、改设置、标记错题，经同一个服务器合并后完全一致；数据不一致时全量核对能补齐。
服务器用 syncserver/sync_server.py 的函数直接调（临时数据库），不走网络。"""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'syncserver'))

import db               # noqa: E402
import sync_server      # noqa: E402


class Device:
    """一台设备 = 一份 progress.json；切换设备就是让 db 读写另一份文件"""

    def __init__(self, root, name):
        self.path = os.path.join(root, name + '.json')

    def use(self):
        db.PROGRESS_PATH = self.path
        db._prog = None
        db._bank = None
        db._load()


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        db.DATA_DIR = self.dir
        db.BANK_PATH = os.path.join(self.dir, 'bank.json')
        db.MEDIA_DIR = os.path.join(self.dir, 'media')
        db.PROGRESS_PATH = os.path.join(self.dir, 'seed.json')
        db._bank = db._prog = None
        db.init()
        qs = [{'type': 'single', 'stem': 'q%d' % i, 'options': [['A', '1'], ['B', '2']], 'answer': 'A'} for i in range(1, 11)]
        db.upsert_paper('politics-1', '政治1', 'politics', qs)
        sync_server.DB_PATH = os.path.join(self.dir, 'sync.db')
        sync_server._local.c = None
        sync_server.init_db()
        sync_server.adduser('u', 'pw123456')
        self.uid = sync_server.conn().execute('SELECT uid FROM users').fetchone()[0]
        self.a, self.b = Device(self.dir, 'a'), Device(self.dir, 'b')
        for d in (self.a, self.b):
            d.use()
            db.sync_start_account()

    def tearDown(self):
        sync_server._local.c.close()
        sync_server._local.c = None
        db._bank = db._prog = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def sync(self, dev):
        """和 sync.sync_once 一样的流程，只是把网络请求换成直接调服务器函数"""
        dev.use()
        reconciled = False
        for _ in range(20):
            out = json.loads(json.dumps(db.sync_outbox()))
            code, resp = sync_server.api_sync(self.uid, json.loads(json.dumps(out)))
            self.assertEqual(code, 200)
            r = db.sync_apply(out, json.loads(json.dumps(resp)))
            if r['more'] or db.sync_pending():
                continue
            if r['match'] or reconciled:
                return r
            reconciled = True
            missing = db.sync_reconcile(sync_server.api_ids(self.uid, {})[1]['ids'])
            db.sync_merge_fetched(sync_server.api_fetch(self.uid, {'ids': missing})[1]['events'])
        self.fail('同步没收敛')

    def state(self, dev):
        dev.use()
        p = db._prog
        return (sorted(e['id'] for e in p['attempts'] + p['marks']), p['cards'], p['settings'])

    def test_offline_edits_merge(self):
        self.a.use()
        db.record_answer(1, False)
        db.record_answer(2, True)
        db.set_setting('new_per_day', 30)
        self.b.use()
        db.record_answer(1, True)
        db.record_answer(3, False)
        time.sleep(0.01)
        db.set_setting('new_per_day', 40)            # B 后改
        db.mark_mastered(3, True)
        for d in (self.a, self.b, self.a):
            self.sync(d)
        sa, sb = self.state(self.a), self.state(self.b)
        self.assertEqual(sa, sb)
        self.assertEqual(len(sa[0]), 5)               # 4 次作答 + 1 次标记
        self.assertEqual(sa[2]['new_per_day'], 40)
        # 卡片 = 按时间重放全部事件的结果
        db._prog = None
        self.a.use()
        k = db._ck(next(q for q in db._bank['questions'] if q['id'] == 3))
        self.assertFalse(db._prog['cards'][k]['in_wrong'])

    def test_ids_stable_for_duplicate_events(self):
        self.a.use()
        e = {'k': 'politics-1#1', 'ok': True, 't': '2026-01-01 08:00:00', 'm': 'practice'}
        db._prog['attempts'] += [dict(e), dict(e)]     # 老版本迁移来的完全相同的两条
        for x in db._prog['attempts']:
            x.pop('id', None)
        db._ensure_ids()
        ids = [x['id'] for x in db._prog['attempts']]
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual(ids[1], ids[0] + '.1')

    def test_reconcile_restores_lost_events(self):
        self.a.use()
        for i in range(1, 6):
            db.record_answer(i, True)
        self.sync(self.a)
        self.sync(self.b)
        self.b.use()
        del db._prog['attempts'][:3]                   # B 的文件被弄乱：少了 3 条，但都标着“已上传”
        db._save_prog()
        self.sync(self.b)
        self.assertEqual(self.state(self.a), self.state(self.b))

    def test_legacy_card_kept_as_base(self):
        self.a.use()
        db._prog['cards']['politics-1#9'] = dict(db.srs.new_card(), box=5, right=7, last='2025-01-01 00:00:00',
                                                  due='2025-02-01')   # 只有卡片、没有作答记录的老数据
        db._save_prog()
        db.sync_start_account()
        self.sync(self.a)
        self.sync(self.b)
        self.b.use()
        self.assertEqual(db._prog['cards']['politics-1#9']['box'], 5)


if __name__ == '__main__':
    unittest.main()
