# -*- coding: utf-8 -*-
"""模拟考试：按科目蓝图组卷 + 判分。纯函数，不碰存储。

组卷以“单元”为单位抽题：共用同一段材料的题（阅读、完形、对话）整组抽，
不会把一篇阅读拆散。只抽客观题（单选/多选/判断及语文阅读、古诗文单选）。
"""
import random
import re

OBJECTIVE = ('single', 'multi', 'judge', 'reading', 'poem')

# 科目 -> 预设 -> {title, minutes, sections: [(小节名, 卷子key前缀, 题型列表, 题数[, 每题分值[, 筛选]])]}
# 卷子key前缀为 '' 表示该科目全部卷子；每题分值不写就是 1 分；成绩 = 得分 / 总分 × 100
# 英语、思政的结构和分值照老师在学习通上组的练习卷（学测/_学习通/）：
#   英语：单选 35（语音 5、词汇语法 20、图文 10）每题 1 分；对话 2 组、书面表达 1 组、阅读匹配 1 组每空 1 分；
#         完形 1 篇 10 空每空 1 分；阅读理解 4 篇共 35 分（每题 1.75 分），合计 100 分
#   思政：单选 20 共 56.5 分，多选 5 共 14.5 分，判断 10 共 29 分
# 筛选：'match' 只要 5 个选项的配对题（阅读里“为每个人选择合适的……”那种），'comp' 只要其余的阅读题
BLUEPRINTS = {
    'politics': {
        'standard': {'title': '思想政治 模拟卷', 'minutes': 45, 'sections': [
            ('单项选择题', '', ['single'], 20, 2.825),
            ('多项选择题', '', ['multi'], 5, 2.9),
            ('判断题', '', ['judge'], 10, 2.9)]},
    },
    'chinese': {
        'standard': {'title': '语文 模拟卷（客观题）', 'minutes': 40, 'sections': [
            ('基础知识', '', ['single'], 6),
            ('现代文阅读', '', ['reading'], 10),
            ('古诗文阅读', '', ['poem'], 4)]},
    },
    'math': {
        'standard': {'title': '数学 模拟卷（选择题）', 'minutes': 30, 'sections': [
            ('单项选择题', '', ['single'], 13)]},
    },
    'english': {
        'standard': {'title': '英语 模拟卷', 'minutes': 60, 'sections': [
            ('语音辨析', 'english-phonetics', ['single'], 5, 1),
            ('词汇与语法', 'english-vocab', ['single'], 20, 1),
            ('图文理解', 'english-picture', ['single'], 10, 1),
            ('交际对话', 'english-dialogue', ['single'], 10, 1),
            ('书面表达', 'english-writing', ['single'], 5, 1),
            ('阅读匹配', 'english-reading', ['single'], 5, 1, 'match'),
            ('完形填空', 'english-cloze', ['single'], 10, 1),
            ('阅读理解', 'english-reading', ['single', 'judge'], 20, 1.75, 'comp')]},
    },
    'media': {
        'standard': {'title': '数字媒体理论 模拟卷', 'minutes': 60, 'sections': [
            ('单项选择题', '', ['single'], 30),
            ('多项选择题', '', ['multi'], 10),
            ('判断题', '', ['judge'], 20)]},
    },
}
QUICK = {'title': '快速小测', 'minutes': 15, 'count': 20}


def blueprint(subject, preset):
    if preset == 'quick':
        return {'title': '%s' % QUICK['title'], 'minutes': QUICK['minutes'],
                'sections': [('小测', '', list(OBJECTIVE), QUICK['count'], 1)]}
    bp = BLUEPRINTS.get(subject, {}).get(preset)
    if not bp:
        raise ValueError('该科目没有这个组卷方案')
    return bp


def units(pool):
    """把题按 (卷子, 材料) 分组成抽题单元；没有材料的题各自成一个单元。"""
    groups, order = {}, []
    for q in pool:
        k = (q['paper_id'], q['material']) if q.get('material') else ('q', q['id'])
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(q)
    return [sorted(groups[k], key=lambda x: x['qno']) for k in order]


def pick(pool, count, rng):
    """随机抽单元凑够 count 题；大单元放不下就跳过，尽量凑满。"""
    us = units(pool)
    rng.shuffle(us)
    out = []
    for u in us:
        if len(out) >= count:
            break
        if len(out) + len(u) <= count:
            out.extend(u)
    if len(out) < count:           # 剩下的空位用大单元的前几题补上（材料仍完整显示）
        for u in us:
            for q in u:
                if len(out) >= count:
                    break
                if q not in out:
                    out.append(q)
    return out


def is_match(q):
    """配对题：5 个选项（A～E）共用一组，比如“为每个人选择合适的天气”"""
    return len(q.get('options') or []) >= 5


def compose(questions, papers, subject, preset='standard', seed=None):
    """questions/papers 为该科目全部题和卷子。返回 (标题, 分钟, [(小节名, [题...], 每题分值)])"""
    bp = blueprint(subject, preset)
    rng = random.Random(seed)
    pkey = {p['id']: p.get('key', '') for p in papers}
    used = set()
    sections = []
    for sec in bp['sections']:
        name, prefix, types, count = sec[:4]
        points = sec[4] if len(sec) > 4 else 1
        filt = sec[5] if len(sec) > 5 else None
        pool = [q for q in questions
                if q['type'] in types and q['answer'] and q['id'] not in used
                and pkey.get(q['paper_id'], '').startswith(prefix)
                and (filt is None or (filt == 'match') == is_match(q))]
        got = pick(pool, count, rng)
        used.update(q['id'] for q in got)
        if got:
            sections.append((name, got, points))
    if not sections:
        raise ValueError('题库里没有可用于组卷的客观题')
    return bp['title'], bp['minutes'], sections


# 选项里引用了别的选项或字母标号，打乱后会出错：以上都对 / A和B / All of the above / 见材料 / 选项就是图里的 A、B、C
_NO_SHUFFLE = re.compile(r'以上|上述|都(?:对|错|正确|不正确)|(?<![A-Za-z])[A-G]\s*[和与及、,，]\s*[A-G](?![A-Za-z])'
                         r'|^[A-G]{1,4}$|见材料|(?<!可)见图'
                         r'|\b(?:[Aa]ll|[Nn]one|[Bb]oth|[Nn]either) of the above\b|\b[A-G] and [A-G]\b')


def shuffle_perm(q, rng):
    """返回选项的显示顺序（原选项下标列表），不该打乱的题返回 None。
    perm[i] = 显示在第 i 位的原选项下标。"""
    opts = q.get('options') or []
    if q['type'] == 'judge' or len(opts) < 2:
        return None
    if any(_NO_SHUFFLE.search((v or '').strip()) for _, v in opts):
        return None
    perm = list(range(len(opts)))
    rng.shuffle(perm)
    return perm


def shuffled_options(q, perm):
    """按 perm 重排选项并重新标 A、B、C…"""
    return [[chr(65 + i), q['options'][j][1]] for i, j in enumerate(perm)]


def to_original(given, perm):
    """显示字母（如 'BD'）换算回原卷字母。"""
    if not perm or not given:
        return given or ''
    out = []
    for c in given:
        i = ord(c) - 65
        out.append(chr(65 + perm[i]) if 0 <= i < len(perm) else c)
    return ''.join(sorted(out))


def is_right(q, given):
    given = (given or '').strip()
    if not given:
        return False
    if q['type'] == 'multi':
        return ''.join(sorted(given)) == ''.join(sorted(q['answer']))
    return given == q['answer']
