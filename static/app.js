'use strict';
/*!
 * 智学题库 · 江苏中职学测刷题系统
 * 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
 * 项目：https://github.com/chen-pi-2007/zhixue-tiku
 * © 2026 十三、chen_pi，保留所有权利。转载、修改后发布请注明原作者和项目地址。
 */
/* 智学题库 前端逻辑(纯原生JS,无框架无CDN) */

const $ = s => document.querySelector(s);
try {
  console.log('%c智学题库%c 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）\nhttps://github.com/chen-pi-2007/zhixue-tiku  © 2026 保留所有权利',
    'background:#c4374a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold', 'color:inherit');
} catch (e) { /* 控制台不可用时忽略 */ }
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = v => String(v == null ? '' : v)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 题目文本:转义后把 [[img:x]] 换成图片,「」换成下划线,〔〕换成加点字,\( … \) 画成数学公式
function rich(s) {
  return esc(s)
    .replace(/\[\[img:([^\]]+)\]\]/g, (m, p) =>
      '<img class="qimg" loading="lazy" src="/media/' + p.split('/').map(encodeURIComponent).join('/') + '" onclick="zoomImg(this.src)">')
    .replace(/「([^「」]*)」/g, '<u>$1</u>')
    .replace(/〔([^〔〕]*)〕/g, '<span class="emph">$1</span>')
    .replace(/\\\((.+?)\\\)/g, (m, t) => '<span class="math">' + mathHtml(t) + '</span>');
}

// 数学公式（题库里写成 \( … \)，由 学测/_脚本/mathfmt.py 生成）：\frac{分子}{分母} 画成上下两层的分数，
// \sqrt{…} 画成带横线的根号，^{…} 上标，_{…} 下标。不用公式库，手机离线也能显示
// 根号、大括号用 SVG 画：随里面内容的高度拉伸，线宽不变（vector-effect），根号的勾和上面那条横线接成一笔
const SQRT_SVG = '<svg class="msign" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M0.5 64 L3 58 L5.6 97 L9.6 0.6 L10.5 0.6" vector-effect="non-scaling-stroke"/></svg>';
const BRACE_SVG = '<svg class="mbrace" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M9.5 1 C5.5 1 5.5 3 5.5 9 L5.5 42 C5.5 47 3.5 50 0.8 50 C3.5 50 5.5 53 5.5 58 L5.5 91 C5.5 97 5.5 99 9.5 99"' +
  ' vector-effect="non-scaling-stroke"/></svg>';

function mathHtml(t) {
  let out = '', i = 0;
  const raw = () => {                            // t[i] 是 '{'：取出配对的 {…} 里面的原文
    let depth = 0, j = i;
    for (; j < t.length; j++) {
      if (t[j] === '{') depth++;
      else if (t[j] === '}' && --depth === 0) break;
    }
    const inner = t.slice(i + 1, j);
    i = j + 1;
    return inner;
  };
  const group = () => mathHtml(raw());           // 取出 {…} 并画好
  while (i < t.length) {
    if (t.startsWith('\\frac{', i)) {
      i += 5;
      const num = group();
      const den = t[i] === '{' ? group() : '';
      out += '<span class="mfrac"><span class="mfn">' + num + '</span><span class="mfd">' + den + '</span></span>';
    } else if (t.startsWith('\\sqrt{', i)) {
      i += 5;
      out += '<span class="msqrt">' + SQRT_SVG + '<span class="mrad">' + group() + '</span></span>';
    } else if (t.startsWith('\\cases{', i)) {
      // 分段函数 / 方程组：\cases{x+1,&x≥0,\\2x−1,&x<0,}——和 LaTeX 一样，行用 \\ 分开，式子和条件用 & 分开。
      // 到这里文字已经转义过（& 变成 &amp;），所以按 &amp; 切；不用 ; 分行，免得切坏 &lt; 这类转义
      i += 6;
      const rows = raw().split('\\\\').map(r => r.split(/&amp;|&(?![a-z]+;)/));
      out += '<span class="mcases">' + BRACE_SVG + '<span class="mrows">' +
        rows.map(r => '<span class="mrow">' + r.map((c, k) => '<span class="mcell' + (k ? ' mcond' : '') + '">' + mathHtml(c) + '</span>').join('') +
          '</span>').join('') + '</span></span>';
    } else if ((t[i] === '^' || t[i] === '_') && t[i + 1] === '{') {
      const tag = t[i] === '^' ? 'sup' : 'sub';
      i += 1;
      out += '<' + tag + '>' + group() + '</' + tag + '>';
    } else {
      out += t[i++];
    }
  }
  return out;
}

function zoomImg(src) {
  const d = document.createElement('div');
  d.className = 'zoom';
  d.innerHTML = '<img src="' + esc(src) + '">';
  d.onclick = () => d.remove();
  document.body.appendChild(d);
}

// 老内核兜底：安卓系统 WebView 84 以前（很多国产手机没有谷歌商店，WebView 一直不更新）不支持弹性布局的 gap，
// 元素会挤在一起。检测到不支持时，给弹性容器的子元素补上等量的外边距；新内核上这段什么都不做
(function flexGapFallback() {
  const t = document.createElement('div');
  t.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  t.appendChild(document.createElement('div'));
  t.appendChild(document.createElement('div'));
  document.body.appendChild(t);
  const ok = t.scrollHeight === 1;
  t.remove();
  if (ok) return;
  document.documentElement.classList.add('no-flexgap');
  const SKIP = '.theme-pick, .top-upd, .upd-dot';      // 这些靠 margin-left:auto 推到右边，不能改
  const px = v => parseFloat(v) || 0;
  function fix() {
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display !== 'flex' && cs.display !== 'inline-flex') return;
      const cg = px(cs.columnGap), rg = px(cs.rowGap);
      if (!cg && !rg) return;
      // 直接写在容器里的文字（比如“●语文”里的“语文”）也是一个弹性子项，先套一层 span 才能补间距
      Array.from(el.childNodes).forEach(n => {
        if (n.nodeType === 3 && n.textContent.trim()) {
          const s = document.createElement('span');
          n.replaceWith(s);
          s.appendChild(n);
        }
      });
      const kids = Array.from(el.children).filter(k => {
        const s = getComputedStyle(k);
        return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
      });
      const dir = cs.flexDirection, wrap = cs.flexWrap !== 'nowrap';
      // 换行的容器：子元素右边、下边都补了间距，最后一行、最后一个多出来的那份用容器的负外边距抵掉
      // （容器自己有背景或边框时不抵，免得背景跟着变形）
      if (wrap && !el.dataset.gapWrap && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && !px(cs.borderBottomWidth) && cs.backgroundImage === 'none') {
        if (rg) el.style.marginBottom = (px(cs.marginBottom) - rg) + 'px';
        if (cg) el.style.marginRight = (px(cs.marginRight) - cg) + 'px';
        el.dataset.gapWrap = '1';
      }
      kids.forEach((k, i) => {
        if (k.dataset.gapFix || k.matches(SKIP)) return;
        const ks = getComputedStyle(k);
        if (wrap) {                                    // 换行的：每个子元素右边、下边都留空
          if (cg) k.style.marginRight = (px(ks.marginRight) + cg) + 'px';
          if (rg) k.style.marginBottom = (px(ks.marginBottom) + rg) + 'px';
        } else if (i > 0) {                            // 不换行的：从第二个起，前面留空
          if (dir === 'row' && cg) k.style.marginLeft = (px(ks.marginLeft) + cg) + 'px';
          else if (dir === 'row-reverse' && cg) k.style.marginRight = (px(ks.marginRight) + cg) + 'px';
          else if (dir === 'column' && rg) k.style.marginTop = (px(ks.marginTop) + rg) + 'px';
          else if (dir === 'column-reverse' && rg) k.style.marginBottom = (px(ks.marginBottom) + rg) + 'px';
        }
        k.dataset.gapFix = '1';
      });
    });
  }
  let queued = false;
  const run = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fix(); }); } };
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', run);
  run();
})();

// 手机 App 里没有 Python 服务，请求交给 mobile/local.js 在本地处理
const IS_APP = !!window.LocalAPI;
function openExternal(url) {
  if (window.ZXStore && window.ZXStore.openUrl) window.ZXStore.openUrl(url);
  else window.open(url, '_blank');
}

async function api(path, opts) {
  opts = opts || {};
  if (IS_APP) return window.LocalAPI.call(path, opts);
  if (opts.body && typeof opts.body === 'object' &&
      !(opts.body instanceof ArrayBuffer) && !(opts.body instanceof Uint8Array)) {
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(path, opts);
  let data = {};
  try { data = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok || data.ok === false) throw new Error(data.error || ('请求失败 ' + r.status));
  return data;
}

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

const TYPE_NAME = {
  single: '单选题', multi: '多选题', judge: '判断题', qa: '问答题',
  reading: '阅读单选', poem: '古诗文单选', dictation: '默写', essay: '作文',
  blank: '填空题', solution: '解答题',
};
// 自评类题型:纸上/心里作答后点按钮对照参考答案,再自评
const SELF_TYPES = ['qa', 'dictation', 'essay', 'blank', 'solution'];
// 题型印章字
const TYPE_ICON = { single: '单', reading: '阅', poem: '诗', dictation: '默', qa: '问', essay: '文', blank: '填',
                    solution: '解', multi: '多', judge: '判' };
const SUBJECT_NAME = { chinese: '语文', math: '数学', english: '英语', politics: '思想政治',
                       media: '数字媒体', general: '其他' };
// 科目印章字
const SUBJECT_ICON = { chinese: '语', math: '数', english: '英', politics: '政', media: '媒', general: '其' };
const MASTER_STREAK = 3;

function toast(msg, cls) {
  const d = document.createElement('div');
  d.className = 'toast ' + (cls || '');
  d.textContent = msg;
  $('#toasts').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = '.4s'; }, 2200);
  setTimeout(() => d.remove(), 2700);
}

function optionList(q) {
  if (q.type === 'judge') return [['对', '对'], ['错', '错']];
  return q.options || [];
}

// 英语题的中文翻译开关（平时练习、错题本、题库浏览显示；模拟考没有这些字段）
// 译文总是渲染进页面，开关只切换 html.cn-off（做题中途切换不会重画、不丢作答状态）。
// 带 .after 的译文在练习卡片里要作答后才显示：选项译文（含音标、语法提示）和带空格的题干译文会直接暴露答案。
function cnOn() { const v = store.get('quiz.cn'); return v == null ? true : !!v; }
function applyCn() { document.documentElement.classList.toggle('cn-off', !cnOn()); $$('.cn-btn').forEach(b => b.classList.toggle('on', cnOn())); }
function toggleCn() { store.set('quiz.cn', !cnOn()); applyCn(); }
function hasCn(q) { return !!(q.stem_cn || q.material_cn || (q.options_cn && q.options_cn.length)); }
function cnBtn(q) { return hasCn(q) ? '<button class="cn-btn' + (cnOn() ? ' on' : '') + '" onclick="toggleCn()" title="显示/隐藏中文翻译">译</button>' : ''; }
function stemCn(q) { return q.stem_cn ? '<div class="stem-cn' + (/_{2,}/.test(q.stem) ? ' after' : '') + '">' + rich(q.stem_cn) + '</div>' : ''; }
function optCn(q, i) { return q.options_cn && q.options_cn[i] ? '<span class="opt-cn after">' + esc(q.options_cn[i]) + '</span>' : ''; }
function pointBox(q) { return q.point ? '<div class="point-box"><b>知识点</b><div>' + rich(q.point) + '</div></div>' : ''; }

// 某个选项的说明：专门写的“为什么对 / 错”（option_notes），英语没写的话用选项的中文翻译（里面带着语法提示）
function optNote(q, key) {
  const i = optionList(q).findIndex(o => o[0] === key);
  if (i < 0) return '';
  return (q.option_notes && q.option_notes[i]) || (q.options_cn && q.options_cn[i]) || '';
}

// 做错时：你选的错在哪、漏选了什么、正确答案为什么对
function whyBox(q, selKeys) {
  if (q.type === 'judge' || !selKeys || !selKeys.length) return '';
  const opts = optionList(q);
  const text = k => { const o = opts.find(x => x[0] === k); return o ? o[1] : ''; };
  const ans = q.type === 'multi' ? q.answer.split('') : [q.answer];
  const rows = [];
  selKeys.filter(k => ans.indexOf(k) < 0).forEach(k => {
    const n = optNote(q, k);
    rows.push('<div class="why-row bad"><span class="why-k">你选的 ' + esc(k) + '</span><span>' + (n ? rich(n) : rich(text(k)) + '（不对）') + '</span></div>');
  });
  if (q.type === 'multi') ans.filter(k => selKeys.indexOf(k) < 0).forEach(k => {
    const n = optNote(q, k);
    rows.push('<div class="why-row miss"><span class="why-k">漏选 ' + esc(k) + '</span><span>' + (n ? rich(n) : rich(text(k))) + '</span></div>');
  });
  const okNotes = ans.map(k => optNote(q, k)).filter(Boolean);
  if (okNotes.length) rows.push('<div class="why-row ok"><span class="why-k">正确答案 ' + esc(q.answer) + '</span><span>' + okNotes.map(rich).join('；') + '</span></div>');
  return rows.length ? '<div class="why-box"><b>为什么错</b>' + rows.join('') + '</div>' : '';
}

// 英语题相关的词组，作答后显示，方便顺手记
function phraseBox(q) {
  if (!q.phrases || !q.phrases.length) return '';
  return '<div class="phrase-box"><b>词组</b><div class="phrase-list">' + q.phrases.map(p =>
    '<span class="phrase"><em>' + esc(p[0]) + '</em>' + esc(p[1] || '') + '</span>').join('') + '</div></div>';
}

// 错题本、搜索里看答案时：每个选项的说明折起来放着
function optNotesBox(q) {
  if (!q.option_notes || !q.option_notes.some(Boolean)) return '';
  return '<details class="why-all"><summary>每个选项为什么对 / 错</summary>' + optionList(q).map((o, i) =>
    q.option_notes[i] ? '<div class="why-row' + ((q.type === 'multi' ? q.answer.indexOf(o[0]) >= 0 : o[0] === q.answer) ? ' ok' : '') +
      '"><span class="why-k">' + esc(o[0]) + '</span><span>' + rich(q.option_notes[i]) + '</span></div>' : '').join('') + '</details>';
}

// 阅读材料/情境材料展示框
// fold:长材料默认折叠(错题本、报告里同一篇材料会重复出现)
function materialBox(q, fold) {
  if (!q.material || !q.material.trim()) return '';
  if (fold && q.material.length > 160) {
    return '<details class="material-box"><summary class="material-title">材料（点开查看）· ' +
      esc(q.material.split('\n')[0].slice(0, 40)) + '…</summary>' +
      '<div class="material-body">' + rich(q.material) + '</div>' + materialCn(q) + '</details>';
  }
  return '<div class="material-box"><div class="material-title">材料</div>' +
    '<div class="material-body">' + rich(q.material) + '</div>' + materialCn(q) + '</div>';
}

function materialCn(q) {
  return q.material_cn ? '<div class="material-cn"><div class="material-title">参考译文</div>' + rich(q.material_cn) + '</div>' : '';
}

// 错题要在不同的日子连续答对 MASTER_STREAK 次才消灭：显示“还要答对几次”，比“已连对 0/3”好懂
function streakText(streak) {
  const left = Math.max(MASTER_STREAK - (streak || 0), 0);
  return left ? '还要分 ' + left + ' 天答对才移出错题本' : '再答对一次就移出错题本';
}

function recBadge(q) {
  if (!q.wrong_count && !q.right_count) return '';
  if (q.in_wrong) return '<span class="rec-badge bad" title="这题以前做错过，在错题本里">以前做错过 · ' + streakText(q.streak) + '</span>';
  return '<span class="rec-badge">对' + q.right_count + ' 错' + q.wrong_count + '</span>';
}

function ansHtml(q) {
  return '正确答案 <b>' + rich(q.answer) + '</b>' +
    (q.analysis ? '<div class="analysis">解析：' + rich(q.analysis) + '</div>' : '') + pointBox(q) + optNotesBox(q) + phraseBox(q);
}

function optsStatic(q, given) {
  const opts = optionList(q);
  if (!opts.length) return '';
  return '<div class="opts">' + opts.map((o, i) => {
    const isAns = q.type === 'multi' ? q.answer.indexOf(o[0]) >= 0 : o[0] === q.answer;
    const isGiven = given != null && given.indexOf(o[0]) >= 0;
    const cls = isAns ? ' ok' : (isGiven ? ' bad' : '');
    return '<div class="opt' + cls + '" style="cursor:default"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + optCn(q, i) + '</span></div>';
  }).join('') + '</div>';
}

function bar(pct, cls) {
  return '<div class="accbar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, pct || 0)) + '%"></i></div>';
}

// 生成可内嵌到 onclick="..." 属性里的 JSON 字符串(双引号转实体,避免截断属性)
function jsq(s) { return JSON.stringify(s == null ? '' : s).replace(/"/g, '&quot;'); }

/* ================================================================ 路由 */

const state = {
  bank: { paper_id: 0, subject: '', type: '', q: '', showAns: false, offset: 0, items: [], total: 0, papers: [] },
  wrongTab: 0,
  wrongSubject: '',
  practice: null,
};

const routes = { home: viewHome, subject: viewSubject, bank: viewBank, wrong: viewWrong,
                 practice: viewPractice, exam: viewExam, upload: viewUpload };

function route() {
  const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
  const name = routes[parts[0]] ? parts[0] : 'home';
  const navOf = { practice: 'home', subject: 'home' };
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.v === (navOf[name] || name)));
  document.body.classList.toggle('subpage', name === 'settings');   // 手机上设置是二级页面：收起底下的导航，标题带返回
  const ts = $('#top-set');
  if (ts) ts.classList.toggle('active', name === 'settings');
  if (name !== 'exam') stopExamTimer();
  window.scrollTo(0, 0);
  // 换页时淡入一下（同一页内重绘不播放）
  if (name !== state.lastPage) {
    state.lastPage = name;
    app.classList.remove('page-in');
    void app.offsetWidth;
    app.classList.add('page-in');
  }
  routes[name](parts.slice(1));
}
window.addEventListener('hashchange', route);
applyCn();
api('/api/dashboard').then(r => setTopDays(r.data.settings.exam_date)).catch(() => {});

/* ================================================================ 首页:今日 + 各科 */

// 线条图标（24×24，stroke=currentColor）
const ICONS = {
  review: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16"/><path d="M4 20v-4h4"/>',
  wrong: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="m10 7 4 4m0-4-4 4"/>',
  exam: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  skill: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m9 9 2 2 4-4"/>',
  bank: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  fire: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.5 3 2.5 3 0-3 1-6 4-8 0 3 4 5.5 4 10.5 0 4.2-3 7.5-7 7.5z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  shuffle: '<path d="M3 7h3c4 0 6 10 10 10h5"/><path d="M3 17h3c1.6 0 2.8-1.5 4-3.5"/><path d="M14 9.5C15.2 7.8 16.4 7 18 7h3"/><path d="m18 4 3 3-3 3M18 14l3 3-3 3"/>',
};
function icon(name, cls) {
  return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

// 首页（参照力扣题库页）：中间是科目筛选 + 卷子列表，右侧是今日复习和学习日历
state.home = state.home || { subj: '', q: '' };

async function viewHome() {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let d, papers, skills = [];
  try {
    d = (await api('/api/dashboard')).data;
    setTopDays(d.settings.exam_date);
    papers = (await api('/api/papers')).papers;
  } catch (e) {
    app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    return;
  }
  try { skills = (await api('/api/skills')).items; } catch (e) { /* 没有技能题库时首页照常显示 */ }
  state.hidden = d.settings.hidden_subjects || [];
  d.subjects = d.subjects.filter(s => !s.hidden);
  papers = papers.filter(p => !isHidden(p.subject));
  skills = skills.filter(s => !isHidden('skill:' + s.direction));
  const h = state.home;
  h.group = h.group || '';
  if (h.subj && isHidden(h.subj)) h.subj = '';
  const unfinished = store.get('quiz.exam');
  // 科目条目：各科卷子 + 技能卷方向（计算机应用、网络技术，筛选值 skill:<方向>），分成文化课、专业技能两类
  const entries = d.subjects.map(s => ({ key: s.subject, name: SUBJECT_NAME[s.subject] || s.subject, group: subjectGroup(s.subject),
                                         dot: 's-' + s.subject, count: s.total, href: '#/subject/' + s.subject }));
  skills.forEach(s => {
    const k = 'skill:' + s.direction;
    let e = entries.find(x => x.key === k);
    if (!e) entries.push(e = { key: k, name: SKILL_DIR_NAME[s.direction] || s.direction, group: 'pro',
                               dot: 's-skill-' + s.direction, count: 0, unit: ' 套', href: '#/skills' });
    e.count++;
  });
  const inGroup = e => !h.group || e.group === h.group;
  const tagRow = g => {
    const es = entries.filter(e => e.group === g);
    return es.length ? '<div class="tag-row"><b class="tag-group">' + GROUP_NAME[g] + '</b>' + es.map(e =>
      '<a href="' + e.href + '">' + esc(e.name) + '<span>' + e.count + (e.unit || '') + '</span></a>').join('') + '</div>' : '';
  };
  const canShuffle = !h.group ? h.subj.indexOf('skill:') !== 0 : (h.subj && h.subj.indexOf('skill:') !== 0);
  app.innerHTML =
    '<div class="home">' +
      '<section class="home-main">' +
        (unfinished ? '<div class="notice">有一场模拟考还没交卷：' + esc(unfinished.exam.title) + ' <a href="#/exam/run">继续作答</a></div>' : '') +
        tagRow('culture') + tagRow('pro') +
        '<div class="group-tabs">' + [['', '全部'], ['culture', GROUP_NAME.culture], ['pro', GROUP_NAME.pro]].map(g =>
          '<button class="group-tab' + (h.group === g[0] ? ' on' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>').join('') +
        '</div>' +
        '<div class="pill-row">' +
          '<button class="pill-tab' + (h.subj === '' ? ' on' : '') + '" data-s="">' + (h.group ? '全部' + GROUP_NAME[h.group] : '全部卷子') + '</button>' +
          entries.filter(inGroup).map(e => '<button class="pill-tab' + (h.subj === e.key ? ' on' : '') + '" data-s="' + e.key + '">' +
            '<span class="dot ' + e.dot + '"></span>' + esc(e.name) + '</button>').join('') +
        '</div>' +
        homeTypes(d, h.subj) +
        '<div class="list-tools">' +
          '<label class="search-pill">' + icon('search') + '<input id="home-q" placeholder="搜索卷子" value="' + esc(h.q) + '"></label>' +
          '<span class="spacer"></span>' +
          (canShuffle ?
            '<button class="icon-btn" title="随机练一组" onclick="startPractice({subject:' + jsq(h.subj) + ',scope:\'all\',title:\'随机练习\'})">' + icon('shuffle') + '</button>' : '') +
        '</div>' +
        '<div class="plist" id="plist"></div>' +
      '</section>' +
      '<aside class="home-side">' + todayCard(d) + calendarCard(d) + examsCard(d) + '</aside>' +
    '</div>';

  const render = () => {
    const q = h.q.trim();
    const isSkill = h.subj.indexOf('skill:') === 0;
    const list = isSkill ? [] : papers.filter(p => (h.subj ? p.subject === h.subj : !h.group || subjectGroup(p.subject) === h.group) &&
                                                   (!q || p.name.indexOf(q) >= 0));
    const sks = skills.filter(s => (h.subj ? h.subj === 'skill:' + s.direction : !h.group || h.group === 'pro') &&
                                   (!q || s.name.indexOf(q) >= 0));
    const rows = list.map((p, i) => paperRow(p, i)).concat(sks.map((s, i) => skillRow(s, list.length + i)));
    $('#plist').innerHTML = rows.length ? rows.join('') : '<div class="empty">没有符合条件的卷子</div>';
  };
  render();
  $$('.group-tab').forEach(b => b.addEventListener('click', () => { h.group = b.dataset.g; h.subj = ''; viewHome(); }));
  $$('.pill-tab').forEach(b => b.addEventListener('click', () => { h.subj = b.dataset.s; viewHome(); }));
  $('#home-q').addEventListener('input', e => { h.q = e.target.value; render(); });
  const np = $('#newper');
  if (np) np.addEventListener('change', async () => {
    try { await api('/api/settings', { method: 'POST', body: { new_per_day: +np.value } }); viewHome(); } catch (e) { toast(e.message, 'bad'); }
  });
}

// 某一科的题型卡片：单做一种题型最练记忆，点进去选练习方式（能存档）
function typeGrid(s, subj) {
  const name = SUBJECT_NAME[subj] || subj;
  const weak = s.types.filter(t => t.accuracy != null && t.accuracy < 70).map(t => t.type);
  return '<div class="typegrid">' + s.types.map(t =>
    '<button class="typebtn' + (weak.indexOf(t.type) >= 0 ? ' weak' : '') + '" onclick="openModeSheet({subject:' + jsq(subj) +
      ',type:' + jsq(t.type) + '},' + jsq(name + '·' + (TYPE_NAME[t.type] || t.type)) + ')">' +
      '<span class="ti">' + (TYPE_ICON[t.type] || '') + '</span>' +
      '<span class="tn">' + (TYPE_NAME[t.type] || t.type) + '</span>' +
      '<span class="tc">' + t.total + ' 题 · 掌握 ' + t.mastery + '%' + (t.accuracy != null ? ' · 对 ' + t.accuracy + '%' : '') + '</span>' +
      bar(t.mastery, 'thin') +
    '</button>').join('') + '</div>';
}

// 首页选了某一科时，卷子列表上面先放这一科的题型卡片（手机上没有科目页的入口，这里就是入口）
function homeTypes(d, subj) {
  if (!subj || subj.indexOf('skill:') === 0) return '';
  const s = (d.subjects || []).find(x => x.subject === subj);
  if (!s || !s.types || !s.types.length) return '';
  return '<div class="home-types">' +
    '<div class="sec-h"><span>按题型练习</span>' +
      '<span class="sec-links">' +
        (s.wrong_open ? '<a href="javascript:void(0)" class="danger-link" onclick="startPractice({subject:' + jsq(subj) +
          ',scope:\'wrongmix\',title:' + jsq((SUBJECT_NAME[subj] || subj) + '·错题') + '})">错题重练(' + s.wrong_open + ')</a>' : '') +
        '<a href="#/subject/' + esc(subj) + '">更多 ›</a>' +
      '</span></div>' +
    typeGrid(s, subj) +
    '<div class="sec-h"><span>卷子</span></div>' +
  '</div>';
}

function paperRow(p, i) {
  const st = p.mastery >= 80 ? ['已掌握', 'st-done'] : (p.seen ? ['练习中', 'st-doing'] : ['未开始', 'st-new']);
  return '<a class="prow" href="javascript:void(0)" onclick="openPaperSheet(' + p.id + ',' + jsq(p.name) + ')">' +
    '<span class="prow-t">' + (i + 1) + '. ' + esc(p.name) + '</span>' +
    '<span class="prow-c">' + p.total + ' 题</span>' +
    '<span class="prow-m">' + p.mastery + '%</span>' +
    '<span class="prow-s ' + st[1] + '">' + st[0] + '</span>' +
    (p.wrong_open ? '<span class="prow-w">错 ' + p.wrong_open + '</span>' : '<span class="prow-w"></span>') +
  '</a>';
}

const SKILL_DIR_NAME = { comp: '计算机应用', net: '网络技术' };
// 首页的两大类：文化课（公共基础课）和专业技能；自己导入的"其他"卷子只在"全部"里出现
const GROUP_NAME = { culture: '文化课', pro: '专业技能' };
const CULTURE_SUBJECTS = ['chinese', 'math', 'english', 'politics'];
function subjectGroup(subj) {
  if (CULTURE_SUBJECTS.indexOf(subj) >= 0) return 'culture';
  if (subj === 'media' || subj.indexOf('skill:') === 0) return 'pro';
  return 'other';
}

// 不学的科目（设置里取消勾选的），首页、错题本、搜索、模拟考、技能实操都不显示；技能方向写成 skill:<方向>
state.hidden = null;
async function loadHidden() {
  if (!state.hidden) {
    try { state.hidden = (await api('/api/dashboard')).data.settings.hidden_subjects || []; } catch (e) { state.hidden = []; }
  }
  return state.hidden;
}
function isHidden(subj) { return !!state.hidden && state.hidden.indexOf(subj) >= 0; }
function shownSubjectKeys() { return Object.keys(SUBJECT_NAME).filter(k => !isHidden(k)); }

// 技能卷行：题数一栏写模块数，掌握度用最好成绩占总分的比例，点开进技能实操
function skillRow(s, i) {
  const pct = s.total ? Math.round(100 * s.best_total / s.total) : 0;
  const tried = s.modules.some(m => m.best != null);
  const st = pct >= 80 ? ['已掌握', 'st-done'] : (tried ? ['练习中', 'st-doing'] : ['未开始', 'st-new']);
  return '<a class="prow" href="#/skills/' + s.key + '">' +
    '<span class="prow-t">' + (i + 1) + '. ' + esc(s.name) + '</span>' +
    '<span class="prow-c">' + s.modules.length + ' 项实操</span>' +
    '<span class="prow-m">' + pct + '%</span>' +
    '<span class="prow-s ' + st[1] + '">' + st[0] + '</span>' +
    '<span class="prow-w"></span>' +
  '</a>';
}

function examDays(date) {
  if (!date) return null;
  const p = date.split('-').map(Number);
  return Math.round((new Date(p[0], p[1] - 1, p[2]) - new Date(new Date().toDateString())) / 86400000);
}

function todayCard(d) {
  const t = d.today;
  const todo = t.todo != null ? t.todo : t.due + t.new_left;
  return '<div class="side-card today-card">' +
    '<div class="sc-head"><b>今日复习</b>' +
    '</div>' +
    '<div class="sc-stats">' +
      '<div><em>' + t.due + '</em><span>到期</span></div>' +
      '<div><em>' + (t.new != null ? t.new : t.new_left) + '</em><span>新题</span></div>' +
      '<div><em>' + t.done + '</em><span>已做</span></div>' +
      '<div><em>' + (t.done ? Math.round(100 * t.right / t.done) + '%' : '-') + '</em><span>正确率</span></div>' +
    '</div>' +
    (todo ? '<button class="btn block" onclick="startReview(\'\')">开始复习 ' + todo + ' 题</button>'
          : '<div class="sc-done">今天的复习已完成</div><button class="btn ghost block" onclick="startReview(\'\')">再加练 20 题</button>') +
    '<label class="sc-set">每天新题 <input class="inp" id="newper" type="number" min="0" max="200" value="' + d.settings.new_per_day + '"> 道</label>' +
  '</div>';
}

function calendarCard(d) {
  const counts = {};
  d.history.forEach(h => { counts[h.day] = h.n; });
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const n = new Date(y, m + 1, 0).getDate();
  const pad = v => String(v).padStart(2, '0');
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let day = 1; day <= n; day++) {
    const key = y + '-' + pad(m + 1) + '-' + pad(day);
    const cls = day === now.getDate() ? 'today' : (counts[key] ? 'did' : '');
    cells += '<span class="' + cls + '" title="' + key + (counts[key] ? ':做了 ' + counts[key] + ' 题' : '') + '">' + day + '</span>';
  }
  return '<div class="side-card">' +
    '<div class="sc-head"><b>学习日历</b><span class="muted">' + (m + 1) + ' 月 · 连续 ' + d.streak + ' 天</span></div>' +
    '<div class="cal"><i>日</i><i>一</i><i>二</i><i>三</i><i>四</i><i>五</i><i>六</i>' + cells + '</div>' +
  '</div>';
}

function examsCard(d) {
  return '<div class="side-card">' +
    '<div class="sc-head"><b>模拟考试</b><a class="sc-link" href="#/exam">去考一场</a></div>' +
    (d.exams.length ? d.exams.slice(0, 4).map(e =>
      '<a class="sc-exam" href="#/exam/' + e.id + '"><span>' + esc(e.title) + '</span><em class="' +
        (e.score >= 80 ? 'num-green' : (e.score >= 60 ? 'num-orange' : 'num-red')) + '">' + Math.round(e.score) + '</em></a>').join('')
      : '<div class="muted">还没有考试记录</div>') +
  '</div>';
}

// 顶栏“距学测 N 天”，和“智学题库”放在同一行
function setTopDays(date) {
  const el = $('#top-days');
  if (!el) return;
  const days = examDays(date);
  el.hidden = days == null;
  if (days == null) return;
  el.innerHTML = days > 0 ? '距学测 <em>' + days + '</em> 天' : (days === 0 ? '今天学测' : '学测已结束');
  el.onclick = () => editExamDate(date);
}

// 手机 App：把做题记录发到微信 / QQ / 文件管理（1.4.5 起的 App 才有）
function canShareProgress() { return !!(window.ZXStore && ZXStore.shareProgress); }
function shareProgress() {
  let err = '';
  try { err = ZXStore.shareProgress(); } catch (e) { err = e.message; }
  if (err) toast(err, 'bad');
}

function goBack() {
  history.length > 1 ? history.back() : (location.hash = '#/home');
}

// 分值显示：2.825 → 2.83，整数不带小数
function fmtPts(v) { return String(Math.round(v * 100) / 100); }

async function openDataDir() {
  try { await api('/api/open-data', { method: 'POST', body: {} }); } catch (e) { toast(e.message, 'bad'); }
}

async function editExamDate(cur) {
  const v = prompt('学测日期（格式 2026-11-07）：', cur);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return;
  try { await api('/api/settings', { method: 'POST', body: { exam_date: v.trim() } }); viewHome(); } catch (e) { toast(e.message, 'bad'); }
}

function examRow(e) {
  const cls = e.score >= 80 ? 'num-green' : (e.score >= 60 ? 'num-orange' : 'num-red');
  return '<a class="prow" href="#/exam/' + e.id + '"><span class="prow-t">' + esc(e.title) + '</span>' +
    '<span class="prow-c">' + e.correct + '/' + e.total + '</span><span class="prow-m ' + cls + '">' + Math.round(e.score) + ' 分</span>' +
    '<span class="prow-s">' + fmtDur(e.used_seconds) + '</span><span class="prow-w">' + esc((e.finished || '').slice(5, 16)) + '</span></a>';
}

function fmtDur(s) {
  s = s || 0;
  return Math.floor(s / 60) + '分' + (s % 60 ? (s % 60) + '秒' : '');
}

/* ================================================================ 科目页 */

async function viewSubject(args) {
  const subj = args[0] || 'general';
  app.innerHTML = '<div class="empty">加载中…</div>';
  let d, papers;
  try {
    d = (await api('/api/dashboard')).data;
    papers = (await api('/api/papers')).papers.filter(p => p.subject === subj);
  } catch (e) {
    app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    return;
  }
  const s = d.subjects.find(x => x.subject === subj) || { types: [], total: 0, mastery: 0, due: 0, wrong_open: 0 };
  const name = SUBJECT_NAME[subj] || subj;
  // 薄弱题型:有作答记录、正确率最低的
  const weak = s.types.filter(t => t.accuracy != null && t.accuracy < 70).map(t => t.type);

  app.innerHTML =
    '<div class="crumb"><a href="#/home">首页</a> / ' + name + '</div>' +
    '<div class="card subj-top">' +
      '<div class="subj-name big"><span class="ti">' + (SUBJECT_ICON[subj] || '其') + '</span>' + name + '</div>' +
      '<div class="muted">' + s.total + ' 题 · 掌握度 ' + s.mastery + '% · 到期 ' + s.due + ' · 错题 ' + s.wrong_open + '</div>' +
      '<div class="paper-acts" style="margin-top:10px">' +
        '<button class="btn" onclick="startReview(\'' + subj + '\')">复习本科</button>' +
        '<button class="btn ghost" onclick="startPractice({subject:\'' + subj + '\',scope:\'new\',order:\'seq\',title:\'' + name + '·新题\'})">只做新题</button>' +
        (s.wrong_open ? '<button class="btn danger" onclick="startPractice({subject:\'' + subj + '\',scope:\'wrongmix\',title:\'' + name + '·错题\'})">错题重练(' + s.wrong_open + ')</button>' : '') +
        (subj !== 'general' ? '<a class="btn ghost" href="#/exam/new/' + subj + '">模拟考</a>' : '') +
        '<button class="btn ghost" onclick="goBank(0,\'' + subj + '\')">浏览题目</button>' +
      '</div>' +
    '</div>' +

    '<div class="sec-title">按题型练习' + (weak.length ? ' <span class="muted">· 标红的是薄弱题型（最近正确率低于 70%）</span>' : '') + '</div>' +
    typeGrid(s, subj) +

    '<div class="sec-title">卷子 / 题库(' + papers.length + ')</div>' +
    papers.map(paperCard).join('');
}

function paperCard(p) {
  const accPct = p.answered ? Math.round(100 * p.correct / p.answered) : 0;
  const parts = [];
  for (const t in TYPE_NAME) if (p.counts[t]) parts.push(TYPE_NAME[t] + p.counts[t]);
  return '<div class="card paper">' +
    '<div class="paper-head"><div class="paper-name">' + esc(p.name) + '</div>' +
      '<div class="paper-meta" style="flex:none">掌握 ' + p.mastery + '%</div></div>' +
    '<div class="paper-meta">' + p.total + ' 题(' + parts.join(' · ') + ')' +
      (p.seen ? ' · 做过 ' + p.seen + ' 题 · 正确率 ' + accPct + '%' : '') + '</div>' +
    bar(p.mastery) +
    '<div class="paper-acts">' +
      '<button class="btn sm" onclick="openPaperSheet(' + p.id + ',' + jsq(p.name) + ')">开始练习</button>' +
      (p.wrong_open ? '<button class="btn danger sm" onclick="startPractice({paper_id:' + p.id + ',scope:\'wrongmix\',title:' + jsq(p.name + '·错题') + '})">错题(' + p.wrong_open + ')</button>' : '') +
      '<button class="btn ghost sm" onclick="goBank(' + p.id + ')">浏览</button>' +
      '<button class="btn danger sm" onclick="delPaper(' + p.id + ',' + jsq(p.name) + ')">删除</button>' +
    '</div></div>';
}

async function delPaper(pid, name) {
  if (!confirm('删除卷子「' + name + '」及其全部题目和练习记录？')) return;
  try {
    await api('/api/papers/' + pid, { method: 'DELETE' });
    toast('已删除');
    route();
  } catch (e) { toast(e.message, 'bad'); }
}

function goBank(pid, subject) {
  Object.assign(state.bank, { paper_id: pid || 0, subject: subject || '', offset: 0, items: [], papers: [] });
  location.hash = '#/bank';
}

/* ================================================================ 导入 */

function viewUpload() {
  app.innerHTML =
    '<div class="card">' +
      '<div class="sec-title" style="margin-top:0">导入试卷</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">' +
        '<b style="font-size:14px">科目：</b>' +
        '<select class="inp" id="up-subject" style="padding:5px 10px">' +
          Object.keys(SUBJECT_NAME).map(k => '<option value="' + k + '"' + (k === 'general' ? ' selected' : '') + '>' + SUBJECT_NAME[k] + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="dropzone" id="dz">' +
        '<div class="big">+</div>' +
        '<div><b>点击选择</b> 或把试卷文件拖到这里</div>' +
        '<div class="upload-note">支持 .docx / .txt / .md · 可多选批量上传 · 泛雅格式、带答案的普通编号试卷都能识别</div>' +
      '</div>' +
      '<input type="file" id="file" multiple accept=".docx,.txt,.md" style="display:none">' +
      '<div id="upload-out"></div>' +
      '<div class="muted" style="margin-top:10px">含图片、公式的大题库请用题库包导入：在 学测/_脚本 运行 build_packs.py,' +
        '再关掉本服务运行 <code>python import_packs.py ..\\学测\\题库包</code>。</div>' +
    '</div>';
  bindUpload();
}

function bindUpload() {
  const dz = $('#dz'), fi = $('#file'), out = $('#upload-out');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
  });
  fi.addEventListener('change', () => { handleFiles(fi.files); fi.value = ''; });

  async function handleFiles(files) {
    const subject = $('#up-subject').value;
    for (const f of files) {
      const line = document.createElement('div');
      line.className = 'card upload-result';
      line.style.marginTop = '10px';
      line.textContent = '正在识别：' + f.name + ' …';
      out.appendChild(line);
      try {
        const buf = await f.arrayBuffer();
        const d = await api('/api/upload?name=' + encodeURIComponent(f.name) +
                            '&engine=auto&subject=' + encodeURIComponent(subject),
                            { method: 'POST', body: buf });
        const parts = [];
        const bt = d.by_type || {};
        for (const t in TYPE_NAME) if (bt[t]) parts.push(TYPE_NAME[t] + ' ' + bt[t]);
        line.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<div><b>✓ ' + esc(d.paper.name) + '</b> 识别出 <b>' + d.paper.total + '</b> 题(' + parts.join(' · ') + ')' +
              (d.no_answer ? '<div class="muted" style="color:var(--amber)">' + d.no_answer + ' 题未识别到答案，仅收入题库浏览</div>' : '') +
            '</div>' +
            '<button class="btn sm" onclick="startPractice({paper_id:' + d.paper.id + ',scope:\'all\',order:\'seq\',title:' + jsq(d.paper.name) + '})">立即刷题</button>' +
          '</div>';
      } catch (e) {
        line.className = 'card upload-result err';
        line.innerHTML = '<b style="color:var(--red)">✗ ' + esc(f.name) + ' 识别失败</b><div class="muted">' + esc(e.message) + '</div>';
      }
    }
  }
}

/* ================================================================ 题库浏览 */

async function viewBank() {
  const b = state.bank;
  await loadHidden();
  if (!b.papers.length) {
    try { b.papers = (await api('/api/papers')).papers; } catch (e) { /* ignore */ }
  }
  const plist = b.subject ? b.papers.filter(p => p.subject === b.subject) : b.papers.filter(p => !isHidden(p.subject));
  app.innerHTML =
    '<div class="filters">' +
      '<select class="inp" id="f-subj"><option value="">全部科目</option>' +
        shownSubjectKeys().map(k => '<option value="' + k + '"' + (b.subject === k ? ' selected' : '') + '>' + SUBJECT_NAME[k] + '</option>').join('') +
      '</select>' +
      '<select class="inp" id="f-paper"><option value="0">全部卷子</option>' +
        plist.map(p => '<option value="' + p.id + '"' + (b.paper_id === p.id ? ' selected' : '') + '>' + esc(p.name) + '(' + p.total + ')</option>').join('') +
      '</select>' +
      '<input class="inp" id="f-q" placeholder="搜索题干或材料" value="' + esc(b.q) + '" style="flex:1;min-width:140px">' +
      '<button class="chip' + (b.showAns ? ' on' : '') + '" id="f-ans">显示答案</button>' +
    '</div>' +
    '<div class="filters">' +
      [''].concat(Object.keys(TYPE_NAME)).map(t =>
        '<button class="chip' + (b.type === t ? ' on' : '') + '" data-t="' + t + '">' + (t ? TYPE_NAME[t] : '全部题型') + '</button>').join('') +
    '</div>' +
    '<div id="q-list"></div>';

  $('#f-subj').addEventListener('change', e => { b.subject = e.target.value; b.paper_id = 0; reload(); });
  $('#f-paper').addEventListener('change', e => { b.paper_id = +e.target.value; reload(); });
  $$('.chip[data-t]').forEach(c => c.addEventListener('click', () => { b.type = c.dataset.t; reload(); }));
  $('#f-ans').addEventListener('click', () => { b.showAns = !b.showAns; reload(); });
  let timer = null;
  $('#f-q').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { b.q = e.target.value.trim(); reload(); }, 300);
  });

  function reload() { b.offset = 0; b.items = []; viewBank(); }
  await loadMore();
}

// 搜到的题直接拿来练：按列表顺序，能存档
async function practiceSearch() {
  const b = state.bank;
  const base = '/api/questions?paper_id=' + b.paper_id + (b.subject ? '&subject=' + b.subject : '') +
    (b.type ? '&type=' + b.type : '') + (b.q ? '&q=' + encodeURIComponent(b.q) : '');
  let all = [];
  try {
    for (let off = 0; ; off += 200) {
      const d = await api(base + '&limit=200&offset=' + off);
      all = all.concat(d.items);
      if (!d.items.length || all.length >= d.total) break;
    }
  } catch (e) { toast(e.message, 'bad'); return; }
  const list = all.filter(q => q.answer);
  if (!list.length) { toast('这些题没有标准答案，只能浏览', 'bad'); return; }
  const paper = b.paper_id ? b.papers.find(p => p.id === b.paper_id) : null;
  const parts = [paper ? paper.name : (b.subject ? SUBJECT_NAME[b.subject] : ''), b.type ? TYPE_NAME[b.type] : '', b.q ? '“' + b.q + '”' : ''].filter(Boolean);
  const title = '搜索 · ' + (parts.join(' · ') || '全部题目');
  beginPractice(list, title, 'practice');
  allowSave(Object.assign(b.paper_id ? { paper_id: b.paper_id } : { subject: b.subject, type: b.type }, { scope: 'search' }), title);
  if (list.length < all.length) toast((all.length - list.length) + ' 道没有标准答案的题没放进来');
}

async function loadMore() {
  const b = state.bank;
  const box = $('#q-list');
  if (!box) return;
  if (!b.items.length) box.innerHTML = '<div class="empty">加载中…</div>';
  let d;
  try {
    d = await api('/api/questions?paper_id=' + b.paper_id +
      (b.subject ? '&subject=' + b.subject : '') +
      (b.type ? '&type=' + b.type : '') +
      (b.q ? '&q=' + encodeURIComponent(b.q) : '') +
      '&limit=30&offset=' + b.items.length);
  } catch (e) {
    box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    return;
  }
  b.items = b.items.concat(d.items);
  b.total = d.total;
  box.innerHTML = b.items.length
    ? '<div class="bank-bar"><span class="muted">找到 ' + b.total + ' 题</span>' +
        '<button class="btn sm" onclick="practiceSearch()">练这 ' + b.total + ' 题</button></div>' +
      b.items.map(qCard).join('') +
      (b.items.length < b.total
        ? '<div class="loadmore"><button class="btn ghost" onclick="loadMore()">加载更多(' + b.items.length + '/' + b.total + ')</button></div>'
        : '<div class="muted" style="text-align:center;padding:10px">共 ' + b.total + ' 题</div>')
    : '<div class="empty">没有符合条件的题目，换个题型或关键词试试。</div>';
}

function qCard(q) {
  return '<div class="card" id="qc' + q.id + '">' +
    '<div class="qhead">' +
      '<span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
      '<span class="qsrc">' + esc(q.paper_name) + ' · 第' + q.qno + '题' + (q.answer ? '' : ' · 无答案') + '</span>' +
      recBadge(q) +
    '</div>' +
    materialBox(q) +
    '<div class="stem">' + rich(q.stem) + '</div>' +
    (state.bank.showAns && q.answer ? optsStatic(q) + '<div class="ansbox">' + ansHtml(q) + '</div>'
      : optsStatic({ type: q.type, options: q.options, answer: '' }) +
        '<div style="margin-top:10px"><button class="btn ghost sm" onclick="revealAns(' + q.id + ',this)">显示答案</button></div>') +
    '</div>';
}

function revealAns(qid, btn) {
  const q = state.bank.items.find(x => x.id === qid);
  if (!q) return;
  const card = $('#qc' + qid);
  const opts = card.querySelector('.opts');
  if (opts) opts.outerHTML = optsStatic(q);
  const div = document.createElement('div');
  div.className = 'ansbox';
  div.innerHTML = ansHtml(q);
  btn.replaceWith(div);
}

/* ================================================================ 错题本 */

async function viewWrong() {
  app.innerHTML = '<div class="empty">加载中…</div>';
  await loadHidden();
  if (state.wrongSubject && isHidden(state.wrongSubject)) state.wrongSubject = '';
  const subj = state.wrongSubject;
  let items, done;
  try {
    items = (await api('/api/wrong?mastered=0&subject=' + subj)).items;
    done = (await api('/api/wrong?mastered=1&subject=' + subj)).items;
  } catch (e) {
    app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    return;
  }
  const tab = state.wrongTab;
  const list = tab ? done : items;
  app.innerHTML =
    '<div class="wrong-tabs">' +
      '<button class="chip' + (!tab ? ' on' : '') + '" id="wt0">待消灭(' + items.length + ')</button>' +
      '<button class="chip' + (tab ? ' on' : '') + '" id="wt1">已消灭(' + done.length + ')</button>' +
      '<select class="inp" id="w-subj"><option value="">全部科目</option>' +
        shownSubjectKeys().map(k => '<option value="' + k + '"' + (subj === k ? ' selected' : '') + '>' + SUBJECT_NAME[k] + '</option>').join('') +
      '</select>' +
      '<div style="flex:1"></div>' +
      (items.length
        ? '<button class="btn sm" onclick="startPractice({subject:' + jsq(subj) + ',scope:\'wrongmix\',title:\'错题重练\'})">错题重练</button>' +
          (IS_APP ? '' : '<a class="btn ghost sm" href="/api/export/wrong">导出</a>')
        : '') +
    '</div>' +
    (!tab ? '<div class="muted" style="margin:-4px 0 12px">错题要在<b>不同的日子</b>里连续答对 ' + MASTER_STREAK + ' 次才会消灭，今日复习会按时把它们排出来。</div>' : '') +
    (list.length
      ? list.map(q =>
        '<div class="card">' +
          '<div class="qhead">' +
            '<span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
            '<span class="qsrc">' + esc(q.paper_name) + ' · 第' + q.qno + '题</span>' +
            '<span class="rec-badge bad">做错 ' + q.wrong_count + ' 次</span>' +
            (!q.mastered ? '<span class="rec-badge">' + streakText(q.streak) + (q.due ? ' · ' + q.due.slice(5) + ' 复习' : '') + '</span>' : '') +
            '<div style="flex:1"></div>' +
            (q.mastered
              ? '<button class="btn ghost sm" onclick="markWrong(' + q.id + ',false)">重新加入</button>'
              : '<button class="btn ghost sm" onclick="markWrong(' + q.id + ',true)">标记已掌握</button>') +
          '</div>' +
          materialBox(q, true) +
          '<div class="stem">' + rich(q.stem) + '</div>' +
          optsStatic(q) +
          (q.answer ? '<div class="ansbox">' + ansHtml(q) + '</div>' : '') +
        '</div>').join('')
      : '<div class="empty">' +
        (tab ? '还没有已消灭的错题' : '当前没有待消灭的错题!<br><span class="muted">做错的题会自动收进这里</span>') + '</div>');
  $('#wt0').addEventListener('click', () => { state.wrongTab = 0; viewWrong(); });
  $('#wt1').addEventListener('click', () => { state.wrongTab = 1; viewWrong(); });
  $('#w-subj').addEventListener('change', e => { state.wrongSubject = e.target.value; viewWrong(); });
}

async function markWrong(qid, mastered) {
  try {
    await api('/api/wrong/mark', { method: 'POST', body: { question_id: qid, mastered: mastered } });
    toast(mastered ? '已标记为掌握' : '已重新加入错题本', mastered ? 'good' : '');
    viewWrong();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ================================================================ 刷题 / 复习 */

async function startReview(subject) {
  let d;
  try { d = await api('/api/review' + (subject ? '?subject=' + subject : '')); } catch (e) { toast(e.message, 'bad'); return; }
  const title = (subject ? SUBJECT_NAME[subject] + ' · ' : '');
  if (d.items.length) {
    beginPractice(d.items, title + '今日复习', 'review');
    allowSave({ subject: subject, scope: 'review' }, title + '今日复习');
    toast('到期 ' + d.due + ' 题 + 新题 ' + d.new + ' 题');
    return;
  }
  // 今天该复习的做完了、新题额度也用完了：还想练就加练一轮——最薄弱的旧题掺一些新题
  try { d = await api('/api/review?extra=1' + (subject ? '&subject=' + subject : '')); } catch (e) { toast(e.message, 'bad'); return; }
  if (d.ahead == null) { toast('今天的复习已完成。加练要更新到最新版程序（设置 → 检查更新）'); return; }   // 老版程序不认 extra
  if (!d.items.length) { toast('这里还没有做过的题，先去做几套卷子吧'); return; }
  beginPractice(d.items, title + '加练', 'review');
  allowSave({ subject: subject, scope: 'extra' }, title + '加练');
  toast('今天的复习已完成，再加练 ' + d.items.length + ' 题：' +
    [d.ahead ? '薄弱旧题 ' + d.ahead : '', d.new ? '新题 ' + d.new : ''].filter(Boolean).join(' + '));
}

async function startPractice(opts) {
  let d;
  try {
    d = await api('/api/practice?paper_id=' + (opts.paper_id || 0) +
      '&scope=' + (opts.scope || 'all') +
      '&order=' + (opts.order || 'random') +
      (opts.subject ? '&subject=' + encodeURIComponent(opts.subject) : '') +
      (opts.type ? '&type=' + encodeURIComponent(opts.type) : ''));
  } catch (e) { toast(e.message, 'bad'); return; }
  // 1.5.0 以前的电脑版程序不认 wrongmix，会把范围里的题全返回：退回只练错题
  if (opts.scope === 'wrongmix' && !d.mix) return startPractice(Object.assign({}, opts, { scope: 'wrong' }));
  if (!d.items.length) {
    toast(/^wrong/.test(opts.scope) ? '现在没有待消灭的错题' : (opts.scope === 'new' ? '这里的题都做过了' : '该范围暂无可练习的题目'));
    return;
  }
  const list = opts.shuffleOpts ? d.items.map(shuffleQuestion) : d.items;
  beginPractice(list, opts.title || '练习', 'practice');
  // 除了全部乱序（选项每次重新打乱），平时的练习都能手动存档；模拟考试另有自己的进度保存
  if (!opts.shuffleOpts) allowSave(opts, opts.title);
  if (opts.scope === 'wrongmix') {
    const w = d.items.filter(q => q.in_wrong).length;
    const back = d.items.filter(q => !q.in_wrong && q.wrong_count).length;
    toast(w + ' 道错题混在 ' + d.items.length + ' 道题里' + (back ? '，其中 ' + back + ' 道是以前错过、后来做对的' : ''));
  }
}

// 这一轮练习可以存档：存档按练习的来源（卷子 / 科目 / 题型 / 复习……）分开存，读档时按存下的题目顺序还原
function allowSave(src, title) {
  state.practice.saveKey = saveKeyOf(src);
  state.practice.saveOpts = Object.assign(practiceSrc(src), { title: title });
  if (location.hash === '#/practice') route();
}

function beginPractice(list, title, mode) {
  state.practice = { list: list, idx: 0, correct: 0, answered: false, results: [], title: title,
                     mode: mode, requeued: {}, firstTotal: list.length,
                     done: {} };          // 题目序号 -> 当时的作答（选项字母数组，或自评 {self: true/false}），回看上一题用
  if (location.hash === '#/practice') route();
  else location.hash = '#/practice';
}

/* ---- 整卷 / 题型练习的两种方式 + 手动存档 ---- */

// 练习的范围：一张卷子，或者某科的某个题型（比如数学·单选题）
function practiceSrc(o) { return o.paper_id ? { paper_id: o.paper_id } : { subject: o.subject || '', type: o.type || '' }; }
function saveKeyOf(o) {
  const scope = o.scope && o.scope !== 'all' ? '.' + o.scope : '';
  if (o.paper_id) return 'zx.save.' + o.paper_id + scope;           // 整卷：zx.save.<卷子id>（1.4.8 起的存档沿用）
  return 'zx.save.' + (o.subject || 'all') + '.' + (o.type || '') + scope;
}

// 选项里引用了别的选项（以上都对、A和B……）或图里标号的题，打乱会出错，不打乱（和模拟考试同一条规则）
const NO_SHUFFLE = /以上|上述|都(?:对|错|正确|不正确)|(?<![A-Za-z])[A-G]\s*[和与及、,，]\s*[A-G](?![A-Za-z])|^[A-G]{1,4}$|见材料|(?<!可)见图|\b(?:[Aa]ll|[Nn]one|[Bb]oth|[Nn]either) of the above\b|\b[A-G] and [A-G]\b/;

// 全乱序模式：把题目复制一份，选项打乱后重新标 A、B、C，答案、中文释义、每个选项的说明跟着换
function shuffleQuestion(q) {
  const opts = q.options || [];
  if (q.type === 'judge' || opts.length < 2 || opts.some(o => NO_SHUFFLE.test((o[1] || '').trim()))) return q;
  const perm = opts.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const L = i => String.fromCharCode(65 + i);
  const newKey = {};
  perm.forEach((j, i) => { newKey[opts[j][0]] = L(i); });
  const c = Object.assign({}, q, {
    options: perm.map((j, i) => [L(i), opts[j][1]]),
    answer: (q.answer || '').split('').map(k => newKey[k] || k).sort().join(''),
    shuffled: true,
  });
  if (q.options_cn) c.options_cn = perm.map(j => q.options_cn[j]);
  if (q.option_notes) c.option_notes = perm.map(j => q.option_notes[j]);
  return c;
}

function openPaperSheet(pid, name) { openModeSheet({ paper_id: pid }, name); }

function openModeSheet(src, name) {
  const key = saveKeyOf(src);
  const save = store.get(key);
  const go = o => startPractice(Object.assign(practiceSrc(src), { scope: 'all' }, o));
  const sheet = document.createElement('div');
  sheet.className = 'sheet-mask';
  sheet.innerHTML =
    '<div class="sheet" role="dialog">' +
      '<div class="sheet-h"><b>' + esc(name) + '</b><button class="sheet-x" aria-label="关闭">×</button></div>' +
      '<div class="sheet-sec"><div class="sheet-t">选项不变</div>' +
        '<div class="sheet-d">选项顺序和原卷一样。做到一半可以手动存档，以后读档回到那个状态接着做。</div>' +
        (save ? '<button class="btn block" data-act="resume">从存档继续（第 ' + (save.idx + 1) + '/' + save.ids.length + ' 题，' + esc(save.t.slice(5, 16)) + ' 存）</button>' : '') +
        '<div class="sheet-row"><button class="btn' + (save ? ' ghost' : '') + '" data-act="seq">' + (src.paper_id ? '按原卷顺序' : '按卷子顺序') + '</button>' +
        '<button class="btn ghost" data-act="rand">题目打乱</button></div></div>' +
      '<div class="sheet-sec"><div class="sheet-t">全部乱序</div>' +
        '<div class="sheet-d">题目顺序和选项顺序都打乱，检验是不是真会，而不是记住了答案的位置。</div>' +
        '<button class="btn ghost block" data-act="all">开始</button></div>' +
    '</div>';
  const close = () => sheet.remove();
  sheet.addEventListener('click', e => {
    // 用 closest：老手机上 gap 兜底脚本会把按钮里的文字包进 <span>，点到的是 span 不是按钮
    if (e.target === sheet || e.target.closest('.sheet-x')) return close();
    const btn = e.target.closest('[data-act]');
    const act = btn && btn.dataset.act;
    if (!act) return;
    close();
    if (act === 'resume') loadSave(key);
    else if (act === 'seq') go({ order: 'seq', title: name });
    else if (act === 'rand') go({ order: 'random', title: name + '·题目打乱' });
    else go({ order: 'random', shuffleOpts: true, title: name + '·全部乱序' });
  });
  document.body.appendChild(sheet);
}

function saveProgress() {
  const p = state.practice;
  if (!p || !p.saveKey) return;
  // 当前这道已经答完就存“做完这道”，下次从下一道开始
  const idx = p.answered ? p.idx + 1 : p.idx;
  store.set(p.saveKey, {
    ids: p.list.map(q => q.id), idx: Math.min(idx, p.list.length - 1), done: p.done,
    results: p.results.map(r => [r.q.id, r.correct]), correct: p.correct,
    title: p.title, opts: p.saveOpts, t: nowText(),
  });
  toast('已存档：做完了 ' + Object.keys(p.done).length + ' 题，以后可以读档回到这里');
}

async function loadSave(key) {
  if (typeof key === 'number') key = 'zx.save.' + key;
  const sv = store.get(key);
  if (!sv) { toast('还没有存档'); return; }
  const o = sv.opts || {};
  let d;
  try {
    // 取这个范围里的全部题，再按存档里的题目 id 和顺序还原
    d = await api('/api/practice?scope=all&order=seq' + (o.paper_id ? '&paper_id=' + o.paper_id
      : (o.subject ? '&subject=' + encodeURIComponent(o.subject) : '') + (o.type ? '&type=' + encodeURIComponent(o.type) : '')));
  } catch (e) { toast(e.message, 'bad'); return; }
  const byId = {};
  d.items.forEach(q => { byId[q.id] = q; });
  const list = sv.ids.map(id => byId[id]).filter(Boolean);
  if (list.length !== sv.ids.length) { toast('题目变过了，这个存档用不了', 'bad'); return; }
  beginPractice(list, sv.title, 'practice');
  const p = state.practice;
  Object.assign(p, { idx: sv.idx, done: sv.done || {}, correct: sv.correct || 0,
                     results: (sv.results || []).map(r => ({ q: byId[r[0]], correct: r[1] })).filter(r => r.q),
                     saveKey: key, saveOpts: sv.opts });
  route();
  toast('已读档：回到第 ' + (sv.idx + 1) + ' 题');
}

function nowText() {
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

function retryWrongOnly() {
  const p = state.practice;
  const seen = {};
  const wrongs = p.results.filter(r => !r.correct && !seen[r.q.id] && (seen[r.q.id] = 1)).map(r => r.q);
  if (!wrongs.length) { toast('这次没有错题'); return; }
  beginPractice(wrongs, p.title + '·错题重练', 'practice');
}

function viewPractice() {
  const p = state.practice;
  if (!p) { location.hash = '#/home'; return; }
  if (p.finished) return renderFinish();
  renderQ();
}

function statsHtml(p) {
  const doneN = p.results.length;
  return '<span class="muted">答对：</span><span class="num-green">' + p.correct + ' 题</span>' +
    '<span class="muted">答错：</span><span class="num-red">' + (doneN - p.correct) + ' 题</span>' +
    '<span class="muted">正确率：</span>' + (doneN ? Math.round(100 * p.correct / doneN) : 0) + '%';
}

function renderQ() {
  const p = state.practice;
  const q = p.list[p.idx];
  const opts = optionList(q);
  const pct = Math.round(100 * p.idx / p.list.length);
  const again = p.idx >= p.firstTotal;
  app.innerHTML =
    '<div class="crumb crumb-row"><span class="crumb-t"><span class="crumb-pre">当前位置：</span><a href="#/home">首页</a> &gt; ' + esc(p.title) + '</span>' +
      '<span class="crumb-acts">' +
        (p.saveKey ? '<a href="javascript:void(0)" onclick="saveProgress()">存档</a>' +
          (store.get(p.saveKey) ? '<a href="javascript:void(0)" onclick="loadSave(' + jsq(p.saveKey) + ')">读档</a>' : '') : '') +
        '<a class="crumb-exit" href="javascript:void(0)" onclick="quitPractice()">退出练习</a></span></div>' +
    '<div class="pbar-wrap"><div class="pbar"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="card qcard-main">' +
      '<div class="qhead">' +
        '<span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
        '<span class="qsrc">' + esc(q.paper_name) + ' 第' + q.qno + '题</span>' +
        (again ? '<span class="rec-badge bad">刚才做错，再来一次</span>' : recBadge(q)) +
        '<span class="spacer"></span>' + cnBtn(q) +
      '</div>' +
      materialBox(q) +
      '<div class="stem">' + (p.idx + 1) + '/' + p.list.length + '、' + rich(q.stem) + '</div>' + stemCn(q) +
      '<div id="qbody"></div>' +
      '<div class="msg-bar" id="pstats">' + statsHtml(p) + '</div>' +
    '</div>';

  const body = $('#qbody');
  if (SELF_TYPES.indexOf(q.type) >= 0) {
    const ph = { dictation: '在纸上或这里默写诗句，再对照答案（选填）…',
                 essay: '可以先列提纲，写完再对照参考思路自评（选填）…',
                 solution: '在草稿纸上推演，做完再来对照（此栏可记关键步骤，选填）…',
                 blank: '在纸上写出结果，再来对照（选填）…' }[q.type] || '可以在这里写下你的思路（选填）…';
    const btnText = { dictation: '查看默写答案', essay: '查看写作思路',
                      solution: '做完了，对照解答', blank: '做完了，对照答案' }[q.type] || '查看参考答案';
    body.innerHTML =
      '<textarea class="selfarea" id="self-input" placeholder="' + ph + '"></textarea>' +
      '<div class="qactions" id="qact"><button class="btn" onclick="showQaAns()">' + btnText + '</button></div>';
  } else {
    // 单选、判断、多选都是：点选项只是选中，按「确认答案」（或回车）才判对错
    const multi = q.type === 'multi';
    body.innerHTML =
      (q.type === 'judge'
        ? '<div class="judge-row" id="optsbox">' + opts.map(o =>
          '<button class="opt" data-k="' + esc(o[0]) + '" onclick="pickOpt(this)"><span class="key">' + (o[0] === '对' ? '✓' : '✗') + '</span><span>' + esc(o[1]) + '</span></button>').join('') + '</div>'
        : '<div class="opts" id="optsbox">' + opts.map((o, i) =>
          '<button class="opt" data-k="' + esc(o[0]) + '" onclick="pickOpt(this)"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + optCn(q, i) + '</span></button>').join('') + '</div>') +
      '<div class="qactions" id="qact">' + prevBtn(p) + '<span class="muted kbd-tip">' + (multi ? '多选题，可选多项。' : '') + keyTip('选好后按回车确认') + '</span><div class="spacer"></div>' +
        '<button class="btn" id="confirm-btn" disabled onclick="confirmChoice()">确认答案</button></div>';
  }
  // 回看已经做过的题：直接显示当时的作答和解析，不再记分
  const done = p.done[p.idx];
  if (done) {
    if (done.self !== undefined) showQaAns(true);
    else {
      $$('#optsbox .opt').forEach(b => { if (done.indexOf(b.dataset.k) >= 0) b.classList.add('sel'); });
      gradeAndShow(done, true);
    }
  }
}

// 键盘提示只在有键盘的设备上显示
function keyTip(t) {
  return window.matchMedia && matchMedia('(hover: none)').matches ? '' : t;
}

function prevBtn(p) {
  return p.idx > 0 ? '<button class="btn ghost" onclick="prevQ()">上一题</button>' : '';
}

function pickOpt(btn) {
  const p = state.practice;
  if (!p || p.answered) return;
  const q = p.list[p.idx];
  if (q.type === 'multi') btn.classList.toggle('sel');
  else $$('#optsbox .opt').forEach(b => b.classList.toggle('sel', b === btn));
  const ok = $('#confirm-btn');
  if (ok) ok.disabled = !$$('#optsbox .opt.sel').length;
}

function confirmChoice() {
  const p = state.practice;
  if (!p || p.answered) return;
  const sel = $$('#optsbox .opt.sel').map(b => b.dataset.k);
  if (sel.length) gradeAndShow(sel);
}


function recordResult(q, ok) {
  const p = state.practice;
  p.results.push({ q: q, correct: ok });
  if (ok) p.correct++;
  const st = $('#pstats');
  if (st) st.innerHTML = statsHtml(p);
  // 复习模式:做错的题在本轮末尾再出现一次
  if (!ok && p.mode === 'review' && !p.requeued[q.id]) {
    p.requeued[q.id] = 1;
    p.list.push(q);
  }
  api('/api/record', { method: 'POST', body: { question_id: q.id, correct: ok, mode: p.mode } })
    .then(d => {
      if (d.event === 'released') toast('连续答对 ' + MASTER_STREAK + ' 次，这道错题已消灭', 'good');
      else if (d.event === 'entered') toast('已加入错题本');
    })
    .catch(e => toast('记录失败：' + e.message, 'bad'));
}

function gradeAndShow(selKeys, replay) {
  const p = state.practice;
  const q = p.list[p.idx];
  const isRight = q.type === 'multi'
    ? selKeys.slice().sort().join('') === q.answer.split('').sort().join('')
    : selKeys[0] === q.answer;
  p.answered = true;
  $('.qcard-main').classList.add('answered');
  if (!replay) {
    p.done[p.idx] = selKeys.slice();
    recordResult(q, isRight);
  }

  $$('#qbody .opt').forEach(b => {
    b.disabled = true;
    const k = b.dataset.k;
    const inAns = q.type === 'multi' ? q.answer.indexOf(k) >= 0 : k === q.answer;
    if (inAns) b.classList.add('ok');
    else if (selKeys.indexOf(k) >= 0) b.classList.add('bad');
  });

  const fb = document.createElement('div');
  fb.className = 'feedback ' + (isRight ? 'good' : 'bad');
  fb.innerHTML = '<div class="ans-line">' + (isRight ? '✓ 答对了' : '✗ 答错了') +
    '<span class="ans-key">正确答案 <b>' + esc(q.answer) + '</b></span></div>' +
    (isRight ? '' : whyBox(q, selKeys)) +
    (q.analysis ? '<div class="analysis">' + (isRight ? '' : '<b>怎么解：</b>') + rich(q.analysis) + '</div>' +
      (q.shuffled && /[A-F]/.test(q.analysis) ? '<div class="muted">选项已打乱，解析里提到的字母是原卷的顺序</div>' : '') : '') +
    pointBox(q) + phraseBox(q);
  $('#qbody').insertBefore(fb, $('#qact'));

  $('#qact').innerHTML = nextActions(p);
}

// 答完以后的按钮：上一题 / 下一题（或查看结果）
function nextActions(p) {
  return prevBtn(p) + '<span class="muted kbd-tip">' + keyTip('回车 = 下一题') + '</span><div class="spacer"></div>' +
    '<button class="btn" id="nextbtn" onclick="nextQ()">' + (p.idx + 1 >= p.list.length ? '查看结果' : '下一题') + '</button>';
}

function showQaAns(replay) {
  const p = state.practice;
  const q = p.list[p.idx];
  p.answered = true;
  $('.qcard-main').classList.add('answered');
  const ta = $('#self-input');
  const fb = document.createElement('div');
  fb.className = 'feedback';
  fb.style.background = 'var(--primary-l)';
  fb.innerHTML = '<div class="ans-line">参考答案</div><div class="analysis">' + rich(q.answer) + '</div>' +
    (q.analysis ? '<div class="analysis">' + rich(q.analysis) + '</div>' : '') + pointBox(q) + phraseBox(q);
  $('#qbody').insertBefore(fb, $('#qact'));
  if (ta) ta.disabled = true;
  if (replay) {                      // 回看：已经自评过了
    $('#qact').innerHTML = nextActions(p);
    return;
  }
  $('#qact').innerHTML = prevBtn(p) +
    '<span class="muted">对照参考答案，诚实自评：</span><div class="spacer"></div>' +
    '<button class="btn green" onclick="selfGrade(true)">✓ 我答对了</button>' +
    '<button class="btn danger" onclick="selfGrade(false)">✗ 没答好</button>';
}

function selfGrade(ok) {
  const p = state.practice;
  p.done[p.idx] = { self: ok };
  recordResult(p.list[p.idx], ok);
  nextQ();
}

function nextQ() {
  const p = state.practice;
  if (!p) return;
  if (!p.answered && !p.done[p.idx]) return;     // 还没作答，不能跳过去
  p.answered = false;
  p.idx++;
  if (p.idx >= p.list.length) p.finished = true;
  route();
}

function prevQ() {
  const p = state.practice;
  if (!p || p.idx <= 0) return;
  p.answered = false;
  p.idx--;
  route();
}

function quitPractice() {
  if (!state.practice || state.practice.finished || !state.practice.results.length ||
      confirm('退出练习？已作答的题都已记录。')) {
    state.practice = null;
    history.length > 1 ? history.back() : (location.hash = '#/home');
  }
}

function renderFinish() {
  const p = state.practice;
  // 按每道题第一次作答统计
  const first = {};
  p.results.forEach(r => { if (!(r.q.id in first)) first[r.q.id] = r; });
  const rs = Object.values(first);
  const total = rs.length;
  const right = rs.filter(r => r.correct).length;
  const wrongs = rs.filter(r => !r.correct);
  const pct = total ? Math.round(100 * right / total) : 0;
  const color = pct >= 80 ? 'var(--green)' : (pct >= 60 ? 'var(--amber)' : 'var(--red)');
  const comment = pct >= 90 ? '这一轮几乎全对。' : pct >= 70 ? '错的题明天会再排出来。' :
    pct >= 50 ? '先把这次的错题重练一遍。' : '建议先把错题本过一遍，再做新题。';
  app.innerHTML =
    '<div class="card finish">' +
      '<div class="ring" style="background:conic-gradient(' + color + ' 0 ' + pct + '%, var(--track) ' + pct + '% 100%)">' +
        '<span class="v" style="color:' + color + '">' + pct + '</span></div>' +
      '<h2>' + esc(p.title) + ' 完成!</h2>' +
      '<div class="muted">共 ' + total + ' 题 · 答对 <b style="color:var(--green)">' + right + '</b> · 答错 <b style="color:var(--red)">' + wrongs.length + '</b><br>' + comment + '</div>' +
      '<div class="acts">' +
        (p.mode === 'practice' ? '<button class="btn ghost" onclick="beginPractice(state.practice.list.slice(0,state.practice.firstTotal),state.practice.title,\'practice\')">再做一遍</button>' : '') +
        (wrongs.length ? '<button class="btn danger" onclick="retryWrongOnly()">只练本次错题(' + wrongs.length + ')</button>' : '') +
        '<a class="btn ghost" href="#/wrong">查看错题本</a>' +
        '<a class="btn" href="#/home">返回首页</a>' +
      '</div>' +
    '</div>' +
    (wrongs.length
      ? '<div class="sec-title">本次错题（正确答案已标绿）</div>' +
        wrongs.map(r => {
          const q = r.q;
          return '<div class="card">' +
            '<div class="qhead"><span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
            '<span class="qsrc">' + esc(q.paper_name || '') + ' · 第' + q.qno + '题</span></div>' +
            materialBox(q, true) +
            '<div class="stem">' + rich(q.stem) + '</div>' +
            optsStatic(q) +
            '<div class="ansbox">' + ansHtml(q) + '</div>' +
          '</div>';
        }).join('')
      : '');
}

/* ================================================================ 模拟考试 */

let examTimer = null;
function stopExamTimer() { if (examTimer) { clearInterval(examTimer); examTimer = null; } }

async function viewExam(args) {
  stopExamTimer();
  if (args[0] === 'run') return renderExamRun();
  if (args[0] === 'new') return viewExamNew(args[1]);
  if (args[0]) return viewExamReport(+args[0]);
  return viewExamNew('');
}

async function viewExamNew(subject) {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let d, list;
  try {
    d = (await api('/api/dashboard')).data;
    list = (await api('/api/exams')).items.filter(e => e.finished);
  } catch (e) {
    app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    return;
  }
  const unfinished = store.get('quiz.exam');
  state.hidden = d.settings.hidden_subjects || [];
  const subs = d.subjects.filter(s => s.subject !== 'general' && !s.hidden);
  app.innerHTML =
    (unfinished ? '<div class="card notice">还没交卷：<b>' + esc(unfinished.exam.title) + '</b><div class="spacer"></div>' +
      '<a class="btn sm" href="#/exam/run">继续作答</a><button class="btn danger sm" onclick="abandonExam()">放弃</button></div>' : '') +
    '<div class="card">' +
      '<div class="sec-title" style="margin-top:0">开始一场模拟考</div>' +
      '<div class="muted" style="margin-bottom:12px">从该科所有卷子里随机抽题、打乱选项，限时作答，交卷后统一判分。做错和没做的题会自动进错题本。</div>' +
      '<div class="exam-grid">' + subs.map(s =>
        '<div class="exam-pick' + (s.subject === subject ? ' on' : '') + '">' +
          '<div class="subj-name"><span class="ti">' + SUBJECT_ICON[s.subject] + '</span>' + SUBJECT_NAME[s.subject] + '</div>' +
          '<div class="paper-acts">' +
            '<button class="btn sm" onclick="startExam(\'' + s.subject + '\',\'standard\')">标准模拟卷</button>' +
            '<button class="btn ghost sm" onclick="startExam(\'' + s.subject + '\',\'quick\')">20 题小测</button>' +
          '</div></div>').join('') +
      '</div>' +
    '</div>' +
    '<div class="card"><div class="sec-title" style="margin-top:0">考试记录</div>' +
      (list.length ? list.map(examRow).join('') : '<div class="muted">还没有考过</div>') +
    '</div>';
}

async function startExam(subject, preset) {
  if (store.get('quiz.exam') && !confirm('还有一场没交卷的考试，放弃它并开始新的？')) return;
  let d;
  try { d = await api('/api/exam/start', { method: 'POST', body: { subject: subject, preset: preset } }); } catch (e) { toast(e.message, 'bad'); return; }
  const now = Date.now();
  store.set('quiz.exam', { exam: d.exam, answers: {}, startedAt: now, deadline: now + d.exam.minutes * 60000 });
  location.hash = '#/exam/run';
}

function abandonExam() {
  if (!confirm('放弃这场考试？作答不会被记录。')) return;
  store.del('quiz.exam');
  route();
}

function renderExamRun() {
  const st = store.get('quiz.exam');
  if (!st) { location.hash = '#/exam'; return; }
  const e = st.exam;
  let n = 0;
  const allItems = [];
  app.innerHTML =
    '<div class="exam-bar">' +
      '<div class="exam-bar-t">' + esc(e.title) + '</div>' +
      '<div class="timer" id="timer">--:--</div>' +
      '<div class="muted" id="exam-progress"></div>' +
      '<button class="btn sm" onclick="submitExam(false)">交卷</button>' +
    '</div>' +
    '<div class="exam-layout"><div class="exam-main">' +
    e.sections.map(sec => {
      let lastMat = null;
      return '<div class="sec-title">' + esc(sec.name) + '<span class="muted"> · ' + sec.items.length + ' 题' +
        (sec.points && sec.points !== 1 ? '，每题 ' + fmtPts(sec.points) + ' 分' : '') + '</span></div>' +
        sec.items.map(q => {
          n++;
          allItems.push({ q: q, n: n });
          const mat = q.material && q.material !== lastMat ? materialBox(q) : '';
          lastMat = q.material;
          const opts = optionList(q);
          return mat + '<div class="card exam-q" id="eq' + q.id + '">' +
            '<div class="qhead"><span class="qno">' + n + '</span><span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span></div>' +
            '<div class="stem">' + rich(q.stem) + '</div>' +
            (q.type === 'judge'
              ? '<div class="judge-row">' + opts.map(o =>
                  '<button class="opt" data-q="' + q.id + '" data-k="' + o[0] + '" onclick="examPick(' + q.id + ',\'' + o[0] + '\',false)"><span class="key">' + (o[0] === '对' ? '✓' : '✗') + '</span><span>' + o[1] + '</span></button>').join('') + '</div>'
              : '<div class="opts">' + opts.map(o =>
                  '<button class="opt" data-q="' + q.id + '" data-k="' + esc(o[0]) + '" onclick="examPick(' + q.id + ',\'' + esc(o[0]) + '\',' + (q.type === 'multi') + ')"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + '</span></button>').join('') + '</div>' +
                (q.type === 'multi' ? '<div class="muted" style="margin-top:6px">多选题，可选多项</div>' : '')) +
          '</div>';
        }).join('');
    }).join('') +
    '<div style="text-align:center;margin:20px 0"><button class="btn big-btn" onclick="submitExam(false)">交卷</button></div>' +
    '</div>' +
    '<div class="answer-card" id="acard">' + allItems.map(it =>
      '<a href="javascript:void(0)" data-q="' + it.q.id + '" onclick="document.getElementById(\'eq' + it.q.id + '\').scrollIntoView({behavior:\'smooth\',block:\'center\'})">' + it.n + '</a>').join('') +
    '</div></div>';

  refreshExamMarks();
  tick();
  examTimer = setInterval(tick, 1000);

  function tick() {
    const s = store.get('quiz.exam');
    if (!s) { stopExamTimer(); return; }
    const left = Math.max(0, Math.round((s.deadline - Date.now()) / 1000));
    const el = $('#timer');
    if (!el) { stopExamTimer(); return; }
    el.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    el.classList.toggle('urgent', left <= 300);
    if (left <= 0) { stopExamTimer(); toast('时间到，自动交卷'); submitExam(true); }
  }
}

function examPick(qid, key, multi) {
  const st = store.get('quiz.exam');
  if (!st) return;
  let cur = st.answers[qid] || '';
  if (multi) cur = cur.indexOf(key) >= 0 ? cur.replace(key, '') : (cur + key).split('').sort().join('');
  else cur = cur === key ? '' : key;
  st.answers[qid] = cur;
  store.set('quiz.exam', st);
  refreshExamMarks();
}

function refreshExamMarks() {
  const st = store.get('quiz.exam');
  if (!st) return;
  $$('.exam-q .opt').forEach(b => {
    const a = st.answers[b.dataset.q] || '';
    b.classList.toggle('sel', a.indexOf(b.dataset.k) >= 0 && a !== '');
  });
  let done = 0, total = 0;
  $$('#acard a').forEach(a => {
    total++;
    const ok = !!st.answers[a.dataset.q];
    if (ok) done++;
    a.classList.toggle('done', ok);
  });
  const pr = $('#exam-progress');
  if (pr) pr.textContent = '已答 ' + done + '/' + total;
}

let submitting = false;
async function submitExam(auto) {
  const st = store.get('quiz.exam');
  if (!st || submitting) return;
  if (!auto) {
    const total = st.exam.sections.reduce((a, s) => a + s.items.length, 0);
    const done = Object.values(st.answers).filter(Boolean).length;
    if (!confirm(done < total ? '还有 ' + (total - done) + ' 题没答，确定交卷？' : '确定交卷？')) return;
  }
  submitting = true;
  try {
    const used = Math.round((Math.min(Date.now(), st.deadline) - st.startedAt) / 1000);
    const d = await api('/api/exam/submit', { method: 'POST', body: { id: st.exam.id, answers: st.answers, used_seconds: used } });
    store.del('quiz.exam');
    stopExamTimer();
    location.hash = '#/exam/' + d.exam.id;
  } catch (e) {
    toast('交卷失败：' + e.message, 'bad');
  } finally {
    submitting = false;
  }
}

async function viewExamReport(id) {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let e;
  try { e = (await api('/api/exams/' + id)).exam; } catch (err) {
    app.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    return;
  }
  if (!e.finished) { app.innerHTML = '<div class="empty">这场考试还没交卷</div>'; return; }
  const pct = Math.round(e.score);
  const color = pct >= 80 ? 'var(--green)' : (pct >= 60 ? 'var(--amber)' : 'var(--red)');
  const wrongs = [];
  e.sections.forEach(s => s.items.forEach(q => { if (!q.correct) wrongs.push(q); }));
  const bt = e.by_type || {};
  app.innerHTML =
    '<div class="crumb"><a href="#/exam">模拟考</a> / 成绩报告</div>' +
    '<div class="card finish">' +
      '<div class="ring" style="background:conic-gradient(' + color + ' 0 ' + pct + '%, var(--track) ' + pct + '% 100%)">' +
        '<span class="v" style="color:' + color + '">' + pct + '</span></div>' +
      '<h2>' + esc(e.title) + '</h2>' +
      '<div class="muted">答对 ' + e.correct + '/' + e.total + ' · 用时 ' + fmtDur(e.used_seconds) + '(限时 ' + e.minutes + ' 分钟)· ' + esc(e.finished) + '</div>' +
      '<div class="report-grid">' +
        (e.by_section || []).map(s => {
          const p = s.total ? Math.round(100 * s.correct / s.total) : 0;
          const pts = s.points || 1;
          return '<div class="report-cell"><div class="rc-name">' + esc(s.name) + '</div><div class="rc-num">' + s.correct + '/' + s.total +
            (pts !== 1 ? '<span class="muted"> · ' + fmtPts(s.correct * pts) + '/' + fmtPts(s.total * pts) + ' 分</span>' : '') + '</div>' + bar(p, p < 60 ? 'red' : '') + '</div>';
        }).join('') +
      '</div>' +
      '<div class="muted" style="margin-top:8px">按题型：' + Object.keys(bt).map(t =>
        (TYPE_NAME[t] || t) + ' ' + bt[t].correct + '/' + bt[t].total).join(' · ') + '</div>' +
      '<div class="acts">' +
        '<button class="btn" onclick="startExam(\'' + e.subject + '\',\'standard\')">再考一场</button>' +
        (wrongs.length ? '<button class="btn danger" onclick="practiceExamWrongs()">重练这次的错题(' + wrongs.length + ')</button>' : '') +
        '<a class="btn ghost" href="#/home">返回首页</a>' +
      '</div>' +
    '</div>' +
    (wrongs.length ? '<div class="sec-title">错题（红色是你的选择，绿色是正确答案）</div>' +
      wrongs.map(q =>
        '<div class="card">' +
          '<div class="qhead"><span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
          '<span class="qsrc">' + esc(q.paper_name) + ' · 第' + q.qno + '题</span>' +
          '<span class="rec-badge bad">' + (q.given ? '你选 ' + esc(q.given) : '未作答') + '</span></div>' +
          materialBox(q, true) +
          '<div class="stem">' + rich(q.stem) + '</div>' +
          optsStatic(q, q.given || '') +
          '<div class="ansbox">' + ansHtml(q) + '</div>' +
        '</div>').join('') : '');
  window.__examWrongs = wrongs;
}

function practiceExamWrongs() {
  if (window.__examWrongs && window.__examWrongs.length) beginPractice(window.__examWrongs, '模拟考错题重练', 'practice');
}

/* ================================================================ 键盘快捷键 */

document.addEventListener('keydown', e => {
  if (document.querySelector('.zoom') && e.key === 'Escape') { $$('.zoom').forEach(z => z.remove()); return; }
  const p = state.practice;
  if (!p || location.hash !== '#/practice' || p.finished) return;
  const q = p.list[p.idx];
  if (!q) return;
  // 焦点在可交互控件上时交给控件自身(避免回车双触发/输入误触)
  const t = e.target;
  const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
  // 选项按钮点过以后焦点会停在上面，回车照样走「确认 / 下一题」，所以选项按钮不算
  const interactive = (tag === 'input' || tag === 'textarea' || tag === 'select' ||
                      (tag === 'button' && !t.disabled && !t.classList.contains('opt')));
  if (interactive) return;
  if (e.key === 'ArrowLeft') { prevQ(); return; }
  if (e.key === 'ArrowRight') { if (p.answered) nextQ(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (p.answered) nextQ();                                       // 第二次回车：下一题
    else if (SELF_TYPES.indexOf(q.type) < 0) confirmChoice();      // 第一次回车：确认答案
    return;
  }
  if (p.answered || SELF_TYPES.indexOf(q.type) >= 0) return;
  const opts = optionList(q);
  const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5 };
  const km = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
  let i = map[e.key];
  if (i === undefined) i = km[e.key.toLowerCase()];
  if (i === undefined || !opts[i]) return;
  const btns = $$('#optsbox .opt');
  if (btns[i]) pickOpt(btns[i]);
});

/* ================================================================ 设置：版本更新、清除数据 */

routes.settings = viewSettings;

async function viewSettings() {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let a, d, skills = [];
  try {
    a = await api('/api/app');
    d = (await api('/api/dashboard')).data;
  } catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  try { skills = (await api('/api/skills')).items; } catch (e) { /* 没有技能题库 */ }
  state.hidden = d.settings.hidden_subjects || [];
  // 可选的科目：题库里有的科目 + 技能实操方向，按文化课 / 专业技能 / 其他分组
  const subjOpts = d.subjects.map(s => ({ key: s.subject, name: SUBJECT_NAME[s.subject] || s.subject, note: s.total + ' 题' }));
  skills.forEach(s => {
    const k = 'skill:' + s.direction;
    const o = subjOpts.find(x => x.key === k);
    if (o) o.n++;
    else subjOpts.push({ key: k, name: SKILL_DIR_NAME[s.direction] || s.direction, n: 1 });
  });
  subjOpts.forEach(o => { if (o.n) o.note = o.n + ' 套实操'; });
  // 设置页：仿手机系统设置的分组列表（分组标题 + 一行一项 + 底下一句灰色说明）
  const subjList = g => {
    const os = subjOpts.filter(o => subjectGroup(o.key) === g);
    return os.length ? '<div class="set-group-t">' + (GROUP_NAME[g] || '其他') + '</div><div class="set-list">' + os.map(o =>
      '<label class="set-item subj-check' + (isHidden(o.key) ? ' off' : '') + '"><span class="set-main">' + esc(o.name) + '</span><span class="set-val">' + esc(o.note) + '</span>' +
        '<input type="checkbox" class="switch" data-k="' + esc(o.key) + '"' + (isHidden(o.key) ? '' : ' checked') + '></label>').join('') + '</div>' : '';
  };
  const item = (main, val, attrs, cls) =>
    '<' + (attrs ? 'button' : 'div') + ' class="set-item' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' +
      '<span class="set-main">' + main + '</span>' + (val ? '<span class="set-val">' + val + '</span>' : '') + '</' + (attrs ? 'button' : 'div') + '>';
  const canUpd = a.frozen || a.mobile;
  app.innerHTML =
    '<h2 class="page-h"><a class="page-back" href="javascript:void(0)" onclick="goBack()" aria-label="返回">' +
      '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></a>设置</h2>' +
    '<div class="set-page">' +
    subjList('culture') + subjList('pro') + subjList('other') +
    '<div class="set-foot">关掉的科目不再出现在首页、复习、错题本和模拟考里，做题记录会保留。</div>' +

    '<div class="set-group-t">更新</div><div class="set-list">' +
      item('当前版本', 'v' + esc(a.version) + (a.content_version ? ' · 内容第 ' + a.content_version + ' 版' : '')) +
      '<button class="set-item set-link" id="upd-check"' + (canUpd ? '' : ' disabled data-off="1"') + '><span class="set-main upd-label">检查更新</span></button>' +
    '</div>' +
    '<div id="upd-out"></div>' +
    '<div class="set-foot">' + (canUpd ? '题库和界面只下载改动的部分，几秒就好；做题记录不会丢。' : '源码运行，用 git pull 更新。') + '</div>' +

    '<div class="set-group-t">我的数据</div><div class="set-list">' +
      (a.mobile ? item('保存位置', '本机') : '<div class="set-item set-col"><span class="set-main">保存位置</span><span class="set-sub">' + esc(a.data_dir) + '</span></div>') +
      (a.open_data ? item('打开数据文件夹', '', ' onclick="openDataDir()"', 'set-link') : '') +
      (canShareProgress() ? item('分享做题记录', '', ' onclick="shareProgress()"', 'set-link') : '') +
      item('清除做题记录', '', ' onclick="clearMyData()"', 'set-link set-danger') +
    '</div>' +
    '<div class="set-foot">' + (a.mobile
      ? '卸载 App 会一起删除做题记录' + (canShareProgress() ? '，换手机或重装前先分享一份备份' : '') + '。清除前会自动留一份备份。'
      : '清除会清空复习进度、错题本、模拟考和技能实操记录，清除前自动备份到数据文件夹的 backups 里。') + '</div>' +

    '<div class="set-group-t">关于</div><div class="set-list">' +
      item('开发者', '十三、chen_pi') +
      item('项目地址', 'GitHub', ' onclick="openExternal(' + jsq(a.repo) + ')"', 'set-link') +
    '</div>' +
    '<div class="set-foot">智学题库由 十三（xiabanghao13）和 chen_pi（chen-pi-2007）共同开发。<br>' +
      '© 2026 十三、chen_pi，保留所有权利。源码公开仅供学习参考，转载、修改后发布请注明原作者和项目地址。</div>' +
    '</div>';
  const btn = $('#upd-check');
  if (btn) btn.addEventListener('click', checkUpdate);
  markUpdDots();
  updRestore();
  // 热更新了后端代码、还没重启：提醒一下（重启后 a.py.active 会追上来）
  const nr = store.get('zx.needRestart');
  if (nr && a.py) {
    if ((a.py.active || 0) >= nr) store.del('zx.needRestart');
    else if (!upd.busy && !upd.html) updShow('<div class="upd-box"><b>后台程序的更新还没生效</b><div class="muted">重启题库后生效，几秒钟，做题记录不受影响。</div>' +
      '<button class="btn" onclick="restartApp()">现在重启</button></div>');
  }
  $$('.subj-check input').forEach(c => c.addEventListener('change', () => {
    c.closest('.subj-check').classList.toggle('off', !c.checked);     // 关掉的科目名变灰（老 WebView 不支持 :has，用 class）
    saveHidden();
  }));
}

async function saveHidden() {
  const hidden = $$('.subj-check input').filter(c => !c.checked).map(c => c.dataset.k);
  try {
    await api('/api/settings', { method: 'POST', body: { hidden_subjects: hidden } });
    state.hidden = hidden;
    toast(hidden.length ? '已保存，' + hidden.length + ' 个科目不再显示' : '已保存，全部科目都显示', 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

// 更新区域的状态。同一时间只做一件事（检查 / 下载程序 / 更新内容），做的时候「检查更新」按钮变灰；
// 显示的内容记在 upd.html 里，进度循环每次写的都是“当前页面上的” #upd-out，
// 所以中途切到别的页面再回来，进度照样接着显示，也不会两件事抢着改同一块区域
const upd = { busy: '', html: '' };          // busy: '' / 'check' / 'app' / 'content'

function updShow(html) {
  upd.html = html;
  const o = $('#upd-out');
  if (o) o.innerHTML = html;
}

function updSetBusy(kind) {
  upd.busy = kind || '';
  updButton();
}

function updButton() {
  const btn = $('#upd-check');
  if (!btn) return;
  btn.disabled = !!upd.busy || btn.dataset.off === '1';
  const label = btn.querySelector('.upd-label');
  if (label) label.textContent = upd.busy === 'check' ? '正在检查…' : upd.busy ? '正在更新…' : '检查更新';
}

// 设置页重新画出来以后：把正在进行（或刚失败）的更新显示回去
function updRestore() {
  if (upd.busy || upd.html) {
    const o = $('#upd-out');
    if (o) o.innerHTML = upd.html;
  }
  updButton();
}

// 检查更新：程序（exe / apk，要重装）和内容（界面 + 题库，热更新）分开检查，各自显示
async function checkUpdate() {
  if (upd.busy) { updRestore(); return; }              // 正在检查或更新：只把进度显示出来，不再发一次
  updSetBusy('check');
  updShow('<div class="muted set-note">正在检查…</div>');
  let app, cont;
  try {
    [app, cont] = await Promise.all([
      api('/api/update/check').catch(e => ({ error: e.message })),
      api('/api/content/check').catch(e => ({ error: e.message })),
    ]);
  } finally {
    updSetBusy('');
  }
  syncUpdNotice(app, cont, app.error, cont.error);
  let html = '';
  // 先列内容更新：只下载改动的文件，几秒就好；程序整包放后面，可以以后再装
  if (cont.has_update) {
    html += '<div class="upd-box"><b>题库和界面有更新（第 ' + cont.latest + ' 版，' + cont.files + ' 个文件，' + fmtMB(cont.bytes) + '）</b>' +
      (cont.notes ? '<div class="upd-notes">' + esc(cont.notes) + '</div>' : '') +
      '<button class="btn" onclick="applyContentUpdate()">现在更新</button></div>';
  }
  if (app.has_update) {
    html += '<div class="upd-box"><b>有新版程序 v' + esc(app.latest) + '</b>' +
      (app.notes ? '<div class="upd-notes">' + esc(app.notes) + '</div>' : '') +
      (cont.has_update ? '<div class="muted">要重新下载整个程序；上面的更新不用等它，可以先装。</div>' : '') +
      '<button class="btn' + (cont.has_update ? ' ghost' : '') + '" onclick="applyUpdate()">下载并安装' +
        (app.size ? '（' + fmtMB(app.size) + '）' : '') + '</button></div>';
  }
  if (cont.has_update) {
    /* 上面已经列了 */
  } else if (cont.latest > cont.current && !cont.compatible && !app.has_update) {
    html += '<div class="set-note num-orange">有新的题库和界面，但需要程序 v' + esc(cont.min_app_version) + ' 以上，等新版程序发布后先更新程序。</div>';
  }
  if (!html) {
    const err = app.error && cont.error ? app.error : '';
    html = err ? '<div class="set-note num-red">' + esc(err) + '</div>'
               : '<div class="muted set-note">程序和题库都已经是最新的。</div>';
  }
  updShow(html);
}

// 热更新：下载改动的文件（进度条），装好后刷新页面就是新界面和新题库
async function applyContentUpdate() {
  if (upd.busy) { updRestore(); return; }
  updSetBusy('content');
  let p;
  try { p = await api('/api/content/update', { method: 'POST' }); } catch (e) { return updFail(e.message, '', 'content'); }
  while (p.state === 'downloading') {
    updShow(updProgress(p, '正在更新题库和界面' + (p.files_total ? '（' + p.files_done + ' / ' + p.files_total + ' 个文件）' : '')));
    await new Promise(r => setTimeout(r, 400));
    try { p = await api('/api/content/progress'); } catch (e) { return updFail(e.message, '', 'content'); }
  }
  if (p.state !== 'done') return updFail(p.error || '更新失败', '', 'content');
  store.del('zx.updNotice');
  if (p.restart && !IS_APP) {
    // 这次也更新了电脑版的后端代码（hotpy.py），要重启题库才用上
    store.set('zx.needRestart', p.version);
    updSetBusy('');
    updShow('<div class="upd-box"><b>更新好了</b><div class="muted">界面和题库已经换上；后台程序也有改动，重启题库后生效（几秒钟，做题记录不受影响）。</div>' +
      '<div class="upd-acts"><button class="btn" onclick="restartApp()">现在重启</button>' +
      '<button class="btn ghost" onclick="location.reload()">以后再说</button></div></div>');
    return;
  }
  updShow(updProgress(Object.assign({}, p, { done: p.total || 1, total: p.total || 1 }), '更新好了，正在刷新…'));
  setTimeout(() => location.reload(), 800);        // 刷新前一直保持“正在更新”，按钮不能再点
}

// 重启题库（电脑版）：程序退出后自动再打开；独立窗口会整个关掉重开，浏览器里的页面等新进程起来后自己刷新
async function restartApp() {
  updSetBusy('app');
  let before;
  try { before = (await api('/api/app')).started; await api('/api/app/restart', { method: 'POST' }); } catch (e) {
    updSetBusy('');
    return updShow('<div class="set-note num-red">重启没成功：' + esc(e.message) + '。可以在右下角托盘图标上右键「退出」，再重新打开智学题库。</div>');
  }
  store.del('zx.needRestart');
  updShow('<div class="upd-box upd-prog"><b>正在重启…</b><div class="upd-bar busy"><i></i></div></div>');
  const t0 = Date.now();
  const poll = setInterval(async () => {
    try {
      const a = await api('/api/app');
      if (a.started !== before) { clearInterval(poll); location.reload(); }
    } catch (e) { /* 正在重启 */ }
    if (Date.now() - t0 > 60000) {
      clearInterval(poll);
      updSetBusy('');
      updShow('<div class="set-note">重启时间有点长，稍后从开始菜单或桌面打开智学题库即可。</div>');
    }
  }, 1200);
}

// 每天第一次打开时在后台查一下有没有更新，有就在页面顶上提示（不打扰做题）
// 有更新时的提示：导航「设置」和「检查更新」按钮上的红点（一直在，更新完才消失），
// 外加页面底部的提示条（点「以后再说」只关掉提示条，红点还在）。
// 每 6 小时在后台查一次；手动点「检查更新」的结果也会同步过来。
const UPD_EVERY = 6 * 3600 * 1000;

function cmpVer(a, b) {
  const p = s => String(s || '').replace(/^[vV]/, '').split('.').map(x => parseInt(x, 10) || 0).concat([0, 0, 0]).slice(0, 3);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

function noticeFrom(app, cont) {
  // 内容更新（只下改动的文件）优先提示；装完内容还有新程序的话，下次检查再提示程序
  if (cont.has_update) return { kind: 'content', latest: cont.latest, text: '题库和界面有更新（' + fmtMB(cont.bytes) + '）' };
  if (app.has_update) return { kind: 'app', latest: app.latest, text: '有新版程序 v' + app.latest };
  return null;
}

async function autoCheckUpdate(a) {
  let n = store.get('zx.updNotice');
  // 已经更新过了（程序或内容版本追上了提示里的版本），提示作废
  if (n && ((n.kind === 'app' && cmpVer(n.latest, a.version) <= 0) ||
            (n.kind === 'content' && n.latest <= (a.content_version || 0)))) n = null;
  setUpdNotice(n);
  if (Date.now() - (+store.get('zx.lastAutoCheck') || 0) < UPD_EVERY) return;
  store.set('zx.lastAutoCheck', Date.now());
  const [app, cont] = await Promise.all([
    api('/api/update/check').catch(() => ({ failed: true })),
    api('/api/content/check').catch(() => ({ failed: true })),
  ]);
  syncUpdNotice(app, cont, app.failed, cont.failed);
}

// 检查结果同步到提示：查到更新就提示；两边都确认没有更新才清掉；有一边没连上时保留原来的提示
function syncUpdNotice(app, cont, appFailed, contFailed) {
  const n = noticeFrom(app, cont);
  if (n || (!appFailed && !contFailed)) setUpdNotice(n);
}

function setUpdNotice(n) {
  store.set('zx.updNotice', n);
  markUpdDots();
  showUpdNotice();
}

function markUpdDots() {
  const n = store.get('zx.updNotice');
  // 有更新只在「设置」入口（电脑左侧导航、手机右上角齿轮）和「检查更新」上点个小红点，不另外显示「有更新」标签
  const top = $('#top-upd');
  if (top) top.remove();                       // 旧版界面留下的标签
  [$('#nav a[data-v="settings"]'), $('#top-set'), $('#upd-check')].forEach(el => {
    if (!el) return;
    const dot = el.querySelector('.upd-dot');
    if (n && !dot) el.insertAdjacentHTML('beforeend', '<i class="upd-dot" title="' + esc(n.text) + '"></i>');
    else if (!n && dot) dot.remove();
  });
}

// 不再弹「有更新」提示条，只留小红点；别处还在调用这个函数，顺便清掉旧版界面弹出来的条
function showUpdNotice() {
  const old = $('#upd-banner');
  if (old) old.remove();
}

async function applyUpdate() {
  if (IS_APP) return applyUpdateApp();
  if (upd.busy) { updRestore(); return; }
  updSetBusy('app');
  // 电脑：后台下载 → 轮询进度画进度条 → 下完自动安装并重启 → 新版起来后页面自动刷新
  let p;
  try { p = await api('/api/update/download', { method: 'POST' }); } catch (e) {
    if (/接口不存在/.test(e.message)) return applyUpdateLegacy();
    return updFail(e.message);
  }
  const t0 = Date.now();
  while (p.state === 'downloading') {
    // 1.4.6 以前的程序只会连 GitHub，国内不开代理会一直卡在 0 MB：15 秒没动静就给出国内线路
    const stuck = !p.done && Date.now() - t0 > 15000;
    updShow(updProgress(p, '正在下载 v' + (p.version || '新版本') + '，下载完会自动安装并重启') +
      (stuck ? domesticBox() : ''));
    await new Promise(r => setTimeout(r, 500));
    try { p = await api('/api/update/progress'); } catch (e) { return updFail('和题库程序的连接断了：' + e.message); }
  }
  if (p.state !== 'done') return updFail(p.error || '下载失败', p.page);
  updShow(updProgress(p, '下载完成，正在安装并重启…'));
  try { await api('/api/update/install', { method: 'POST' }); } catch (e) { return updFail(e.message, p.page); }
  waitRestart(p.version);                          // 等重启，一直保持“正在更新”
}

// 后台还是 1.3.0 以前的程序（exe 放在源码文件夹里时，界面会先用上新的）：只有一个一次下完的接口，
// 看不到真实进度，就显示一直在动的进度条和已用时间，让人知道还在下
async function applyUpdateLegacy() {
  const t0 = Date.now();
  const tick = () => updShow('<div class="upd-box upd-prog"><b>正在下载新版本，下载完会自动重启</b>' +
    '<div class="upd-bar busy"><i></i></div>' +
    '<div class="muted">已用 ' + Math.round((Date.now() - t0) / 1000) + ' 秒（当前程序是旧版，显示不了下载进度，一般一两分钟）</div></div>');
  tick();
  const timer = setInterval(tick, 1000);
  let r;
  try { r = await api('/api/update/apply', { method: 'POST' }); } catch (e) {
    clearInterval(timer);
    return updFail(e.message, 'https://github.com/chen-pi-2007/zhixue-tiku/releases/latest');
  }
  clearInterval(timer);
  updShow('<div class="upd-box upd-prog"><b>下载完成，正在重启…</b><div class="upd-bar"><i style="width:100%"></i></div></div>');
  waitRestart(r.version);
}

// 旧程序还要半秒才退出，所以要等到版本号变成新版才刷新（独立窗口版会整个关掉重开，用不到这里）
function waitRestart(want) {
  const start = Date.now();
  const poll = setInterval(async () => {
    try {
      const a = await api('/api/app');
      if (a.version === want) { clearInterval(poll); location.reload(); }
    } catch (e) { /* 正在重启 */ }
    if (Date.now() - start > 90000) {
      clearInterval(poll);
      updSetBusy('');
      updShow('<div class="set-note">重启时间有点长，稍后从开始菜单或桌面打开智学题库即可。</div>');
    }
  }, 1500);
}

// 手机：系统下载器下 apk（App 里和通知栏都有进度）→ 下完自动打开安装界面。
// 安卓不允许 App 装完自己重启，装好后在安装界面点「打开」。
// restart=true 是进度里的「重新下载」：取消正在下的，重新开始
let appDl = null;
async function applyUpdateApp(restart) {
  if (upd.busy && !(restart && upd.busy === 'app')) { updRestore(); return; }
  updSetBusy('app');
  let u;
  try { u = await api('/api/update/check'); } catch (e) { return updFail(e.message); }
  if (!u.url) return updFail('这个版本没有安卓安装包', u.page);
  const S = window.ZXStore;
  if (!S || !S.download) { updSetBusy(''); openExternal(u.url); return; }        // 旧版 App 没有下载接口
  if (appDl) S.cancelDownload(appDl);
  const id = appDl = S.download(u.url, 'zhixue-tiku-' + u.latest + '.apk');
  if (!id) return updFail('没法开始下载', u.page);
  let lastDone = -1, lastMove = Date.now(), lastT = Date.now(), speed = 0;
  for (;;) {
    if (appDl !== id) return;                                     // 点了「重新下载」，换了新任务
    const p = JSON.parse(S.dlProgress(id));
    const now = Date.now();
    if (p.done !== lastDone) {
      if (lastDone >= 0) speed = (p.done - lastDone) / Math.max((now - lastT) / 1000, 0.001);
      lastDone = p.done; lastMove = now; lastT = now;
    }
    if (p.state === 'done') break;
    if (p.state === 'error') { appDl = null; return updFail(p.reason || '下载失败', u.page); }
    const stalled = now - lastMove > 30000;
    updShow(updProgress({ state: 'downloading', done: p.done, total: p.total || u.size || 0, speed: speed },
      '正在下载 v' + u.latest + '，下载完会自动打开安装界面') +
      (p.state === 'waiting' || stalled
        ? '<div class="set-note num-red">' + esc(p.reason || '30 秒没有收到数据，网络可能断了') +
          '　<a href="javascript:void(0)" onclick="applyUpdateApp(true)">重新下载</a>　' +
          '<a href="javascript:void(0)" onclick="openExternal(' + jsq(u.url) + ')">用浏览器下载</a></div>' : ''));
    await new Promise(r => setTimeout(r, 600));
  }
  appDl = null;
  updSetBusy('');
  updShow(updProgress({ state: 'done', done: lastDone, total: lastDone }, '下载完成，正在打开安装界面…') +
    '<div class="muted set-note">在安装界面点「更新」（第一次会让你允许智学题库安装应用，打开开关再返回即可），装好后点「打开」。做题记录会保留。</div>');
  if (!S.installApk(id)) updFail('打不开安装界面，请下拉通知栏，点「智学题库 更新」那条下载完成的通知安装', u.page);
}

function fmtMB(b) { return b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }   // 热更新常常只有几十 KB

function updProgress(p, title) {
  const pct = p.total ? Math.min(100, Math.round(100 * p.done / p.total)) : 0;
  return '<div class="upd-box upd-prog"><b>' + esc(title) + '</b>' +
    '<div class="upd-bar"><i style="width:' + pct + '%"></i></div>' +
    '<div class="muted">' + (p.total ? pct + '% · ' + fmtMB(p.done) + ' / ' + fmtMB(p.total) : fmtMB(p.done)) +
      (p.state === 'downloading' ? (p.speed ? ' · ' + fmtMB(p.speed) + '/s' : ' · 正在连接 GitHub…') : '') + '</div>' +
    (p.state === 'downloading' && p.error ? '<div class="num-orange">' + esc(p.error) + '</div>' : '') + '</div>';
}

// kind：失败的是哪种更新，「重试」就重试哪种（以前内容更新失败时，重试的却是程序更新）
function updFail(msg, page, kind) {
  updSetBusy('');
  updShow('<div class="upd-box upd-err"><b>更新没有完成</b><div>' + esc(msg) + '</div>' +
    '<div class="upd-acts"><button class="btn" onclick="' + (kind === 'content' ? 'applyContentUpdate()' : 'applyUpdate()') + '">重试</button>' +
    (page ? '<button class="btn ghost" onclick="openExternal(' + jsq(page) + ')">去 GitHub 手动下载</button>' : '') + '</div></div>' +
    (kind === 'content' ? '' : domesticBox()));
}

// 国内线路：GitHub 连不上时，经国内的 GitHub 下载加速站下载新版安装包，用浏览器下载、手动换上。
// 这段在界面里（随题库热更新发布，走 jsDelivr），所以只会连 GitHub 的老版本程序也能用上
const RELEASE_JSON = ['https://cdn.jsdelivr.net/gh/chen-pi-2007/zhixue-tiku@main/release.json',
                      'https://fastly.jsdelivr.net/gh/chen-pi-2007/zhixue-tiku@main/release.json',
                      'https://gcore.jsdelivr.net/gh/chen-pi-2007/zhixue-tiku@main/release.json'];
function domesticBox() {
  return '<div class="upd-box"><b>连不上 GitHub？改用国内线路</b>' +
    '<div class="muted">用浏览器从国内加速站下载新版' + (IS_APP ? '安装包，下载完点开安装（覆盖安装，做题记录不会丢）。' :
      '程序。下载完先关掉智学题库（托盘图标右键退出），再用新下载的文件替换原来的「智学题库.exe」，然后打开即可，做题记录不会丢。') + '</div>' +
    '<div class="upd-acts"><button class="btn" onclick="openDomestic()">国内线路下载</button></div></div>';
}
async function openDomestic() {
  let info = null;
  for (const u of RELEASE_JSON) {
    try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { info = await r.json(); break; } } catch (e) { /* 换下一个 */ }
  }
  const a = info && (info.assets || {})[IS_APP ? 'apk' : 'exe'];
  if (!a || !a.url) { toast('读不到新版本信息，检查一下网络', 'bad'); return; }
  openExternal('https://ghproxy.net/' + a.url);
  toast('已在浏览器打开 v' + info.version + ' 的下载（' + (a.size / 1048576).toFixed(1) + ' MB）');
}

async function clearMyData() {
  const v = prompt('确定要清除所有做题记录吗？清除后错题本、复习进度、考试记录都会清空。\n确认请输入：清除');
  if (v !== '清除') { if (v != null) toast('输入不对，没有清除'); return; }
  try {
    const d = await api('/api/data/clear', { method: 'POST', body: { confirm: '清除' } });
    toast(IS_APP ? '已清除，手机上留了一份备份' : '已清除，备份在 ' + d.backup.split(/[\\/]/).slice(-2).join('/'), 'good');
    location.hash = '#/home';
  } catch (e) { toast(e.message, 'bad'); }
}

/* ================================================================ 主题 */

function applyTheme(pref) {
  const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', pref === 'auto' ? (dark ? 'dark' : 'light') : pref);
  document.documentElement.setAttribute('data-theme-pref', pref);
  try { localStorage.setItem('quiz.theme', pref); } catch (e) { /* ignore */ }
  $$('#theme-menu button').forEach(b => b.classList.toggle('on', b.dataset.t === pref));
}

(function bindTheme() {
  const btn = $('#theme-btn'), menu = $('#theme-menu');
  if (!btn) return;
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-t]');
    if (b) { applyTheme(b.dataset.t); close(); }
  });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (document.documentElement.getAttribute('data-theme-pref') === 'auto') applyTheme('auto');
    });
  }
  applyTheme(document.documentElement.getAttribute('data-theme-pref') || 'auto');
})();

/* ================================================================ 启动 */

window.addEventListener('DOMContentLoaded', () => {
  route();
  // 打包好的程序（exe / 手机 App）每天自动查一次更新；源码运行时不查
  api('/api/app').then(a => { if (a.frozen || a.mobile) setTimeout(() => autoCheckUpdate(a), 1500); }).catch(() => {});
});
