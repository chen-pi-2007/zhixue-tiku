# -*- coding: utf-8 -*-
"""网页设计题：用标准库把 Dreamweaver 保存的框架网页解析成简单的树，供检查器查询。"""
import os
import re
from html.parser import HTMLParser

VOID = {'meta', 'link', 'img', 'br', 'hr', 'input', 'frame', 'base', 'col', 'area', 'param', 'source'}


class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag = tag
        self.attrs = {k.lower(): (v if v is not None else '') for k, v in attrs}
        self.parent = parent
        self.children = []
        self.texts = []

    def get(self, name, default=None):
        return self.attrs.get(name.lower(), default)

    def iter(self, tag=None):
        for c in self.children:
            if tag is None or c.tag == tag:
                yield c
            yield from c.iter(tag)

    def find_all(self, tag=None, **attrs):
        out = []
        for n in self.iter(tag):
            if all((n.get(k) or '').lower() == str(v).lower() for k, v in attrs.items()):
                out.append(n)
        return out

    def find(self, tag=None, **attrs):
        r = self.find_all(tag, **attrs)
        return r[0] if r else None

    @property
    def text(self):
        parts = list(self.texts)
        for c in self.children:
            parts.append(c.text)
        return re.sub(r'\s+', ' ', ''.join(parts)).strip()

    def ancestors(self):
        p = self.parent
        while p is not None:
            yield p
            p = p.parent

    def __repr__(self):
        return '<%s %s>' % (self.tag, self.attrs)


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root', [])
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.texts.append(data)


def parse_css(text):
    """'.a { font-family: "黑体"; color:#990033 }' -> {'.a': {'font-family': '黑体', 'color': '#990033'}}"""
    rules = {}
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', text):
        props = {}
        for decl in body.split(';'):
            if ':' in decl:
                k, v = decl.split(':', 1)
                props[k.strip().lower()] = v.strip().strip('"\'').strip()
        for s in sel.split(','):
            rules.setdefault(s.strip(), {}).update(props)
    return rules


def parse_style_attr(s):
    return parse_css('x{%s}' % (s or '')).get('x', {})


class Page:
    def __init__(self, path):
        self.path = path
        self.exists = os.path.exists(path)
        raw = b''
        if self.exists:
            with open(path, 'rb') as f:
                raw = f.read()
        for enc in ('utf-8', 'gbk'):
            try:
                self.html = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        b = _Builder()
        b.feed(self.html)
        self.root = b.root
        self.css = {}
        for st in self.root.iter('style'):
            self.css.update(parse_css(''.join(st.texts)))
        t = self.root.find('title')
        self.title = t.text if t is not None else ''
        self.body = self.root.find('body')

    def find_all(self, tag=None, **attrs):
        return self.root.find_all(tag, **attrs)

    def find(self, tag=None, **attrs):
        return self.root.find(tag, **attrs)

    def text_node(self, text):
        """包含这段文字的最内层元素"""
        best = None
        for n in self.root.iter():
            if text in ''.join(n.texts):
                best = n
        return best

    def styles_for(self, node):
        """元素生效的样式：class 规则 + 标签规则 + style 属性 + 祖先的 class（只取常用继承属性）"""
        out = {}
        chain = list(reversed(list(node.ancestors()))) + [node]
        for n in chain:
            if n.tag.startswith('#'):
                continue
            out.update(self.css.get(n.tag, {}))
            for c in (n.get('class') or '').split():
                out.update(self.css.get('.' + c, {}))
            if n.get('id'):
                out.update(self.css.get('#' + n.get('id'), {}))
            out.update(parse_style_attr(n.get('style')))
            for a, k in (('align', 'text-align'), ('bgcolor', 'background-color')):
                if n.get(a):
                    out[k] = n.get(a)
        return out


class Site:
    """框架网页：index.html 及其引用的各页"""

    def __init__(self, folder):
        self.folder = folder
        self.index = Page(os.path.join(folder, 'index.html'))

    def page(self, name):
        return Page(os.path.join(self.folder, name))

    def frames(self):
        return self.index.find_all('frame')

    def frame(self, name):
        for f in self.frames():
            if (f.get('name') or '') == name or (f.get('id') or '') == name:
                return f
        return None

    def frame_page(self, name):
        f = self.frame(name)
        if f is None or not f.get('src'):
            return None
        return self.page(f.get('src'))

    def framesets(self):
        return self.index.find_all('frameset')

    def frameset_of(self, frame):
        return frame.parent if frame is not None and frame.parent.tag == 'frameset' else None
