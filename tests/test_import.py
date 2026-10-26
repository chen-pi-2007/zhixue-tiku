# -*- coding: utf-8 -*-
"""导入整理台的解析（docparse.py）：老师随手发的各种卷子、粘贴的答案、标准格式往返"""
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import docparse  # noqa: E402


def parse(text):
    return docparse.parse_lines(text.split('\n'))['questions']


def brief(qs):
    return [(q['type'], q['answer']) for q in qs]


class ShapeTest(unittest.TestCase):
    def test_no_number_no_tag(self):
        """没题号、没题型标记：一组选项是一道题的结尾，“（ ）”结尾没选项的是判断题，卷名不进题干"""
        qs = parse('思想政治练习卷\n姓名______ 班级______\n职业生涯规划的第一步是\nA.确定目标\nB.认识自我\nC.制定措施\nD.评估调整\n'
                   '下列属于职业道德基本要求的有哪些\nA.爱岗敬业\nB.诚实守信\n人的兴趣是可以培养的。（ ）\n'
                   '职业理想与个人发展无关。（ ）\n简述职业生涯规划的意义。\n')
        self.assertEqual([q['type'] for q in qs], ['single', 'multi', 'judge', 'judge', 'qa'])
        self.assertEqual(qs[0]['stem'], '职业生涯规划的第一步是')
        self.assertTrue(all('no_answer' in q['flags'] for q in qs))
        self.assertIn('type_guess', qs[0]['flags'])
        self.assertEqual((qs[0]['line'], qs[0]['end']), (2, 6))

    def test_pasted_key_matches_by_order(self):
        """没题号的卷子，粘贴的答案按第几道题对上；“5.略”这种认不出的不影响别的"""
        qs = parse('第一步是\nA.甲\nB.乙\n人的兴趣可以培养。（ ）\n简述意义。\n\n参考答案：2.对 3.略\n参考答案：1-1 B')
        self.assertEqual(brief(qs), [('single', 'B'), ('judge', '对'), ('qa', '')])


class KeyTest(unittest.TestCase):
    def test_key_formats(self):
        key, lines = docparse.extract_answer_key(['1.C2.A3.A', '4-6 BDA', '7.ABD 8.对 9.×', '正文 2024年3月5日'])
        self.assertEqual(key, {1: 'C', 2: 'A', 3: 'A', 4: 'B', 5: 'D', 6: 'A', 7: 'ABD', 8: '对', 9: '错'})
        self.assertEqual(lines, ['', '', '', '正文 2024年3月5日'])       # 答案行换成空行，行号不变

    def test_solution_answer_not_key(self):
        """“答案：（1）2a+b=…”是一道题的解答，不是答案表"""
        qs = parse('1.【问答题】求 2a+b\n答案：（1）2a+b=(−5,5)；（2）略')
        self.assertTrue(qs[0]['answer'].startswith('（1）2a+b'))

    def test_section_titles(self):
        qs = parse('一、单项选择题\n1.甲\nA.a B.b\n二、多项选择题\n2.乙\nA.a B.b C.c\n三、判断题\n3.丙\n四、问答题\n4.丁')
        self.assertEqual([q['type'] for q in qs], ['single', 'multi', 'judge', 'qa'])


class StandardFormatTest(unittest.TestCase):
    def test_material_and_doubt(self):
        qs = parse('1.【单选题】甲\nA.x\nB.y\n答案：A\n【材料】\n一段材料。\n2.【单选题】乙\nA.x\nB.y\n答案：B\n'
                   '3.【判断题】丙\n答案：对\n【存疑】看不清\n【材料结束】\n4.【问答题】丁\n答案：第一行\n第二行\n解析：说明')
        self.assertEqual(brief(qs), [('single', 'A'), ('single', 'B'), ('judge', '对'), ('qa', '第一行\n第二行')])
        self.assertEqual([q['material'] for q in qs], ['', '一段材料。', '一段材料。', ''])
        self.assertIn('doubt', qs[2]['flags'])
        self.assertEqual(qs[3]['analysis'], '说明')

    def test_option_letters_inside_stem(self):
        """题干里有“A、B、C 三个控制点”时，选项从行首的 A. 开始拆"""
        qs = parse('1.【多选题】关于A、B、C三个控制点，正确的是\nA.A、B、C为控制点\nB.B表示终点\n答案：AB')
        self.assertEqual(qs[0]['stem'], '关于A、B、C三个控制点，正确的是')
        self.assertEqual([o[0] for o in qs[0]['options']], ['A', 'B'])

    def test_round_trip_bank(self):
        """题库里每张卷子转成标准格式再解析回来，题型、题干、选项、答案、材料都不变（导入整理台「补答案 / 修改」靠这个）"""
        path = os.path.join(os.path.dirname(HERE), 'data', 'bank.json')
        if not os.path.exists(path):
            self.skipTest('没有 data/bank.json')
        with open(path, encoding='utf-8') as f:
            bank = json.load(f)
        norm = lambda s: '\n'.join(x.strip() for x in str(s or '').strip().split('\n') if x.strip())
        for p in bank['papers']:
            qs = sorted([q for q in bank['questions'] if q['paper_id'] == p['id']], key=lambda q: int(q['key'].split('#')[1]))
            back = parse(docparse.to_text(qs, p['name']))
            self.assertEqual(len(back), len(qs), p['key'])
            for a, b in zip(qs, back):
                self.assertEqual('qa' if a['type'] == 'blank' else a['type'], b['type'], a['key'])
                for f in ('stem', 'answer', 'material'):
                    self.assertEqual(norm(a.get(f)), norm(b.get(f)), '%s %s' % (a['key'], f))
                self.assertEqual([[k, (t or '').replace('\n', ' ').strip()] for k, t in a.get('options') or []],
                                 [[k, t.strip()] for k, t in b['options']], a['key'])


def mini_docx(body, rels, files):
    """拼一个最小的 Word 文件：body 是 <w:body> 里的段落，rels 是 {rId: 图片路径}，files 是 {路径: 字节}"""
    import io
    import zipfile
    ns = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
          'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
          'xmlns:v="urn:schemas-microsoft-com:vml" '
          'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"')
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        z.writestr('word/document.xml', '<w:document %s><w:body>%s</w:body></w:document>' % (ns, body))
        z.writestr('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                   ''.join('<Relationship Id="%s" Target="%s"/>' % kv for kv in rels.items()) + '</Relationships>')
        for k, v in files.items():
            z.writestr(k, v)
    return b.getvalue()


class ImageTest(unittest.TestCase):
    def test_images_extracted_in_place(self):
        """Word 里的图片取出来、原位置写 [[img:]]；新版 Word 同一张图的老版本备份（mc:Fallback）不重复；
        EMF 这种浏览器显示不了的、公式对象，留 [图片] 记号"""
        drawing = '<w:r><w:drawing><a:blip r:embed="%s"/></w:drawing></w:r>'
        body = ('<w:p><w:r><w:t>1. 下图是（ ）</w:t></w:r></w:p>'
                '<w:p><mc:AlternateContent><mc:Choice>' + drawing % 'rId1' + '</mc:Choice>'
                '<mc:Fallback><w:r><w:pict><v:imagedata r:id="rId1"/></w:pict></w:r></mc:Fallback></mc:AlternateContent></w:p>'
                '<w:p><w:r><w:t>A.甲</w:t></w:r></w:p><w:p><w:r><w:t>B.</w:t></w:r>' + drawing % 'rId2' + '</w:p>'
                '<w:p><w:r><w:t>答案：B</w:t></w:r></w:p>'
                '<w:p><w:r><w:t>2. 公式</w:t></w:r><w:r><w:object><v:imagedata r:id="rId3"/></w:object></w:r>' + drawing % 'rId4' + '</w:p>')
        data = mini_docx(body, {'rId1': 'media/image1.png', 'rId2': 'media/image2.jpeg', 'rId3': 'media/image3.wmf', 'rId4': 'media/image4.emf'},
                         {'word/media/image1.png': b'png1', 'word/media/image2.jpeg': b'jpg2', 'word/media/image3.wmf': b'w', 'word/media/image4.emf': b'e'})
        saved = []

        def save(ext, b):
            saved.append((ext, b))
            return 'x/%d%s' % (len(saved), ext)
        qs = docparse.parse_lines([ln for p in docparse.extract_any(data, 'a.docx', save) for ln in p.split('\n')])['questions']
        self.assertEqual(saved, [('.png', b'png1'), ('.jpeg', b'jpg2')])
        self.assertIn('[[img:x/1.png]]', qs[0]['stem'])
        self.assertEqual(qs[0]['options'], [['A', '甲'], ['B', '[[img:x/2.jpeg]]']])
        self.assertEqual(qs[0]['answer'], 'B')
        self.assertEqual(qs[1]['stem'].count('[图片]'), 2)
        self.assertIn('has_image', qs[1]['flags'])
        # 不传存图函数（老接口）：图片一律写成 [图片]
        plain = '\n'.join(docparse.extract_any(data, 'a.docx'))
        self.assertNotIn('[[img:', plain)


if __name__ == '__main__':
    unittest.main()
