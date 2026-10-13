/* 智学题库 · 导出 Word —— 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
 * 把一份卷子（或一个题型）导出成 .docx：空白卷，或答案卷（红字标答案，最后附答案速查，不带解析）。
 * 不用任何库：自己拼 Word 的 XML，再打成不压缩的 zip。电脑上直接下载，手机上交给 App 弹分享面板。
 * 排版照 学测/_脚本/export_english_word.py。 */
'use strict';

const WX = (() => {
  const enc = new TextEncoder();
  const CN_NUM = '一二三四五六七八九十';
  const IMG = /\[\[img:([^\]]+)\]\]/g;
  const RED = 'C00000';
  const SECTION_TIP = {
    '单选题': '从每题所给的选项中选出最佳答案。',
    '连线题': '为每个问句选出恰当的答语。',
    '排序题': '选出每个空（或每个位置）对应的句子。',
    '完形填空': '阅读短文，从每题所给的选项中选出最佳答案。',
    '阅读理解': '阅读短文，判断正误或选出最佳答案。',
  };
  const SELF = ['qa', 'dictation', 'essay', 'blank', 'solution'];

  const x = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  // ---------------------------------------------------------------- zip（只存不压缩）
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {               // files: [[路径, Uint8Array]]
    const parts = [], cd = [];
    let off = 0;
    const u16 = v => [v & 255, (v >>> 8) & 255];
    const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach(([name, data]) => {
      const nb = enc.encode(name), crc = crc32(data);
      const common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nb.length), u16(0));
      const lh = new Uint8Array([].concat(u32(0x04034b50), common));
      parts.push(lh, nb, data);
      cd.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(off))), nb);
      off += lh.length + nb.length + data.length;
    });
    const cdLen = cd.reduce((s, b) => s + b.length, 0);
    const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdLen), u32(off), u16(0)));
    return new Blob(parts.concat(cd, [end]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ---------------------------------------------------------------- 文档内容
  function Doc() { this.body = []; this.media = []; this.pics = {}; }

  // 一段文字 → 若干 run：「」下划线，〔〕加点字，\( \) 数学公式，[[img:]] 图片
  Doc.prototype.runs = function (text, o) {
    o = o || {};
    let out = '';
    String(text || '').split(/(\[\[img:[^\]]+\]\]|\\\(.+?\\\))/).forEach(part => {
      if (!part) return;
      let m = /^\[\[img:([^\]]+)\]\]$/.exec(part);
      if (m) { out += this.pic(m[1], o.imgW || 15, o.imgH || 9); return; }
      m = /^\\\((.+)\\\)$/.exec(part);
      if (m) { out += '<m:oMath>' + omml(m[1]) + '</m:oMath>'; return; }
      part.split(/(「[^「」]*」|〔[^〔〕]*〕)/).forEach(seg => {
        if (!seg) return;
        if (seg[0] === '「') out += run(seg.slice(1, -1), Object.assign({}, o, { u: true }));
        else if (seg[0] === '〔') out += run(seg.slice(1, -1), Object.assign({}, o, { em: true }));
        else out += run(seg, o);
      });
    });
    return out;
  };
  function run(t, o) {
    let pr = '';
    if (o.b) pr += '<w:b/>';
    if (o.color) pr += '<w:color w:val="' + o.color + '"/>';
    if (o.size) pr += '<w:sz w:val="' + Math.round(o.size * 2) + '"/><w:szCs w:val="' + Math.round(o.size * 2) + '"/>';
    if (o.u) pr += '<w:u w:val="single"/>';
    if (o.em) pr += '<w:em w:val="dot"/>';
    return t.split('\n').map((ln, i) => (i ? '<w:r><w:br/></w:r>' : '') +
      '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + x(ln) + '</w:t></w:r>').join('');
  }
  Doc.prototype.p = function (text, o) {
    o = o || {};
    let pr = '<w:spacing w:before="0" w:after="' + Math.round((o.after == null ? 2 : o.after) * 20) + '" w:line="300" w:lineRule="auto"/>';
    if (o.indent) pr += '<w:ind w:left="' + Math.round(o.indent * 567) + '"/>';
    if (o.center) pr += '<w:jc w:val="center"/>';
    if (o.keep) pr = '<w:keepNext/>' + pr;
    if (o.pageBefore) pr = '<w:pageBreakBefore/>' + pr;
    this.body.push('<w:p><w:pPr>' + pr + '</w:pPr>' + (o.raw || '') + (text ? this.runs(text, o) : '') + '</w:p>');
  };
  // 图片：先登记、留占位，打包时统一下载，按原图比例缩到不超过 w × h 厘米
  Doc.prototype.pic = function (rel, w, h) {
    let p = this.pics[rel];
    if (!p) { p = this.pics[rel] = { rel: rel, id: 'rIdImg' + (this.media.length + 1), file: 'media/img' + (this.media.length + 1) + '.png' }; this.media.push(p); }
    return '@@PIC ' + p.id + ' ' + w + ' ' + h + '@@';
  };

  // 数学公式 → Word 公式（OMML）：\frac{}{} 分数、\sqrt{} 根号、^{} 上标、_{} 下标、\cases{} 分段
  function omml(t) {
    let out = '', buf = '', i = 0;
    const flush = () => { if (buf) out += mr(buf); buf = ''; };
    const raw = () => { let d = 0, j = i; for (; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) break; } const s = t.slice(i + 1, j); i = j + 1; return s; };
    while (i < t.length) {
      if (t.startsWith('\\frac{', i)) {
        flush(); i += 5; const a = omml(raw()); const b = t[i] === '{' ? omml(raw()) : '';
        out += '<m:f><m:num>' + a + '</m:num><m:den>' + b + '</m:den></m:f>';
      } else if (t.startsWith('\\sqrt{', i)) {
        flush(); i += 5;
        out += '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + omml(raw()) + '</m:e></m:rad>';
      } else if (t.startsWith('\\cases{', i)) {
        flush(); i += 6;
        const rows = raw().split('\\\\').filter(r => r.trim());
        out += '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>' +
          rows.map(r => '<m:e>' + omml(r.split('&').join('  ')) + '</m:e>').join('') + '</m:eqArr></m:e></m:d>';
      } else if ((t[i] === '^' || t[i] === '_') && t[i + 1] === '{') {
        const tag = t[i] === '^' ? 'Sup' : 'Sub', base = buf.slice(-1);
        buf = buf.slice(0, -1); flush(); i += 1;
        out += '<m:s' + tag + '><m:e>' + (base ? mr(base) : '') + '</m:e><m:' + tag.toLowerCase() + '>' + omml(raw()) + '</m:' + tag.toLowerCase() + '></m:s' + tag + '>';
      } else buf += t[i++];
    }
    flush();
    return out;
  }
  const mr = s => '<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">' + x(s) + '</m:t></m:r>';

  // ---------------------------------------------------------------- 题目排版
  const cleanMaterial = m => {
    const ls = (m || '').split('\n');
    if (ls.length && /^(问答配对|补全对话|书面表达|完形填空)/.test(ls[0])) ls.shift();
    return ls.join('\n').trim();
  };
  const sameOpts = (a, b) => JSON.stringify(a.options) === JSON.stringify(b.options);
  function groups(qs) {
    const out = [];
    qs.forEach(q => {
      const last = out[out.length - 1];
      if (q.material && last && last[0].material === q.material && (cleanMaterial(q.material) || sameOpts(last[0], q))) last.push(q);
      else out.push([q]);
    });
    return out;
  }
  const red = (d, t) => d.runs(t, { b: true, color: RED });
  const optText = q => (q.options || []).map(o => o[0] + '. ' + o[1]);

  function lines(d, text) {
    (text || '').split('\n').forEach(ln => {
      if (!ln.trim()) return;
      if (!ln.replace(IMG, '').trim()) { (ln.match(IMG) || []).forEach(m => d.p(m, { keep: true, imgW: 16, imgH: 11 })); return; }
      d.p(ln.trim());
    });
  }

  function optionsLine(d, q) {
    const ts = optText(q);
    if (ts.join('').length <= 70 && !ts.some(t => t.indexOf('[[img:') >= 0)) d.p(ts.join('        '), { indent: 0.6 });
    else ts.forEach(t => d.p(t, { indent: 0.6, after: 0 }));
  }

  function writeGroup(d, g, ans) {
    const mat = cleanMaterial(g[0].material);
    if (mat) { d.p('', { keep: true }); lines(d, mat); }
    const shared = g.length > 1 && g.every(q => sameOpts(q, g[0])) && (g[0].options || []).length;
    if (shared && g[0].options.every(o => /见材料/.test(o[1]))) {      // 书面表达：选项在材料（图）里，只留作答的空
      d.p('', { indent: 0.6, raw: g.map((q, i) => d.runs((i ? '    ' : '') + q.qno + '. ') +
        (ans ? d.runs('  ' + q.answer + '  ', { b: true, color: RED, u: true }) : d.runs('______'))).join('') });
      return;
    }
    if (shared && g[0].type !== 'judge' && !/^第\d+空/.test(g[0].stem)) {   // 配对、补全对话、阅读匹配：选项只印一次
      g.forEach(q => {
        const stem = q.stem.replace(/^第\d+组\s*/, '');
        const m = /^对话第(\d+)空应填$/.exec(stem);
        if (m) {                                                  // 补全对话：答在横线上
          d.p(q.qno + '.（第 ' + m[1] + ' 空）', { indent: 0.3 });
          addTail(d, ans ? d.runs('  ' + q.answer + '  ', { b: true, color: RED, u: true }) : d.runs('______'));
        } else {
          d.p(q.qno + '. ' + stem, { indent: 0.3 });
          if (ans) addTail(d, red(d, '    答案：' + q.answer));
        }
      });
      d.p('答语 / 选项：', { b: true, after: 0 });
      optText(g[0]).forEach(t => d.p(t, { indent: 0.6, after: 0 }));
      d.p('');
      return;
    }
    g.forEach(q => writeQ(d, q, ans));
  }

  const addTail = (d, xml) => { d.body[d.body.length - 1] = d.body[d.body.length - 1].replace(/<\/w:p>$/, xml + '</w:p>'); };

  function writeQ(d, q, ans) {
    let stem = q.stem;
    if (q.type === 'judge') {
      d.p('', { indent: 0.3, raw: d.runs('（') + (ans ? red(d, ' ' + q.answer + ' ') : d.runs('    ')) + d.runs('）' + q.qno + '. ' + stem) });
      return;
    }
    const m = /^第(\d+)空/.exec(stem);
    if (m) {                                                      // 完形：每空一行
      d.p(q.qno + '.（第 ' + m[1] + ' 空）' + optText(q).join('    '), { indent: 0.3, after: 0 });
      if (ans) addTail(d, red(d, '    答案：' + q.answer));
      return;
    }
    if (/^找出划线部分读音/.test(stem)) stem = '找出划线部分读音与其他三项不同的一项。';
    if (SELF.indexOf(q.type) >= 0) {                              // 问答、默写、作文、解答：空白卷留横线，答案卷写参考答案
      d.p(q.qno + '. ' + stem, { keep: true });
      if (ans) { d.p('参考答案：', { b: true, color: RED, after: 0, keep: true }); (q.answer || '').split('\n').forEach(ln => ln.trim() && d.p(ln, { color: RED, indent: 0.6, after: 0 })); }
      else for (let k = 0; k < (q.type === 'essay' ? 12 : q.type === 'solution' ? 8 : 3); k++) d.p('_____________________________________________________________________________', { after: 4 });
      d.p('');
      return;
    }
    const imgs = stem.match(IMG) || [];
    stem = stem.replace(IMG, '').trim();
    d.p(q.qno + '. ' + stem, { keep: !!(q.options || []).length || imgs.length });
    if (ans) addTail(d, red(d, '    答案：' + q.answer));
    if (imgs.length) d.p(imgs.join(''), { indent: 0.6, keep: true, imgW: 12, imgH: 6 });
    optionsLine(d, q);
  }

  function answerTable(d, qs) {
    d.p('答案速查', { size: 16, b: true, center: true, after: 10, pageBefore: true });
    let sec = null;
    qs.forEach(q => {
      if (q.sec === sec) return;
      sec = q.sec;
      const ns = qs.filter(y => y.sec === sec && SELF.indexOf(y.type) < 0);
      if (!ns.length) return;
      d.p(sec + '（第 ' + ns[0].qno + '–' + ns[ns.length - 1].qno + ' 题）', { size: 12, b: true });
      for (let i = 0; i < ns.length; i += 10) d.p(ns.slice(i, i + 10).map(y => y.qno + '. ' + y.answer).join('    '));
      d.p('', { after: 4 });
    });
  }

  // ---------------------------------------------------------------- 打包
  const pngSize = b => (b.length > 24 && b[1] === 0x50 && b[2] === 0x4E) ?
    [(b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0] : null;

  async function pack(d) {
    const files = [];
    const sizes = {};
    for (const p of d.media) {
      try {
        const r = await fetch('/media/' + p.rel.split('/').map(encodeURIComponent).join('/'));
        if (!r.ok) throw new Error(r.status);
        p.data = new Uint8Array(await r.arrayBuffer());
        sizes[p.id] = pngSize(p.data);
        if (sizes[p.id]) files.push(['word/' + p.file, p.data]);
      } catch (e) { sizes[p.id] = null; }
    }
    let pid = 0;
    const body = d.body.join('').replace(/@@PIC (\S+) ([\d.]+) ([\d.]+)@@/g, (m, id, w, h) => {
      const s = sizes[id];
      if (!s) return '';
      const k = Math.min(+w / s[0], +h / s[1]);
      const cx = Math.round(s[0] * k * 360000), cy = Math.round(s[1] * k * 360000);
      pid++;
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
        '<wp:docPr id="' + pid + '" name="图' + pid + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:nvPicPr><pic:cNvPr id="' + pid + '" name="图' + pid + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    });
    const footer = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body +
      '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1021" w:right="1134" w:bottom="1021" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/>' +
      '<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      d.media.filter(p => sizes[p.id]).map(p => '<Relationship Id="' + p.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + p.file + '"/>').join('') +
      '</Relationships>';
    files.unshift(
      ['[Content_Types].xml', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')],
      ['_rels/.rels', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')],
      ['word/document.xml', enc.encode(doc)],
      ['word/styles.xml', enc.encode(styles)],
      ['word/footer1.xml', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '>' + footer + '</w:ftr>')],
      ['word/_rels/document.xml.rels', enc.encode(rels)]);
    return zip(files);
  }

  // qs：按卷子顺序的题目；secName(q)：这道题属于哪个大题
  async function build(title, qs, ans, secName) {
    const d = new Doc();
    d.p(title + (ans ? '（答案）' : ''), { size: 18, b: true, center: true, after: 4 });
    if (ans) d.p('红字为参考答案（以官方参考答案为准）', { size: 10, center: true, after: 10 });
    else d.p('姓名 ____________    班级 ____________    得分 ________', { center: true, after: 10 });
    const secs = [];
    qs.forEach((q, i) => {
      q = Object.assign({}, q, { qno: i + 1, sec: secName(q) });
      qs[i] = q;
      if (!secs.length || secs[secs.length - 1][0] !== q.sec) secs.push([q.sec, []]);
      secs[secs.length - 1][1].push(q);
    });
    secs.forEach(([name, sq], i) => {
      d.p((CN_NUM[i] || (i + 1)) + '、' + name + '（共 ' + sq.length + ' 题）', { size: 12, b: true, keep: true });
      if (SECTION_TIP[name]) d.p(SECTION_TIP[name], { size: 9.5, after: 4, keep: true });
      groups(sq).forEach(g => writeGroup(d, g, ans));
      d.p('', { after: 4 });
    });
    if (ans) answerTable(d, qs);
    return pack(d);
  }

  return { build: build };
})();
