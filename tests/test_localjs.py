# -*- coding: utf-8 -*-
"""手机版 mobile/local.js 和电脑版 db.py / exam.py 逻辑一致的测试（用 node 跑 local.js；没装 node 就跳过），
以及 static/app.js 里整篇卡片分组的纯逻辑。"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import db      # noqa: E402

NODE = shutil.which('node')

# 在 node 里装出 App 的样子（window、localStorage、fetch('bank.json')），加载 local.js，按顺序调接口，结果打成 JSON
HARNESS = r'''
const fs = require('fs');
global.window = global;
global.location = { href: 'http://local/' };
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); },
                        removeItem: k => { delete mem[k]; } };
const bank = fs.readFileSync(process.argv[2], 'utf8');
global.fetch = async u => { if (u === 'bank.json') return { ok: true, json: async () => JSON.parse(bank) }; throw new Error('offline'); };
eval(fs.readFileSync(process.argv[3], 'utf8'));
(async () => {
  const calls = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const out = [];
  for (const [path, opts] of calls) out.push(await window.LocalAPI.call(path, opts));
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
'''


def reading_paper(key, sizes, start=1):
    """一张语文卷：几道基础单选 + 几篇现代文阅读（每篇 sizes[i] 题）"""
    qs = [{'type': 'single', 'stem': '%s 基础%d' % (key, i), 'options': [['A', '1'], ['B', '2']], 'answer': 'A'}
          for i in range(1, 7)]
    for n, size in enumerate(sizes):
        qs += [{'type': 'reading', 'stem': '%s 阅读%d-%d' % (key, n, i), 'material': '%s 文章%d' % (key, n),
                'options': [['A', '1'], ['B', '2'], ['C', '3'], ['D', '4']], 'answer': 'A'} for i in range(size)]
    return qs


class LocalJsSameAsDbTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        db.DATA_DIR = self.dir
        db.BANK_PATH = os.path.join(self.dir, 'bank.json')
        db.PROGRESS_PATH = os.path.join(self.dir, 'progress.json')
        db.MEDIA_DIR = os.path.join(self.dir, 'media')
        db._bank = db._prog = None
        db.init()
        # 卷 8 先导入（paper_id 小），卷 7 后导入：“按卷子顺序”还是要卷 7 在前
        db.upsert_paper('chinese-8', '语文8', 'chinese', reading_paper('c8', [4, 3, 3]))
        db.upsert_paper('chinese-7', '语文7', 'chinese', reading_paper('c7', [3, 4, 3]))
        db.upsert_paper('chinese-1', '语文1', 'chinese', reading_paper('c1', [3, 3, 4]))

    def tearDown(self):
        db._bank = db._prog = None
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_js(self, calls):
        cf = os.path.join(self.dir, 'calls.json')
        hf = os.path.join(self.dir, 'harness.js')
        with open(cf, 'w', encoding='utf-8') as f:
            json.dump(calls, f, ensure_ascii=False)
        with open(hf, 'w', encoding='utf-8') as f:
            f.write(HARNESS)
        r = subprocess.run([NODE, hf, db.BANK_PATH, os.path.join(ROOT, 'mobile', 'local.js'), cf],
                           capture_output=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr.decode('utf-8', 'replace'))
        return json.loads(r.stdout.decode('utf-8'))

    def test_type_practice_in_paper_order(self):
        keys = [q['key'].split('#')[0] for q in db.practice_set(subject='chinese', qtype='reading', shuffle=False)]
        self.assertEqual(sorted(set(keys), key=keys.index), ['chinese-1', 'chinese-7', 'chinese-8'])
        found = [q['key'].split('#')[0] for q in db.get_questions(subject='chinese', search='基础1', limit=10)[0]]
        self.assertEqual(found, ['chinese-1', 'chinese-7', 'chinese-8'])
        if not NODE:
            self.skipTest('没装 node')
        res = self.run_js([['/api/practice?subject=chinese&type=reading&order=seq&scope=all', {}],
                           ['/api/questions?subject=chinese&q=' + '基础1', {}]])
        self.assertEqual([q['key'] for q in res[0]['items']],
                         [q['key'] for q in db.practice_set(subject='chinese', qtype='reading', shuffle=False)])
        self.assertEqual([q['key'].split('#')[0] for q in res[1]['items']], found)

    def check_exam(self, e):
        with open(db.BANK_PATH, encoding='utf-8') as f:
            bank = json.load(f)
        size = {}
        for q in bank['questions']:
            if q.get('material'):
                size[q['material']] = size.get(q['material'], 0) + 1
        sec = next(s for s in e['sections'] if s['name'] == '现代文阅读')
        self.assertEqual(len(sec['items']), 10)
        got = {}
        for q in sec['items']:
            got[q['material']] = got.get(q['material'], 0) + 1
        self.assertEqual(got, {m: size[m] for m in got})      # 每篇都是整篇，没有半篇
        total = sum(len(s['items']) * s['points'] for s in e['sections'])
        self.assertEqual(round(total, 6), 16)           # 基础 6 + 阅读 10（这里没有古诗文）

    def test_chinese_exam_reading_whole_passages(self):
        for _ in range(15):
            self.check_exam(db.exam_start('chinese'))
        if not NODE:
            self.skipTest('没装 node')
        res = self.run_js([['/api/exam/start', {'method': 'POST', 'body': {'subject': 'chinese'}}]] * 15)
        for r in res:
            self.check_exam(r['exam'])


# static/app.js 里整篇卡片分组的几个纯函数（groupKey … sortUnits），取出来在 node 里跑
GROUP_JS = r'''
const SELF_TYPES = ['qa', 'dictation', 'essay', 'blank', 'solution'];
eval(require('fs').readFileSync(process.argv[2], 'utf8'));
const q = (id, mat) => ({ id: id, paper_id: 1, qno: id, type: 'single', material: mat || '' });
// 最后一篇阅读（3、4、5）做错了 4、5，复制一份（extra）放到后面再来一次
const p = { list: [q(1), q(2), q(3, 'M'), q(4, 'M'), q(5, 'M')] };
p.list.push(Object.assign({}, p.list[3], { extra: 'again' }), Object.assign({}, p.list[4], { extra: 'again' }));
const units = [];
for (let i = 0; i < p.list.length; i = unitEnd(p, i)) units.push([i, unitEnd(p, i)]);
p.idx = 5;
const no = unitNo(p);
process.stdout.write(JSON.stringify({ units: units, start6: unitStart(p, 6), start5: unitStart(p, 5), no: no }));
'''


@unittest.skipUnless(NODE, '没装 node')
class AppGroupTest(unittest.TestCase):
    def test_requeued_wrongs_are_their_own_unit(self):
        with open(os.path.join(ROOT, 'static', 'app.js'), encoding='utf-8') as f:
            src = f.read()
        a, b = src.index('function groupKey(q)'), src.index('function renderGroup()')
        d = tempfile.mkdtemp()
        try:
            part, hf = os.path.join(d, 'part.js'), os.path.join(d, 'h.js')
            with open(part, 'w', encoding='utf-8') as f:
                f.write(src[a:b])
            with open(hf, 'w', encoding='utf-8') as f:
                f.write(GROUP_JS)
            r = subprocess.run([NODE, hf, part], capture_output=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stderr.decode('utf-8', 'replace'))
            res = json.loads(r.stdout.decode('utf-8'))
        finally:
            shutil.rmtree(d, ignore_errors=True)
        self.assertEqual(res['units'], [[0, 1], [1, 2], [2, 5], [5, 7]])     # 再来一次的两题单独一篇
        self.assertEqual((res['start6'], res['start5'], res['no']), (5, 5, '4/4'))


if __name__ == '__main__':
    unittest.main()
