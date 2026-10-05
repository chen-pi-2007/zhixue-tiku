# -*- coding: utf-8 -*-
"""检查项的积木：每个函数返回 fn(ctx) -> (是否通过, 说明)。
ctx 提供 ctx.docx / ctx.xlsx / ctx.pptx / ctx.site（按需加载考生保存的文件）。
说明里写出实际读到的值，答错时能看到错在哪。"""
import re

from .ooxml import CN_SIZE, run_font_ea, run_font_ascii, q, attr

# 标准色
STD = {'红色': 'FF0000', '深红': 'C00000', '橙色': 'FFC000', '黄色': 'FFFF00', '浅绿': '92D050', '绿色': '00B050',
       '浅蓝': '00B0F0', '蓝色': '0070C0', '深蓝': '002060', '紫色': '7030A0'}


class Check:
    def __init__(self, desc, points, fn):
        self.desc, self.points, self.fn = desc, points, fn

    def run(self, ctx):
        try:
            ok, detail = self.fn(ctx)
        except FileNotFoundError:
            ok, detail = False, '没找到保存的文件'
        except Exception as e:                       # 文件损坏、结构不符等
            ok, detail = False, '无法判断（%s）' % e
        return {'desc': self.desc, 'points': self.points, 'ok': bool(ok),
                'score': self.points if ok else 0, 'detail': detail}


T = Check


def _num(v, nd=2):
    return ('%.*f' % (nd, v)).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)


def close(a, b, tol):
    return a is not None and b is not None and abs(a - b) <= tol


def font_ok(actual, want):
    if not actual or not want:
        return False
    a, w = actual.replace(' ', ''), want.replace(' ', '')
    return a == w or a.startswith(w) or (w == '楷体' and a.startswith('楷体')) or (w == '仿宋' and a.startswith('仿宋'))


def size_pt(s):
    return CN_SIZE[s] if isinstance(s, str) else s


def all_ok(items):
    """items: [(ok, 说明)] -> (全部通过, 合并说明)"""
    bad = [d for ok, d in items if not ok]
    return (not bad), ('；'.join(bad) if bad else '；'.join(d for _, d in items))


# ====================================================================== Word：段落选择器

def sel_contains(text):
    def f(d):
        p = d.find(text, d.body_paragraphs) or d.find(text)
        return [p] if p else []
    f.label = '“%s”所在段' % text[:12]
    return f


def sel_body(skip_first=True, exclude=(), only_until=None):
    """正文各段：非空顶层段落，默认跳过标题段；exclude 中文字所在段不算"""
    def f(d):
        ps = d.nonempty()
        if skip_first:
            ps = ps[1:]
        ps = [p for p in ps if not any(e in p.text for e in exclude) and not p.props.get('drop_cap')]
        return ps[:only_until] if only_until else ps
    f.label = '正文各段'
    return f


def sel_nth(*idx):
    """第 n 段（正文非空段落，1 表示标题后的第一段）"""
    def f(d):
        ps = [p for p in d.nonempty()[1:] if not p.props.get('drop_cap')]
        return [ps[i - 1] for i in idx if 0 < i <= len(ps)]
    f.label = '第%s段' % '、'.join(map(str, idx))
    return f


def sel_title():
    def f(d):
        ps = d.nonempty()
        return ps[:1]
    f.label = '标题段'
    return f


def sel_last():
    def f(d):
        ps = [p for p in d.nonempty() if not p.props.get('drop_cap')]
        return ps[-1:]
    f.label = '最后一段'
    return f


def _paras(d, sel):
    ps = sel(d)
    if not ps:
        raise ValueError('找不到%s' % getattr(sel, 'label', '段落'))
    return ps


# ====================================================================== Word：检查项

def w_page(w=None, h=None, left=None, right=None, top=None, bottom=None, tol=0.06):
    def f(ctx):
        pg = ctx.docx.page()
        items = []
        if w is not None or h is not None:
            ok = (w is None or close(pg['w'], w, tol)) and (h is None or close(pg['h'], h, tol))
            items.append((ok, '纸张 %s×%s 厘米' % (_num(pg['w']), _num(pg['h'])) + ('' if ok else '（要求 %s×%s）' % (w, h))))
        for k, v, name in (('left', left, '左'), ('right', right, '右'), ('top', top, '上'), ('bottom', bottom, '下')):
            if v is not None:
                ok = close(pg[k], v, tol)
                items.append((ok, '%s边距 %s 厘米' % (name, _num(pg[k])) + ('' if ok else '（要求 %s）' % v)))
        return all_ok(items)
    return f


def w_bg_image():
    def f(ctx):
        bg = ctx.docx.background()
        return bg == 'image', '页面背景：' + {'image': '图片填充', None: '无'}.get(bg, bg)
    return f


def _run_items(d, runs, east=None, ascii=None, size=None, bold=None, color=None, em=None, char_spacing=None, label=''):
    items = []
    if not runs:
        return [(False, '%s没有文字' % label)]
    def chk(name, getter, want, fmt=lambda v: str(v), eq=lambda a, b: a == b):
        vals = [getter(r) for r in runs]
        bad = [v for v in vals if not eq(v, want)]
        items.append((not bad, '%s%s：%s' % (label, name, fmt(bad[0] if bad else vals[0])) +
                      ('（要求 %s）' % fmt(want) if bad else '')))
    if east is not None:
        chk('中文字体', lambda r: run_font_ea(d, r), east, eq=font_ok)
    if ascii is not None:
        chk('西文字体', lambda r: run_font_ascii(d, r), ascii, eq=font_ok)
    if size is not None:
        chk('字号', lambda r: r.props.get('size'), size_pt(size), fmt=lambda v: '%s磅' % _num(v) if v else '默认',
            eq=lambda a, b: close(a, b, 0.01))
    if bold is not None:
        chk('加粗', lambda r: bool(r.props.get('bold')), bold, fmt=lambda v: '是' if v else '否')
    if color is not None:
        want = STD.get(color, color).upper()
        chk('颜色', lambda r: (r.props.get('color') or 'auto').upper(), want, fmt=lambda v: '#' + v if v != 'AUTO' else '自动')
    if em is not None:
        chk('着重号', lambda r: r.props.get('em') or 'none', 'dot' if em else 'none',
            fmt=lambda v: '有' if v != 'none' else '无', eq=lambda a, b: (a != 'none') == (b != 'none'))
    if char_spacing is not None:
        chk('字符间距加宽', lambda r: r.props.get('char_spacing') or 0, char_spacing, fmt=lambda v: '%s磅' % _num(float(v)),
            eq=lambda a, b: close(float(a), float(b), 0.05))
    return items


def w_font(sel, **kw):
    """所选段落里所有文字的格式"""
    def f(ctx):
        d = ctx.docx
        ps = _paras(d, sel)
        runs = [r for p in ps for r in p.text_runs()]
        return all_ok(_run_items(d, runs, label=getattr(sel, 'label', ''), **kw))
    return f


def runs_matching(p, text):
    """段落里覆盖 text 每次出现的文字块"""
    out = []
    pos = 0
    spans = []
    for r in p.runs:
        spans.append((pos, pos + len(r.text), r))
        pos += len(r.text)
    start = 0
    while True:
        i = p.text.find(text, start)
        if i < 0:
            break
        for a, b, r in spans:
            if a < i + len(text) and b > i and r.text.strip():
                out.append(r)
        start = i + len(text)
    return out


def w_text_font(text, sel=None, **kw):
    """文中所有“text”的文字格式"""
    def f(ctx):
        d = ctx.docx
        ps = sel(d) if sel else d.paragraphs
        runs = [r for p in ps for r in runs_matching(p, text)]
        if not runs:
            return False, '文中找不到“%s”' % text
        return all_ok(_run_items(d, runs, label='“%s”' % text, **kw))
    return f


def w_text_count(text, minimum=1, sel=None, absent=None):
    """文中出现 text（并且不再有 absent）"""
    def f(ctx):
        d = ctx.docx
        ps = sel(d) if sel else d.body_paragraphs
        n = sum(p.text.count(text) for p in ps)
        items = [(n >= minimum, '“%s”出现 %d 处' % (text, n))]
        if absent:
            m = sum(p.text.count(absent) for p in ps)
            items.append((m == 0, '还剩 %d 处“%s”' % (m, absent) if m else '已无“%s”' % absent))
        return all_ok(items)
    return f


def w_para(sel, align=None, before=None, after=None, line_mult=None, line_exact=None, first_chars=None):
    """段落格式。before/after 单位“行”；line_exact 单位磅；first_chars 首行缩进字符数"""
    names = {'center': '居中', 'both': '两端对齐', 'left': '左对齐', 'right': '右对齐', 'start': '左对齐', 'end': '右对齐'}

    def f(ctx):
        d = ctx.docx
        ps = _paras(d, sel)
        items = []
        lab = getattr(sel, 'label', '')
        for p in ps:
            pp = p.props
            if align is not None:
                a = pp.get('align') or 'both'
                a = {'start': 'left', 'end': 'right'}.get(a, a)
                items.append((a == align, '%s对齐：%s' % (lab, names.get(a, a))))
            for key, want, name in (('before', before, '段前'), ('after', after, '段后')):
                if want is None:
                    continue
                lines = pp.get('sp_%sLines' % key)
                tw = pp.get('sp_' + key)
                v = lines / 100.0 if lines is not None else (tw / 312.0 if tw is not None else 0)
                items.append((close(v, want, 0.03), '%s%s %s 行' % (lab, name, _num(round(v, 2)))))
            if line_mult is not None:
                rule, val = pp.get('sp_lineRule', 'auto'), pp.get('sp_line')
                v = val / 240.0 if (rule == 'auto' and val) else (1.0 if val is None else None)
                items.append((v is not None and close(v, line_mult, 0.01),
                              '%s行距 %s' % (lab, ('%s倍' % _num(round(v, 2))) if v is not None else '固定值/最小值')))
            if line_exact is not None:
                rule, val = pp.get('sp_lineRule'), pp.get('sp_line')
                ok = rule == 'exact' and val is not None and close(val / 20.0, line_exact, 0.1)
                items.append((ok, '%s行距 %s' % (lab, ('固定值%s磅' % _num(val / 20.0)) if rule == 'exact' and val else '不是固定值')))
            if first_chars is not None:
                chars = pp.get('ind_firstLineChars')
                tw = pp.get('ind_firstLine')
                sz = next((r.props.get('size') for r in p.text_runs() if r.props.get('size')), 10.5)
                v = chars / 100.0 if chars is not None else (tw / (sz * 20.0) if tw else 0)
                items.append((close(v, first_chars, 0.15), '%s首行缩进 %s 字符' % (lab, _num(round(v, 1)))))
        # 同一项多段只报一次
        merged = {}
        for ok, dsc in items:
            k = dsc.split(' ')[0] if ' ' in dsc else dsc
            if k not in merged or not ok:
                merged[k] = (ok and merged.get(k, (True,))[0], dsc)
        return all_ok(list(merged.values()))
    return f


def w_drop_cap(sel, lines):
    def f(ctx):
        d = ctx.docx
        dc = [p for p in d.body_paragraphs if p.props.get('drop_cap')]
        if not dc:
            return False, '没有设置首字下沉'
        p = dc[0]
        return (p.props.get('drop_cap') == 'drop' and p.props.get('drop_lines') == lines,
                '首字下沉“%s”，%s，下沉 %s 行' % (p.text, '下沉' if p.props.get('drop_cap') == 'drop' else '悬挂', p.props.get('drop_lines')))
    return f


def w_fit_text(text, chars):
    def f(ctx):
        d = ctx.docx
        p = d.find(text)
        if not p:
            return False, '找不到“%s”' % text
        runs = runs_matching(p, text)
        vals = [r.props.get('fit_text') for r in runs]
        sz = next((r.props.get('size') for r in runs if r.props.get('size')), 10.5)
        if not all(vals):
            return False, '“%s”没有调整宽度' % text
        v = vals[0] / (sz * 20.0)
        return close(v, chars, 0.1), '“%s”字符宽度 %s 字符' % (text, _num(round(v, 1)))
    return f


def w_ruby(base):
    def f(ctx):
        d = ctx.docx
        for r in d.doc.iter(q('w:ruby')):
            b = ''.join(x.text or '' for x in r.find(q('w:rubyBase')).iter(q('w:t')))
            t = ''.join(x.text or '' for x in r.find(q('w:rt')).iter(q('w:t')))
            if b and b in base:
                return True, '“%s”已加拼音“%s”' % (b, t)
        return False, '“%s”上方没有拼音指南' % base
    return f


def w_table(rows=None, cols=None, style_has=None, jc=None, autofit=None, near=None, label='表格'):
    """autofit: 'window'（根据窗口）/ 'content'（根据内容）"""
    def f(ctx):
        d = ctx.docx
        ts = d.tables()
        if near:
            ts = [t for t in ts if any(near in c for row in t['texts'] for c in row)] or ts
        if not ts:
            return False, '文中没有表格'
        t = ts[0]
        items = []
        if rows is not None or cols is not None:
            ok = (rows is None or t['rows'] == rows) and (cols is None or t['cols'] == cols)
            items.append((ok, '%s %d 行 %d 列' % (label, t['rows'], t['cols'])))
        if style_has:
            nm = (t['style_name'] or t['style'] or '')
            ok = all(s.lower() in nm.lower().replace(' ', '') for s in style_has)
            items.append((ok, '表格样式：%s' % (nm or '无')))
        if jc:
            items.append((t['jc'] == jc, '表格对齐：%s' % {'center': '居中', None: '默认'}.get(t['jc'], t['jc'])))
        if autofit == 'window':
            items.append((t['width_type'] == 'pct', '表格宽度：%s' % ('按窗口（百分比）' if t['width_type'] == 'pct' else t['width_type'] or '默认')))
        if autofit == 'content':
            ok = t['width_type'] in ('auto', None) and t['layout'] != 'fixed'
            items.append((ok, '表格宽度：%s' % ('根据内容' if ok else t['width_type'])))
        return all_ok(items)
    return f


def w_table_borders(outer_sz, inner_sz, color):
    want = STD.get(color, color)

    def f(ctx):
        ts = ctx.docx.tables()
        if not ts:
            return False, '文中没有表格'
        t = ts[0]
        b = dict(t['borders'])
        # 外框也可能写在单元格上：取单元格边框中出现的最粗值
        for cb in t['cell_borders']:
            for side, v in cb.items():
                if side in ('top', 'left', 'bottom', 'right') and v['sz'] > b.get(side, {'sz': 0})['sz']:
                    b[side] = v
        items = []
        for side in ('top', 'left', 'bottom', 'right'):
            v = b.get(side)
            ok = v and v['val'] == 'single' and close(v['sz'], outer_sz, 0.01) and (v['color'] or '').upper() == want
            items.append((ok, '外框%s：%s' % (side, '%s磅 #%s %s' % (_num(v['sz']), v['color'], v['val']) if v else '无')))
        for side in ('insideH', 'insideV'):
            v = b.get(side)
            ok = v and v['val'] == 'single' and close(v['sz'], inner_sz, 0.01) and (v['color'] or '').upper() == want
            items.append((ok, '内框%s：%s' % ('横线' if side == 'insideH' else '竖线',
                                            '%s磅 #%s' % (_num(v['sz']), v['color']) if v else '无')))
        return all_ok(items)
    return f


def w_para_border_shading(sel, border_sz, border_theme, border_tint, fill_theme, fill_tint, pattern, pattern_theme, pattern_tint):
    def f(ctx):
        d = ctx.docx
        ps = _paras(d, sel)
        p = ps[0]
        items = []
        bd = p.props.get('borders') or {}
        sides = [bd.get(s) for s in ('top', 'left', 'bottom', 'right')]
        ok = all(s and close(s['sz'], border_sz, 0.01) and s['theme'] == border_theme and (s['tint'] or '').upper() == border_tint
                 for s in sides)
        s0 = sides[0]
        items.append((ok, '边框：%s' % ('%s磅 %s 淡色%s' % (_num(s0['sz']), s0['theme'] or s0['color'], s0['tint']) if s0 else '无')))
        sh = p.props.get('shading') or {}
        ok = sh.get('fill_theme') == fill_theme and (sh.get('fill_tint') or '').upper() == fill_tint
        items.append((ok, '底纹填充：%s' % ('%s 淡色%s' % (sh.get('fill_theme') or sh.get('fill'), sh.get('fill_tint')) if sh else '无')))
        ok = sh.get('val') == pattern and sh.get('color_theme') == pattern_theme and (sh.get('color_tint') or '').upper() == pattern_tint
        items.append((ok, '图案：%s %s' % (sh.get('val') or '无', sh.get('color_theme') or sh.get('color') or '')))
        return all_ok(items)
    return f


def w_columns(num, sep, near_text):
    def f(ctx):
        d = ctx.docx
        cols = d.columns()
        hit = [c for c in cols if c['num'] == num]
        if not hit:
            return False, '没有分成 %d 栏' % num
        c = hit[0]
        items = [(True, '已分 %d 栏' % num), (c['sep'] == sep, '分隔线：%s' % ('有' if c['sep'] else '无')),
                 (c['equal'], '栏宽：%s' % ('相等' if c['equal'] else '不相等'))]
        # 分栏只作用于指定段：找出这一节包含的段落（上一个分节符之后，到本节分节符为止）
        if near_text:
            sections, cur = [], []
            for p in d.body_paragraphs:
                cur.append(p)
                s = p.el.find('.//' + q('w:sectPr'))
                if s is not None:
                    sections.append((s, cur))
                    cur = []
            sections.append((d.body.find(q('w:sectPr')), cur))
            mine = next((ps for s, ps in sections if s is c['el']), [])
            texts = [p.text for p in mine if p.text.strip()]
            ok = len(texts) == 1 and near_text in texts[0]
            items.append((ok, '分栏范围：%s' % ('只有第2段' if ok else ('%d 段' % len(texts) if texts else '无'))))
        return all_ok(items)
    return f


def w_picture(w_cm=None, h_cm=None, wrap=None, in_text=None):
    def f(ctx):
        ds = [x for x in ctx.docx.drawings() if x['kind'] == 'pic']
        if not ds:
            return False, '文中没有图片'
        x = ds[0]
        items = []
        if wrap:
            nm = {'wrapSquare': '四周型', 'wrapTight': '紧密型', 'wrapTopAndBottom': '上下型', 'wrapNone': '浮于文字上方',
                  'behind': '衬于文字下方', None: '嵌入型'}
            items.append((x['wrap'] == wrap, '环绕方式：%s' % nm.get(x['wrap'], x['wrap'])))
        if w_cm or h_cm:
            ok = close(x['w_cm'], w_cm, 0.06) and close(x['h_cm'], h_cm, 0.06)
            items.append((ok, '图片 高%s×宽%s 厘米' % (_num(x['h_cm']), _num(x['w_cm']))))
        if in_text:
            items.append((in_text in x['para'].text, '图片位置：%s' % ('第3段' if in_text in x['para'].text else '“%s…”段' % x['para'].text[:8])))
        return all_ok(items)
    return f


def w_footnote(anchor_text, note):
    def f(ctx):
        d = ctx.docx
        fn = d.footnotes()
        items = [(any(note.rstrip('。') in x for x in fn), '脚注内容：%s' % ('；'.join(fn) or '无'))]
        refs = d.footnote_ref_paragraphs()
        items.append((any(anchor_text in p.text for p in refs), '脚注位置：%s' % ('“%s”后' % anchor_text if any(anchor_text in p.text for p in refs) else '不在指定段')))
        return all_ok(items)
    return f


def w_page_border(sz, theme, tint):
    def f(ctx):
        bs = ctx.docx.page_borders()
        if not bs:
            return False, '没有页面边框'
        ok = len(bs) >= 4 and all(close(b['sz'], sz, 0.01) and b['theme'] == theme and (b['tint'] or '').upper() == tint for b in bs)
        b = bs[0]
        return ok, '页面边框：%s磅 %s 淡色%s' % (_num(b['sz']), b['theme'] or b['color'], b['tint'])
    return f


def w_wordart(text, wrap=None, align_h=None):
    def f(ctx):
        ds = [x for x in ctx.docx.drawings() if x['kind'] == 'shape' and text in x['text']]
        if not ds:
            return False, '没有内容为“%s”的艺术字' % text
        x = ds[0]
        items = [(True, '已插入艺术字“%s”' % text)]
        if wrap:
            items.append((x['wrap'] == wrap, '环绕：%s' % {'wrapTopAndBottom': '上下型'}.get(x['wrap'], x['wrap'] or '嵌入型')))
        if align_h:
            items.append((x['align_h'] == align_h, '水平位置：%s' % {'center': '居中'}.get(x['align_h'], x['align_h'] or '未设置对齐')))
        return all_ok(items)
    return f


def w_wordart_glow(text, size_pt, theme):
    def f(ctx):
        ds = [x for x in ctx.docx.drawings() if x['kind'] == 'shape' and text in x['text']]
        if not ds:
            return False, '没有艺术字'
        glows = list(ds[0]['el'].iter(q('w14:glow'))) + list(ds[0]['el'].iter(q('a:glow')))
        if not glows:
            return False, '艺术字没有发光效果'
        g = glows[0]
        rad = int(g.get(q('w14:rad')) or g.get('rad') or 0) / 12700.0
        clr = next((c for c in g.iter() if c.tag.endswith('schemeClr')), None)
        cv = (clr.get(q('w14:val')) or clr.get('val')) if clr is not None else None
        return close(rad, size_pt, 0.5) and cv == theme, '发光：%s磅 %s' % (_num(rad), cv)
    return f


# ====================================================================== Excel

def _sheet(ctx, name=None):
    x = ctx.xlsx
    s = x.sheet(name) if name else x.sheets[0]
    if s is None:
        raise ValueError('没有名为“%s”的工作表' % name)
    return x, s


def x_merge(rng, sheet=None):
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        return rng in s.merges, '合并区域：%s' % ('、'.join(s.merges) or '无')
    return f


def x_cell_fmt(ref, align=None, font=None, size=None, bold=None, sheet=None):
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        xf = s.xf(ref)
        fo = xf.get('font', {})
        items = []
        if align:
            items.append((xf.get('h_align') in (align, 'centerContinuous' if align == 'center' else align),
                          '%s 水平对齐：%s' % (ref, {'center': '居中'}.get(xf.get('h_align'), xf.get('h_align') or '常规'))))
        if font:
            items.append((font_ok(fo.get('name'), font), '%s 字体：%s' % (ref, fo.get('name'))))
        if size:
            items.append((close(fo.get('size'), size, 0.01), '%s 字号：%s' % (ref, _num(fo.get('size') or 0))))
        if bold is not None:
            items.append((bool(fo.get('bold')) == bold, '%s 加粗：%s' % (ref, '是' if fo.get('bold') else '否')))
        return all_ok(items)
    return f


def x_sheet_name(name):
    def f(ctx):
        names = [s.name for s in ctx.xlsx.sheets]
        return names[0] == name or name in names, '工作表名：%s' % '、'.join(names)
    return f


def x_tab_color(color, sheet=None):
    want = STD.get(color, color)

    def f(ctx):
        x, s = _sheet(ctx, sheet)
        return s.tab_color == want, '标签颜色：%s' % (('#' + s.tab_color) if s.tab_color and not s.tab_color.startswith('theme') else (s.tab_color or '无'))
    return f


def x_value(ref, value, sheet=None):
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        v = s.value(ref)
        return (str(v).strip() == str(value)), '%s 内容：%s' % (ref, v if v is not None else '空')
    return f


def x_formula(refs, func, sheet=None, expect=None):
    """refs 里每个单元格都用 func 函数计算；expect: {ref: 期望值}"""
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        items = []
        bad = [r for r in refs if not (s.get(r) and s.get(r).formula and func.upper() in s.get(r).formula.upper())]
        items.append((not bad, ('%s 未用 %s 函数' % ('、'.join(bad[:3]), func)) if bad else '%s 用 %s 函数计算' % (refs[0] if len(refs) == 1 else refs[0] + '…' + refs[-1], func)))
        for r, v in (expect or {}).items():
            got = s.value(r)
            ok = isinstance(got, float) and close(got, v, 0.01)
            items.append((ok, '%s = %s' % (r, _num(got) if isinstance(got, float) else got)))
        return all_ok(items)
    return f


def x_sorted(col, r1, r2, desc=True, then_col=None, sheet=None):
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        keys = []
        for r in range(r1, r2 + 1):
            a = s.value('%s%d' % (col, r))
            b = s.value('%s%d' % (then_col, r)) if then_col else 0
            keys.append((a if isinstance(a, float) else float('-inf'), b if isinstance(b, float) else float('-inf')))
        ok = keys == sorted(keys, reverse=desc)
        return ok, '%s列%s' % (col, ('已按%s排序' % ('降序' if desc else '升序')) if ok else '没有按要求排序')
    return f


def x_numfmt(rng, decimals=None, percent=False, sheet=None):
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        from .ooxml import ref_range
        c1, r1, c2, r2 = ref_range(rng)
        bad = []
        sample = None
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                ref = _col(c) + str(r)
                if s.value(ref) is None:
                    continue
                fmt = x.xf(s.get(ref).style).get('numfmt') or 'General'
                sample = sample or fmt
                core = fmt.split(';')[0]
                ok = ('%' in core) == percent
                if decimals is not None:
                    m = re.search(r'0\.(0+)', core)
                    ok = ok and (len(m.group(1)) if m else 0) == decimals
                if not ok:
                    bad.append((ref, fmt))
        return (not bad and sample is not None), ('%s 数字格式：%s' % (rng, sample) if not bad else '%s 格式为 %s' % bad[0])
    return f


def _col(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def x_cond(col_range, operator, value, fill=None, font_color=None, sheet=None):
    """条件格式：区域需覆盖 col_range（如 'B3:B15'）"""
    ops = {'greaterThan': '大于', 'greaterThanOrEqual': '大于等于', 'lessThan': '小于'}

    def f(ctx):
        x, s = _sheet(ctx, sheet)
        from .ooxml import ref_range
        want = ref_range(col_range)
        for c in s.cond:
            covers = False
            for part in (c['sqref'] or '').split():
                a = ref_range(part)
                if a[0] <= want[0] and a[1] <= want[1] + 1 and a[2] >= want[2] and a[3] >= want[3] - 1:
                    covers = True
            if not covers:
                continue
            items = [(c['type'] == 'cellIs' and c['operator'] == operator and c['formula'] and str(c['formula'][0]).strip() == str(value),
                      '规则：%s %s' % (ops.get(c['operator'], c['operator'] or c['type']), c['formula'][0] if c['formula'] else ''))]
            if fill:
                got = (c['dxf'].get('fill') or {}).get('color')
                items.append((got == fill, '填充色：%s' % ('#' + got if got else '无')))
            if font_color:
                got = (c['dxf'].get('font') or {}).get('color')
                items.append((got == font_color, '文字颜色：%s' % ('#' + got if got else '默认')))
            return all_ok(items)
        return False, '%s 没有设置条件格式' % col_range
    return f


def x_table_style(style, no_filter=None, sheet=None):
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        if not s.tables:
            return False, '没有套用表格格式'
        t = s.tables[0]
        items = [(t['style'] == style, '表格样式：%s' % t['style'])]
        if no_filter:
            items.append((not t['autofilter'], '筛选按钮：%s' % ('已取消' if not t['autofilter'] else '仍显示')))
        return all_ok(items)
    return f


def x_filter(conds, sheet=None):
    """conds: {列号(从0): (operator, 值)}"""
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        if s.autofilter is None:
            return False, '没有设置自动筛选'
        items = []
        for col, (op, val) in conds.items():
            got = s.filters.get(col) or []
            ok = any(o == op and str(v) == str(val) for o, v in got)
            items.append((ok, '第%d列筛选：%s' % (col + 1, '、'.join('%s %s' % (o, v) for o, v in got) or '无')))
        return all_ok(items)
    return f


def x_chart(kind='bar', bar_dir='col', grouping='clustered', title=None, anchor=None, sheet=None):
    """anchor: (起列, 起行, 止列, 止行)，从 0 开始，如 A12:L32 -> (0,11,11,31)"""
    def f(ctx):
        x, s = _sheet(ctx, sheet)
        if not s.charts:
            return False, '没有插入图表'
        c = s.charts[0]
        items = [(kind + 'Chart' in c['types'] and c['bar_dir'] == bar_dir and c['grouping'] == grouping,
                  '图表类型：%s' % ('簇状柱形图' if c['bar_dir'] == 'col' and c['grouping'] == 'clustered' else '、'.join(c['types'])))]
        if title:
            items.append((c['title'] == title, '图表标题：%s' % (c['title'] or '无')))
        if anchor:
            fr, to = c['from'], c['to']
            ok = fr and to and abs(fr[0] - anchor[0]) <= 0 and abs(fr[1] - anchor[1]) <= 1 and abs(to[0] - anchor[2]) <= 1 and abs(to[1] - anchor[3]) <= 1
            items.append((ok, '图表位置：%s%d:%s%d' % (_col(fr[0] + 1), fr[1] + 1, _col(to[0] + 1), to[1] + 1) if fr and to else '未知'))
        return all_ok(items)
    return f


# ====================================================================== PowerPoint

def p_slide_count(n):
    def f(ctx):
        k = len(ctx.pptx.slides)
        return k == n, '共 %d 张幻灯片' % k
    return f


LAYOUT_NAMES = {'title': '标题幻灯片', 'obj': '标题和内容', 'twoObj': '两栏内容', 'titleOnly': '仅标题', 'blank': '空白',
                'objTx': '内容与标题', 'picTx': '图片与标题', 'twoTxTwoObj': '比较'}


def p_layout(i, layout):
    def f(ctx):
        sl = ctx.pptx.slides
        if len(sl) < i:
            return False, '没有第 %d 张幻灯片' % i
        s = sl[i - 1]
        return s.layout_type == layout, '第%d张版式：%s' % (i, s.layout_name or LAYOUT_NAMES.get(s.layout_type, s.layout_type))
    return f


def _slide(ctx, i):
    sl = ctx.pptx.slides
    if len(sl) < i:
        raise ValueError('没有第 %d 张幻灯片' % i)
    return sl[i - 1]


def _eff_size(slide, shape, run_props):
    """字号：文字上直接设置的，否则查版式/母版里同类占位符的默认字号"""
    if run_props.get('size'):
        return run_props['size']
    pres = slide.pres
    for part in (slide.layout_part, ):
        root = pres.xml(part) if part else None
        if root is None:
            continue
        for sp in root.iter(q('p:sp')):
            ph = sp.find('.//' + q('p:ph'))
            if ph is None:
                continue
            if (ph.get('type') or 'body') == (shape.ph_type or 'body') and (shape.ph_type != 'body' or ph.get('idx') == shape.ph_idx):
                d = sp.find('.//' + q('a:lvl1pPr') + '/' + q('a:defRPr'))
                if d is not None and d.get('sz'):
                    return int(d.get('sz')) / 100.0
    return None


def p_shape_text(i, ph_types, text=None, latin=None, ea=None, size=None, bold=None, color=None, label=None):
    """第 i 张幻灯片某占位符的文字和格式。ph_types 如 ('title','ctrTitle')；None 表示非占位符文本框"""
    def f(ctx):
        s = _slide(ctx, i)
        shapes = [sh for sh in s.shapes if (sh.ph_type in ph_types if ph_types else sh.ph_type is None) and sh.kind == 'sp']
        if text:
            shapes = [sh for sh in shapes if text in sh.text.replace('\n', '')] or shapes
        lab = label or ('第%d张' % i)
        if not shapes:
            return False, '%s找不到对应文本框' % lab
        sh = shapes[0]
        items = []
        if text is not None:
            items.append((text in sh.text.replace('\n', ''), '%s文字：%s' % (lab, sh.text[:20] or '空')))
        runs = sh.text_runs()
        if not runs:
            return all_ok(items + [(False, '%s没有文字' % lab)])
        def chk(name, getter, want, fmt=str, eq=lambda a, b: a == b):
            vals = [getter(r) for r in runs]
            bad = [v for v in vals if not eq(v, want)]
            items.append((not bad, '%s%s：%s' % (lab, name, fmt(bad[0] if bad else vals[0]))))
        if latin or ea:
            chk('字体', lambda r: r['props'].get('ea') or r['props'].get('latin'), ea or latin, eq=font_ok,
                fmt=lambda v: v or '默认')
        if size:
            chk('字号', lambda r: _eff_size(s, sh, r['props']), size, eq=lambda a, b: close(a, b, 0.1),
                fmt=lambda v: '%s磅' % _num(v) if v else '默认')
        if bold is not None:
            chk('加粗', lambda r: bool(r['props'].get('bold')), bold, fmt=lambda v: '是' if v else '否')
        if color:
            want = STD.get(color, color)
            chk('颜色', lambda r: r['props'].get('color'), want, fmt=lambda v: ('#' + v) if v and not v.startswith('scheme') else (v or '默认'))
        return all_ok(items)
    return f


def p_no_subtitle(i):
    def f(ctx):
        s = _slide(ctx, i)
        sub = s.ph('subTitle')
        return not sub, '第%d张副标题占位符：%s' % (i, '已删除' if not sub else '仍在')
    return f


def p_picture(i, style=None, near_right=None):
    """style: 'shadow'（矩形投影）/ 几何形状名（如 round2DiagRect）"""
    def f(ctx):
        s = _slide(ctx, i)
        pics = s.pics
        if not pics:
            return False, '第%d张没有图片' % i
        items = [(True, '第%d张已插入图片' % i)]
        if style:
            ok = False
            desc = []
            for p in pics:
                geom = p.el.find('.//' + q('a:prstGeom'))
                g = geom.get('prst') if geom is not None else None
                shd = p.el.find('.//' + q('a:outerShdw'))
                if style == 'shadow' and g == 'rect' and shd is not None:
                    ok = True
                if style != 'shadow' and g == style:
                    ok = True
                desc.append(g or '?')
            items.append((ok, '图片样式：%s' % '、'.join(desc)))
        return all_ok(items)
    return f


def p_pictures_geom(i, geoms):
    """第 i 张的图片按从左到右的形状"""
    def f(ctx):
        s = _slide(ctx, i)
        pics = []
        for p in s.pics:
            off = p.el.find('.//' + q('a:off'))
            geom = p.el.find('.//' + q('a:prstGeom'))
            ln = p.el.find('.//' + q('a:ln'))
            white = ln is not None and ln.find('.//' + q('a:srgbClr')) is not None and ln.find('.//' + q('a:srgbClr')).get('val') in ('FFFFFF',) \
                or (ln is not None and ln.find('.//' + q('a:schemeClr')) is not None and ln.find('.//' + q('a:schemeClr')).get('val') in ('bg1', 'lt1'))
            pics.append((int(off.get('x')) if off is not None else 0, geom.get('prst') if geom is not None else None, white))
        pics.sort()
        got = [g for _, g, _ in pics]
        ok = got[:len(geoms)] == list(geoms) and all(w for _, _, w in pics[:len(geoms)])
        return ok, '第%d张图片样式（左→右）：%s' % (i, '、'.join(str(g) for g in got) or '无')
    return f


ANIM_NAMES = {2: '飞入', 6: '形状', 16: '劈裂', 22: '擦除', 26: '弹跳', 31: '翻转式由远及近', 42: '浮入(上浮)',
              47: '浮入(下浮)', 10: '淡出', 53: '缩放'}


def _target(s, target):
    """target: 'title' / 'body' / 'pic' / ('pic', n) 第 n 张图(从左数) / 'text:xxx' 包含文字的形状"""
    if target == 'title':
        t = s.title()
        return [t.id] if t else []
    if target == 'body':
        return [sh.id for sh in s.shapes if sh.kind == 'sp' and sh.ph_type in ('body', 'obj') and sh.text.strip()] or \
               [sh.id for sh in s.shapes if sh.kind == 'sp' and sh.ph_type not in ('title', 'ctrTitle', 'subTitle', 'dt', 'ftr', 'sldNum') and sh.text.strip()]
    if target == 'pic':
        return [p.id for p in s.pics]
    if isinstance(target, str) and target.startswith('text:'):
        return [sh.id for sh in s.shapes if target[5:] in sh.text]
    return []


def p_anim(i, target, preset, subtype=None, node=None, by_para=None, label=None):
    """target 的进入动画。node: 'click' / 'after' / 'with'"""
    def f(ctx):
        s = _slide(ctx, i)
        ids = _target(s, target)
        anims = [a for a in s.animations() if a['spid'] in ids and a['cls'] == 'entr']
        lab = label or '第%d张' % i
        if not anims:
            return False, '%s没有设置进入动画' % lab
        a = anims[0]
        items = [(a['preset'] == preset, '%s动画：%s' % (lab, ANIM_NAMES.get(a['preset'], '编号%s' % a['preset'])))]
        if subtype is not None:
            items.append((a['subtype'] == subtype, '%s效果选项：%s' % (lab, SUBTYPE_NAMES.get((a['preset'], a['subtype']), a['subtype']))))
        if node:
            n = {'clickEffect': 'click', 'afterEffect': 'after', 'withEffect': 'with'}.get(a['node'], a['node'])
            items.append((n == node, '%s开始：%s' % (lab, {'click': '单击时', 'after': '上一动画之后', 'with': '与上一动画同时'}.get(n, n))))
        if by_para is not None:
            bp = a['build'] == 'p' or (a['para'] and len(anims) > 1 and a['build'] != 'allAtOnce')
            if by_para == 'all':
                ok = a['build'] in ('allAtOnce', None) and len([x for x in anims if x['node'] == 'clickEffect']) <= 1
                items.append((ok, '%s发送：%s' % (lab, '整批' if ok else '按段落')))
            else:
                items.append((bp, '%s发送：%s' % (lab, '按段落' if bp else '整批')))
        return all_ok(items)
    return f


# (presetID, subtype) -> 中文
SUBTYPE_NAMES = {(2, 1): '自顶部', (2, 2): '自右侧', (2, 4): '自底部', (2, 8): '自左侧', (2, 3): '自右上部',
                 (2, 6): '自右下部', (2, 9): '自左上部', (2, 12): '自左下部', (22, 1): '自顶部', (22, 4): '自底部',
                 (22, 8): '自左侧', (16, 37): '中央向左右展开', (16, 21): '左右向中央收缩', (6, 16): '切出', (6, 32): '切入'}


def p_anim_order(i, targets):
    """第 i 张动画的出现顺序"""
    def f(ctx):
        s = _slide(ctx, i)
        order = []
        for a in s.animations():
            if a['cls'] != 'entr':
                continue
            for t in targets:
                if a['spid'] in _target(s, t) and t not in order:
                    order.append(t)
        names = {'title': '标题', 'body': '文本', 'pic': '图片'}
        return order == list(targets), '第%d张动画顺序：%s' % (i, '→'.join(names.get(t, t) for t in order) or '无')
    return f


TRANS_NAMES = {'blinds': '百叶窗', 'pull': '揭开', 'dissolve': '溶解', 'fade': '淡出', 'prstTrans': '悬挂等',
               'push': '推进', 'wipe': '擦除', 'split': '分割', 'cover': '覆盖', 'none': '无'}


def p_transition_all(kind, attrs=None, adv_ms=None, defaults=None):
    """全部幻灯片切换效果；kind 可为 ('prstTrans', {'prst':'drape'}) 这类 p15 效果"""
    def f(ctx):
        bad = []
        first = None
        for n, s in enumerate(ctx.pptx.slides, 1):
            trs = s.transitions_all()
            ok = False
            for t in trs:
                ta = dict(defaults or {}, **t['attrs'])
                if kind is None or (t['kind'] == kind and all(ta.get(k) == v for k, v in (attrs or {}).items())):
                    if adv_ms is None or t['advTm'] == adv_ms:
                        ok = True
            if first is None:
                first = trs[0] if trs else None
            if not ok:
                bad.append(n)
        nm = (TRANS_NAMES.get(first['kind'], first['kind']) + (' ' + first['attrs'].get('prst', '') if first and first['attrs'].get('prst') else '')) if first else '无'
        desc = '切换效果：%s' % nm
        if adv_ms is not None:
            desc = '自动换片：%s' % (('%s秒' % _num(first['advTm'] / 1000.0)) if first and first['advTm'] else '未设置')
        if bad:
            desc += '（第%s张不符合）' % '、'.join(map(str, bad[:5]))
        return not bad, desc
    return f


def p_show(mode):
    names = {'present': '演讲者放映', 'browse': '观众自行浏览', 'kiosk': '在展台浏览'}

    def f(ctx):
        m = ctx.pptx.show
        return m == mode, '放映方式：%s' % names.get(m, m)
    return f


def p_theme(name):
    def f(ctx):
        t = (ctx.pptx.theme_name or '').strip('​ ')
        return t == name or name in t, '主题：%s' % t
    return f


def p_background(i, color):
    def f(ctx):
        s = _slide(ctx, i)
        b = s.background()
        return b == color, '第%d张背景：%s' % (i, b or '跟随母版')
    return f


def p_bullets(i, target='body'):
    def f(ctx):
        s = _slide(ctx, i)
        ids = _target(s, target)
        shs = [sh for sh in s.shapes if sh.id in ids]
        if not shs:
            return False, '第%d张没有文本' % i
        paras = [p for p in shs[0].paragraphs if p['text'].strip()]
        ok = paras and all(p['bullet'] in ('buChar', 'buAutoNum', 'buBlip') for p in paras)
        return bool(ok), '第%d张文本项目符号：%s' % (i, '已设置' if ok else '没有')
    return f


def p_wordart(i, text):
    def f(ctx):
        s = _slide(ctx, i)
        sh = [x for x in s.shapes if x.ph_type is None and text in x.text.replace('\n', '')]
        return bool(sh), '第%d张艺术字：%s' % (i, ('“%s”' % sh[0].text) if sh else '没有')
    return f


# ====================================================================== 网页（Dreamweaver）

def _basename(p):
    return (p or '').replace('\\', '/').rsplit('/', 1)[-1]


def _ci(a, b):
    return (a or '').strip().lower() == (b or '').strip().lower()


def h_frameset_rows(first=None, rows=None):
    """最外层 frameset 的 rows；first 只比较第一项"""
    def f(ctx):
        fs = ctx.site.framesets()
        if not fs:
            return False, 'index.html 不是框架网页'
        r = (fs[0].get('rows') or '').replace(' ', '')
        parts = r.split(',')
        if rows:
            return r == rows, '框架行值：%s' % r
        return parts[0] == str(first), '上框架高度：%s' % (parts[0] or '未设置')
    return f


def h_frame_attrs(name, **want):
    """frame 属性，如 marginwidth='1', frameborder='yes', bordercolor='#009900', scrolling='no'"""
    labels = {'marginwidth': '边界宽度', 'marginheight': '边界高度', 'frameborder': '边框', 'bordercolor': '边框颜色',
              'src': '源文件', 'scrolling': '滚动'}

    def f(ctx):
        fr = ctx.site.frame(name)
        if fr is None:
            return False, '没有名为 %s 的框架' % name
        items = []
        for k, v in want.items():
            got = fr.get(k)
            if k == 'frameborder':
                norm = {'yes': 'yes', '1': 'yes', 'no': 'no', '0': 'no'}
                ok = norm.get((got or '').lower()) == v
            else:
                ok = _ci(got, v)
            items.append((ok, '%s %s：%s' % (name, labels.get(k, k), got or '未设置')))
        return all_ok(items)
    return f


def h_split(parent_frame_src, direction, values, new_name, new_src, new_first=True):
    """中框架拆分：嵌套 frameset 的 cols/rows，并且 new 框架（名称、源文件）位于指定一侧"""
    def f(ctx):
        site = ctx.site
        target = None
        for fs in site.framesets()[1:]:
            target = fs
            break
        if target is None:
            return False, '中框架没有拆分'
        attr_name = 'cols' if direction == 'cols' else 'rows'
        v = (target.get(attr_name) or '').replace(' ', '').replace('1*', '*')
        items = [(v == values, '拆分%s：%s' % ('为列' if attr_name == 'cols' else '为行', v or ('没有%s属性' % attr_name)))]
        frames = [c for c in target.children if c.tag in ('frame', 'frameset')]
        names = [c.get('name') for c in frames]
        idx = 0 if new_first else 1
        ok = len(frames) == 2 and frames[idx].get('name') == new_name
        items.append((ok, '框架名称：%s' % '、'.join(n or '?' for n in names)))
        src = frames[idx].get('src') if len(frames) == 2 else None
        items.append(((src or '').endswith(new_src), '%s 框架源文件：%s' % (new_name, src or '无')))
        return all_ok(items)
    return f


def _page(ctx, frame=None, file=None):
    if file:
        return ctx.site.page(file)
    p = ctx.site.frame_page(frame)
    if p is None:
        raise ValueError('找不到 %s 框架的网页' % frame)
    return p


def h_title(frame, title):
    def f(ctx):
        p = _page(ctx, frame)
        return p.title.strip() == title, '%s 网页标题：%s' % (frame, p.title or '空')
    return f


def h_body_bg(frame=None, file=None, image=None, repeat=None, color=None, css=True):
    def f(ctx):
        p = _page(ctx, frame, file)
        b = p.body
        st = p.styles_for(b) if b is not None else {}
        items = []
        if image:
            v = st.get('background-image') or (b.get('background') if b is not None else '') or ''
            items.append((image in v.replace('\\', '/'), '背景图像：%s' % (v or '无')))
        if repeat:
            v = st.get('background-repeat')
            items.append((v == repeat, '背景重复：%s' % (v or '未设置')))
        if color:
            v = (b.get('bgcolor') if b is not None else None) or st.get('background-color')
            items.append((_ci(v, color), '背景颜色：%s' % (v or '无')))
        return all_ok(items)
    return f


def h_text_style(frame=None, text=None, file=None, cls=None, font=None, size=None, color=None, align=None, bold=None):
    """文字（可指定 CSS 类名 cls）的字体、大小、颜色、对齐"""
    def f(ctx):
        p = _page(ctx, frame, file)
        n = p.text_node(text)
        if n is None:
            return False, '%s 中没有文字“%s”' % (frame or file, text)
        st = p.styles_for(n)
        items = [(True, '已输入“%s”' % text)]
        if cls:
            has = cls in p.css.get('.' + cls, {}) or ('.' + cls) in p.css
            used = any(cls in (x.get('class') or '').split() for x in [n] + list(n.ancestors()))
            items.append((has and used, 'CSS 规则 .%s：%s' % (cls, '已建立并应用' if has and used else ('已建立但没应用' if has else '没有'))))
        if font:
            v = st.get('font-family', '')
            items.append((font in v, '字体：%s' % (v or '默认')))
        if size:
            v = st.get('font-size', '')
            items.append((v.replace(' ', '') == size, '大小：%s' % (v or '默认')))
        if color:
            v = st.get('color', '') or ''
            if not v:
                fn = next((x for x in [n] + list(n.ancestors()) if x.tag == 'font' and x.get('color')), None)
                v = fn.get('color') if fn else ''
            items.append((_ci(v, color), '颜色：%s' % (v or '默认')))
        if align:
            v = st.get('text-align', '')
            items.append((_ci(v, align), '对齐：%s' % ({'center': '居中'}.get(v, v) or '默认')))
        if bold:
            v = st.get('font-weight', '')
            isb = v in ('bold', '700', 'bolder') or any(x.tag in ('b', 'strong') for x in [n] + list(n.ancestors()))
            items.append((isb, '粗体：%s' % ('是' if isb else '否')))
        return all_ok(items)
    return f


def h_link(frame, text, href=None, target=None, href_endswith=None, file=None):
    def f(ctx):
        p = _page(ctx, frame, file)
        links = [a for a in p.find_all('a') if text in a.text and a.get('href') is not None]
        if not links:
            return False, '“%s”没有设置超链接' % text
        a = links[0]
        h = a.get('href') or ''
        items = []
        if href is not None:
            items.append((h.rstrip('/') == href.rstrip('/'), '链接地址：%s' % h))
        if href_endswith is not None:
            items.append((h.endswith(href_endswith), '链接地址：%s' % h))
        if target is not None:
            items.append((_ci(a.get('target'), target), '目标：%s' % (a.get('target') or '未设置')))
        return all_ok(items)
    return f


def h_anchor(frame=None, name=None, file=None, after_text=None):
    def f(ctx):
        p = _page(ctx, frame, file)
        anchors = [a for a in p.find_all('a') if a.get('name') == name or (a.get('id') == name and a.get('href') is None)]
        if not anchors:
            return False, '没有名为“%s”的锚记' % name
        return True, '已插入锚记“%s”' % name
    return f


def h_hr(frame=None, file=None, align=None, width=None, size=None):
    def f(ctx):
        p = _page(ctx, frame, file)
        hrs = p.find_all('hr')
        if not hrs:
            return False, '没有插入水平线'
        h = hrs[0]
        items = [(True, '已插入水平线')]
        if align:
            items.append((_ci(h.get('align'), align), '对齐：%s' % (h.get('align') or '默认')))
        if width:
            items.append((_ci(h.get('width'), width), '宽度：%s' % (h.get('width') or '默认')))
        if size:
            items.append((_ci(h.get('size'), size), '高度：%s' % (h.get('size') or '默认')))
        return all_ok(items)
    return f


def h_table(frame=None, file=None, rows=None, cols=None, width=None, border=None, align=None, images=None, cell_align=None, texts=None, nth=0):
    def f(ctx):
        p = _page(ctx, frame, file)
        ts = p.find_all('table')
        if images:
            ts = [t for t in ts if t.find('img') is not None] or ts
        if texts:
            ts = [t for t in ts if all(x in t.text for x in texts)] or ts
        if len(ts) <= nth:
            return False, '没有插入表格'
        t = ts[nth]
        trs = [tr for tr in t.iter('tr') if next((a for a in tr.ancestors() if a.tag == 'table'), None) is t]
        ncols = max((len([td for td in tr.children if td.tag in ('td', 'th')]) for tr in trs), default=0)
        items = []
        if rows is not None or cols is not None:
            items.append((len(trs) == rows and ncols == cols, '表格 %d 行 %d 列' % (len(trs), ncols)))
        if width:
            items.append((_ci(t.get('width'), width), '表格宽度：%s' % (t.get('width') or '未设置')))
        if border is not None:
            items.append((_ci(t.get('border'), border), '边框粗细：%s' % (t.get('border') if t.get('border') is not None else '未设置')))
        if align:
            items.append((_ci(t.get('align'), align), '表格对齐：%s' % (t.get('align') or '默认')))
        if images:
            srcs = [_basename(i.get('src') or '') for i in t.iter('img')]
            items.append((srcs == list(images), '图片：%s' % ('、'.join(srcs) or '无')))
        if cell_align:
            tds = [td for td in t.iter('td')]
            ok = tds and all(_ci(td.get('align'), cell_align) or _ci(p.styles_for(td).get('text-align'), cell_align) for td in tds)
            items.append((bool(ok), '单元格对齐：%s' % ('全部居中' if ok else '没有全部居中')))
        if texts:
            items.append((all(x in t.text for x in texts), '单元格文字：%s' % t.text[:30]))
        return all_ok(items)
    return f


def h_select(frame=None, file=None, options=None, selected=None, list_type=None, label_text=None, no_form=True):
    def f(ctx):
        p = _page(ctx, frame, file)
        sels = p.find_all('select')
        if not sels:
            return False, '没有插入选择（列表/菜单）'
        s = sels[0]
        opts = [o for o in s.iter('option')]
        items = []
        if label_text:
            items.append((label_text in p.root.text, '文字“%s”：%s' % (label_text, '有' if label_text in p.root.text else '没有')))
        if options:
            got = [o.text for o in opts]
            items.append((got == list(options), '选项：%s' % '、'.join(got)))
        if selected:
            sel = [o.text for o in opts if 'selected' in o.attrs]
            items.append((sel == [selected], '初始选定：%s' % ('、'.join(sel) or '无')))
        if list_type:
            items.append((s.get('size') is not None or 'multiple' in s.attrs, '类型：%s' % ('列表' if s.get('size') else '菜单')))
        if no_form:
            items.append((not p.find_all('form'), '表单标签：%s' % ('无' if not p.find_all('form') else '有（要求不添加）')))
        return all_ok(items)
    return f


def h_input(frame=None, file=None, label_text=None, size=None, button_value=None):
    def f(ctx):
        p = _page(ctx, frame, file)
        ins = p.find_all('input')
        items = []
        if label_text:
            items.append((label_text in p.root.text, '文字“%s”：%s' % (label_text, '有' if label_text in p.root.text else '没有')))
        texts = [i for i in ins if (i.get('type') or 'text').lower() == 'text']
        items.append((bool(texts) and (size is None or texts[0].get('size') == str(size)),
                      '文本域：%s' % (('字符宽度 %s' % texts[0].get('size')) if texts else '没有')))
        if button_value:
            btn = [i for i in ins if (i.get('type') or '').lower() in ('button', 'submit')]
            items.append((bool(btn) and btn[0].get('value') == button_value, '按钮：%s' % (btn[0].get('value') if btn else '没有')))
        items.append((not p.find_all('form'), '表单标签：%s' % ('无' if not p.find_all('form') else '有（要求不添加）')))
        return all_ok(items)
    return f


def h_image(frame=None, file=None, src=None):
    def f(ctx):
        p = _page(ctx, frame, file)
        imgs = [_basename(i.get('src') or '') for i in p.find_all('img')]
        return src in imgs, '图片：%s' % ('、'.join(imgs) or '无')
    return f
