# -*- coding: utf-8 -*-
"""核心逻辑测试：python -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db      # noqa: E402
import exam    # noqa: E402
import srs     # noqa: E402


class SrsTest(unittest.TestCase):
    def test_first_right_jumps_to_box3(self):
        c, ev = srs.apply(None, True, '2026-10-04 10:00:00')
        self.assertEqual((c['box'], c['due'], ev), (3, '2026-10-08', None))

    def test_same_day_repeat_counts_once(self):
        c, _ = srs.apply(None, False, '2026-10-04 10:00:00')
        c, _ = srs.apply(c, True, '2026-10-04 10:05:00')
        c, _ = srs.apply(c, True, '2026-10-04 10:06:00')
        self.assertEqual((c['streak'], c['box'], c['right']), (1, 1, 2))

    def test_wrong_enters_book_and_needs_three_days_to_release(self):
        c, ev = srs.apply(None, False, '2026-10-04 10:00:00')
        self.assertEqual(ev, 'entered')
        self.assertTrue(c['in_wrong'])
        self.assertEqual(c['due'], '2026-10-05')
        c, ev = srs.apply(c, True, '2026-10-05 10:00:00')
        c, ev = srs.apply(c, True, '2026-10-06 10:00:00')
        self.assertTrue(c['in_wrong'])
        c, ev = srs.apply(c, True, '2026-10-08 10:00:00')
        self.assertEqual(ev, 'released')
        self.assertFalse(c['in_wrong'])

    def test_wrong_again_resets(self):
        c, _ = srs.apply(None, True, '2026-10-04 10:00:00')
        c, ev = srs.apply(c, False, '2026-10-08 10:00:00')
        self.assertEqual((c['box'], c['streak'], ev), (0, 0, 'entered'))

    def test_legacy(self):
        c = srs.from_legacy({'wrong_count': 1, 'right_count': 0, 'last_time': '2026-09-30 11:00:00', 'mastered': 0})
        self.assertTrue(c['in_wrong'])
        self.assertEqual(c['due'], '2026-09-30')
        c = srs.from_legacy({'wrong_count': 0, 'right_count': 1, 'last_time': '2026-09-30 11:00:00', 'mastered': 0})
        self.assertEqual((c['box'], c['due']), (3, '2026-10-04'))


def q(i, pid=1, t='single', mat='', ans='A'):
    return {'id': i, 'key': 'p%d#%d' % (pid, i), 'paper_id': pid, 'qno': i, 'type': t, 'stem': 's%d' % i,
            'material': mat, 'options': [['A', 'a'], ['B', 'b']], 'answer': ans, 'analysis': ''}


class ExamTest(unittest.TestCase):
    def test_units_keep_material_together(self):
        pool = [q(1), q(2, mat='M'), q(3, mat='M'), q(4)]
        us = exam.units(pool)
        self.assertEqual([[x['id'] for x in u] for u in us], [[1], [2, 3], [4]])

    def test_pick_exact_count_and_no_split_when_possible(self):
        import random
        pool = [q(i, mat='M%d' % (i // 5)) for i in range(20)]       # 4 组，每组 5 题
        got = exam.pick(pool, 10, random.Random(1))
        self.assertEqual(len(got), 10)
        self.assertEqual(len(set(x['material'] for x in got)), 2)

    def test_compose_english_sections_by_paper_prefix(self):
        papers = [{'id': 1, 'key': 'english-vocab'}, {'id': 2, 'key': 'english-phonetics'}]
        qs = [q(i, pid=1) for i in range(1, 31)] + [q(i, pid=2) for i in range(31, 41)]
        title, minutes, secs = exam.compose(qs, papers, 'english')
        d = dict((n, g) for n, g in secs)
        self.assertEqual(len(d['语音辨析']), 5)
        self.assertTrue(all(x['paper_id'] == 2 for x in d['语音辨析']))
        self.assertEqual(len(d['词汇与语法']), 15)

    def test_shuffle_skips_unsafe_options(self):
        import random
        rng = random.Random(0)
        self.assertIsNone(exam.shuffle_perm(q(1, t='judge'), rng))
        x = q(1)
        x['options'] = [['A', '甲'], ['B', '乙'], ['C', '以上都对']]
        self.assertIsNone(exam.shuffle_perm(x, rng))
        x['options'] = [['A', 'A'], ['B', 'B'], ['C', 'C']]               # 图里的标号
        self.assertIsNone(exam.shuffle_perm(x, rng))
        x['options'] = [['A', 'cat'], ['B', 'All of the above']]
        self.assertIsNone(exam.shuffle_perm(x, rng))
        x['options'] = [['A', '甲'], ['B', '乙'], ['C', '丙'], ['D', '丁']]
        self.assertEqual(sorted(exam.shuffle_perm(x, rng)), [0, 1, 2, 3])

    def test_to_original(self):
        perm = [2, 0, 3, 1]                  # 显示 A=原C, B=原A, C=原D, D=原B
        self.assertEqual(exam.to_original('A', perm), 'C')
        self.assertEqual(exam.to_original('DB', perm), 'AB')
        self.assertEqual(exam.to_original('对', None), '对')
        x = q(1)
        x['options'] = [['A', '甲'], ['B', '乙'], ['C', '丙'], ['D', '丁']]
        self.assertEqual(exam.shuffled_options(x, perm)[0], ['A', '丙'])

    def test_is_right(self):
        self.assertTrue(exam.is_right(q(1, t='multi', ans='AC'), 'CA'))
        self.assertFalse(exam.is_right(q(1, t='multi', ans='AC'), 'A'))
        self.assertFalse(exam.is_right(q(1), ''))


class DbFlowTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        db.DATA_DIR = self.dir
        db.BANK_PATH = os.path.join(self.dir, 'bank.json')
        db.PROGRESS_PATH = os.path.join(self.dir, 'progress.json')
        db.MEDIA_DIR = os.path.join(self.dir, 'media')
        db._bank = db._prog = None
        db.init()
        qs = [{'type': 'single', 'stem': 'q%d' % i, 'options': [['A', '1'], ['B', '2']], 'answer': 'A'}
              for i in range(1, 41)]
        qs += [{'type': 'judge', 'stem': 'j%d' % i, 'answer': '对'} for i in range(1, 21)]
        qs += [{'type': 'multi', 'stem': 'm%d' % i, 'options': [['A', '1'], ['B', '2'], ['C', '3']],
                'answer': 'AB'} for i in range(1, 11)]
        db.upsert_paper('politics-1', '政治1', 'politics', qs)

    def tearDown(self):
        db._bank = db._prog = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_reimport_keeps_ids_and_progress(self):
        q1 = db.get_questions(limit=1)[0][0]
        db.record_answer(q1['id'], False)
        qs = [{'type': 'single', 'stem': 'changed', 'options': [['A', '1'], ['B', '2']], 'answer': 'B'}]
        db.upsert_paper('politics-1', '政治1', 'politics', qs)
        items, total = db.get_questions()
        self.assertEqual(total, 1)
        self.assertEqual(items[0]['id'], q1['id'])
        self.assertEqual(items[0]['wrong_count'], 1)

    def test_review_queue_due_and_new(self):
        q1 = db.get_questions(limit=1)[0][0]
        db.record_answer(q1['id'], False)
        db._prog['cards'][q1['key']]['due'] = '2000-01-01'
        r = db.review_queue(new_limit=5)
        self.assertEqual(r['due'], 1)
        self.assertEqual(r['new'], 5)
        self.assertEqual(r['items'][0]['id'], q1['id'])

    def test_exam_flow_records_wrong(self):
        e = db.exam_start('politics')
        self.assertEqual(sum(len(s['items']) for s in e['sections']), 35)
        self.assertTrue(all(i['answer'] == '' for s in e['sections'] for i in s['items']))
        first = e['sections'][0]['items'][0]              # 单选，原卷答案 A='1'
        shown = next(k for k, v in first['options'] if v == '1')
        r = db.exam_submit(e['id'], {str(first['id']): shown}, 100)
        self.assertEqual(r['correct'], 1)
        rf = r['sections'][0]['items'][0]
        self.assertEqual((rf['given'], rf['options'][0]), ('A', ['A', '1']))   # 报告按原卷顺序
        self.assertEqual(r['total'], 35)
        self.assertEqual(len(db.wrong_list(0)), 34)
        self.assertEqual(db.dashboard()['exams'][0]['score'], round(100.0 / 35, 1))


if __name__ == '__main__':
    unittest.main()


class DataSafetyTest(unittest.TestCase):
    """更新题库、清除记录都不能误伤用户数据"""

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        db._bank = db._prog = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_seed_upgrade_keeps_progress(self):
        import appdir
        seed = os.path.join(self.dir, 'seed')
        data = os.path.join(self.dir, 'data')
        os.makedirs(os.path.join(seed, 'media'))
        os.makedirs(data)
        with open(os.path.join(seed, 'bank.json'), 'w') as f:
            f.write('NEW')
        with open(os.path.join(seed, 'data_version.txt'), 'w') as f:
            f.write('3')
        for name, text in (('bank.json', 'OLD'), ('progress.json', 'MINE'), ('data_version.txt', '2')):
            with open(os.path.join(data, name), 'w') as f:
                f.write(text)
        old = appdir.RES_DIR, appdir.DATA_DIR
        appdir.RES_DIR, appdir.DATA_DIR = self.dir, data
        try:
            appdir.ensure_data()
            # 题库不直接覆盖，放成 bank.seed.json 等 db 合并；做题记录不动
            self.assertEqual(open(os.path.join(data, 'bank.json')).read(), 'OLD')
            self.assertEqual(open(os.path.join(data, 'bank.seed.json')).read(), 'NEW')
            self.assertEqual(open(os.path.join(data, 'progress.json')).read(), 'MINE')
            # 版本相同时不再处理
            os.remove(os.path.join(data, 'bank.seed.json'))
            appdir.ensure_data()
            self.assertFalse(os.path.exists(os.path.join(data, 'bank.seed.json')))
        finally:
            appdir.RES_DIR, appdir.DATA_DIR = old

    def test_clear_progress_backs_up_and_keeps_settings(self):
        db.DATA_DIR = self.dir
        db.BANK_PATH = os.path.join(self.dir, 'bank.json')
        db.PROGRESS_PATH = os.path.join(self.dir, 'progress.json')
        db.MEDIA_DIR = os.path.join(self.dir, 'media')
        db._bank = db._prog = None
        db.init()
        db.upsert_paper('p-1', '卷', 'politics', [{'type': 'single', 'stem': 'q', 'options': [['A', '1']], 'answer': 'A'}])
        qid = db.get_questions()[0][0]['id']
        db.record_answer(qid, False)
        db.set_setting('exam_date', '2026-11-07')
        backup = db.clear_progress()
        self.assertTrue(os.path.exists(backup))
        self.assertEqual(db.stats()['answered'], 0)
        self.assertEqual(db.wrong_list(0), [])
        self.assertEqual(db._prog['settings']['exam_date'], '2026-11-07')
        self.assertEqual(db.stats()['questions'], 1)

    def test_seed_merge_keeps_user_papers_and_records(self):
        db.DATA_DIR = self.dir
        db.BANK_PATH = os.path.join(self.dir, 'bank.json')
        db.PROGRESS_PATH = os.path.join(self.dir, 'progress.json')
        db.MEDIA_DIR = os.path.join(self.dir, 'media')
        db._bank = db._prog = None
        db.init()
        q = lambda stem: {'type': 'single', 'stem': stem, 'options': [['A', '1']], 'answer': 'A'}
        db.upsert_paper('politics-1', '政治1', 'politics', [q('旧题1'), q('旧题2')])
        db.upsert_paper('upload-1', '我导入的', 'general', [q('我的题')])
        qid = db.get_questions(paper_id=None)[0][0]['id']
        db.record_answer(qid, False)
        # 新版题库：政治1 的题干改了
        seed = {'version': 2, 'papers': [{'id': 1, 'key': 'politics-1', 'name': '政治1', 'subject': 'politics'}],
                'questions': [dict(q('新题1'), id=1, key='politics-1#1', paper_id=1, qno=1),
                              dict(q('新题2'), id=2, key='politics-1#2', paper_id=1, qno=2)]}
        db._write_json(os.path.join(self.dir, 'bank.seed.json'), seed)
        db._bank = db._prog = None
        db.init()
        stems = [x['stem'] for x in db.get_questions()[0]]
        self.assertIn('新题1', stems)
        self.assertIn('我的题', stems)
        self.assertNotIn('旧题1', stems)
        self.assertEqual(len(db.wrong_list(0)), 1)       # 做题记录还在
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'bank.seed.json')))
