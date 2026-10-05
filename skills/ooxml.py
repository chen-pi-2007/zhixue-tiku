# -*- coding: utf-8 -*-
"""只用标准库读取 docx / xlsx / pptx，给技能检查器用。

不追求完整还原 Office 的排版，只把检查要用到的属性按 Office 的继承规则算出来：
Word 段落/文字格式（样式链 + 直接格式）、页面设置、表格、图片、脚注；
Excel 单元格值/公式/格式、合并、条件格式、表格样式、筛选、图表；
PowerPoint 幻灯片版式、文本框文字格式、动画、切换、放映方式、主题。
"""
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    's': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'v': 'urn:schemas-microsoft-com:vml',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
}


def q(tag):
    """'w:p' -> '{ns}p'"""
    pre, name = tag.split(':')
    return '{%s}%s' % (NS[pre], name)


def attr(el, name, default=None):
    if el is None:
        return default
    if ':' in name:
        return el.get(q(name), default)
    return el.get(name, default)


TWIP_PER_CM = 1440 / 2.54
EMU_PER_CM = 360000

# 中文字号 -> 磅
CN_SIZE = {'初号': 42, '小初': 36, '一号': 26, '小一': 24, '二号': 22, '小二': 18, '三号': 16, '小三': 15,
           '四号': 14, '小四': 12, '五号': 10.5, '小五': 9, '六号': 7.5, '小六': 6.5}


class Package:
    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        self.names = set(self.zip.namelist())
        self._xml = {}

    def has(self, name):
        return name in self.names

    def xml(self, name):
        if name not in self._xml:
            self._xml[name] = ET.fromstring(self.zip.read(name)) if name in self.names else None
        return self._xml[name]

    def text(self, name):
        return self.zip.read(name).decode('utf-8', 'replace') if name in self.names else ''

    def rels(self, part):
        """part 的关系：{rId: (目标部件路径, 类型尾部, TargetMode)}"""
        d, b = posixpath.split(part)
        rp = posixpath.join(d, '_rels', b + '.rels')
        out = {}
        root = self.xml(rp)
        if root is None:
            return out
        for r in root:
            t = r.get('Target')
            if r.get('TargetMode') != 'External':
                t = posixpath.normpath(posixpath.join(d, t)) if not t.startswith('/') else t.lstrip('/')
            out[r.get('Id')] = (t, r.get('Type', '').rsplit('/', 1)[-1], r.get('TargetMode'))
        return out


# ====================================================================== Word

def _merge(dst, src):
    for k, v in src.items():
        if v is not None:
            dst[k] = v
    return dst


def _on(el):
    """w:b 之类的开关属性：存在且 val 不是 0/false 即为开"""
    if el is None:
        return None
    return attr(el, 'w:val', 'true') not in ('0', 'false', 'off')


def parse_rpr(rpr):
    d = {}
    if rpr is None:
        return d
    f = rpr.find(q('w:rFonts'))
    if f is not None:
        d['font_ea'] = attr(f, 'w:eastAsia') or (('theme:' + attr(f, 'w:eastAsiaTheme')) if attr(f, 'w:eastAsiaTheme') else None)
        d['font_ascii'] = attr(f, 'w:ascii') or (('theme:' + attr(f, 'w:asciiTheme')) if attr(f, 'w:asciiTheme') else None)
        d['font_hansi'] = attr(f, 'w:hAnsi') or (('theme:' + attr(f, 'w:hAnsiTheme')) if attr(f, 'w:hAnsiTheme') else None)
    sz = rpr.find(q('w:sz'))
    if sz is not None:
        d['size'] = int(attr(sz, 'w:val')) / 2.0
    for k, tag in (('bold', 'w:b'), ('italic', 'w:i'), ('strike', 'w:strike')):
        v = _on(rpr.find(q(tag)))
        if v is not None:
            d[k] = v
    c = rpr.find(q('w:color'))
    if c is not None:
        d['color'] = (attr(c, 'w:val') or '').upper()
        d['color_theme'] = attr(c, 'w:themeColor')
    u = rpr.find(q('w:u'))
    if u is not None:
        d['underline'] = attr(u, 'w:val', 'single')
    em = rpr.find(q('w:em'))
    if em is not None:
        d['em'] = attr(em, 'w:val')
    sp = rpr.find(q('w:spacing'))
    if sp is not None:
        d['char_spacing'] = int(attr(sp, 'w:val', '0')) / 20.0       # 磅
    ft = rpr.find(q('w:fitText'))
    if ft is not None:
        d['fit_text'] = int(attr(ft, 'w:val', '0'))                  # twip
    hl = rpr.find(q('w:highlight'))
    if hl is not None:
        d['highlight'] = attr(hl, 'w:val')
    glow = rpr.find(q('w14:glow'))
    if glow is not None:
        d['glow'] = glow
    return d


def parse_ppr(ppr):
    d = {}
    if ppr is None:
        return d
    jc = ppr.find(q('w:jc'))
    if jc is not None:
        d['align'] = attr(jc, 'w:val')
    sp = ppr.find(q('w:spacing'))
    if sp is not None:
        for k in ('before', 'after', 'beforeLines', 'afterLines', 'line', 'lineRule'):
            v = attr(sp, 'w:' + k)
            if v is not None:
                d['sp_' + k] = v if k == 'lineRule' else int(v)
    ind = ppr.find(q('w:ind'))
    if ind is not None:
        for k in ('firstLine', 'firstLineChars', 'left', 'leftChars', 'hanging', 'hangingChars'):
            v = attr(ind, 'w:' + k)
            if v is not None:
                d['ind_' + k] = int(v)
    fp = ppr.find(q('w:framePr'))
    if fp is not None and attr(fp, 'w:dropCap'):
        d['drop_cap'] = attr(fp, 'w:dropCap')
        d['drop_lines'] = int(attr(fp, 'w:lines', '0'))
    bdr = ppr.find(q('w:pBdr'))
    if bdr is not None:
        d['borders'] = {b.tag.split('}')[1]: {'val': attr(b, 'w:val'), 'sz': int(attr(b, 'w:sz', '0')) / 8.0,
                                               'color': attr(b, 'w:color'), 'theme': attr(b, 'w:themeColor'),
                                               'tint': attr(b, 'w:themeTint')} for b in bdr}
    shd = ppr.find(q('w:shd'))
    if shd is not None:
        d['shading'] = {'val': attr(shd, 'w:val'), 'fill': attr(shd, 'w:fill'), 'color': attr(shd, 'w:color'),
                        'fill_theme': attr(shd, 'w:themeFill'), 'fill_tint': attr(shd, 'w:themeFillTint'),
                        'color_theme': attr(shd, 'w:themeColor'), 'color_tint': attr(shd, 'w:themeTint')}
    ps = ppr.find(q('w:pStyle'))
    if ps is not None:
        d['style'] = attr(ps, 'w:val')
    return d


class Run:
    def __init__(self, text, props, el):
        self.text, self.props, self.el = text, props, el

    def __repr__(self):
        return 'Run(%r, %r)' % (self.text, {k: v for k, v in self.props.items() if k != 'glow'})


class Para:
    def __init__(self, el, doc):
        self.el = el
        self.doc = doc
        ppr = el.find(q('w:pPr'))
        direct = parse_ppr(ppr)
        self.style = direct.get('style') or doc.default_pstyle
        self.props = _merge(dict(doc.style_ppr(self.style)), direct)
        base_r = doc.style_rpr(self.style)
        self.runs = []
        for r in el.iter(q('w:r')):
            t = ''.join((x.text or '') if x.tag == q('w:t') else ('\t' if x.tag == q('w:tab') else '')
                        for x in r if x.tag in (q('w:t'), q('w:tab')))
            rp = dict(base_r)
            rpr = r.find(q('w:rPr'))
            if rpr is not None and rpr.find(q('w:rStyle')) is not None:
                _merge(rp, doc.style_rpr(attr(rpr.find(q('w:rStyle')), 'w:val')))
            _merge(rp, parse_rpr(rpr))
            self.runs.append(Run(t, rp, r))
        # 拼音（ruby）的注音文字不算正文
        rt_runs = set()
        for rt in el.iter(q('w:rt')):
            for r in rt.iter(q('w:r')):
                rt_runs.add(id(r))
        self.runs = [r for r in self.runs if id(r.el) not in rt_runs]
        self.text = ''.join(r.text for r in self.runs)

    def text_runs(self):
        return [r for r in self.runs if r.text.strip()]

    def __repr__(self):
        return 'Para(%r)' % self.text[:30]


class Docx(Package):
    def __init__(self, path):
        super().__init__(path)
        self.doc = self.xml('word/document.xml')
        self.body = self.doc.find(q('w:body'))
        self._load_styles()
        self._load_theme()
        self.paragraphs = [Para(p, self) for p in self.body.iter(q('w:p'))]
        # 正文顶层段落（不含表格、文本框里的）
        self.body_paragraphs = [Para(p, self) for p in self.body.findall(q('w:p'))]

    # ---- 样式
    def _load_styles(self):
        st = self.xml('word/styles.xml')
        self.styles = {}
        self.default_pstyle = None
        self.doc_rpr, self.doc_ppr = {}, {}
        if st is None:
            return
        dd = st.find(q('w:docDefaults'))
        if dd is not None:
            self.doc_rpr = parse_rpr(dd.find('.//' + q('w:rPr')))
            self.doc_ppr = parse_ppr(dd.find('.//' + q('w:pPr')))
        for s in st.findall(q('w:style')):
            sid = attr(s, 'w:styleId')
            based = s.find(q('w:basedOn'))
            name = s.find(q('w:name'))
            self.styles[sid] = {'type': attr(s, 'w:type'), 'based': attr(based, 'w:val'),
                                'name': attr(name, 'w:val'),
                                'rpr': parse_rpr(s.find(q('w:rPr'))), 'ppr': parse_ppr(s.find(q('w:pPr')))}
            if attr(s, 'w:type') == 'paragraph' and attr(s, 'w:default') == '1':
                self.default_pstyle = sid

    def _chain(self, sid):
        out, seen = [], set()
        while sid and sid in self.styles and sid not in seen:
            seen.add(sid)
            out.append(self.styles[sid])
            sid = self.styles[sid]['based']
        return list(reversed(out))

    def style_rpr(self, sid):
        d = dict(self.doc_rpr)
        for s in self._chain(sid):
            _merge(d, s['rpr'])
        return d

    def style_ppr(self, sid):
        d = dict(self.doc_ppr)
        for s in self._chain(sid):
            _merge(d, s['ppr'])
        return d

    def style_name(self, sid):
        return (self.styles.get(sid) or {}).get('name') or sid

    def _load_theme(self):
        self.theme_fonts = {}
        rels = self.rels('word/document.xml')
        th = next((t for t, typ, _ in rels.values() if typ == 'theme'), None)
        root = self.xml(th) if th else None
        if root is None:
            return
        for kind in ('majorFont', 'minorFont'):
            f = root.find('.//' + q('a:' + kind))
            if f is None:
                continue
            pre = 'major' if kind == 'majorFont' else 'minor'
            ea = f.find(q('a:ea'))
            lat = f.find(q('a:latin'))
            hans = next((x.get('typeface') for x in f.findall(q('a:font')) if x.get('script') == 'Hans'), None)
            self.theme_fonts[pre + 'EastAsia'] = (ea.get('typeface') if ea is not None else '') or hans or ''
            self.theme_fonts[pre + 'HAnsi'] = lat.get('typeface') if lat is not None else ''
            self.theme_fonts[pre + 'Ascii'] = self.theme_fonts[pre + 'HAnsi']

    def font(self, name):
        if name and name.startswith('theme:'):
            return self.theme_fonts.get(name[6:], name)
        return name

    # ---- 查找
    def find(self, contains, paras=None):
        for p in (paras or self.paragraphs):
            if contains in p.text:
                return p
        return None

    def nonempty(self, paras=None):
        return [p for p in (paras or self.body_paragraphs) if p.text.strip()]

    # ---- 页面
    def sect(self):
        s = self.body.find(q('w:sectPr'))
        if s is None:
            s = list(self.body.iter(q('w:sectPr')))[-1]
        return s

    def page(self):
        s = self.sect()
        sz, mar = s.find(q('w:pgSz')), s.find(q('w:pgMar'))
        cm = lambda v: round(int(v) / TWIP_PER_CM, 2) if v is not None else None
        return {'w': cm(attr(sz, 'w:w')), 'h': cm(attr(sz, 'w:h')),
                'top': cm(attr(mar, 'w:top')), 'bottom': cm(attr(mar, 'w:bottom')),
                'left': cm(attr(mar, 'w:left')), 'right': cm(attr(mar, 'w:right'))}

    def page_borders(self):
        out = []
        for s in self.body.iter(q('w:sectPr')):
            b = s.find(q('w:pgBorders'))
            if b is not None:
                out += [{'side': x.tag.split('}')[1], 'val': attr(x, 'w:val'), 'sz': int(attr(x, 'w:sz', '0')) / 8.0,
                         'color': attr(x, 'w:color'), 'theme': attr(x, 'w:themeColor'), 'tint': attr(x, 'w:themeTint')}
                        for x in b]
        return out

    def background(self):
        """'image' / 'color:RRGGBB' / None"""
        bg = self.doc.find(q('w:background'))
        if bg is None:
            return None
        fill = bg.find('.//' + q('v:fill'))
        if fill is not None and attr(fill, 'r:id'):
            return 'image'
        return 'color:' + (attr(bg, 'w:color') or '')

    def tables(self):
        out = []
        for t in self.body.iter(q('w:tbl')):
            tp = t.find(q('w:tblPr'))
            style = attr(tp.find(q('w:tblStyle')) if tp is not None else None, 'w:val')
            rows = t.findall(q('w:tr'))
            ncols = max((len(r.findall(q('w:tc'))) for r in rows), default=0)
            jc = attr(tp.find(q('w:jc')) if tp is not None else None, 'w:val')
            tw = tp.find(q('w:tblW')) if tp is not None else None
            layout = attr(tp.find(q('w:tblLayout')) if tp is not None else None, 'w:type')
            borders = {}
            tb = tp.find(q('w:tblBorders')) if tp is not None else None
            if tb is not None:
                for b in tb:
                    borders[b.tag.split('}')[1]] = {'val': attr(b, 'w:val'), 'sz': int(attr(b, 'w:sz', '0')) / 8.0,
                                                   'color': (attr(b, 'w:color') or '').upper()}
            # 单元格级边框（Word 有时把外框写在单元格上）
            cell_borders = []
            for tc in t.iter(q('w:tc')):
                cb = tc.find(q('w:tcPr') + '/' + q('w:tcBorders'))
                if cb is not None:
                    cell_borders.append({b.tag.split('}')[1]: {'val': attr(b, 'w:val'), 'sz': int(attr(b, 'w:sz', '0')) / 8.0,
                                                              'color': (attr(b, 'w:color') or '').upper()} for b in cb})
            texts = [[''.join(x.text or '' for x in tc.iter(q('w:t'))) for tc in r.findall(q('w:tc'))] for r in rows]
            out.append({'el': t, 'style': style, 'style_name': self.style_name(style) if style else None,
                        'rows': len(rows), 'cols': ncols, 'jc': jc, 'width_type': attr(tw, 'w:type'),
                        'width': attr(tw, 'w:w'), 'layout': layout, 'borders': borders,
                        'cell_borders': cell_borders, 'texts': texts})
        return out

    def drawings(self):
        """图片/文本框/艺术字：[{kind, inline, wrap, w_cm, h_cm, text, el, para}]"""
        out = []
        for p in self.paragraphs:
            for dr in p.el.iter(q('w:drawing')):
                inner = dr[0] if len(dr) else None
                if inner is None:
                    continue
                inline = inner.tag == q('wp:inline')
                ext = inner.find(q('wp:extent'))
                wrap = None
                if not inline:
                    for w in ('wrapSquare', 'wrapTopAndBottom', 'wrapTight', 'wrapThrough', 'wrapNone'):
                        if inner.find(q('wp:' + w)) is not None:
                            wrap = w
                    if attr(inner, 'behindDoc') == '1' and wrap == 'wrapNone':
                        wrap = 'behind'
                pos_h = inner.find(q('wp:positionH'))
                align_h = None
                if pos_h is not None and pos_h.find(q('wp:align')) is not None:
                    align_h = pos_h.find(q('wp:align')).text
                kind = 'pic' if dr.find('.//' + q('a:blip')) is not None else 'shape'
                txt = ''.join(x.text or '' for x in dr.iter(q('w:t')))
                out.append({'kind': kind, 'inline': inline, 'wrap': wrap, 'align_h': align_h,
                            'w_cm': round(int(attr(ext, 'cx', '0')) / EMU_PER_CM, 2),
                            'h_cm': round(int(attr(ext, 'cy', '0')) / EMU_PER_CM, 2),
                            'text': txt, 'el': dr, 'para': p})
        return out

    def footnotes(self):
        root = self.xml('word/footnotes.xml')
        out = []
        if root is None:
            return out
        for f in root.findall(q('w:footnote')):
            if attr(f, 'w:type') in ('separator', 'continuationSeparator'):
                continue
            out.append(''.join(x.text or '' for x in f.iter(q('w:t'))).strip())
        return out

    def footnote_ref_paragraphs(self):
        return [p for p in self.paragraphs if p.el.find('.//' + q('w:footnoteReference')) is not None]

    def columns(self):
        """各节的分栏：[{num, sep, equal}]"""
        out = []
        for s in self.body.iter(q('w:sectPr')):
            c = s.find(q('w:cols'))
            out.append({'num': int(attr(c, 'w:num', '1')) if c is not None else 1,
                        'sep': attr(c, 'w:sep') in ('1', 'true') if c is not None else False,
                        'equal': attr(c, 'w:equalWidth', '1') not in ('0', 'false') if c is not None else True,
                        'el': s})
        return out


def run_font_ea(doc, run):
    return doc.font(run.props.get('font_ea') or run.props.get('font_ascii'))


def run_font_ascii(doc, run):
    return doc.font(run.props.get('font_ascii') or run.props.get('font_hansi'))


# ====================================================================== Excel

def col_index(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def split_ref(ref):
    m = re.match(r'^\$?([A-Z]+)\$?(\d+)$', ref)
    return m.group(1), int(m.group(2))


def ref_range(rng):
    a, b = (rng.split(':') + [rng])[:2]
    ca, ra = split_ref(a)
    cb, rb = split_ref(b)
    return col_index(ca), ra, col_index(cb), rb


class Cell:
    def __init__(self, ref, value, formula, style):
        self.ref, self.value, self.formula, self.style = ref, value, formula, style

    def __repr__(self):
        return 'Cell(%s=%r f=%r)' % (self.ref, self.value, self.formula)


class Sheet:
    def __init__(self, book, name, part):
        self.book, self.name, self.part = book, name, part
        root = book.xml(part)
        self.root = root
        self.cells = {}
        shared = {}                       # 共享公式：si -> 主单元格公式文本
        for f in root.iter(q('s:f')):
            if f.get('t') == 'shared' and f.text:
                shared[f.get('si')] = f.text
        for c in root.iter(q('s:c')):
            r = c.get('r')
            t = c.get('t')
            v = c.find(q('s:v'))
            f = c.find(q('s:f'))
            val = v.text if v is not None else None
            if t == 's' and val is not None:
                val = book.shared[int(val)]
            elif t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(q('s:t')))
            elif val is not None and t not in ('str', 'e', 'b'):
                try:
                    val = float(val)
                except ValueError:
                    pass
            formula = None
            if f is not None:
                formula = f.text or shared.get(f.get('si')) or ''
            self.cells[r] = Cell(r, val, formula, int(c.get('s', '0')))
        self.merges = [m.get('ref') for m in root.iter(q('s:mergeCell'))]
        tc = root.find(q('s:sheetPr') + '/' + q('s:tabColor'))
        self.tab_color = None if tc is None else ((tc.get('rgb') or '')[-6:].upper() or ('theme:' + str(tc.get('theme'))))
        af = root.find(q('s:autoFilter'))
        self.autofilter = af
        self.filters = {}                 # 列号(从0) -> [(operator, val)]
        if af is not None:
            for fc in af.findall(q('s:filterColumn')):
                conds = [(cf.get('operator', 'equal'), cf.get('val')) for cf in fc.iter(q('s:customFilter'))]
                vals = [x.get('val') for x in fc.iter(q('s:filter'))]
                self.filters[int(fc.get('colId'))] = conds or [('in', v) for v in vals]
        self.cond = []
        for cf in root.iter(q('s:conditionalFormatting')):
            for rule in cf.findall(q('s:cfRule')):
                self.cond.append({'sqref': cf.get('sqref'), 'type': rule.get('type'), 'operator': rule.get('operator'),
                                  'formula': [x.text for x in rule.findall(q('s:formula'))],
                                  'dxf': book.dxf(int(rule.get('dxfId'))) if rule.get('dxfId') else {}})
        # x14 扩展里的条件格式（新版 Excel 有时写在 extLst）
        rels = book.rels(part)
        self.tables = []
        for tp in root.iter(q('s:tablePart')):
            tpath = rels[tp.get(q('r:id'))][0]
            t = book.xml(tpath)
            si = t.find(q('s:tableStyleInfo'))
            self.tables.append({'ref': t.get('ref'), 'style': si.get('name') if si is not None else None,
                                'autofilter': t.find(q('s:autoFilter')) is not None, 'el': t})
        self.charts = []
        for d in root.iter(q('s:drawing')):
            dpath = rels[d.get(q('r:id'))][0]
            drels = book.rels(dpath)
            droot = book.xml(dpath)
            for anc in list(droot):
                fr, to = anc.find(q('xdr:from')), anc.find(q('xdr:to'))
                cref = anc.find('.//' + q('c:chart'))
                if cref is None:
                    continue
                cpath = drels[cref.get(q('r:id'))][0]
                croot = book.xml(cpath)
                plot = croot.find('.//' + q('c:plotArea'))
                types = [x.tag.split('}')[1] for x in plot if x.tag.endswith('Chart')] if plot is not None else []
                bar_dir = croot.find('.//' + q('c:barDir'))
                grouping = croot.find('.//' + q('c:grouping'))
                title = croot.find('.//' + q('c:title'))
                ttext = ''.join(x.text or '' for x in title.iter(q('a:t'))) if title is not None else ''
                pos = lambda e: (int(e.find(q('xdr:col')).text), int(e.find(q('xdr:row')).text)) if e is not None else None
                self.charts.append({'types': types, 'bar_dir': bar_dir.get('val') if bar_dir is not None else None,
                                    'grouping': grouping.get('val') if grouping is not None else None,
                                    'title': ttext, 'from': pos(fr), 'to': pos(to),
                                    'refs': [x.text for x in croot.iter(q('c:f'))]})

    def get(self, ref):
        return self.cells.get(ref)

    def value(self, ref):
        c = self.cells.get(ref)
        return c.value if c else None

    def column_values(self, col, r1, r2):
        return [self.value('%s%d' % (col, r)) for r in range(r1, r2 + 1)]

    def xf(self, ref):
        c = self.cells.get(ref)
        return self.book.xf(c.style if c else 0)

    def merged(self, rng):
        return rng in self.merges


class Xlsx(Package):
    def __init__(self, path):
        super().__init__(path)
        ss = self.xml('xl/sharedStrings.xml')
        self.shared = []
        if ss is not None:
            for si in ss.findall(q('s:si')):
                # 只取正文（富文本 r/t 或直接 t），不含拼音 rPh
                rs = si.findall(q('s:r'))
                self.shared.append(''.join(r.findtext(q('s:t')) or '' for r in rs) if rs else (si.findtext(q('s:t')) or ''))
        self._styles()
        wb = self.xml('xl/workbook.xml')
        rels = self.rels('xl/workbook.xml')
        self.sheets = []
        for s in wb.iter(q('s:sheet')):
            self.sheets.append(Sheet(self, s.get('name'), rels[s.get(q('r:id'))][0]))

    def _styles(self):
        st = self.xml('xl/styles.xml')
        self.fonts, self.fills, self.xfs, self.dxfs, self.numfmts = [], [], [], [], {}
        if st is None:
            return
        for nf in st.iter(q('s:numFmt')):
            self.numfmts[int(nf.get('numFmtId'))] = nf.get('formatCode')
        fonts = st.find(q('s:fonts'))
        for f in (fonts if fonts is not None else []):
            self.fonts.append(self._font(f))
        fills = st.find(q('s:fills'))
        for f in (fills if fills is not None else []):
            self.fills.append(self._fill(f))
        xfs = st.find(q('s:cellXfs'))
        for x in (xfs if xfs is not None else []):
            al = x.find(q('s:alignment'))
            nid = int(x.get('numFmtId', '0'))
            self.xfs.append({'font': self.fonts[int(x.get('fontId', '0'))] if self.fonts else {},
                             'fill': self.fills[int(x.get('fillId', '0'))] if self.fills else {},
                             'numfmt_id': nid, 'numfmt': self.numfmts.get(nid, BUILTIN_NUMFMT.get(nid, '')),
                             'h_align': al.get('horizontal') if al is not None else None})
        dx = st.find(q('s:dxfs'))
        for d in (dx if dx is not None else []):
            f = d.find(q('s:font'))
            fl = d.find(q('s:fill'))
            nf = d.find(q('s:numFmt'))
            self.dxfs.append({'font': self._font(f) if f is not None else {},
                              'fill': self._fill(fl, dxf=True) if fl is not None else {},
                              'numfmt': nf.get('formatCode') if nf is not None else None})

    @staticmethod
    def _color(el):
        if el is None:
            return None
        if el.get('rgb'):
            return el.get('rgb')[-6:].upper()
        if el.get('theme') is not None:
            return 'theme:%s:%s' % (el.get('theme'), el.get('tint', '0'))
        if el.get('indexed') is not None:
            return INDEXED.get(int(el.get('indexed')), 'indexed:' + el.get('indexed'))
        return None

    def _font(self, f):
        name = f.find(q('s:name'))
        sz = f.find(q('s:sz'))
        return {'name': name.get('val') if name is not None else None,
                'size': float(sz.get('val')) if sz is not None else None,
                'bold': f.find(q('s:b')) is not None and f.find(q('s:b')).get('val', '1') not in ('0', 'false'),
                'color': self._color(f.find(q('s:color')))}

    def _fill(self, f, dxf=False):
        pf = f.find(q('s:patternFill'))
        if pf is None:
            return {}
        fg, bg = self._color(pf.find(q('s:fgColor'))), self._color(pf.find(q('s:bgColor')))
        # 条件格式（dxf）里纯色填充的颜色写在 bgColor
        return {'pattern': pf.get('patternType'), 'fg': fg, 'bg': bg, 'color': (bg if dxf else fg) or fg or bg}

    def xf(self, i):
        return self.xfs[i] if i < len(self.xfs) else {}

    def dxf(self, i):
        return self.dxfs[i] if i < len(self.dxfs) else {}

    def sheet(self, name=None, index=0):
        if name:
            return next((s for s in self.sheets if s.name == name), None)
        return self.sheets[index] if index < len(self.sheets) else None


BUILTIN_NUMFMT = {0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'yyyy/m/d'}
INDEXED = {2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00', 10: 'FF0000', 17: '008000', 11: '00FF00', 12: '0000FF'}


# ====================================================================== PowerPoint

class Shape:
    def __init__(self, el, slide):
        self.el = el
        self.slide = slide
        nv = el.find('.//' + q('p:cNvPr'))
        self.id = nv.get('id') if nv is not None else None
        self.name = nv.get('name') if nv is not None else ''
        ph = el.find('.//' + q('p:nvPr') + '/' + q('p:ph'))
        self.ph_type = (ph.get('type') or 'body') if ph is not None else None
        self.ph_idx = ph.get('idx') if ph is not None else None
        self.kind = el.tag.split('}')[1]          # sp / pic / graphicFrame / grpSp
        self.paragraphs = []
        tx = el.find(q('p:txBody'))
        if tx is not None:
            for p in tx.findall(q('a:p')):
                runs = []
                for r in p.findall(q('a:r')):
                    rp = r.find(q('a:rPr'))
                    runs.append({'text': r.findtext(q('a:t')) or '', 'props': _a_rpr(rp)})
                ppr = p.find(q('a:pPr'))
                self.paragraphs.append({'runs': runs, 'text': ''.join(x['text'] for x in runs),
                                        'bullet': None if ppr is None else _bullet(ppr),
                                        'end': _a_rpr(p.find(q('a:endParaRPr')))})
        self.text = '\n'.join(p['text'] for p in self.paragraphs)

    def text_runs(self):
        return [r for p in self.paragraphs for r in p['runs'] if r['text'].strip()]

    def __repr__(self):
        return 'Shape(%s %s %s %r)' % (self.kind, self.id, self.ph_type, self.text[:20])


def _bullet(ppr):
    for t in ('buChar', 'buAutoNum', 'buBlip'):
        if ppr.find(q('a:' + t)) is not None:
            return t
    if ppr.find(q('a:buNone')) is not None:
        return 'none'
    return None


def _a_color(el):
    if el is None:
        return None
    sf = el.find(q('a:solidFill'))
    if sf is None:
        return None
    c = sf.find(q('a:srgbClr'))
    if c is not None:
        return c.get('val').upper()
    c = sf.find(q('a:schemeClr'))
    if c is not None:
        mods = ''.join(':%s=%s' % (m.tag.split('}')[1], m.get('val')) for m in c)
        return 'scheme:' + c.get('val') + mods
    return None


def _a_rpr(rp):
    if rp is None:
        return {}
    d = {}
    if rp.get('sz'):
        d['size'] = int(rp.get('sz')) / 100.0
    if rp.get('b') is not None:
        d['bold'] = rp.get('b') in ('1', 'true')
    for tag, k in (('a:latin', 'latin'), ('a:ea', 'ea')):
        e = rp.find(q(tag))
        if e is not None:
            d[k] = e.get('typeface')
    c = _a_color(rp)
    if c:
        d['color'] = c
    return d


class Slide:
    def __init__(self, pres, part):
        self.pres, self.part = pres, part
        self.root = pres.xml(part)
        rels = pres.rels(part)
        self.layout_part = next((t for t, typ, _ in rels.values() if typ == 'slideLayout'), None)
        lroot = pres.xml(self.layout_part) if self.layout_part else None
        self.layout_type = lroot.get('type') if lroot is not None else None
        csld = lroot.find(q('p:cSld')) if lroot is not None else None
        self.layout_name = csld.get('name') if csld is not None else None
        tree = self.root.find(q('p:cSld') + '/' + q('p:spTree'))
        self.shapes = [Shape(el, self) for el in tree.iter() if el.tag in (q('p:sp'), q('p:pic'))]
        self.pics = [s for s in self.shapes if s.kind == 'pic']
        self.rels = rels

    @property
    def text(self):
        return '\n'.join(s.text for s in self.shapes if s.text)

    def ph(self, *types):
        return [s for s in self.shapes if s.ph_type in types]

    def title(self):
        t = self.ph('title', 'ctrTitle')
        return t[0] if t else None

    def shape_by_id(self, sid):
        return next((s for s in self.shapes if s.id == sid), None)

    def transition(self):
        """返回 (类型名, 属性dict, advTm毫秒或None)；兼容 mc:AlternateContent 里 p14 的新切换效果"""
        tr = None
        for el in self.root.iter(q('p:transition')):
            tr = el
            break
        if tr is None:
            return None, {}, None
        adv = tr.get('advTm')
        kinds = [c for c in tr if c.tag not in (q('p:sndAc'), q('p:extLst'))]
        if not kinds:
            return 'none', {}, int(adv) if adv else None
        k = kinds[0]
        return k.tag.split('}')[1], dict(k.attrib), int(adv) if adv else None

    def transitions_all(self):
        """所有 transition 元素（AlternateContent 的 Choice/Fallback 各一个）"""
        out = []
        for el in self.root.iter(q('p:transition')):
            kinds = [c for c in el if c.tag not in (q('p:sndAc'), q('p:extLst'))]
            out.append({'kind': kinds[0].tag.split('}')[1] if kinds else 'none',
                        'attrs': dict(kinds[0].attrib) if kinds else {},
                        'advTm': int(el.get('advTm')) if el.get('advTm') else None,
                        'advClick': el.get('advClick')})
        return out

    def animations(self):
        """按播放顺序：[{spid, preset, cls, subtype, node, build}]"""
        out = []
        timing = self.root.find(q('p:timing'))
        if timing is None:
            return out
        builds = {b.get('spid'): b.get('build') for b in timing.iter(q('p:bldP'))}
        for ctn in timing.iter(q('p:cTn')):
            if ctn.get('presetID') is None:
                continue
            tgt = ctn.find('.//' + q('p:spTgt'))
            spid = tgt.get('spid') if tgt is not None else None
            out.append({'spid': spid, 'preset': int(ctn.get('presetID')), 'cls': ctn.get('presetClass'),
                        'subtype': int(ctn.get('presetSubtype', '0')), 'node': ctn.get('nodeType'),
                        'grp': ctn.get('grpId'), 'build': builds.get(spid),
                        'para': tgt.find(q('p:txEl')) is not None if tgt is not None else False})
        return out

    def background(self):
        bg = self.root.find(q('p:cSld') + '/' + q('p:bg'))
        if bg is None:
            return None
        pr = bg.find(q('p:bgPr'))
        if pr is None:
            return 'ref'
        return _a_color(pr) or 'other'


class Pptx(Package):
    def __init__(self, path):
        super().__init__(path)
        pres = self.xml('ppt/presentation.xml')
        rels = self.rels('ppt/presentation.xml')
        self.slides = [Slide(self, rels[s.get(q('r:id'))][0]) for s in pres.iter(q('p:sldId'))]
        self.theme_part = next((t for t, typ, _ in rels.values() if typ == 'theme'), None)
        # 母版的主题
        master = next((t for t, typ, _ in rels.values() if typ == 'slideMaster'), None)
        mrels = self.rels(master) if master else {}
        mtheme = next((t for t, typ, _ in mrels.values() if typ == 'theme'), None)
        th = self.xml(mtheme or self.theme_part) if (mtheme or self.theme_part) else None
        self.theme_name = th.get('name') if th is not None else None
        pp = self.xml('ppt/presProps.xml')
        self.show = None
        self.show_loop = False
        if pp is not None:
            sp = pp.find(q('p:showPr'))
            if sp is not None:
                self.show_loop = sp.get('loop') in ('1', 'true')
                for k in ('present', 'browse', 'kiosk'):
                    if sp.find(q('p:' + k)) is not None:
                        self.show = k
        if self.show is None:
            self.show = 'present'
