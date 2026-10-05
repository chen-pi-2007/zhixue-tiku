# -*- coding: utf-8 -*-
"""技能题判分入口：grade(卷key, 模块id, 考生文件夹) -> 每小题得分和逐项说明。"""
import os

from .ooxml import Docx, Xlsx, Pptx
from .web import Site
from .specs_comp import SPECS as COMP_SPECS

SPECS = dict(COMP_SPECS)
FILES = {'word': '文档.docx', 'excel': '文档.xlsx', 'ppt': '文档.pptx', 'web': 'web'}


class Ctx:
    def __init__(self, folder):
        self.folder = folder
        self._cache = {}

    def _load(self, key, cls, name):
        if key not in self._cache:
            path = os.path.join(self.folder, name)
            if not os.path.exists(path):
                raise FileNotFoundError(path)
            self._cache[key] = cls(path)
        return self._cache[key]

    @property
    def docx(self):
        return self._load('docx', Docx, FILES['word'])

    @property
    def xlsx(self):
        return self._load('xlsx', Xlsx, FILES['excel'])

    @property
    def pptx(self):
        return self._load('pptx', Pptx, FILES['ppt'])

    @property
    def site(self):
        return self._load('site', Site, FILES['web'])


def has_spec(key, module):
    return module in SPECS.get(key, {})


def grade(key, module, folder):
    tasks = SPECS[key][module]
    ctx = Ctx(folder)
    out = []
    for i, checks in enumerate(tasks, 1):
        rs = [c.run(ctx) for c in checks]
        out.append({'no': i, 'score': round(sum(r['score'] for r in rs), 2),
                    'points': round(sum(r['points'] for r in rs), 2), 'checks': rs})
    total = round(sum(t['score'] for t in out), 2)
    return {'score': total, 'points': round(sum(t['points'] for t in out), 2), 'tasks': out}
