# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
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
import os
import posixpath
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
    # 标准格式（to_text）用的细分题型，导回来不变
    '阅读单选': 'reading', '古诗文单选': 'poem', '默写': 'dictation', '作文': 'essay', '解答题': 'solution',
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
# 问答题的答案里常有“分析：”这类字样，只认单独起一行的“解析：”/【解析】才拆出解析
SELF_ANALYSIS_RE = re.compile(r'\n\s*(?:【\s*解析\s*】|解析\s*[:：])')
OPT_MARK_RE = re.compile(r'(?<![A-Za-z0-9])([A-Ha-h])[\.、．]\s*')
# 答案后面可以紧跟下一个题号（答案页常写成 1.C2.A3.A），但不能跟着字母、汉字或别的数字；多选写成 2.ABD
KEY_PAIR_RE = re.compile(r'(\d{1,3})\s*[\.、．:：]?\s*([A-Ha-h]{1,8}|对|错|√|×)(?![\u4e00-\u9fffA-Za-z])(?!\d+(?!\d)(?![\.、．:：]))')


def is_tag_type(tag):
    if not tag:
        return False
    t = tag.strip()
    return t in TYPE_MAP or t.endswith('题') or t.endswith('选择')


# ---------------------------------------------------------------- 文本抽取

R_NS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
A_BLIP = '{http://schemas.openxmlformats.org/drawingml/2006/main}blip'
V_IMAGEDATA = '{urn:schemas-microsoft-com:vml}imagedata'
MC_FALLBACK = '{http://schemas.openxmlformats.org/markup-compatibility/2006}Fallback'
WEB_IMAGE = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')      # 浏览器能直接显示的图片


def extract_docx_paras(data, save_image=None):
    """从 docx 二进制中按段落抽取文本。
    图片：传了 save_image(扩展名, 图片字节) -> 存放路径，就把图片存起来、原位置写成 [[img:路径]]（导入整理台用）；
    没传，或者是浏览器显示不了的（EMF / WMF 矢量图、公式对象），写成 [图片] 记号，预览里标“有图”"""
    zf = zipfile.ZipFile(io.BytesIO(data))
    xml = zf.read('word/document.xml')
    root = ET.fromstring(xml)
    rels = {}
    try:
        for r in ET.fromstring(zf.read('word/_rels/document.xml.rels')):
            rels[r.get('Id')] = r.get('Target') or ''
    except (KeyError, ET.ParseError):
        pass
    saved = {}

    def image(rid):
        target = rels.get(rid or '')
        if not target or not save_image or target.startswith('http'):
            return None
        path = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('word', target))
        if os.path.splitext(path)[1].lower() not in WEB_IMAGE:
            return None
        if path not in saved:
            try:
                saved[path] = save_image(os.path.splitext(path)[1].lower(), zf.read(path))
            except KeyError:
                saved[path] = None
        return saved[path]

    paras = []
    for p in root.iter(W_NS + 'p'):
        # 新版 Word 的图片写两份：mc:Choice 里的 drawing 和 mc:Fallback 里给老版本看的 pict，只认前一份
        skip = set()
        for fb in p.iter(MC_FALLBACK):
            skip.update(fb.iter())
        buf = []
        for node in p.iter():
            if node in skip:
                continue
            if node.tag == W_NS + 't':
                buf.append(node.text or '')
            elif node.tag == W_NS + 'br':
                buf.append('\n')
            elif node.tag in (W_NS + 'drawing', W_NS + 'pict', W_NS + 'object'):
                ref = None
                if node.tag != W_NS + 'object':          # object 是公式等嵌入对象，里面那张是 WMF 预览图，显示不了
                    for b in node.iter():
                        if b.tag == A_BLIP:
                            ref = image(b.get(R_NS + 'embed'))
                            break
                        if b.tag == V_IMAGEDATA:
                            ref = image(b.get(R_NS + 'id'))
                            break
                buf.append('[[img:%s]]' % ref if ref else '[图片]')
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


def extract_any(data, filename, save_image=None):
    """根据内容判断 docx 还是纯文本；save_image 见 extract_docx_paras"""
    if data[:2] == b'PK':
        try:
            return extract_docx_paras(data, save_image)
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
    # 先找从行首的“A.”开始的链：题干里本身有“A、B、C 三个控件”这种字时，不把它当成选项
    at_line = lambda s: s == 0 or norm[:s].rstrip(' \t　').endswith('\n')
    for need_line in (True, False):
        for i, (letter, s, e) in enumerate(matches):
            if letter != 'A' or (need_line and not at_line(s)):
                continue
            c = [(letter, s, e)]
            want = 'B'
            for j in range(i + 1, len(matches)):
                if matches[j][0] == want and (not need_line or at_line(matches[j][1])):
                    c.append(matches[j])
                    want = chr(ord(want) + 1)
                    if want > 'H':
                        break
            if len(c) >= 2:
                chain = c
                break
        if chain:
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

# 1-5 CABDA、11~15 对错对对错：一段题号连着一串答案
RANGE_KEY_RE = re.compile(r'(\d{1,3})\s*[-~～—–至到]\s*(\d{1,3})\s*[\.、．:：]?\s*([A-Ha-h对错√×]{2,})')
KEY_HEAD_RE = re.compile(r'^\s*(?:【\s*)?(?:参考答案|正确答案|答案速查|答案)(?:\s*】)?\s*[:：]?\s*')


def _key_val(v):
    v = v.upper()
    return {'√': '对', '×': '错'}.get(v, v)


def extract_answer_key(lines):
    """识别卷尾（或粘贴进来的）答案表：'1.B 2.A 3.D'、'1.C2.A3.A'、'1-5 CABDA'。
    返回 (key_dict, 清理后的行)。答案表那几行换成空行而不是删掉，行号和原文对得上（预览点题跳回原文要用）"""
    key = {}
    cleaned = []
    for ln in lines:
        s = ln.strip()
        if not s:
            cleaned.append(ln)
            continue
        body = KEY_HEAD_RE.sub('', s)
        got = {}
        for m in RANGE_KEY_RE.finditer(body):
            a, b, vals = int(m.group(1)), int(m.group(2)), m.group(3)
            if b >= a and b - a + 1 == len(vals):
                for i, v in enumerate(vals):
                    got[a + i] = _key_val(v)
        rest = RANGE_KEY_RE.sub(' ', body) if got else body
        pairs = KEY_PAIR_RE.findall(rest)
        left = re.sub(r'[\s,，;；。、]', '', KEY_PAIR_RE.sub('', rest))
        # 整行只有答案（题号段 + 单个题号），才算答案表；只有零散几个“1.A”的普通句子不算。
        # 开头写着“参考答案：”的（整理台「粘贴答案」就这样加）：有一个就算，剩下的只能是“5.略”这种题号加一两个字；
        # “答案：（1）2a+b=…”这种一道题的解答不算
        junk = re.sub(r'(?:^|\s)\d{1,3}\s*[\.、．:：]?\s*[^\s\d]{1,2}(?=\s|$)', ' ', KEY_PAIR_RE.sub(' ', rest))
        headed = bool(re.match(r'^\s*(?:【\s*)?(?:参考答案|答案速查)', s)) and not re.sub(r'[\s,，;；。、]', '', junk)
        if (got and not left) or len(pairs) >= 3 or (headed and (got or pairs)):
            for num, val in pairs:
                got[int(num)] = _key_val(val)
            key.update(got)
            cleaned.append('')
            continue
        cleaned.append(ln)
    return key, cleaned


# ---------------------------------------------------------------- 语文卷分节

SECTION_RE = re.compile(r'^\s*([一二三四五六七八九十]+)、\s*(.*)$')
SUBSEC_RE = re.compile(r'^\s*[（(][一二三四五六七八九十][)）]\s*$')
VOL_RE = re.compile(r'^\s*第\s*[ⅠⅡⅠVⅣ12一二十]+\s*卷\b')
# 标准格式的扩展：【材料】……（下面几道题）……【材料结束】，一段材料和下面几道题连成一篇
MAT_OPEN_RE = re.compile(r'^\s*【\s*(?:阅读)?材料\s*】\s*(.*)$')
MAT_CLOSE_RE = re.compile(r'^\s*【\s*材料结束\s*】\s*$')
DOUBT_RE = re.compile(r'^\s*【\s*存疑\s*】\s*(.*)$')           # AI 整理时拿不准的地方（提示词要求这样标）


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
    # 老师卷常见的“二、多项选择题”“三、判断题”：没有【题型】标签时靠大题标题定题型
    if '多项选择' in t or '多选' in t or '不定项' in t:
        return 'multi'
    if '判断' in t or '是非' in t:
        return 'judge'
    if '单项选择' in t or '单选' in t or '选择题' in t:
        return 'single'
    if any(w in t for w in ('问答', '简答', '材料分析', '综合题', '论述', '解答', '计算题', '填空')):
        return 'qa'
    if '基础' in t or '语言运用' in t:
        return 'single'
    if '实践' in t or '应用' in t or '表达' in t:
        return 'qa'
    return None


# ---------------------------------------------------------------- 题型推断

OPT_LINE_RE = re.compile(r'^\s*[A-Ha-hＡ-Ｈ]\s*[\.、．]')
BLANK_END_RE = re.compile(r'[（(]\s*[）)]\s*[。.]?\s*$')        # 题干末尾的“（ ）”：判断题常见
MULTI_HINT_RE = re.compile(r'多选|多项|不定项|哪些|正确的有|错误的有|至少有两')
TITLE_HINT_RE = re.compile(r'练习卷|试卷|试题|测试|考试|姓名|班级|学号|得分|总分|时间[:：]')


def _finish(raw, key):
    """切好的题（body / answer 行）-> 题目。题型：标签 / 大题标题优先，其次看答案和选项的样子。
    flags：no_answer 没答案；type_guess 题型是猜的（没有标签、大题标题，也没有能定题型的答案）；has_image 原文有图（导入不了）；
    doubt AI 整理时标了【存疑】"""
    result = []
    running_no = 0
    for q in raw:
        running_no += 1
        qno = int(q['num']) if q.get('num') else None
        body = '\n'.join(x for x in q['body'] if x).strip()
        ans_full = '\n'.join(q['answer']).strip()
        ans_part, analysis = split_analysis(ans_full)
        opts = None
        if body:
            split = split_options(body)
            if split:
                body, opts = split
        if not body:
            continue
        kno = qno or running_no                          # 没题号的卷子按第几道题对
        if not ans_part and kno in key:                  # 卷尾答案表补上
            ans_part = key.pop(kno)

        qtype = q.get('tag')
        guessed = not qtype
        answer = ''
        if qtype in ('single', 'multi', 'reading', 'poem') or (opts and not qtype):
            letters, extra = normalize_choice_answer(ans_part)
            if letters:
                answer = letters
                if not qtype:
                    qtype = 'multi' if len(letters) > 1 else 'single'
                    guessed = False
                elif qtype == 'single' and len(letters) > 1:
                    qtype = 'multi'
                if extra:
                    analysis = (analysis + '\n' + extra).strip()
        if not answer and (qtype == 'judge' or not opts):
            j, _ = normalize_judge_answer(ans_part)
            if j and (qtype in (None, 'judge')):
                answer = j
                if not qtype:
                    qtype = 'judge'
                    guessed = False
        # 判断题但答案写成了字母（“正确的选 A，错误的选 B”）
        if qtype == 'judge' and not answer and not opts and ans_part[:1].upper() in ('A', 'B'):
            answer = '对' if ans_part[:1].upper() == 'A' else '错'
        if qtype == 'judge' and opts:                     # 有选项却标成判断：其实是单选
            qtype = 'single'
            letters, _ = normalize_choice_answer(ans_part)
            answer = letters or ''
        if not qtype:
            if opts:
                qtype = 'multi' if MULTI_HINT_RE.search(body) else 'single'
            elif BLANK_END_RE.search(body):
                qtype = 'judge'
            else:
                qtype = 'qa'
        if qtype in ('qa', 'dictation', 'essay', 'blank', 'solution') and not answer:
            m = SELF_ANALYSIS_RE.search(ans_full)
            answer, analysis = (ans_full[:m.start()].strip(), ans_full[m.end():].strip()) if m else (ans_full, '')

        flags = []
        if not answer:
            flags.append('no_answer')
        if guessed and qtype != 'qa':
            flags.append('type_guess')
        if '[图片]' in body or any('[图片]' in o[1] for o in (opts or [])):
            flags.append('has_image')
        if q.get('doubt'):
            flags.append('doubt')
        result.append({
            'qno': qno if qno is not None else running_no,
            'type': qtype,
            'stem': body,
            'material': q.get('material') or '',
            'options': opts if opts else [],
            'answer': answer,
            'analysis': analysis,
            'line': q.get('line', 0),
            'end': q.get('end', q.get('line', 0)),
            'flags': flags,
            'doubt': q.get('doubt') or '',
        })

    # 题号重排(缺号顺延)
    fixed_no = 0
    prev = 0
    for item in result:
        if item['qno'] is None or item['qno'] <= prev:
            fixed_no += 1
            item['qno'] = fixed_no
        else:
            fixed_no = item['qno']
        prev = item['qno']
    return result


# ---------------------------------------------------------------- 主解析流程

def _parse_numbered(lines):
    """有题号（或【题型】标签）的卷子：题号行 / 标签行开始一道新题。返回 (切好的题, 卷首的行)"""
    head_lines = []
    questions = []
    cur = None
    material = []    # 语文卷:当前子节的阅读/情境材料,挂在后续每道题的题干前
    group = None     # 【材料】块：None 不在块里；列表 = 块里的材料
    collecting = False
    cur_type = None  # 当前大题的题型
    last_num = 0     # 上一题号(用于防材料里的数字行误判 + 识别紧接标题的题号)
    doc_has_tags = any(TAG_RE.match(ln) and is_tag_type(TAG_RE.match(ln).group(2)) for ln in lines if ln.strip())

    def close():
        nonlocal cur
        if cur is not None:
            questions.append(cur)
        cur = None

    def mat_now():
        return '\n'.join(group) if group is not None else '\n'.join(material)

    def start(i, num, tag, body_text):
        nonlocal cur, last_num, collecting
        close()
        collecting = False
        if num:
            last_num = int(num)
        cur = {'num': num, 'tag': tag, 'body': [body_text], 'answer': [], 'in_answer': False,
               'material': mat_now(), 'line': i, 'end': i}

    for i, ln in enumerate(lines):
        if not ln.strip():
            continue
        dm = DOUBT_RE.match(ln)
        if dm:
            if cur is not None:
                cur['doubt'] = ((cur.get('doubt') or '') + ' ' + dm.group(1)).strip()
                cur['end'] = i
            continue
        mo = MAT_OPEN_RE.match(ln)
        if mo:
            close()
            group = [mo.group(1)] if mo.group(1).strip() else []
            collecting = True
            continue
        if MAT_CLOSE_RE.match(ln):
            close()
            group = None
            collecting = False
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
                    start(i, tail.group(1), cur_type, tail.group(2))
                continue
        if SUBSEC_RE.match(ln):
            close()
            material = []
            continue
        if VOL_RE.match(ln):
            continue
        tag_m = TAG_RE.match(ln)
        if tag_m and is_tag_type(tag_m.group(2)):
            start(i, tag_m.group(1), TYPE_MAP.get(tag_m.group(2).strip(), 'qa'), tag_m.group(3) or '')
            continue
        ans_m = ANS_RE.match(ln)
        if cur is not None and ans_m and ans_m.group(1).strip():
            cur['in_answer'] = True
            cur['answer'].append(ans_m.group(1))
            cur['end'] = i
            continue
        num_m = NUM_RE.match(ln)
        if not num_m and cur_type:
            # 语文卷特例:个别题号后漏了点号,如"25是故无贵无贱……"
            # 只接受"数字+紧跟汉字"且正好是下一题号的情况,防止把材料里的日期当题号
            lm = re.match(r'^\s*(\d{1,3})\s*(\S.*)$', ln)
            if lm and lm.group(2) and '一' <= lm.group(2)[0] <= '鿿':
                try:
                    nv = int(lm.group(1))
                except ValueError:
                    nv = -1
                if nv == last_num + 1:
                    num_m = lm
        if num_m and not doc_has_tags and not collecting:
            start(i, num_m.group(1), cur_type, num_m.group(2))
            continue
        if collecting:
            group.append(ln)
        elif cur is None:
            if cur_type:
                material.append(ln)
            else:
                head_lines.append(ln)
        elif cur['in_answer']:
            cur['answer'].append(ln.strip())
            cur['end'] = i
        else:
            cur['body'].append(ln)
            cur['end'] = i
    close()
    return questions, head_lines


def _parse_shape(lines):
    """没题号、没标签的卷子：按“形状”切题——一组选项（和后面的答案行）是一道题的结尾，
    选项后面再出现正文就是下一题；没有选项的题，题干末尾是“（ ）”、下一行又是正文，就是单独一道（多半是判断题）"""
    questions = []
    head = []
    cur = None
    cur_type = None
    group = None

    def new(i, s):
        return {'num': None, 'tag': cur_type, 'body': [s], 'answer': [], 'state': 'stem', 'line': i, 'end': i,
                'material': '\n'.join(group or [])}

    for i, ln in enumerate(lines):
        s = ln.strip()
        if not s:
            continue
        dm = DOUBT_RE.match(s)
        if dm:
            if cur:
                cur['doubt'] = ((cur.get('doubt') or '') + ' ' + dm.group(1)).strip()
            continue
        mo = MAT_OPEN_RE.match(s)
        if mo or MAT_CLOSE_RE.match(s):
            if cur:
                questions.append(cur)
            cur = None
            group = ([mo.group(1)] if mo.group(1).strip() else []) if mo else None
            continue
        sec_m = SECTION_RE.match(s)
        if sec_m and classify_section(sec_m.group(2)):
            if cur:
                questions.append(cur)
            cur = None
            cur_type = classify_section(sec_m.group(2))
            continue
        ans_m = ANS_RE.match(s)
        if ans_m and ans_m.group(1).strip():
            if cur:
                cur['answer'].append(ans_m.group(1))
                cur['state'] = 'ans'
                cur['end'] = i
            continue
        if OPT_LINE_RE.match(s) or (cur and cur['state'] == 'stem' and split_options(s) and split_options(s)[0] == ''):
            if cur and cur['state'] != 'ans':
                cur['body'].append(s)
                cur['state'] = 'opt'
                cur['end'] = i
            continue
        if cur is None:
            cur = new(i, s)
        elif cur['state'] in ('opt', 'ans') or BLANK_END_RE.search(cur['body'][-1]):
            questions.append(cur)
            cur = new(i, s)
        else:
            cur['body'].append(s)
            cur['end'] = i
    if cur:
        questions.append(cur)
    # 第一道题前面的卷名、姓名班级这些行不是题干
    if questions:
        q0 = questions[0]
        while len(q0['body']) > 1 and len(q0['body'][0]) < 40 and TITLE_HINT_RE.search(q0['body'][0]):
            head.append(q0['body'].pop(0))
            q0['line'] += 1
    return questions, head


def parse_lines(lines, filename=''):
    # docx 段落内可能含软换行(w:br),先拆平成单行再走状态机
    lines = [sub for ln in lines for sub in ln.split('\n')]
    # 卷尾答案表先抽走（换成空行，行号不变）,避免干扰题目切分
    key, lines = extract_answer_key(lines)
    raw, head_lines = _parse_numbered(lines)
    mode = 'numbered'
    if not raw:
        raw, head_lines = _parse_shape(lines)
        mode = 'shape'
    result = _finish(raw, key)

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
        'mode': mode,
    }


def parse_bytes(data, filename=''):
    paras = extract_any(data, filename)
    res = parse_lines(paras, filename)
    res['filename'] = filename
    return res


# ---------------------------------------------------------------- 标准格式

STD_TAG = {'single': '单选题', 'multi': '多选题', 'judge': '判断题', 'reading': '阅读单选', 'poem': '古诗文单选',
           'dictation': '默写', 'essay': '作文', 'blank': '填空题', 'solution': '解答题', 'qa': '问答题'}


def to_text(questions, title=''):
    """题目 -> 标准格式文本（泛雅格式 + 【材料】扩展）。导入整理台“补答案 / 修改已导入的卷子”用，导回来题目顺序不变"""
    out = [title, ''] if title else []
    prev = ''
    for i, q in enumerate(questions, 1):
        mat = q.get('material') or ''
        if mat != prev:
            if prev:
                out += ['【材料结束】', '']
            if mat:
                out += ['【材料】'] + mat.split('\n') + ['']
            prev = mat
        out.append('%d.【%s】%s' % (i, STD_TAG.get(q.get('type'), '问答题'), q.get('stem') or ''))
        for k, t in q.get('options') or []:
            out.append('%s.%s' % (k, (t or '').replace('\n', ' ')))
        if q.get('answer'):
            out.append('答案：' + q['answer'])
        if q.get('analysis'):
            out.append('解析：' + q['analysis'].replace('\n', ' '))
        out.append('')
    if prev:
        out.append('【材料结束】')
    return '\n'.join(out).strip() + '\n'


# 复制到免费 AI（豆包、DeepSeek、Kimi……）或者用 API 时的提示词：把随便什么样的卷子整理成标准格式。
# 规则和 to_text / parse_lines 认的格式一致；公式写法和 mathfmt.py、界面 mathHtml 一致
AI_PROMPT = '''你是一个严谨的试卷整理助手。请把我在最后给出的试卷原文，整理成下面规定的格式。只整理格式，不出题、不改题。

【必须遵守】
1. 原文照抄：题干、选项、材料一个字都不要改、不要删、不要润色，也不要纠正原文里你认为的错别字或错误。
2. 不要编造：原文没有的题目、选项、答案、解析一律不要补。原文没给答案的题，就不写“答案：”这一行。
3. 不要自己做题：除非原文里明确写了答案（题后的“答案”、卷尾的答案表、括号里填好的字母等），否则不写答案。
4. 不确定的地方，在那道题的最后单独加一行“【存疑】说明哪里不确定”，不要硬猜。
5. 题目顺序和题号与原文一致，一道都不能漏；原文的大题标题、注意事项、分值说明不用输出。
6. 只输出整理好的内容，不要输出任何解释、开场白或总结。

【每道题的格式】
题号.【题型】题干
A.选项内容
B.选项内容
（有几个选项写几个，每个选项单独一行，字母后面用英文句点）
答案：A
解析：（原文有解析才写）

题型只能用这几种：单选题、多选题、判断题、填空题、问答题。
- 有 A、B、C、D 选项、只选一个的是单选题；能选多个的（题干或大题标题里有“多选”“多项选择”“不定项”）是多选题，答案连写，如 答案：ABD
- 判断对错的是判断题，答案只写“对”或“错”；原文用“正确的选 A，错误的选 B”的，A 写成对、B 写成错
- 填空、简答、材料分析、作文等都写成问答题，原文给了参考答案就照抄在“答案：”后面（可以多行）

【几道题共用一段材料时】（阅读理解、完形填空、材料分析等）
【材料】
材料原文（照抄，可以多段）
然后是这段材料下面的几道题（格式同上）
【材料结束】

【特殊写法】
- 数学公式：分数写成 \\(\\frac{分子}{分母}\\)，根号写成 \\(\\sqrt{被开方式}\\)，乘方写成 \\(x^{2}\\)，下标写成 \\(a_{1}\\)，
  分段函数或方程组写成 \\(\\cases{第一行,&条件\\\\第二行,&条件}\\)；不要用其他 LaTeX 写法，普通文字不要放进公式里。
- 原文的下划线文字写成「文字」，加点字写成〔字〕。
- 原文有图片的地方写“[图片]”，不要描述图片内容。

下面是试卷原文：
'''

AI_TIPS = [
    '一份卷子开一个新对话，别在同一个对话里连着整理好几份——AI 会把上一份的内容记混。',
    '卷子很长（超过 50 道题左右）时分成几段发，每段整理完再发下一段，最后把结果拼起来；一次发太多，AI 容易漏题、后半截偷懒。',
    'AI 有时会“编”：答案、选项可能是它自己补的。粘回来以后看右边的预览，没答案的题显示“缺答案”，标黄的是 AI 说拿不准（【存疑】）的题，对照原卷看一眼。',
    '答案以老师给的为准。AI 给的答案只能当参考，不要直接当标准答案用。',
]


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
