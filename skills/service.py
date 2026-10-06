# -*- coding: utf-8 -*-
"""技能实操：题目数据、练习文件夹、打开文件、判分、打字、程序填空、配置检查、自查卡。

data/skills/<卷key>/      题库包内容（skill.json、material、answer、answer_pdf、img），只读
data/skill_work/<卷key>/  练习文件夹（相当于考试时的“考试文件夹”）：文档.docx/.xlsx/.pptx、图片、web/
进度（每次得分、填写内容）存在 progress.json 的 skills 里（由 db 模块读写）。
"""
import difflib
import glob
import json
import os
import re
import shutil
import sys
import time

from . import grader, netcheck
from .net_answers import ANSWERS as NET_ANSWERS

OFFICE_FILES = {'word': '文档.docx', 'excel': '文档.xlsx', 'ppt': '文档.pptx'}
IMG_EXT = ('.jpg', '.jpeg', '.png', '.gif', '.bmp')

# 信息录入评分表：字/分钟 -> 分
TYPING_TABLE = [(10, 0.5), (11, 1), (12, 1.5), (13, 2), (14, 2.5), (15, 3), (16, 3.5), (17, 4), (18, 4.5), (19, 5), (20, 5.5),
                (21, 6), (22, 6.5), (23, 7), (24, 7.5), (25, 8), (26, 9), (27, 10), (28, 11), (29, 13), (30, 15)]


class Skills:
    def __init__(self, data_dir, store):
        """store：带 skill_get(key) / skill_put(key, dict) 的进度存取对象（db 模块）"""
        self.root = os.path.join(data_dir, 'skills')
        self.work = os.path.join(data_dir, 'skill_work')
        self.store = store
        self._cache = {}

    # ---------------------------------------------------------------- 题目
    def keys(self):
        if not os.path.isdir(self.root):
            return []
        ks = [k for k in os.listdir(self.root) if os.path.exists(os.path.join(self.root, k, 'skill.json'))]
        return sorted(ks, key=lambda k: (k.split('-')[0] != 'comp', k))

    def skill(self, key):
        path = os.path.join(self.root, key, 'skill.json')
        if not os.path.exists(path):
            raise KeyError('没有这套技能卷：%s' % key)
        mt = os.path.getmtime(path)
        if key not in self._cache or self._cache[key][0] != mt:
            with open(path, encoding='utf-8') as f:
                self._cache[key] = (mt, json.load(f))
        return self._cache[key][1]

    def module(self, key, mid):
        s = self.skill(key)
        m = next((m for m in s['modules'] if m['id'] == mid), None)
        if m is None:
            raise KeyError('没有这个模块')
        return m

    def summary(self):
        out = []
        for k in self.keys():
            s = self.skill(k)
            st = self.store.skill_get(k)
            mods = []
            for m in s['modules']:
                h = (st.get('history') or {}).get(m['id']) or []
                mods.append({'id': m['id'], 'title': m['title'], 'points': m['points'], 'kind': m['kind'],
                             'best': max((x['score'] for x in h), default=None), 'last': h[-1]['score'] if h else None,
                             'tries': len(h)})
            best = sum(x['best'] or 0 for x in mods)
            out.append({'key': k, 'name': s['name'], 'direction': s['direction'], 'total': s['total'],
                        'modules': mods, 'best_total': round(best, 2)})
        return out

    def detail(self, key):
        s = json.loads(json.dumps(self.skill(key)))
        st = self.store.skill_get(key)
        work = os.path.join(self.work, key)
        for m in s['modules']:
            m['history'] = (st.get('history') or {}).get(m['id']) or []
            m['saved'] = (st.get('saved') or {}).get(m['id'])
            if m['kind'] == 'office':
                f = os.path.join(work, OFFICE_FILES[m['id']])
                m['work_file'] = f
                m['work_exists'] = os.path.exists(f)
                m['work_mtime'] = time.strftime('%m-%d %H:%M', time.localtime(os.path.getmtime(f))) if os.path.exists(f) else None
                m['answer_pdf'] = 'skill/%s/answer_pdf/%s.pdf' % (key, OFFICE_FILES[m['id']])
                m['can_check'] = grader.has_spec(key, m['id'])
                m['checklist'] = self._checklist(key, m['id'])
            elif m['kind'] == 'web':
                idx = os.path.join(work, 'web', 'index.html')
                m['work_exists'] = os.path.exists(idx)
                m['answer_web'] = 'skill/%s/answer/web/index.html' % key
                m['sample'] = next(('skill/%s/material/%s' % (key, os.path.basename(p))
                                    for p in glob.glob(os.path.join(self.root, key, 'material', '样张_*'))), None)
                m['can_check'] = grader.has_spec(key, 'web')
                m['checklist'] = self._checklist(key, 'web')
            elif m['kind'] == 'netcfg':
                m['devices'] = netcheck.devices_of(m['rubric_items'])
                checks, plan, proto = netcheck.build_checks(m['rubric_items'], m['intro'])
                m['checklist'] = [{'desc': c[0], 'points': c[1], 'manual': c[2] == 'manual'} for c in checks]
                m['protocol'] = proto
                ans = NET_ANSWERS.get(key, {})
                m['answer'] = {'note': ans.get('note', ''), 'configs': {d: ans[d] for d in m['devices'] if d in ans}}
            elif m['kind'] == 'program':
                m['answer_code'] = fill_code(m['code'], [b[0] for b in m['blanks']])
        s['work_dir'] = work
        s['deviations'] = REFERENCE_NOTES.get(key, [])
        return s

    def _checklist(self, key, mid):
        if not grader.has_spec(key, mid):
            return []
        return [[{'desc': c.desc, 'points': c.points} for c in task] for task in grader.SPECS[key][mid]]

    # ---------------------------------------------------------------- 练习文件夹
    def start(self, key, mid, reset=True):
        """把该模块的素材复制到练习文件夹；reset=False 时已有文件就保留（继续上次）"""
        src = os.path.join(self.root, key, 'material')
        work = os.path.join(self.work, key)
        os.makedirs(work, exist_ok=True)
        m = self.module(key, mid)
        if m['kind'] == 'office':
            f = OFFICE_FILES[mid]
            dst = os.path.join(work, f)
            if reset or not os.path.exists(dst):
                _copy_replace(os.path.join(src, f), dst)
            for p in os.listdir(src):                              # 题目要用到的图片
                if p.lower().endswith(IMG_EXT) and not p.startswith('样张_') and not os.path.exists(os.path.join(work, p)):
                    shutil.copy(os.path.join(src, p), work)
            return dst
        if m['kind'] == 'web':
            dst = os.path.join(work, 'web')
            if reset or not os.path.exists(dst):
                shutil.rmtree(dst, ignore_errors=True)
                shutil.copytree(os.path.join(src, 'web'), dst)
            return os.path.join(dst, 'index.html')
        raise ValueError('这个模块不需要素材')

    def open(self, key, mid, what):
        """what: work / folder / answer / answer_folder / dreamweaver"""
        work = os.path.join(self.work, key)
        m = self.module(key, mid)
        if what == 'folder':
            target = os.path.join(work, 'web') if m['kind'] == 'web' else work
            if not os.path.exists(target):
                self.start(key, mid, reset=False)
            return _startfile(target)
        if what == 'work':
            if m['kind'] == 'office':
                f = os.path.join(work, OFFICE_FILES[mid])
                if not os.path.exists(f):
                    self.start(key, mid)
                return _startfile(f)
            if m['kind'] == 'web':
                f = os.path.join(work, 'web', 'index.html')
                if not os.path.exists(f):
                    self.start(key, mid)
                dw = find_dreamweaver()
                if dw:
                    import subprocess
                    subprocess.Popen([dw, f])
                    return 'Dreamweaver'
                return _startfile(os.path.join(work, 'web'))
        if what == 'answer':
            if m['kind'] == 'office':
                return _startfile(os.path.join(self.root, key, 'answer', OFFICE_FILES[mid]))
            if m['kind'] == 'web':
                return _startfile(os.path.join(self.root, key, 'answer', 'web'))
        raise ValueError('不支持的操作')

    # ---------------------------------------------------------------- 判分
    def check(self, key, mid):
        work = os.path.join(self.work, key)
        m = self.module(key, mid)
        if m['kind'] == 'office' and not os.path.exists(os.path.join(work, OFFICE_FILES[mid])):
            raise ValueError('还没有开始练习：先点“开始练习”，在 Office 里做完并保存')
        if m['kind'] == 'web' and not os.path.exists(os.path.join(work, 'web')):
            raise ValueError('还没有开始练习：先点“开始练习”')
        locked = _locked_file(work, OFFICE_FILES.get(mid))
        r = grader.grade(key, mid, work)
        r['warning'] = '文件可能还开着或没保存：先在 Office 里保存（Ctrl+S）再检查' if locked else ''
        self._record(key, mid, r['score'], r['points'])
        return r

    def check_program(self, key, answers):
        m = self.module(key, 'program')
        per = m['points'] / float(len(m['blanks']) or 1)
        out = []
        for i, alts in enumerate(m['blanks']):
            given = (answers[i] if i < len(answers) else '') or ''
            ok = any(norm_code(given) == norm_code(a) for a in alts)
            out.append({'no': i + 1, 'given': given, 'ok': ok, 'answers': alts, 'score': per if ok else 0})
        score = round(sum(x['score'] for x in out), 2)
        self._record(key, 'program', score, m['points'], saved={'answers': answers})
        return {'score': score, 'points': m['points'], 'blanks': out, 'answer_code': fill_code(m['code'], [b[0] for b in m['blanks']])}

    def typing(self, key, typed, seconds):
        m = self.module(key, 'typing')
        r = typing_score(m['text'], typed, seconds)
        self._record(key, 'typing', r['score'], m['points'])
        return r

    def check_net(self, key, configs, manual):
        m = self.module(key, 'netcfg')
        r = netcheck.grade(m['rubric_items'], m['intro'], configs, manual)
        self._record(key, 'netcfg', r['score'], r['points'], saved={'configs': configs, 'manual': manual})
        return r

    def card(self, key, mid, checked):
        """自查卡：checked = {条目序号: True}"""
        m = self.module(key, mid)
        items = card_items(m)
        if isinstance(checked, list):          # 也接受勾选序号的列表
            checked = {str(i): True for i in checked}
        score = round(sum(it['points'] for i, it in enumerate(items) if checked.get(str(i))), 2)
        total = round(sum(it['points'] for it in items), 2)
        self._record(key, mid, score, total, saved={'checked': checked})
        return {'score': score, 'points': total}

    def _record(self, key, mid, score, points, saved=None):
        st = self.store.skill_get(key)
        h = st.setdefault('history', {}).setdefault(mid, [])
        h.append({'t': time.strftime('%Y-%m-%d %H:%M'), 'score': score, 'points': points})
        del h[:-30]
        if saved is not None:
            st.setdefault('saved', {})[mid] = saved
        self.store.skill_put(key, st)


# ====================================================================== 工具

def card_items(m):
    """自查卡条目：计算机组装（小题+评分细则）、综合布线/服务器架设（评分表条目）"""
    if m.get('tasks'):
        return [{'text': t['text'], 'points': t['points'], 'rubric': t.get('rubric', '')} for t in m['tasks']]
    return [{'text': (r['group'].replace('\n', '') + '：' if r['group'] else '') + r['item'], 'points': r['points'], 'rubric': ''}
            for r in m.get('rubric_items', []) if '合计' not in r['item']]


def norm_code(s):
    s = (s or '').strip().rstrip(';').strip()
    s = re.sub(r'\s+', '', s)
    return s.replace('（', '(').replace('）', ')').replace('；', ';')


def fill_code(code, answers):
    out = code
    for i, a in enumerate(answers, 1):
        out = out.replace('【%d】' % i, a)
    return out


def typing_score(src, typed, seconds):
    src = re.sub(r'\s+', '', src or '')
    t = re.sub(r'[\r\n]+', '', typed or '')          # 换行不算；多余的空格按错字算
    # 和原文对齐，统计错字（错字、多字、缺字、多余空格都算错）；只比到考生打到的位置
    ref = src[:max(len(t), 1)]
    sm = difflib.SequenceMatcher(None, ref, t, autojunk=False)
    errors = 0
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op != 'equal':
            errors += max(a2 - a1, b2 - b1)
    minutes = max(seconds, 1) / 60.0
    speed = len(t) / minutes
    base = 0
    for v, p in TYPING_TABLE:
        if speed >= v:
            base = p
    score = max(0.0, round(base - 0.2 * errors, 2))
    return {'chars': len(t), 'errors': errors, 'seconds': int(seconds), 'speed': round(speed, 1),
            'base': base, 'score': score, 'points': 15}


def _copy_replace(src, dst):
    try:
        shutil.copy(src, dst)
    except PermissionError:
        raise ValueError('练习文件正在被 Office 打开，先关闭它再重新开始')


def _locked_file(work, name):
    """Office 打开文件时会生成 ~$ 开头的锁文件"""
    if not name:
        return False
    return os.path.exists(os.path.join(work, '~$' + name[2:])) or os.path.exists(os.path.join(work, '~$' + name))


def _startfile(path):
    if sys.platform != 'win32':
        raise ValueError('只能在 Windows 上打开文件')
    try:
        os.startfile(path)
    except OSError as e:
        ext = os.path.splitext(path)[1]
        if ext:
            raise ValueError('这台电脑没有可以打开 %s 的程序（可以安装 Office 或 WPS）。也可以先用“答案模式”看参考答案。' % ext)
        raise ValueError('打开失败：%s' % e)
    return os.path.basename(path)


def find_dreamweaver():
    """在注册表 App Paths 里找 Dreamweaver"""
    try:
        import winreg
    except ImportError:
        return None
    for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(root, r'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Dreamweaver.exe') as k:
                p = winreg.QueryValueEx(k, None)[0]
                if os.path.exists(p):
                    return p
        except OSError:
            continue
    return None


def can_open(ext):
    """这台电脑有没有关联 ext（如 .docx）的程序"""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, ext) as k:
            prog = winreg.QueryValueEx(k, None)[0]
        return bool(prog)
    except (OSError, ImportError):
        return False


# 参考答案与题目要求不一致的地方（答案模式里提醒；判分以题目要求为准）
REFERENCE_NOTES = {
    'comp-1': ['PowerPoint(1)：参考答案第2张标题没有设置为红色', 'PowerPoint(2)：参考答案第4张标题字号是54磅，题目要求48磅'],
    'comp-2': ['Word(1)：参考答案左右边距是2.54厘米，题目要求3厘米', 'Excel(3)：参考答案没有取消自动筛选按钮',
               '网页设计(1)：参考答案“杭州西湖欢迎您”没有设置粗体'],
}
