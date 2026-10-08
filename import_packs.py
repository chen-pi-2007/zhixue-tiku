# -*- coding: utf-8 -*-
# 智学题库 · 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
# https://github.com/chen-pi-2007/zhixue-tiku  © 2026 十三、chen_pi，保留所有权利。
"""导入题库包：python import_packs.py <题库包目录或某个 .json> ...

题库包由 学测/_脚本/build_packs.py 生成，格式：
  {"key": "english-vocab", "name": "英语 词汇与语法", "subject": "english",
   "questions": [{"type", "stem", "material", "options": [["A","..."]], "answer", "analysis", "qno"}]}
图片在 <目录>/media/<key>/ 下。同 key 的卷子整卷替换，做题记录保留。
不要在网页服务运行时导入（两边都会写 bank.json），先关掉服务。
"""
import glob
import json
import os
import sys

import db


def import_file(path):
    with open(path, encoding='utf-8') as f:
        pack = json.load(f)
    media = os.path.join(os.path.dirname(path), 'media', pack['key'])
    pid, name = db.upsert_paper(pack['key'], pack['name'], pack['subject'], pack['questions'],
                                media_src=media if os.path.isdir(media) else None)
    print('  %-22s %-26s %4d 题' % (pack['key'], name, len(pack['questions'])))


def import_skills(src):
    """技能题库包（题库包/skills/<卷key>/）整卷复制到 data/skills/；练习文件夹和做题记录不动"""
    import shutil
    dst_root = os.path.join(db.DATA_DIR, 'skills')
    os.makedirs(dst_root, exist_ok=True)
    for key in sorted(os.listdir(src)):
        if not os.path.exists(os.path.join(src, key, 'skill.json')):
            continue
        dst = os.path.join(dst_root, key)
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(os.path.join(src, key), dst)
        print('  技能 %-16s 已导入' % key)


def main(args):
    if not args:
        print(__doc__)
        return 1
    db.init()
    files = []
    for a in args:
        files += sorted(glob.glob(os.path.join(a, '*.json'))) if os.path.isdir(a) else [a]
        if os.path.isdir(os.path.join(a, 'skills')):
            import_skills(os.path.join(a, 'skills'))
    for f in files:
        import_file(f)
    s = db.stats()
    print('完成：%d 份卷子，%d 题' % (s['papers'], s['questions']))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
