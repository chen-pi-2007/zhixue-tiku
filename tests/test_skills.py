# -*- coding: utf-8 -*-
"""技能检查器的回归测试：参考答案应得满分（已知的参考答案疏漏除外），原始素材应得 0 分。
需要 学测/题库包/skills（build_skills.py 生成）；没有时跳过。"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from skills import grader, netcheck, service          # noqa: E402
from skills.net_answers import ANSWERS                # noqa: E402

PACKS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '学测', '题库包', 'skills')

# 参考答案本身不符合题目要求的检查项：(卷, 模块, 小题序号, 检查项说明开头)
REFERENCE_DEVIATIONS = {
    ('comp-1', 'ppt', 1, '第2张标题红色'),
    ('comp-1', 'ppt', 2, '第4张标题'),
    ('comp-2', 'word', 1, '纸张宽27厘米'),
    ('comp-2', 'excel', 3, '取消自动筛选按钮'),
    ('comp-2', 'web', 1, '“杭州西湖欢迎您”'),
}


@unittest.skipUnless(os.path.isdir(PACKS), '没有技能题库包')
class OfficeGraderTest(unittest.TestCase):
    def test_reference_answers_full_marks(self):
        for key in sorted(grader.SPECS):
            for mod in grader.SPECS[key]:
                r = grader.grade(key, mod, os.path.join(PACKS, key, 'answer'))
                for t in r['tasks']:
                    for c in t['checks']:
                        known = any(k == key and m == mod and n == t['no'] and c['desc'].startswith(d)
                                    for k, m, n, d in REFERENCE_DEVIATIONS)
                        with self.subTest(key=key, mod=mod, task=t['no'], check=c['desc']):
                            self.assertEqual(c['ok'], not known, c['detail'])

    def test_materials_score_zero(self):
        for key in sorted(grader.SPECS):
            for mod in grader.SPECS[key]:
                r = grader.grade(key, mod, os.path.join(PACKS, key, 'material'))
                with self.subTest(key=key, mod=mod):
                    self.assertEqual(r['score'], 0, [c['desc'] for t in r['tasks'] for c in t['checks'] if c['ok']])

    def test_points_match_paper(self):
        for key in sorted(grader.SPECS):
            skill = json.load(open(os.path.join(PACKS, key, 'skill.json'), encoding='utf-8'))
            for m in skill['modules']:
                if m['id'] not in grader.SPECS[key]:
                    continue
                spec = grader.SPECS[key][m['id']]
                with self.subTest(key=key, mod=m['id']):
                    self.assertEqual(len(spec), len(m['tasks']))
                    for t, checks in zip(m['tasks'], spec):
                        self.assertAlmostEqual(sum(c.points for c in checks), t['points'])


@unittest.skipUnless(os.path.isdir(PACKS), '没有技能题库包')
class NetGraderTest(unittest.TestCase):
    def test_reference_configs(self):
        for n in range(1, 6):
            key = 'net-%d' % n
            m = next(x for x in json.load(open(os.path.join(PACKS, key, 'skill.json'), encoding='utf-8'))['modules']
                     if x['id'] == 'netcfg')
            cfg = {k: v for k, v in ANSWERS[key].items() if k != 'note'}
            r = netcheck.grade(m['rubric_items'], m['intro'], cfg)
            with self.subTest(key=key):
                self.assertEqual([c['desc'] for c in r['checks'] if not c['ok'] and not c['manual']], [])
                self.assertEqual(netcheck.grade(m['rubric_items'], m['intro'], {})['score'], 0)
                self.assertAlmostEqual(r['points'], m['points'])


class NetParseTest(unittest.TestCase):
    def test_show_run_and_vlan_brief(self):
        d = netcheck.Device('SW1#show run\nhostname SW1\n!\nenable secret 5 $1$x$y\n!\ninterface FastEthernet0/3\n'
                            ' switchport access vlan 10\n!\ninterface Vlan10\n ip address 192.168.5.1 255.255.255.0\n!\n'
                            'ip route 0.0.0.0 0.0.0.0 192.168.10.1\nend\nSW1#show vlan brief\n10   zja   active   Fa0/3\n')
        self.assertEqual(d.hostname, 'SW1')
        self.assertEqual(d.vlans.get('10'), 'zja')
        self.assertEqual(d.access_vlan('f0/3'), '10')
        self.assertIn(('192.168.5.1', '255.255.255.0'), d.ip_of('Vlan 10'))

    def test_typed_commands_without_indent(self):
        d = netcheck.Device('Router(config)#hostname RT1\nRT1(config)#interface f0/0\nRT1(config-if)#ip address 10.0.0.1 255.0.0.0\n'
                            'RT1(config-if)#no shutdown\nRT1(config-if)#exit\nRT1(config)#line vty 0 4\nRT1(config-line)#password 123\n'
                            'RT1(config-line)#login\n')
        self.assertEqual(d.hostname, 'RT1')
        self.assertEqual(d.ip_of('fa0/0'), [('10.0.0.1', '255.0.0.0')])
        self.assertTrue(d.vty[0]['login'] and d.vty[0]['password'] == '123')


class TypingTest(unittest.TestCase):
    def test_typing_rules(self):
        src = '没有人不爱荷花的。可我们楼前池塘中独独缺少荷花。' * 4
        r = service.typing_score(src, src[:30], 60)
        self.assertEqual((r['speed'], r['errors'], r['score']), (30.0, 0, 15))
        r = service.typing_score(src, src[:20].replace('荷', '何') + ' ', 60)
        self.assertEqual(r['errors'], 2)                     # 1 个错字 + 1 个多余空格
        self.assertEqual(r['score'], round(6 - 0.4, 2))      # 打了 21 字（含空格）-> 21 字/分钟 6 分，扣 2×0.2
        self.assertEqual(service.typing_score(src, src[:9], 60)['score'], 0)

    def test_code_normalize(self):
        self.assertEqual(service.norm_code(' n % 16; '), 'n%16')


if __name__ == '__main__':
    unittest.main()
