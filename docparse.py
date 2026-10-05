# -*- coding: utf-8 -*-
"""
智能解析引擎:从 docx / txt / md 试卷文档中抽取题目、选项、答案。

支持的主要格式(泛雅/学习通导出格式):
    1.【单选题】题干... A.选项 B.选项 C.选项 D.选项
    答案：A

    21.【是非题】题干...
    答案：对

    31.【多选题】材料...
    A.选项 B.选项
    答案：BD

同时尽力兼容:
    - 选项与题干挤在同一行
    - 多个选项挤在同一行
    - 题目缺题号
    - 材料题多段题干
    - 卷尾集中答案(1.B 2.A 3.D ...)
    - 纯数字题号、无【题型】标签的普通试卷
"""
import io
import re
import zipfile
import xml.etree.ElementTree as ET

W_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

# 题型标签 -> 内部类型
TYPE_MAP = {
    '单选题': 'single', '单选': 'single', '选择题': 'single',
    '多选题': 'multi', '多选': 'multi', '不定项': 'multi', '不定项选择': 'multi',
    '是非题': 'judge', '判断题': 'judge', '判断': 'judge',
    '填空题': 'qa', '简答题': 'qa', '问答题': 'qa', '论述题': 'qa',
    '名词解释': 'qa', '案例分析': 'qa', '计算题': 'qa', '材料题': 'qa',
}
TYPE_NAME = {
    'single': '单选题', 'multi': '多选题', 'judge': '判断题', 'qa': '问答题',
    'reading': '阅读单选', 'poem': '古诗文单选', 'dictation': '默写', 'essay': '作文',
}

# 全角字母转半角(仅用于选项标记识别)
FW_MAP = {ord(c): chr(ord('A') + i) for i, c in enumerate('ＡＢＣＤＥＦＧＨ')}

TAG_RE = re.compile(r'^\s*(?:(\d{1,3})\s*)?[\.、．]?\s*【\s*([^】]{1,10}?)\s*】\s*(.*)$')
NUM_RE = re.compile(r'^\s*(\d{1,3})\s*[\.、．]\s*(\S.*)$')
ANS_RE = re.compile(r'^\s*(?:【|\[)?\s*(?:正确答案|参考答案|答案|答案解析)\s*(?:】|\])?\s*[:：]?\s*(.*)$')
ANALYSIS_RE = re.compile(r'(?:【\s*(?:解析|解释|点拨|分析|解答)\s*】|(?:^|\s)(?:解析|解释|点拨|分析)\s*[:：])')
OPT_MARK_RE = re.compile(r'(?<![A-Za-z0-9])([A-Ha-h])[\.、．]\s*')
KEY_PAIR_RE = re.compile(r'(\d{1,3})\s*[\.、．:：]?\s*([A-Ha-h]|对|错|√|×)(?![\u4e00-\u9fffA-Za-z0-9])')


def is_tag_type(tag):
    if not tag:
        return False
    t = tag.strip()
    return t in TYPE_MAP or t.endswith('题') or t.endswith('选择')


# ---------------------------------------------------------------- 文本抽取

def extract_docx_paras(data):
    """从 docx 二进制中按段落抽取文本"""
    zf = zipfile.ZipFile(io.BytesIO(data))
    xml = zf.read('word/document.xml')
    root = ET.fromstring(xml)
    paras = []
    for p in root.iter(W_NS + 'p'):
        buf = []
        for node in p.iter():
            if node.tag == W_NS + 't':
                buf.append(node.text or '')
            elif node.tag == W_NS + 'br':
                buf.append('\n')
        paras.append(''.join(buf))
    return paras


def decode_text_paras(data):
    """txt / md:尝试常见编码"""
    for enc in ('utf-8-sig', 'gb18030', 'utf-16'):
        try:
            return data.decode(enc).splitlines()
        except (UnicodeDecodeError, UnicodeError):
            continue
    return data.decode('utf-8', 'replace').splitlines()


def extract_any(data, filename):
    """根据内容判断 docx 还是纯文本"""
    if data[:2] == b'PK':
        try:
            return extract_docx_paras(data)
        except Exception:
            # docx 解析失败(老 .doc 改名等)时降级按文本猜
            pass
    name = (filename or '').lower()
    if name.endswith('.doc'):
        raise ValueError('暂不支持旧版 .doc,请先用 Word 另存为 .docx 再上传')
    if name.endswith('.pdf'):
        raise ValueError('暂不支持 PDF,请先转存为 .docx 或 .txt 再上传')
    return decode_text_paras(data)


# ---------------------------------------------------------------- 选项拆分

def split_options(text):
    """在整段文本中寻找 A. B. C. D. 升序标记链,拆出选项。
    返回 (stem, [[key, text], ...]) 或 None"""
    norm = text.translate(FW_MAP)
    matches = [(m.group(1).upper(), m.start(), m.end()) for m in OPT_MARK_RE.finditer(norm)]
    chain = None
    for i, (letter, s, e) in enumerate(matches):
        if letter != 'A':
            continue
        c = [(letter, s, e)]
        want = 'B'
        for j in range(i + 1, len(matches)):
            if matches[j][0] == want:
                c.append(matches[j])
                want = chr(ord(want) + 1)
                if want > 'H':
                    break
        if len(c) >= 2:
            chain = c
            break
    if not chain:
        return None
    stem = text[:chain[0][1]].strip()
    opts = []
    for k, (letter, s, e) in enumerate(chain):
        end = chain[k + 1][1] if k + 1 < len(chain) else len(text)
        opts.append([letter, text[e:end].strip()])
    return stem, opts


# ---------------------------------------------------------------- 答案规范化

JUDGE_TRUE = ('对', '正确', '√', '是', 'T', 'Y')
JUDGE_FALSE = ('错', '错误', '×', '否', 'F', 'N')


def normalize_choice_answer(ans):
    """选择题答案 -> (字母串, 解析)"""
    m = re.match(r'^\s*([A-Ha-h]{1,8})(?![A-Za-z])\s*[,，。;；\.、）)]?\s*(.*)$', ans.strip())
    if not m:
        return None, ans.strip()
    seen = []
    for ch in m.group(1).upper():
        if ch not in seen:
            seen.append(ch)
    return ''.join(seen), m.group(2).strip()


def normalize_judge_answer(ans):
    a = ans.strip().upper()[:4]
    if not a:
        return None, ''
    for t in JUDGE_TRUE:
        if a.startswith(t.upper()):
            return '对', ''
    for f in JUDGE_FALSE:
        if a.startswith(f.upper()):
            return '错', ''
    return None, ''


def split_analysis(ans_text):
    """把 'BD 解析:xxx' 拆成答案 + 解析"""
    m = ANALYSIS_RE.search(ans_text)
    if m:
        return ans_text[:m.start()].strip(), ans_text[m.end():].strip()
    return ans_text.strip(), ''


# ---------------------------------------------------------------- 卷尾答案表

def extract_answer_key(lines):
    """识别 '1.B 2.A 3.D' 式卷尾答案行,返回 (key_dict, 清理后的行)"""
    key = {}
    cleaned = []
    for ln in lines:
        if not ln.strip():
            cleaned.append(ln)
            continue
        pairs = KEY_PAIR_RE.findall(ln)
        if len(pairs) >= 3 and max(len(re.sub(r'\s', '', p[1])) for p in pairs) <= 2:
            ok = True
            for num, val in pairs:
                v = val.upper()
                if v in ('√',):
                    v = '对'
                elif v in ('×',):
                    v = '错'
                key[int(num)] = v
            if ok:
                continue
        cleaned.append(ln)
    return key, cleaned


# ---------------------------------------------------------------- 语文卷分节

SECTION_RE = re.compile(r'^\s*([一二三四五六七八九十]+)、\s*(.*)$')
SUBSEC_RE = re.compile(r'^\s*[（(][一二三四五六七八九十][)）]\s*$')
VOL_RE = re.compile(r'^\s*第\s*[ⅠⅡⅠVⅣ12一二十]+\s*卷\b')


def classify_section(title):
    """大题标题 -> 题型;识别不了返回 None"""
    t = title or ''
    if '默写' in t:
        return 'dictation'
    if '阅读理解' in t:
        return 'reading'
    if '古代诗文' in t or '古诗文' in t or '文言文' in t:
        return 'poem'
    if '写作' in t or '作文' in t:
        return 'essay'
    if '基础' in t or '语言运用' in t:
        return 'single'
    if '实践' in t or '应用' in t or '表达' in t:
        return 'qa'
    return None


# ---------------------------------------------------------------- 主解析流程

def parse_lines(lines, filename=''):
    # docx 段落内可能含软换行(w:br),先拆平成单行再走状态机
    lines = [sub for ln in lines for sub in ln.split('\n')]
    # 卷尾答案表先抽走,避免干扰题目切分
    key, lines = extract_answer_key(lines)

    head_lines = []
    questions = []
    cur = None  # {'num','tag','body':[...],'answer':[...],'in_answer':False,'prefix'}
    material = []   # 语文卷:当前子节的阅读/情境材料,挂在后续每道题的题干前
    cur_type = None  # 语文卷:当前大题的题型
    last_num = 0     # 上一题号(用于防材料里的数字行误判 + 识别紧接标题的题号)
    doc_has_tags = any(TAG_RE.match(ln) and is_tag_type(TAG_RE.match(ln).group(2)) for ln in lines if ln.strip())

    def close():
        nonlocal cur
        if cur is not None:
            questions.append(cur)
        cur = None

    def start(num, tag, body_text):
        nonlocal cur, last_num
        close()
        last_num = int(num)
        cur = {'num': num, 'tag': tag,
               'body': [body_text], 'answer': [], 'in_answer': False,
               'material': '\n'.join(material)}

    for ln in lines:
        if not ln.strip():
            continue
        sec_m = SECTION_RE.match(ln)
        if sec_m:
            t = classify_section(sec_m.group(2))
            if t:
                close()
                cur_type = t
                material = []
                # 标题行末尾可能紧跟题号,如"六、写作(……)28.阅读下面的材料……"
                tail = re.search(r'(?<![0-9])(\d{1,3})\s*[\.、．]\s*(\S.*)$', sec_m.group(2))
                if tail:
                    start(tail.group(1), cur_type, tail.group(2))
                continue
        if SUBSEC_RE.match(ln):
            # 子节切换:先结束当前题,让后续材料正确累积到新子节
            close()
            material = []
            continue
        if VOL_RE.match(ln):
            continue
        tag_m = TAG_RE.match(ln)
        if tag_m and is_tag_type(tag_m.group(2)):
            close()
            material = []
            cur = {'num': tag_m.group(1), 'tag': TYPE_MAP.get(tag_m.group(2).strip(), 'qa'),
                   'body': [tag_m.group(3) or ''], 'answer': [], 'in_answer': False, 'prefix': ''}
            continue
        ans_m = ANS_RE.match(ln)
        if cur is not None and ans_m and ans_m.group(1).strip():
            cur['in_answer'] = True
            cur['answer'].append(ans_m.group(1))
            continue
        num_m = NUM_RE.match(ln)
        if not num_m and cur_type:
            # 语文卷特例:个别题号后漏了点号,如"25是故无贵无贱……"
            # 只接受"数字+紧跟汉字"且正好是下一题号的情况,防止把材料里的日期当题号
            lm = re.match(r'^\s*(\d{1,3})\s*(\S.*)$', ln)
            if lm and lm.group(2) and '\u4e00' <= lm.group(2)[0] <= '\u9fff':
                try:
                    nv = int(lm.group(1))
                except ValueError:
                    nv = -1
                if nv == last_num + 1:
                    num_m = lm
        if num_m and not doc_has_tags:
            # 无【题型】标签的编号试卷(含语文卷):题号行一律视为新题开始
            start(num_m.group(1), cur_type, num_m.group(2))
            continue
        if cur is None:
            if cur_type:
                material.append(ln)
            else:
                head_lines.append(ln)
        elif cur['in_answer']:
            cur['answer'].append(ln.strip())
        else:
            cur['body'].append(ln)
    close()

    # ---- 逐题整理
    result = []
    running_no = 0
    for q in questions:
        running_no += 1
        qno = int(q['num']) if q['num'] else None
        body = '\n'.join(x for x in q['body'] if x).strip()
        ans_full = '\n'.join(q['answer']).strip()

        ans_part, analysis = split_analysis(ans_full)
        opts = None
        if body:
            split = split_options(body)
            if split:
                body, opts = split

        qtype = q['tag']
        answer = ''
        if qtype in ('single', 'multi') or opts:
            letters, extra = normalize_choice_answer(ans_part)
            if letters:
                answer = letters
                if not qtype:
                    qtype = 'multi' if len(letters) > 1 else 'single'
                if extra:
                    analysis = (analysis + '\n' + extra).strip()
            elif not qtype:
                qtype = None
        if qtype == 'judge' or (not answer and not qtype):
            j, _ = normalize_judge_answer(ans_part)
            if j:
                answer = j
                if not qtype:
                    qtype = 'judge'
        if not qtype:
            qtype = 'qa' if len(ans_part) > 30 or not opts else ('single' if opts else 'qa')
        if qtype == 'qa' and not answer:
            answer = ans_full
            analysis = ''

        # 卷尾答案表补漏
        if not answer and qno and qno in key:
            v = key.pop(qno)
            if qtype in ('single', 'multi'):
                letters, _ = normalize_choice_answer(v)
                if letters:
                    answer = letters
                    if qtype == 'single' and len(letters) > 1:
                        qtype = 'multi'
            elif qtype == 'judge':
                j, _ = normalize_judge_answer(v)
                if j:
                    answer = j
        # 判断题但答案写成了字母 -> 猜 A=对 B=错 常见排布
        if qtype == 'judge' and answer in ('A', 'B') and not opts:
            answer = '对' if answer == 'A' else '错'
        # 有选项但类型被标成判断,纠正为单选
        if qtype == 'judge' and opts:
            qtype = 'single'

        if not body:
            continue
        result.append({
            'qno': qno if qno is not None else running_no,
            'type': qtype,
            'stem': body,
            'material': q.get('material') or '',
            'options': opts if opts else [],
            'answer': answer,
            'analysis': analysis,
        })

    # ---- 题号重排(缺号顺延)
    fixed_no = 0
    prev = 0
    for item in result:
        if item['qno'] is None or item['qno'] <= prev:
            fixed_no += 1
            item['qno'] = fixed_no
        else:
            fixed_no = item['qno']
        prev = item['qno']

    title = ''
    for h in head_lines:
        if h.strip():
            title = h.strip()
            break
    by_type = {}
    for item in result:
        by_type[item['type']] = by_type.get(item['type'], 0) + 1
    return {
        'questions': result,
        'by_type': by_type,
        'title': title,
        'head': head_lines,
        'unused_key': key,
    }


def parse_bytes(data, filename=''):
    paras = extract_any(data, filename)
    res = parse_lines(paras, filename)
    res['filename'] = filename
    return res


# ---------------------------------------------------------------- CLI 自测

if __name__ == '__main__':
    import sys
    import json
    path = sys.argv[1]
    with open(path, 'rb') as f:
        r = parse_bytes(f.read(), path)
    print('总题数:', len(r['questions']), ' 分布:', r['by_type'])
    print('标题猜测:', r['title'])
    noans = [q for q in r['questions'] if not q['answer']]
    print('无答案题:', [q['qno'] for q in noans])
    for q in r['questions'][:3] + r['questions'][19:23] + r['questions'][-2:]:
        print('---', q['qno'], q['type'], '| ans=', repr(q['answer']), '| opts=', len(q['options']))
        print('stem:', q['stem'][:60].replace('\n', ' / '))
        for k, t in q['options'][:4]:
            print('   ', k, t[:30])
