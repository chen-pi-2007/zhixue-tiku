# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""存储层：纯 JSON 文件，无数据库依赖。

data/bank.json      题库内容（卷子 + 题目），可由题库包重新导入，丢了也能重建
data/progress.json  学习进度（复习卡片 + 每次作答日志 + 模拟考试），不可再生，要备份
data/media/         题目图片，题干里写成 [[img:<卷子key>/NNN.png]]

题目用稳定的 key（<卷子key>#<序号>）关联进度。重新导入同一份题库包时，
卷子 key 不变、题目顺序不变，做题记录就还在。
"""
from itertools import zip_longest
import json
import math
import random
import re
import os
import shutil
import threading
import time

import exam as exam_mod
import srs

import appdir

DATA_DIR = appdir.DATA_DIR
BANK_PATH = os.path.join(DATA_DIR, 'bank.json')
PROGRESS_PATH = os.path.join(DATA_DIR, 'progress.json')
MEDIA_DIR = os.path.join(DATA_DIR, 'media')

SUBJECTS = ['chinese', 'math', 'english', 'politics', 'media', 'general']
SELF_TYPES = ('qa', 'dictation', 'essay', 'blank', 'solution')
STUDY_FIELDS = ('stem_cn', 'options_cn', 'material_cn', 'point', 'option_notes', 'phrases', 'evidence')   # 平时练习才显示：翻译、知识点、每个选项错在哪、词组、阅读题的原文依据
# 旧版卷子 → key（第一次升级时用）
LEGACY_KEYS = {'学测2025练习卷1 泛雅格式': 'politics-1'}

_lock = threading.RLock()
_bank = None
_prog = None


# ---------------------------------------------------------------- 读写

def _read_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (ValueError, OSError):
        if os.path.exists(path):
            try:
                shutil.copy(path, path + '.corrupt')
            except OSError:
                pass
        return None


def _write_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _save_bank():
    _write_json(BANK_PATH, _bank)


def _save_prog():
    _write_json(PROGRESS_PATH, _prog)


def _load():
    global _bank, _prog
    if _bank is not None:
        return _bank, _prog
    os.makedirs(DATA_DIR, exist_ok=True)
    bank = _read_json(BANK_PATH) if os.path.exists(BANK_PATH) else None
    if not isinstance(bank, dict):
        bank = {}
    bank.setdefault('papers', [])
    bank.setdefault('questions', [])
    prog = _read_json(PROGRESS_PATH) if os.path.exists(PROGRESS_PATH) else None
    if not isinstance(prog, dict):
        prog = {}
    prog.setdefault('cards', {})
    prog.setdefault('attempts', [])
    prog.setdefault('exams', [])
    prog.setdefault('settings', {'new_per_day': 20})
    prog['settings'].setdefault('exam_date', '2026-11-07')   # 学测日期，首页倒计时
    _bank, _prog = bank, prog
    if bank.get('version') != 2:
        _migrate_v1()
    _merge_seed()
    return _bank, _prog


def _merge_seed():
    """新版程序带来的题库（bank.seed.json）逐卷合并：同 key 的卷子整卷更新（题目 id 和做题记录不变），
    用户自己导入的卷子保留。"""
    seed_path = os.path.join(DATA_DIR, 'bank.seed.json')
    if not os.path.exists(seed_path):
        return
    seed = _read_json(seed_path) or {}
    by_pid = {}
    for q in seed.get('questions', []):
        by_pid.setdefault(q['paper_id'], []).append(q)
    for p in seed.get('papers', []):
        qs = sorted(by_pid.get(p['id'], []), key=lambda q: int(q['key'].rsplit('#', 1)[1]))
        upsert_paper(p['key'], p['name'], p.get('subject', 'general'), qs)
    os.remove(seed_path)


def _migrate_v1():
    """v1：bank.json 里有 records{题目id: 计数}，题目没有 key。"""
    if os.path.exists(BANK_PATH):
        shutil.copy(BANK_PATH, BANK_PATH + '.v1备份')
    used = set()
    for p in _bank['papers']:
        if not p.get('key'):
            k = LEGACY_KEYS.get(p['name']) or _default_key(p)
            while k in used:
                k += '-x'
            p['key'] = k
        used.add(p['key'])
    _assign_question_keys()
    by_id = {q['id']: q for q in _bank['questions']}
    for qid, rec in (_bank.pop('records', None) or {}).items():
        q = by_id.get(int(qid))
        if q:
            _prog['cards'][q['key']] = srs.from_legacy(rec)
            if rec.get('last_time'):
                for _ in range(rec.get('right_count', 0)):
                    _prog['attempts'].append({'k': q['key'], 'ok': True, 't': rec['last_time'], 'm': 'practice'})
                for _ in range(rec.get('wrong_count', 0)):
                    _prog['attempts'].append({'k': q['key'], 'ok': False, 't': rec['last_time'], 'm': 'practice'})
    _prog['attempts'].sort(key=lambda a: a['t'])
    _bank['version'] = 2
    _save_bank()
    _save_prog()


def _default_key(p):
    """语文/数学旧卷名形如《数学》练习卷(3) → math-3"""
    import re
    m = re.search(r'[(（](\d+)[)）]', p['name'])
    return '%s-%s' % (p.get('subject') or 'general', m.group(1) if m else p['id'])


def _assign_question_keys():
    pkey = {p['id']: p['key'] for p in _bank['papers']}
    seq = {}
    for q in sorted(_bank['questions'], key=lambda x: (x['paper_id'], x['id'])):
        n = seq[q['paper_id']] = seq.get(q['paper_id'], 0) + 1
        if not q.get('key'):
            q['key'] = '%s#%d' % (pkey[q['paper_id']], n)


def init():
    with _lock:
        _load()


def reload():
    """热更新放好 bank.seed.json 后调用：重新读文件并合并新题库（做题记录在内存里的都已存盘）"""
    global _bank, _prog
    with _lock:
        _bank = _prog = None
        _load()


def now():
    return time.strftime('%Y-%m-%d %H:%M:%S')


def _next_id(items):
    return max((it['id'] for it in items), default=0) + 1


# ---------------------------------------------------------------- 卷子 / 导入

def _unique_name(name):
    names = set(p['name'] for p in _bank['papers'])
    if name not in names:
        return name
    i = 2
    while '%s (%d)' % (name, i) in names:
        i += 1
    return '%s (%d)' % (name, i)


def upsert_paper(key, name, subject, questions, media_src=None):
    """按卷子 key 新增或整卷替换。同 key 同序号的题沿用原来的题目 id 和进度。"""
    with _lock:
        _load()
        old = next((p for p in _bank['papers'] if p['key'] == key), None)
        if old:
            pid = old['id']
            old.update({'name': name, 'subject': subject, 'total': len(questions), 'updated_at': now()})
        else:
            pid = _next_id(_bank['papers'])
            _bank['papers'].append({'id': pid, 'key': key, 'name': _unique_name(name), 'subject': subject,
                                    'created_at': now(), 'total': len(questions)})
        old_ids = {q['key']: q['id'] for q in _bank['questions'] if q['paper_id'] == pid}
        _bank['questions'] = [q for q in _bank['questions'] if q['paper_id'] != pid]
        nid = max(_next_id(_bank['questions']), max(old_ids.values(), default=0) + 1)
        for i, q in enumerate(questions, 1):
            qk = '%s#%d' % (key, i)
            qid = old_ids.get(qk)
            if qid is None:
                qid, nid = nid, nid + 1
            row = {
                'id': qid, 'key': qk, 'paper_id': pid, 'qno': q.get('qno') or i,
                'type': q['type'], 'stem': q['stem'], 'material': q.get('material') or '',
                'options': q.get('options') or [], 'answer': q.get('answer') or '',
                'analysis': q.get('analysis') or '',
            }
            for f in STUDY_FIELDS:                 # 英语题的中文翻译、知识点（只在平时练习显示）
                if q.get(f):
                    row[f] = q[f]
            for f in ('same_as', 'section'):       # 学习通卷：原题是哪道（共用做题记录）、老师卷上的大题名
                if q.get(f):
                    row[f] = q[f]
            _bank['questions'].append(row)
        if media_src and os.path.isdir(media_src):
            dst = os.path.join(MEDIA_DIR, key)
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(media_src, dst)
        _save_bank()
        return pid, (old or _bank['papers'][-1])['name']


def add_upload(filename, parsed, subject='general'):
    name = os.path.splitext(os.path.basename(filename))[0]
    key = 'upload-%d' % int(time.time() * 1000)
    return upsert_paper(key, name, subject or 'general', parsed['questions'])


def delete_paper(pid):
    with _lock:
        _load()
        p = next((p for p in _bank['papers'] if p['id'] == pid), None)
        if not p:
            return
        keys = [q['key'] for q in _bank['questions'] if q['paper_id'] == pid]
        _bank['papers'] = [x for x in _bank['papers'] if x['id'] != pid]
        _bank['questions'] = [q for q in _bank['questions'] if q['paper_id'] != pid]
        for k in keys:
            _prog['cards'].pop(k, None)
        shutil.rmtree(os.path.join(MEDIA_DIR, p['key']), ignore_errors=True)
        _save_bank()
        _save_prog()


def list_papers():
    with _lock:
        _load()
        cards = _prog['cards']
        qmap = {}
        for q in _bank['questions']:
            qmap.setdefault(q['paper_id'], []).append(q)
        out = []
        for p in sorted(_bank['papers'], key=lambda x: (SUBJECTS.index(x.get('subject', 'general'))
                                                          if x.get('subject') in SUBJECTS else 99, x['key'])):
            qs = qmap.get(p['id'], [])
            cs = [cards[_ck(q)] for q in qs if _ck(q) in cards]
            nmap = {}
            for q in qs:
                nmap[q['type']] = nmap.get(q['type'], 0) + 1
            out.append({
                'id': p['id'], 'key': p['key'], 'name': p['name'], 'created_at': p.get('created_at', ''),
                'total': len(qs), 'subject': p.get('subject', 'general'),
                'gradable': sum(1 for q in qs if q['answer']), 'counts': nmap,
                'seen': len(cs),
                'answered': sum(c['right'] + c['wrong'] for c in cs),
                'correct': sum(c['right'] for c in cs),
                'wrong_open': sum(1 for c in cs if c['in_wrong']),
                'mastery': _round(100 * sum(srs.mastery(c) for c in cs) / len(qs)) if qs else 0,
            })
        return out


# ---------------------------------------------------------------- 题目视图 / 查询

def _papers_by_id():
    return {p['id']: p for p in _bank['papers']}


def _view(q, papers, hide_answer=False):
    c = _prog['cards'].get(_ck(q)) or {}
    p = papers.get(q['paper_id'], {})
    d = dict(q)
    d['paper_name'] = p.get('name', '')
    d['subject'] = p.get('subject', 'general')
    d['wrong_count'] = c.get('wrong', 0)
    d['right_count'] = c.get('right', 0)
    d['in_wrong'] = bool(c.get('in_wrong'))
    d['mastered'] = 1 if (c.get('wrong') and not c.get('in_wrong')) else 0
    d['box'] = c.get('box', 0) if c else None
    d['streak'] = c.get('streak', 0)
    d['due'] = c.get('due', '')
    if hide_answer:                                # 模拟考：不给答案、解析、翻译和知识点
        d['answer'] = ''
        d['analysis'] = ''
        for f in STUDY_FIELDS:
            d.pop(f, None)
    return d


def hidden_subjects():
    """设置里不学的科目（科目 key，技能方向是 skill:<方向>）"""
    return set(_prog['settings'].get('hidden_subjects') or [])


def _round(x, nd=0):
    """四舍五入（逢五进一），和手机端 JS 的 Math.round 一致。Python 自带的 round 是“银行家舍入”，
    6.5 会舍成 6，同样的做题记录在电脑和手机上掌握度会差 1、考试分差 0.1"""
    v = math.floor(x * 10 ** nd + 0.5) / 10 ** nd
    return int(v) if nd == 0 else v


_MATH = [(re.compile(r'\\frac\{([^{}]*)\}\{([^{}]*)\}'), lambda m: _wrap(m.group(1)) + '/' + _wrap(m.group(2))),
         (re.compile(r'\\sqrt\{([^{}]*)\}'), lambda m: '√' + _wrap(m.group(1))),
         (re.compile(r'\^\{([^{}]*)\}'), lambda m: '^' + _wrap(m.group(1))),
         (re.compile(r'_\{([^{}]*)\}'), lambda m: '_' + m.group(1)),
         (re.compile(r'\\cases\{([^{}]*)\}'), lambda m: m.group(1).replace('&', ' ').replace('\\\\', ' '))]


def _wrap(x):
    return '(' + x + ')' if re.search(r'[+−\-×·,\s/]', x) else x


def plain_text(t):
    """数学题里的公式标记 \\(\\frac{1}{2}\\) 换回平常的写法 1/2，搜题时用（搜“1/2”“√3”要能搜到）"""
    if not t or '\\(' not in t:
        return t or ''
    t = t.replace('\\(', '').replace('\\)', '')
    while True:
        old = t
        for pat, fn in _MATH:
            t = pat.sub(fn, t)
        if t == old:
            return t


def _ck(q):
    """这道题的做题记录记在哪个 key 下：学习通卷里的题是题库原题的副本（same_as），和原题共用一份记录，
    在哪边做都算做过这道题，错题本里也只出现一次"""
    return q.get('same_as') or q['key']


def _filter(paper_id=None, subject=None, qtype=None, search=None):
    """没指定卷子和科目时（今日复习、全部随机练、错题本、搜索）跳过不学的科目"""
    papers = _papers_by_id()
    hidden = hidden_subjects() if not (paper_id or subject) else set()
    for q in _bank['questions']:
        if paper_id and q['paper_id'] != paper_id:
            continue
        if not paper_id and q.get('same_as'):     # 副本只在打开那张卷子时出现；按科目统计、复习、错题本、搜索都只算原题
            continue
        s = papers.get(q['paper_id'], {}).get('subject')
        if subject and s != subject:
            continue
        if s in hidden:
            continue
        if qtype and q['type'] != qtype:
            continue
        if search and search not in plain_text(q['stem']) and search not in plain_text(q['material']):
            continue
        yield q


def get_questions(paper_id=None, qtype=None, search=None, limit=50, offset=0, subject=None):
    with _lock:
        _load()
        papers = _papers_by_id()
        qs = sorted(_filter(paper_id, subject, qtype, search), key=lambda x: (x['paper_id'], x['qno'], x['id']))
        return [_view(q, papers) for q in qs[offset:offset + limit]], len(qs)


def _group_material(items):
    """打乱后再把共用材料的题挪到一起，按题号排好，做阅读时不来回跳。"""
    order, groups = [], {}
    for q in items:
        k = (q['paper_id'], q['material']) if q['material'] else ('q', q['id'])
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(q)
    out = []
    for k in order:
        out.extend(sorted(groups[k], key=lambda x: x['qno']))
    return out


WRONG_MIX_MAX = 15      # 错题混练一轮最多带几道错题
WRONG_MIX_FILL = 2      # 每道错题配几道陪练题


def _wrong_mix(pool, cards, rnd):
    """错题混进题海里练：每道错题配 WRONG_MIX_FILL 道陪练题，错题均匀分散开，不扎堆。
    陪练题优先挑「以前错过、后来做对了」的题（最容易再错，顺便巩固），其次是做过的题里记得最不牢的，
    还不够就用没做过的新题补。阅读这类整组材料题不当陪练，免得一组就把错题挤到一起。"""
    wrong, back, seen, fresh = [], [], [], []
    for q in pool:
        c = cards.get(_ck(q))
        if c and c['in_wrong']:
            wrong.append(q)
        elif not q['material'] and q['type'] not in SELF_TYPES:
            if not c:
                fresh.append((0, rnd.random(), q))
            else:
                (back if c['wrong'] else seen).append((c['box'], rnd.random(), q))
    rnd.shuffle(wrong)
    wrong = wrong[:WRONG_MIX_MAX]
    fill = [t[2] for t in sorted(back) + sorted(seen) + fresh][:WRONG_MIX_FILL * len(wrong)]
    rnd.shuffle(fill)
    # 错题均匀插进陪练题里：第 k 道题的位置上，按比例该轮到错题了就放错题
    out, n, wi, fi = [], len(wrong) + len(fill), 0, 0
    for k in range(n):
        if wi < len(wrong) and (k + 1) * len(wrong) // n > wi:
            out.append(wrong[wi])
            wi += 1
        else:
            out.append(fill[fi])
            fi += 1
    return out


def practice_set(paper_id=None, scope='all', shuffle=True, seed=None, subject=None, qtype=None):
    """scope：all 全部、new 没做过的、wrong 错题本里的、wrongmix 错题混进做过的题里练（见 _wrong_mix）"""
    with _lock:
        _load()
        papers = _papers_by_id()
        cards = _prog['cards']
        if scope == 'wrongmix':
            pool = [q for q in _filter(paper_id, subject, qtype) if q['answer']]
            return _group_material([_view(q, papers) for q in _wrong_mix(pool, cards, random.Random(seed))])
        items = []
        for q in _filter(paper_id, subject, qtype):
            if not q['answer']:
                continue
            c = cards.get(_ck(q))
            if scope == 'wrong' and not (c and c['in_wrong']):
                continue
            if scope == 'new' and c:
                continue
            items.append(_view(q, papers))
    if shuffle:
        random.Random(seed).shuffle(items)
    else:
        items.sort(key=lambda x: (x['paper_id'], x['qno']))
    return _group_material(items)


# ---------------------------------------------------------------- 作答 / 错题本 / 今日复习

def record_answer(qid, correct, mode='practice'):
    with _lock:
        _load()
        q = next((x for x in _bank['questions'] if x['id'] == qid), None)
        if not q:
            raise KeyError('题目不存在')
        t = now()
        card, event = srs.apply(_prog['cards'].get(_ck(q)), bool(correct), t)
        _prog['cards'][_ck(q)] = card
        _prog['attempts'].append({'k': _ck(q), 'ok': bool(correct), 't': t, 'm': mode})
        _save_prog()
        return dict(card), event


def mark_mastered(qid, mastered):
    with _lock:
        _load()
        q = next((x for x in _bank['questions'] if x['id'] == qid), None)
        if not q:
            return
        _prog['cards'][_ck(q)] = srs.mark(_prog['cards'].get(_ck(q)), mastered, srs.today_str())
        _save_prog()


def wrong_list(mastered=0, subject=None):
    with _lock:
        _load()
        papers = _papers_by_id()
        items = []
        for q in _filter(subject=subject):
            c = _prog['cards'].get(_ck(q))
            if not c or not c['wrong']:
                continue
            if bool(mastered) == bool(c['in_wrong']):
                continue
            d = _view(q, papers)
            d['last_time'] = c['last']
            items.append(d)
        items.sort(key=lambda x: x['last_time'] or '', reverse=True)
        return items


def _type_accuracy(subject=None, recent=60):
    """各 (科目, 题型) 最近 recent 次作答的正确率，用于“薄弱题型优先”。"""
    papers = _papers_by_id()
    qinfo = {q['key']: (papers.get(q['paper_id'], {}).get('subject'), q['type']) for q in _bank['questions']}
    hist = {}
    for a in reversed(_prog['attempts']):
        k = qinfo.get(a['k'])
        if not k or (subject and k[0] != subject):
            continue
        h = hist.setdefault(k, [])
        if len(h) < recent:
            h.append(a['ok'])
    return {k: sum(v) / float(len(v)) for k, v in hist.items() if v}


EXTRA_SIZE = 20     # 加练一轮的题数


def review_queue(subject=None, new_limit=None, extra=False):
    """今日复习：到期的旧题（错题优先、过期越久越先）+ 若干客观新题（各科轮流，科目内薄弱题型优先）。
    extra=True 是今天的复习做完以后的「加练」：没到期的旧题里挑最薄弱的（错题本里的、记得最不牢的），
    旧题最多占一半，其余是额度以外的新题，一共 EXTRA_SIZE 道，两种交替排开"""
    with _lock:
        _load()
        today = srs.today_str()
        papers = _papers_by_id()
        cards = _prog['cards']
        if new_limit is None:
            new_limit = _new_left(today)
        acc = _type_accuracy(subject)
        due, fresh, ahead = [], {}, []
        for q in _filter(subject=subject):
            if not q['answer']:
                continue
            c = cards.get(_ck(q))
            if c:
                if srs.is_due(c, today):
                    due.append((not c['in_wrong'], c['due'], c['box'], q))
                elif q['type'] not in SELF_TYPES:
                    ahead.append((not c['in_wrong'], c['box'], c['due'], q))
            elif q['type'] not in SELF_TYPES and not (extra and q['material']):
                # 主观题不自动推新题，去科目页按题型练；加练不带阅读这类整组的材料题，免得一组就占满
                subj = papers.get(q['paper_id'], {}).get('subject')
                weak = acc.get((subj, q['type']), 1.0) < 0.7
                fresh.setdefault(subj, []).append((not weak, q['paper_id'], q['qno'], q))
        due.sort(key=lambda x: x[:3])
        if extra:      # 薄弱旧题最多占一半，不够的用新题补满
            new_limit = EXTRA_SIZE - min(len(ahead), EXTRA_SIZE // 2)
        # 新题：各科轮流出，科目内薄弱题型优先、再按卷子顺序推进
        queues = [[t[3] for t in sorted(v, key=lambda x: x[:3])] for _, v in sorted(fresh.items())]
        new_qs = []
        while len(new_qs) < new_limit and any(queues):
            for qq in queues:
                if qq and len(new_qs) < new_limit:
                    new_qs.append(qq.pop(0))
        # 阅读等材料题整组带出，不拆开
        new_qs = _complete_groups(new_qs, [t[3] for v in fresh.values() for t in v])
        if extra:
            ahead.sort(key=lambda x: x[:3])
            old_qs = [t[3] for t in ahead[:max(EXTRA_SIZE - len(new_qs), 0)]]
            mixed = [q for pair in zip_longest(old_qs, new_qs) for q in pair if q]
            items = [_view(q, papers) for q in mixed]
            return {'due': 0, 'ahead': len(old_qs), 'new': len(new_qs), 'items': _group_material(items)}
        items = [_view(t[3], papers) for t in due] + [_view(q, papers) for q in new_qs]
        return {'due': len(due), 'new': len(new_qs), 'items': _group_material(items)}


def _complete_groups(chosen, pool):
    keys = {(q['paper_id'], q['material']) for q in chosen if q['material']}
    ids = {q['id'] for q in chosen}
    return chosen + [q for q in pool if q['material'] and (q['paper_id'], q['material']) in keys and q['id'] not in ids]


def _new_left(today):
    """今天还能学几道新题 = 每日新题数 - 今天第一次做的题数"""
    first_day = {}
    for a in _prog['attempts']:
        first_day.setdefault(a['k'], a['t'][:10])
    done = sum(1 for d in first_day.values() if d == today)
    return max(0, _prog['settings'].get('new_per_day', 20) - done)


def skill_get(key):
    """技能实操进度：{history: {模块: [{t, score, points}]}, saved: {模块: 上次填写的内容}}"""
    with _lock:
        _load()
        return json.loads(json.dumps(_prog.setdefault('skills', {}).get(key) or {}))


def skill_put(key, value):
    with _lock:
        _load()
        _prog.setdefault('skills', {})[key] = value
        _save_prog()


def clear_progress():
    """清除做题记录（复习卡片、作答日志、模拟考、技能成绩），保留设置。
    清除前把 progress.json 备份到 data/backups/，练习文件夹 skill_work/ 一并删除。返回备份文件路径。"""
    global _prog
    with _lock:
        _load()
        os.makedirs(os.path.join(DATA_DIR, 'backups'), exist_ok=True)
        backup = os.path.join(DATA_DIR, 'backups', 'progress-%s.json' % time.strftime('%Y%m%d-%H%M%S'))
        _write_json(backup, _prog)
        settings = _prog.get('settings', {})
        _prog.clear()
        _prog.update({'cards': {}, 'attempts': [], 'exams': [], 'settings': settings, 'skills': {}})
        _save_prog()
        shutil.rmtree(os.path.join(DATA_DIR, 'skill_work'), ignore_errors=True)
        return backup


def set_setting(name, value):
    with _lock:
        _load()
        _prog['settings'][name] = value
        _save_prog()


# ---------------------------------------------------------------- 统计

def _day_streak(days):
    """连续学习天数（今天没做就从昨天往前数）。"""
    d = srs.today_str()
    if d not in days:
        d = srs.add_days(d, -1)
    n = 0
    while d in days:
        n += 1
        d = srs.add_days(d, -1)
    return n


def dashboard():
    with _lock:
        _load()
        today = srs.today_str()
        papers = _papers_by_id()
        cards = _prog['cards']
        acc = _type_accuracy()
        subj = {}
        for q in _bank['questions']:
            if q.get('same_as'):                  # 学习通卷里的副本不重复计数
                continue
            s = papers.get(q['paper_id'], {}).get('subject', 'general')
            d = subj.setdefault(s, {'subject': s, 'total': 0, 'gradable': 0, 'seen': 0, 'right': 0, 'wrong': 0,
                                    'wrong_open': 0, 'due': 0, 'mastery_sum': 0.0, 'types': {}})
            d['total'] += 1
            t = d['types'].setdefault(q['type'], {'type': q['type'], 'total': 0, 'seen': 0, 'mastery_sum': 0.0})
            t['total'] += 1
            if q['answer']:
                d['gradable'] += 1
            c = cards.get(_ck(q))
            if c:
                d['seen'] += 1
                t['seen'] += 1
                d['right'] += c['right']
                d['wrong'] += c['wrong']
                d['wrong_open'] += 1 if c['in_wrong'] else 0
                d['due'] += 1 if (srs.is_due(c, today) and q['answer']) else 0
                d['mastery_sum'] += srs.mastery(c)
                t['mastery_sum'] += srs.mastery(c)
        out = []
        hidden = hidden_subjects()
        for s in sorted(subj, key=lambda x: SUBJECTS.index(x) if x in SUBJECTS else 99):
            d = subj[s]
            d['hidden'] = s in hidden
            d['mastery'] = _round(100 * d.pop('mastery_sum') / d['total']) if d['total'] else 0
            types = []
            for t in d.pop('types').values():
                t['mastery'] = _round(100 * t.pop('mastery_sum') / t['total']) if t['total'] else 0
                a = acc.get((s, t['type']))
                t['accuracy'] = _round(100 * a) if a is not None else None
                types.append(t)
            d['types'] = sorted(types, key=lambda t: -t['total'])
            n = d['right'] + d['wrong']
            d['accuracy'] = _round(100.0 * d['right'] / n, 1) if n else None
            out.append(d)
        days = set(a['t'][:10] for a in _prog['attempts'])
        today_att = [a for a in _prog['attempts'] if a['t'][:10] == today]
        # 每天做题量
        hist = []
        for i in range(41, -1, -1):          # 最近 6 周，首页学习日历用
            day = srs.add_days(today, -i)
            hist.append({'day': day, 'n': sum(1 for a in _prog['attempts'] if a['t'][:10] == day)})
        new_left = _new_left(today)
        rq = review_queue()       # 实际题数：材料题会把同一篇材料的整组题带出来，比每日新题数多
        return {
            'subjects': out,
            'today': {'done': len(today_att), 'right': sum(1 for a in today_att if a['ok']),
                      'due': sum(d['due'] for d in out if not d['hidden']), 'new_left': new_left,
                      'new': len(rq['items']) - rq['due'], 'todo': len(rq['items'])},
            'streak': _day_streak(days),
            'history': hist,
            'wrong_open': sum(d['wrong_open'] for d in out if not d['hidden']),
            'questions': sum(d['total'] for d in out),
            'papers': len(_bank['papers']),
            'settings': _prog['settings'],
            'exams': [_exam_summary(e) for e in reversed(_prog['exams']) if e.get('finished')][:5],
        }


def stats():
    d = dashboard()
    right = sum(s['right'] for s in d['subjects'])
    wrong = sum(s['wrong'] for s in d['subjects'])
    return {'papers': d['papers'], 'questions': d['questions'], 'answered': right + wrong, 'correct': right,
            'accuracy': _round(100.0 * right / (right + wrong), 1) if right + wrong else 0,
            'wrong_open': d['wrong_open']}


# ---------------------------------------------------------------- 模拟考试

def _exam_summary(e):
    return {k: e.get(k) for k in ('id', 'subject', 'title', 'minutes', 'started', 'finished',
                                  'total', 'correct', 'score', 'used_seconds')}


def exam_start(subject, preset='standard'):
    with _lock:
        _load()
        papers = [p for p in _bank['papers'] if p.get('subject') == subject]
        pids = set(p['id'] for p in papers)
        qs = [q for q in _bank['questions'] if q['paper_id'] in pids and q['type'] in exam_mod.OBJECTIVE
              and not q.get('same_as')]
        title, minutes, sections = exam_mod.compose(qs, papers, subject, preset)
        rng = random.Random()
        perms = {}                       # 选项打乱：题目key -> 显示顺序
        for _, g, _pts in sections:
            for q in g:
                pm = exam_mod.shuffle_perm(q, rng)
                if pm:
                    perms[q['key']] = pm
        eid = _next_id(_prog['exams'])
        e = {'id': eid, 'subject': subject, 'preset': preset, 'title': title, 'minutes': minutes,
             'started': now(), 'finished': '', 'perms': perms,
             'sections': [{'name': n, 'keys': [q['key'] for q in g], 'points': pts} for n, g, pts in sections]}
        _prog['exams'].append(e)
        _save_prog()
        return _exam_view(e, hide=True)


def _exam_view(e, hide):
    pb = _papers_by_id()
    by_key = {q['key']: q for q in _bank['questions']}
    secs = []
    for s in e['sections']:
        items = []
        for k in s['keys']:
            q = by_key.get(k)
            if not q:
                continue
            v = _view(q, pb, hide_answer=hide)
            pm = (e.get('perms') or {}).get(k)
            if hide and pm:              # 作答时显示打乱后的选项；报告按原卷顺序，解析里的字母才对得上
                v['options'] = exam_mod.shuffled_options(q, pm)
            if not hide and e.get('answers') is not None:
                v['given'] = e['answers'].get(k, '')
                v['correct'] = exam_mod.is_right(q, v['given'])
            items.append(v)
        secs.append({'name': s['name'], 'items': items, 'points': s.get('points', 1)})
    d = _exam_summary(e)
    d['sections'] = secs
    if not hide:
        d['by_section'] = e.get('by_section')
        d['by_type'] = e.get('by_type')
    return d


def exam_submit(eid, answers, used_seconds=0):
    """answers: {题目id(str): 'A'/'AC'/'对'}"""
    with _lock:
        _load()
        e = next((x for x in _prog['exams'] if x['id'] == eid), None)
        if not e:
            raise KeyError('考试不存在')
        if e.get('finished'):
            return _exam_view(e, hide=False)
        by_key = {q['key']: q for q in _bank['questions']}
        id2key = {str(q['id']): q['key'] for q in _bank['questions']}
        perms = e.get('perms') or {}
        given = {}                       # 交上来的是打乱后的字母，换算回原卷字母再判分
        for i, v in (answers or {}).items():
            if i in id2key:
                k = id2key[i]
                given[k] = exam_mod.to_original(v or '', perms.get(k))
        t = now()
        total = correct = 0
        got_pts = full_pts = 0.0         # 按分值算成绩（老的考试记录没有分值，每题 1 分）
        by_section, by_type = [], {}
        for s in e['sections']:
            sc = st = 0
            pts = s.get('points', 1)
            for k in s['keys']:
                q = by_key.get(k)
                if not q:
                    continue
                ok = exam_mod.is_right(q, given.get(k))
                st += 1
                sc += ok
                bt = by_type.setdefault(q['type'], [0, 0])
                bt[0] += ok
                bt[1] += 1
                # 没作答的题也算错，进复习队列
                card, _ = srs.apply(_prog['cards'].get(k), ok, t)
                _prog['cards'][k] = card
                _prog['attempts'].append({'k': k, 'ok': ok, 't': t, 'm': 'exam'})
            by_section.append({'name': s['name'], 'correct': sc, 'total': st, 'points': pts})
            total += st
            correct += sc
            got_pts += sc * pts
            full_pts += st * pts
        e.update({'answers': given, 'finished': t, 'total': total, 'correct': correct,
                  'score': _round(100.0 * got_pts / full_pts, 1) if full_pts else 0,
                  'used_seconds': int(used_seconds or 0), 'by_section': by_section,
                  'by_type': {k: {'correct': v[0], 'total': v[1]} for k, v in by_type.items()}})
        _save_prog()
        return _exam_view(e, hide=False)


def exam_get(eid):
    with _lock:
        _load()
        e = next((x for x in _prog['exams'] if x['id'] == eid), None)
        if not e:
            raise KeyError('考试不存在')
        return _exam_view(e, hide=not e.get('finished'))


def exam_list():
    with _lock:
        _load()
        return [_exam_summary(e) for e in reversed(_prog['exams'])]


if __name__ == '__main__':
    init()
    print(stats())
