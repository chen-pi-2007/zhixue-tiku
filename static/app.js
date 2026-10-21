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
      '<img class="qimg" loading="lazy" src="' + (window.ZX_WEB ? '' : '/') + 'media/' + p.split('/').map(encodeURIComponent).join('/') + '" onclick="zoomImg(this.src)">')
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
// 网页版（放在同步服务器上，用账号登录才能用，记录都在账号里）：界面和手机 App 一样跑 local.js
const IS_WEB = !!window.ZX_WEB;
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
  set(k, v) {
    if (lsSynced(k) && v && typeof v === 'object') v = Object.assign({}, v, { _st: Date.now() });
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    if (lsSynced(k)) lsPush(k, v);
  },
  del(k) {
    try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    if (lsSynced(k)) lsPush(k, null);
  },
};

/* ---- 账号同步：练习存档（zx.save.*）和自动进度（zx.auto.*）跟着账号走 ----
   每个值带 _st（写入时间）。本机写了就交给后台存一份（没登录也存，登录后一起传）；
   打开页面、进练习前把后台里更新的拉回 localStorage。 */
function lsSynced(k) { return /^zx\.(save|auto)\./.test(k); }
function lsPush(k, v) {
  const t = (v && v._st) || Date.now();
  api('/api/sync/ls', { method: 'POST', body: { key: k, t: t, v: v } }).catch(() => { /* 老版本没有同步：忽略 */ });
}
async function lsPull() {
  let items;
  try { items = (await api('/api/sync/ls')).items || {}; } catch (e) { return; }
  Object.keys(items).forEach(k => {
    if (!lsSynced(k)) return;
    const [t, v] = items[k];
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(k)); } catch (e) { /* ignore */ }
    if (t <= ((cur && cur._st) || 0)) return;
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  });
}
// 第一次登录：本机已有的存档都交上去（没有 _st 的老存档按很早的时间算，别的设备有更新的就用别的）
function lsPushAll() {
  try {
    Object.keys(localStorage).filter(lsSynced).forEach(k => {
      let v = null;
      try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { return; }
      if (v && typeof v === 'object') lsPush(k, Object.assign({ _st: 1 }, v));
    });
  } catch (e) { /* ignore */ }
}

const TYPE_NAME = {
  single: '单选题', multi: '多选题', judge: '判断题', qa: '问答题',
  reading: '阅读单选', poem: '古诗文单选', dictation: '默写', essay: '作文',
  blank: '填空题', solution: '解答题',
  // 英语按专项细分（后台的 _cat）
  en_phon: '语音', en_vocab: '单选（词汇语法）', en_pic: '图文理解', en_dia: '交际对话',
  en_cloze: '完形填空', en_read: '阅读理解', en_write: '书面表达',
};
// 自评类题型:纸上/心里作答后点按钮对照参考答案,再自评
const SELF_TYPES = ['qa', 'dictation', 'essay', 'blank', 'solution'];
// 题型印章字
const TYPE_ICON = { single: '单', reading: '阅', poem: '诗', dictation: '默', qa: '问', essay: '文', blank: '填',
                    solution: '解', multi: '多', judge: '判',
                    en_phon: '音', en_vocab: '单', en_pic: '图', en_dia: '话', en_cloze: '完', en_read: '阅', en_write: '写' };
const SUBJECT_NAME = { chinese: '语文', math: '数学', english: '英语', politics: '思想政治',
                       media: '数字媒体', general: '其他' };
// 科目印章字
const SUBJECT_ICON = { chinese: '语', math: '数', english: '英', politics: '政', media: '媒', general: '其' };
const MASTER_STREAK = 3;

// 同一句提示不重复叠；最多同时留 2 条（用户：点多了提示一条条往上堆，叠好高一串）
function toast(msg, cls) {
  const box = $('#toasts');
  Array.from(box.children).forEach(o => { if (o.textContent === msg) o.remove(); });
  while (box.children.length >= 2) box.removeChild(box.firstChild);
  const d = document.createElement('div');
  d.className = 'toast ' + (cls || '');
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = '.4s'; }, 2200);
  setTimeout(() => d.remove(), 2700);
}

function optionList(q) {
  if (q.type === 'judge') return [['对', '对'], ['错', '错']];
  return q.options || [];
}

// 英语题的中文翻译（平时练习、背题；模拟考没有这些字段）。译文总是渲染进页面，只靠 class 显示 / 隐藏，不重画、不丢作答状态。
// 默认不显示（做题、搜索题目、错题本都一样）：点卡片上的「译」只显示这一张（卡片加 .cn-show，换下一题自然没了）；
// 长按「译」锁定，之后每题都显示（html 去掉 .cn-off），锁定时再点一下解除。
// 译文作答前就能看；只有会直接暴露答案的部分留到作答后（.after）：选项译文里括号中的语法提示和音标；【】里的形式标签作答前就显示。
// 题干译文和英文一样留空（学测/_脚本/english_cn）；万一有把空填好了的，作答前盖住（.peek），点一下才看。
function cnLocked() { return !!store.get('quiz.cnlock'); }
// 设置「答题后自动显示翻译」（localStorage quiz.cnafter）：答完这张卡片自动加 .cn-show，和点一下「译」一样
function cnAfterOn() { return !!store.get('quiz.cnafter'); }
function cnAfterAnswer() {
  if (!cnAfterOn()) return;
  const card = $('.qcard-main');
  if (!card || !card.querySelector('.cn-btn')) return;
  card.classList.add('cn-show');
  applyCn();
}
function applyCn() {
  const lock = cnLocked();
  document.documentElement.classList.toggle('cn-off', !lock);
  $$('.cn-btn').forEach(b => {
    const card = b.closest('.card');
    b.classList.toggle('lock', lock);
    b.classList.toggle('on', lock || !!(card && card.classList.contains('cn-show')));
  });
}
function cnTap(btn) {
  if (cnLocked()) { store.set('quiz.cnlock', false); toast('已取消锁定：翻译默认不显示'); }
  else {
    const card = btn.closest('.card');
    if (card) card.classList.toggle('cn-show');
    if (!store.get('quiz.cntip')) { store.set('quiz.cntip', 1); toast('长按「译」可以锁定，每题都自动显示翻译'); }
  }
  applyCn();
}
function cnLongPress() {
  store.set('quiz.cnlock', !cnLocked());
  toast(cnLocked() ? '已锁定：每题都显示翻译（再点一下「译」取消）' : '已取消锁定：翻译默认不显示');
  applyCn();
}
// 「译」按钮：点 = 只看这一题，长按（0.5 秒）= 锁定 / 取消锁定。用事件委托，按钮重画了也不用重新绑定
(function cnButtonEvents() {
  let timer = null, long = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.cn-btn');
    if (!b) return;
    long = false;
    cancel();
    timer = setTimeout(() => { timer = null; long = true; cnLongPress(); }, 500);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, cancel, true));
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.cn-btn');
    if (!b) return;
    e.stopPropagation();                  // 背题卡片没翻开时整张卡片可点，别让「译」顺带翻开答案
    if (long) { long = false; return; }
    cnTap(b);
  }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.cn-btn')) e.preventDefault(); });
})();
function hasCn(q) { return !!(q.stem_cn || q.material_cn || (q.options_cn && q.options_cn.length)); }
function cnBtn(q) { return hasCn(q) ? '<button class="cn-btn' + (cnLocked() ? ' on lock' : '') + '" title="点：只看这一题的翻译；长按：锁定，每题都显示">译</button>' : ''; }
function stemCn(q) {
  if (!q.stem_cn) return '';
  const peek = /_{2,}/.test(q.stem) && !/_{2,}/.test(q.stem_cn);
  return '<div class="stem-cn' + (peek ? ' peek" title="点一下查看翻译（会提示答案）" onclick="this.classList.add(\'show\')' : '') + '">' + rich(q.stem_cn) + '</div>';
}
const CN_HINT = /（[^（）]*）|\([^()]*\)|\/[^\/\s]+\//g;     // 选项译文里的语法提示、音标
// 【…】是形式标签（原形 / 过去式 / 单复数……，几个选项意思一样时用来区分），作答前就显示成（…）
const cnForm = s => s.replace(/【([^】]*)】/g, '（$1）');
function optCn(q, i) {
  const s = q.options_cn && q.options_cn[i];
  if (!s) return '';
  if (!s.replace(CN_HINT, '').replace(/【[^】]*】/g, '').trim()) return '<span class="opt-cn after">' + esc(cnForm(s)) + '</span>';
  return '<span class="opt-cn">' + cnForm(esc(s).replace(CN_HINT, m => '<span class="after">' + m + '</span>')) + '</span>';
}
function pointBox(q) { return q.point ? '<div class="point-box"><b>知识点</b><div>' + rich(q.point) + '</div></div>' : ''; }

// 某个选项的说明：专门写的“为什么对 / 错”（option_notes），英语没写的话用选项的中文翻译（里面带着语法提示）
function optNote(q, key) {
  const i = optionList(q).findIndex(o => o[0] === key);
  if (i < 0) return '';
  return (q.option_notes && q.option_notes[i]) || (q.options_cn && q.options_cn[i] && cnForm(q.options_cn[i])) || '';
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
    rows.push('<div class="why-row bad"><span class="why-k">你选的 ' + esc(k) + '</span><span>' + (n ? rich(n) : rich(text(k))) + '</span></div>');
  });
  if (q.type === 'multi') ans.filter(k => selKeys.indexOf(k) < 0).forEach(k => {
    const n = optNote(q, k);
    rows.push('<div class="why-row miss"><span class="why-k">漏选 ' + esc(k) + '</span><span>' + (n ? rich(n) : rich(text(k))) + '</span></div>');
  });
  const okNotes = ans.map(k => optNote(q, k)).filter(Boolean);
  // 没写选项说明的题，至少把正确答案的内容摆在旁边对照，不只说“不对”
  if (!okNotes.length) rows.push('<div class="why-row ok"><span class="why-k">正确答案 ' + esc(q.answer) + '</span><span>' +
    ans.map(k => rich(text(k))).join('；') + '</span></div>');
  if (okNotes.length) rows.push('<div class="why-row ok"><span class="why-k">正确答案 ' + esc(q.answer) + '</span><span>' + okNotes.map(rich).join('；') + '</span></div>');
  return rows.length ? '<div class="why-box"><b>为什么错</b>' + rows.join('') + '</div>' : '';
}

// 答对了也说清楚为什么：选“不正确的一项”这类题，说明选的这项错在哪
function rightBox(q) {
  if (q.type === 'judge') return '';
  const ans = q.type === 'multi' ? q.answer.split('') : [q.answer];
  const opts = optionList(q);
  const note = k => { const i = opts.findIndex(o => o[0] === k); return (q.option_notes && q.option_notes[i]) || ''; };
  const rows = ans.map(k => [k, note(k)]).filter(r => r[1]).map(r =>
    '<div class="why-row ok"><span class="why-k">' + esc(r[0]) + '</span><span>' + rich(r[1]) + '</span></div>');
  return rows.length ? '<div class="why-box"><b>为什么选这个</b>' + rows.join('') + '</div>' : '';
}

// 阅读题的原文依据：evidence 是材料里原样摘出来的句子（可以几处），作答后列出来，并在材料里标黄
function evidenceBox(q) {
  if (!q.evidence || !q.evidence.length) return '';
  return '<div class="evidence-box"><b>原文依据</b>' + q.evidence.map(s => '<div class="evidence-q">' + esc(s) + '</div>').join('') +
    (q.material ? '<div class="muted">材料里标黄的就是这几句</div>' : '') + '</div>';
}

function markEvidence(q) {
  if (!q.evidence || !q.evidence.length) return;
  const body = $('.qcard-main .material-body');
  if (!body) return;
  q.evidence.forEach(ev => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.indexOf(ev);
      if (i < 0 || n.parentNode.classList.contains('evidence')) continue;
      const hit = n.splitText(i);
      hit.splitText(ev.length);
      const mark = document.createElement('mark');
      mark.className = 'evidence';
      hit.parentNode.replaceChild(mark, hit);
      mark.appendChild(hit);
      break;
    }
  });
  const box = body.closest('details');
  if (box) box.open = true;
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
// 完形原文里的空（__3__）包一层 span，做哪一空就用荧光笔标哪一空（用户：错题再出时题号和直觉对不上，不好找位置）
const markBlanks = html => html.replace(/_{2,}\s*(\d+)\s*_{2,}/g, '<span class="blank" data-b="$1">$&</span>');
const blankNo = q => ((q && q.stem || '').match(/第(\d+)空/) || [])[1] || '';
function hlBlank(root, q, scroll) {
  if (!root) return;
  root.querySelectorAll('.blank.on').forEach(b => b.classList.remove('on'));
  const n = blankNo(q);
  const b = n && root.querySelector('.blank[data-b="' + n + '"]');
  if (!b) return;
  b.classList.add('on');
  const box = b.closest('.g-orig, .material-box');
  if (scroll && box && box.scrollHeight > box.clientHeight + 4) scrollInBox(box, b, 60);
}

function materialBox(q, fold) {
  if (!q.material || !q.material.trim()) return '';
  if (fold && q.material.length > 160) {
    return '<details class="material-box"><summary class="material-title">材料（点开查看）· ' +
      esc(q.material.split('\n')[0].slice(0, 40)) + '…</summary>' +
      '<div class="material-body">' + rich(q.material) + '</div>' + materialCn(q) + '</details>';
  }
  return '<div class="material-box"><div class="material-title">材料</div>' +
    '<div class="material-body">' + markBlanks(rich(q.material)) + '</div>' + materialCn(q) + '</div>';
}

function materialCn(q) {
  return q.material_cn ? '<div class="material-cn"><div class="material-title">参考译文</div>' + rich(q.material_cn) + '</div>' : '';
}

// 错题要在不同的日子连续答对 MASTER_STREAK 次才消灭：显示“还要答对几次”，比“已连对 0/3”好懂
function streakText(streak) {
  const left = Math.max(MASTER_STREAK - (streak || 0), 0);
  return left ? '还要分 ' + left + ' 天答对才移出错题本' : '再答对一次就移出错题本';
}

// 这题做过几次：做对几次、做错几次（用户：显示对错次数，不要“还要分几天答对才移出错题本”）；错过的标红，在错题本里的鼠标停上去有说明
function recBadge(q) {
  if (!q.wrong_count && !q.right_count) return '<span class="rec-badge">没做过</span>';
  return '<span class="rec-badge' + (q.wrong_count ? ' bad' : ' good') + '"' + (q.in_wrong ? ' title="在错题本里，' + streakText(q.streak) + '"' : '') + '>' +
    '做对 ' + q.right_count + ' 次 · 做错 ' + q.wrong_count + ' 次</span>';
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
                 practice: viewPractice, exam: viewExam, upload: viewUpload, answers: viewAnswers, poems: viewPoems, export: viewExport };

function route() {
  if (IS_WEB && !state.webUser) return webGate();
  const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
  const name = routes[parts[0]] ? parts[0] : 'home';
  const navOf = { practice: 'home', subject: 'home', recite: 'home', answers: 'home', poems: 'home', export: 'upload' };
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.v === (navOf[name] || name)));
  document.body.classList.toggle('subpage', name === 'settings');   // 手机上设置是二级页面：收起底下的导航，标题带返回
  document.body.classList.toggle('workpage', name === 'practice' || name === 'recite');   // 手机上做题 / 背题页：按钮条固定在屏幕最底下（style.css）
  const ts = $('#top-set');
  if (ts) ts.classList.toggle('active', name === 'settings');
  if (name !== 'exam') stopExamTimer();
  if (name === 'settings') {
    if (WORK_PAGES[state.lastPage] && WORK_PAGES[state.lastPage]()) state.backTo = '#/' + state.lastPage;
  } else state.backTo = null;
  window.scrollTo(0, 0);
  // 换页时淡入一下（同一页内重绘不播放）
  if (name !== state.lastPage) {
    state.lastPage = name;
    app.classList.remove('page-in');
    void app.offsetWidth;
    app.classList.add('page-in');
  }
  routes[name](parts.slice(1));
  if (state.pendingReload) setTimeout(reloadIfIdle, 300);
  else if (state.updWanted) setTimeout(() => autoContentUpdate(state.updWanted), 1000);
}
window.addEventListener('hashchange', route);
// 做题中途能去设置再回来的页面（练习 / 背题还在进行中才算）
const WORK_PAGES = { practice: () => !!state.practice, recite: () => !!state.recite };
// 右上角齿轮：在设置页里再点一次 = 回到刚才做题的地方
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('#top-set');
  if (a && location.hash === '#/settings' && state.backTo) { e.preventDefault(); location.hash = state.backTo; }
});
function goBackToWork() { location.hash = state.backTo || '#/home'; }
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
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
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
      '<span class="tc">' + (t.units && t.units < t.total && SELF_TYPES.indexOf(t.type) < 0 ? t.units + ' 篇 · ' : '') + t.total + ' 题 · 掌握 ' + t.mastery + '%' + (t.accuracy != null ? ' · 对 ' + t.accuracy + '%' : '') + '</span>' +
      bar(t.mastery, 'thin') +
    '</button>').join('') +
    // 语文：古诗文划重点也放在题型卡片里（用户：原来只在科目页和弹窗里，不好找）
    (subj === 'chinese' ? '<a class="typebtn po-entry" href="#/poems">' +
      '<span class="ti">记</span><span class="tn"><mark class="hl hl-2 on">古诗文划重点</mark></span>' +
      '<span class="tc">默写考到的全文 · 考过的句子标出来</span></a>' : '') +
    '</div>';
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
  const miss = p.total - (p.gradable == null ? p.total : p.gradable);
  return '<a class="prow" href="javascript:void(0)" onclick="openPaperSheet(' + p.id + ',' + jsq(p.name) + ',' + jsq(p.key) + ',' + miss + ')">' +
    '<span class="prow-t">' + (i + 1) + '. ' + esc(p.name) + '</span>' +
    '<span class="prow-c">' + p.total + ' 题</span>' +
    '<span class="prow-m">' + p.mastery + '%</span>' +
    '<span class="prow-s ' + st[1] + '">' + st[0] + '</span>' +
    (p.wrong_open ? '<span class="prow-w">错 ' + p.wrong_open + '</span>' : (miss ? '<span class="prow-w miss">缺答案 ' + miss + '</span>' : '<span class="prow-w"></span>')) +
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
  if (location.hash === '#/settings' && state.backTo) return goBackToWork();
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
        (subj === 'chinese' ? '<a class="btn ghost" href="#/poems">古诗文划重点</a>' : '') +
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
      '<button class="btn sm" onclick="openPaperSheet(' + p.id + ',' + jsq(p.name) + ',' + jsq(p.key) + ',' + (p.total - (p.gradable == null ? p.total : p.gradable)) + ')">开始练习</button>' +
      (!IS_APP && /^upload-/.test(p.key) ? '<a class="btn ghost sm" href="#/answers/' + p.id + '">' + (p.total > p.gradable ? '填答案' : '改答案') + '</a>' +
        '<a class="btn ghost sm" href="#/upload/' + p.id + '">改题目</a>' : '') +
      (p.wrong_open ? '<button class="btn danger sm" onclick="startPractice({paper_id:' + p.id + ',paper_key:' + jsq(p.key) + ',scope:\'wrongmix\',title:' + jsq(p.name + '·错题') + '})">错题(' + p.wrong_open + ')</button>' : '') +
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

/* ================================================================ 古诗文划重点
   用户要求（2026-10-20）：语文默写考到的古诗文全文都列出来，像荧光笔一样把所有卷子考过的句子画出来。
   全文在 static/poems.js（进这页才加载）；考点从题库的默写题实时算：要默写的句子 = 荧光笔（考得越多颜色越深，
   旁边小字是考过几次），题目里给出的上下句 = 虚线。点画出来的句子看是哪几张卷子的第几题；
   「遮住考点」把要默写的句子盖住，点一下揭开，自己先默一遍再看。 */
const PO_HIDE = 'zx.poems.hide';
function loadPoems() {
  if (window.ZX_POEMS) return Promise.resolve(window.ZX_POEMS);
  return new Promise((ok, bad) => {
    const sc = document.createElement('script');
    sc.src = 'poems.js' + (window.ZX_WEB ? '?v=' + window.ZX_WEB.v : '');
    sc.onload = () => ok(window.ZX_POEMS || []);
    sc.onerror = () => { sc.remove(); bad(new Error('全文没加载出来，检查一下网络再进来')); };
    document.head.appendChild(sc);
  });
}

// 每篇每个字：被哪些题当答案考过（ans）、是不是题目给出的上下句（ctx）
function poemMarks(poems, qs) {
  const info = poems.map(p => ({ p: p, ans: p.text.split('').map(() => null), ctx: p.text.split('').map(() => 0), qs: [] }));
  qs.forEach(q => {
    const it = info.find(x => q.stem.indexOf(x.p.match) >= 0);
    if (!it) return;
    it.qs.push(q);
    const mark = (str, fn) => {
      const i = it.p.text.indexOf(str);
      if (i < 0) { console.warn('古诗文划重点：原文里找不到', it.p.t, str); return; }
      for (let k = i; k < i + str.length; k++) fn(k);
    };
    String(q.answer || '').split(/\s*\/\s*/).filter(Boolean)
      .forEach(a => mark(a, k => { (it.ans[k] = it.ans[k] || []).push(q); }));
    q.stem.replace(/（[^（）]*《[^》]*》[^（）]*）\s*$/, '').split(/[▲，。；、,.;：:！？!?“”"\s]+/)
      .filter(g => g.length >= 2 && g.indexOf('《') < 0).forEach(g => mark(g, k => { it.ctx[k] = 1; }));
  });
  return info;
}

const poQName = q => q.paper_name.replace(/^《语文》/, '') + ' 第' + q.qno + '题';
function poemHtml(it, tips) {
  const t = it.p.text;
  let html = '', d = 0;
  const run = (from, to) => {                     // 一行里按“考没考、被哪几道题考”切段
    let i = from;
    while (i < to) {
      const a = it.ans[i], sig = a ? 'a' + a.map(q => q.id).join(',') : it.ctx[i] ? 'c' : '';
      let j = i + 1;
      while (j < to && (it.ans[j] ? 'a' + it.ans[j].map(q => q.id).join(',') : it.ctx[j] ? 'c' : '') === sig) j++;
      const txt = esc(t.slice(i, j));
      if (a) {
        const n = a.length;
        tips.push(a);
        html += '<mark class="hl hl-' + Math.min(n, 3) + '" data-tip="' + (tips.length - 1) + '" style="--d:' + Math.min(d++, 24) + '">' + txt + '</mark>' +
          (n > 1 ? '<sup class="hl-n">' + n + '</sup>' : '');
      } else html += sig === 'c' ? '<span class="po-ctx">' + txt + '</span>' : txt;
      i = j;
    }
  };
  let at = 0;
  t.split('\n').forEach(line => {
    if (!line) html += '<div class="po-gap"></div>';
    else { html += it.p.prose ? '<p class="po-p">' : '<div class="po-line">'; run(at, at + line.length); html += it.p.prose ? '</p>' : '</div>'; }
    at += line.length + 1;
  });
  return html;
}

async function viewPoems() {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let poems, qs;
  try {
    poems = await loadPoems();
    qs = (await api('/api/questions?subject=chinese&type=dictation&limit=200')).items;
  } catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  const info = poemMarks(poems, qs).filter(it => it.qs.length);
  const tips = [];
  const papers = new Set(qs.map(q => q.paper_id)).size;
  const cards = info.map((it, i) =>
    '<section class="card po-card" id="po-' + i + '">' +
      '<header class="po-head"><div><div class="po-t">' + esc(it.p.t) + '</div>' +
        '<div class="po-a">' + esc(it.p.d) + ' · ' + esc(it.p.a) + '</div></div>' +
        '<div class="po-stat">考过 <b>' + it.qs.length + '</b> 题</div></header>' +
      '<div class="po-body' + (it.p.prose ? ' prose' : '') + '">' + poemHtml(it, tips) + '</div>' +
    '</section>').join('');
  const nSent = tips.length;
  let hide = false;
  try { hide = localStorage.getItem(PO_HIDE) === '1'; } catch (e) { /* ignore */ }
  app.innerHTML =
    '<div class="crumb"><a href="#/home">首页</a> / <a href="#/subject/chinese">语文</a> / 古诗文划重点</div>' +
    '<div class="card po-hero">' +
      '<div class="po-hero-t">古诗文默写 · 全文划重点</div>' +
      '<div class="po-hero-d">' + info.length + ' 篇 · ' + papers + ' 张卷子考过 ' + qs.length + ' 题 · 画出 ' + nSent + ' 处要默写的句子</div>' +
      '<div class="po-legend"><span><mark class="hl hl-1 on">考过一次</mark></span><span><mark class="hl hl-3 on">考过多次</mark><sup class="hl-n">3</sup></span>' +
        '<span><span class="po-ctx">题目给出的上下句</span></span></div>' +
      '<div class="po-tools"><div class="seg" id="po-mode">' +
        '<button data-m="0"' + (hide ? '' : ' class="on"') + '>看全文</button><button data-m="1"' + (hide ? ' class="on"' : '') + '>遮住考点</button></div>' +
        // 遮住模式下点开过几句才出现：一键把点开的再盖回去，重新默一遍（原来一直显示，用户看不懂它干嘛的）
        '<button class="btn ghost sm" id="po-reset" hidden></button></div>' +
      '<div class="po-nav">' + info.map((it, i) => '<a href="javascript:void(0)" data-go="' + i + '">' + esc(it.p.t.replace(/（节选）/, '')) + '<i>' + it.qs.length + '</i></a>').join('') + '</div>' +
    '</div>' +
    '<div class="po-list' + (hide ? ' po-hide' : '') + '" id="po-list">' + cards + '</div>';

  const list = $('#po-list');
  // 荧光笔：卡片滚进屏幕时一笔笔画出来
  const draw = el => el.classList.add('drawn');
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { draw(e.target); io.unobserve(e.target); } }), { threshold: .15 });
    $$('.po-card').forEach(c => io.observe(c));
  } else $$('.po-card').forEach(draw);

  const tipBox = document.createElement('div');
  tipBox.className = 'po-tip';
  tipBox.hidden = true;
  const closeTip = () => { tipBox.hidden = true; };
  const syncReset = () => {
    const n = $$('#po-list mark.open').length, b = $('#po-reset');
    b.hidden = !n;
    b.textContent = '把点开的 ' + n + ' 句重新遮住';
  };
  app.querySelector('.po-hero').addEventListener('click', e => {
    const m = e.target.closest('#po-mode button');
    if (m) {
      const h = m.dataset.m === '1';
      $$('#po-mode button').forEach(b => b.classList.toggle('on', b === m));
      list.classList.toggle('po-hide', h);
      $$('#po-list mark.open').forEach(x => x.classList.remove('open'));
      syncReset();
      try { localStorage.setItem(PO_HIDE, h ? '1' : '0'); } catch (err) { /* ignore */ }
      closeTip();
      return;
    }
    if (e.target.closest('#po-reset')) { $$('#po-list mark.open').forEach(x => x.classList.remove('open')); syncReset(); return; }
    const g = e.target.closest('[data-go]');
    if (g) { const c = $('#po-' + g.dataset.go); draw(c); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  list.addEventListener('click', e => {
    const m = e.target.closest('mark.hl');
    if (!m) return closeTip();
    if (list.classList.contains('po-hide') && !m.classList.contains('open')) { m.classList.add('open'); syncReset(); closeTip(); return; }
    const qsOf = tips[+m.dataset.tip];
    const card = m.closest('.po-card');
    tipBox.innerHTML = '<b>' + (qsOf.length > 1 ? '考过 ' + qsOf.length + ' 次' : '考过 1 次') + '</b>' +
      qsOf.map(q => '<div>' + esc(poQName(q)) + '</div>').join('');
    card.appendChild(tipBox);
    tipBox.hidden = false;
    const r = m.getBoundingClientRect(), c = card.getBoundingClientRect();
    const w = tipBox.offsetWidth;
    tipBox.style.left = Math.max(8, Math.min(c.width - w - 8, r.left - c.left + r.width / 2 - w / 2)) + 'px';
    tipBox.style.top = (r.bottom - c.top + 8) + 'px';
  });
}

function goBank(pid, subject) {
  Object.assign(state.bank, { paper_id: pid || 0, subject: subject || '', offset: 0, items: [], papers: [] });
  location.hash = '#/bank';
}

/* ================================================================ 导入 */

/* ================================================================ 导入整理台
 * 左边是卷子原文（拖文件进来或直接粘贴，可以直接改），右边实时显示识别结果；认不准的标黄、缺答案的标红，
 * 点右边的题跳到左边原文。格式不对：自己在左边改，或者「复制 AI 整理提示词」拿去免费 AI 整理成标准格式再粘回来。
 * 解析都在后台 docparse.py（/api/import/*），入库时后台按同一份文字重新解析，预览看到的就是导进去的。
 * #/upload/<卷子id>：把已经导入的卷子转回标准格式，补答案、改题后整卷替换（题号不变，做题记录还在） */
const IM_FLAG = { no_answer: ['缺答案', 'bad'], type_guess: ['题型待确认', 'warn'], doubt: ['AI 存疑', 'warn'], has_image: ['有图', 'warn'] };
const IM_DRAFT = 'quiz.importDraft';          // 没导入的草稿（本机 localStorage，只图方便）
const IM_CHUNK = 40;                          // 复制给 AI 时每段最多多少道题

async function viewUpload(args) {
  const pid = +(args && args[0]) || 0;
  let st = { text: '', name: '', subject: 'general', key: '' };
  if (pid) {
    try {
      const d = await api('/api/import/text?paper_id=' + pid);
      st = { text: d.text, name: d.name, subject: d.subject, key: d.key };
    } catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  } else {
    try { st = Object.assign(st, JSON.parse(localStorage.getItem(IM_DRAFT) || 'null') || {}); } catch (e) { /* 没草稿 */ }
    st.key = '';
  }
  state.imp = { st: st, res: null, seq: 0 };
  app.innerHTML =
    (st.key ? '<div class="crumb"><a href="#/home">首页</a> / 修改导入的卷子</div>' : ioTabs('upload')) +
    '<div class="im">' +
      '<div class="im-bar">' +
        '<input class="inp im-name" id="im-name" placeholder="卷子名称（不填就用文件名）" value="' + esc(st.name) + '">' +
        '<select class="inp" id="im-subj">' + Object.keys(SUBJECT_NAME).map(k =>
          '<option value="' + k + '"' + (k === st.subject ? ' selected' : '') + '>' + SUBJECT_NAME[k] + '</option>').join('') + '</select>' +
        '<span class="spacer"></span>' +
        '<button class="btn ghost sm" id="im-file">' + icon('upload') + '选择文件</button>' +
        '<input type="file" id="im-fi" multiple accept=".docx,.doc,.txt,.md" hidden>' +
      '</div>' +
      '<div class="im-body">' +
        '<section class="im-left">' +
          '<div class="im-h">原文 <span class="muted">· 把 Word / 文本文件拖到这里，或者直接粘贴；可以直接改，右边跟着变</span></div>' +
          '<textarea id="im-text" spellcheck="false" placeholder="' + esc(
            '把老师发的卷子拖进来（.docx / .doc / .txt），或者把文字粘贴到这里。\n\n' +
            '卷子和答案是两个文件的，一起拖进来，答案会按题号自动对上。\n\n' +
            '什么格式都可以先试试：有没有题号、有没有“单选题”这样的标记都行，右边会显示认出来的结果。\n' +
            '认得最准的写法（泛雅 / 学习通格式）：\n\n1.【单选题】题干\nA.选项\nB.选项\n答案：A') + '">' + esc(st.text) + '</textarea>' +
          '<div class="im-tools">' +
            '<button class="btn ghost sm" id="im-key">粘贴答案…</button>' +
            (state.ai.on ? '<button class="btn sm" id="im-aido">用 AI 整理</button>' : '') +
            '<button class="btn ghost sm" id="im-ai">复制 AI 整理提示词</button>' +
            '<button class="btn ghost sm" id="im-undo" hidden>撤销 AI 整理</button>' +
            '<span class="spacer"></span>' +
            '<button class="btn ghost sm" id="im-clear">清空</button>' +
          '</div>' +
        '</section>' +
        '<section class="im-right">' +
          '<div class="im-sum" id="im-sum"></div>' +
          '<div class="im-list" id="im-list"></div>' +
          '<div class="im-go"><button class="btn block" id="im-save" disabled></button></div>' +
        '</section>' +
      '</div>' +
    '</div>';
  const ta = $('#im-text');
  let timer = 0;
  const changed = () => { clearTimeout(timer); timer = setTimeout(imParse, 250); imDraft(); };
  ta.addEventListener('input', changed);
  $('#im-name').addEventListener('input', imDraft);
  $('#im-subj').addEventListener('change', imDraft);
  $('#im-file').addEventListener('click', () => $('#im-fi').click());
  $('#im-fi').addEventListener('change', e => { imFiles(e.target.files); e.target.value = ''; });
  const left = $('.im-left');
  left.addEventListener('dragover', e => { e.preventDefault(); left.classList.add('drag'); });
  left.addEventListener('dragleave', () => left.classList.remove('drag'));
  left.addEventListener('drop', e => {
    left.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); imFiles(e.dataTransfer.files); }
  });
  $('#im-key').addEventListener('click', imPasteKey);
  $('#im-ai').addEventListener('click', imAiPrompt);
  if ($('#im-aido')) $('#im-aido').addEventListener('click', imAiDo);
  $('#im-undo').addEventListener('click', () => {
    if (state.imp.undo == null) return;
    $('#im-text').value = state.imp.undo;
    state.imp.undo = null;
    $('#im-undo').hidden = true;
    imDraft();
    imParse();
  });
  $('#im-clear').addEventListener('click', () => {
    if (ta.value.trim() && !confirm('清空左边的原文？')) return;
    ta.value = '';
    changed();
  });
  $('#im-save').addEventListener('click', imSave);
  $('#im-list').addEventListener('click', imListClick);
  imParse();
}

function imDraft() {
  const im = state.imp;
  if (!im || im.st.key) return;                // 改已导入的卷子不存草稿
  try {
    localStorage.setItem(IM_DRAFT, JSON.stringify({ text: $('#im-text').value, name: $('#im-name').value, subject: $('#im-subj').value }));
  } catch (e) { /* 存不了就算了 */ }
}

// 读文件：卷子文件的文字放进左边；文件名带“答案”的当答案文件，只取出里面的答案表接到后面
async function imFiles(files) {
  const ta = $('#im-text');
  const list = Array.from(files).sort((a, b) => /答案/.test(a.name) - /答案/.test(b.name));
  for (const f of list) {
    const isKey = /答案/.test(f.name) && list.length > 1 || (/答案/.test(f.name) && ta.value.trim());
    toast('正在读取 ' + f.name + (/\.doc$/i.test(f.name) ? '（老版 .doc 要先用 Word 转换，稍等几秒）' : '') + '……');
    let d;
    try {
      d = await api('/api/import/extract?name=' + encodeURIComponent(f.name) + (isKey ? '&answer=1' : ''),
                    { method: 'POST', body: await f.arrayBuffer() });
    } catch (e) { toast(f.name + '：' + e.message, 'bad'); continue; }
    if (isKey) {
      if (!d.keys) { toast(f.name + ' 里没找到“1.A 2.B”这样的答案表，可以打开它把答案复制到「粘贴答案」里', 'bad'); continue; }
      ta.value = ta.value.replace(/\s*$/, '\n\n') + d.text;
      toast('从 ' + f.name + ' 读到 ' + d.keys + ' 题的答案，已按题号对上', 'good');
    } else {
      if (ta.value.trim() && !confirm('左边已经有内容了，用「' + f.name + '」替换掉吗？\n（选“取消”就接在后面）')) ta.value = ta.value.replace(/\s*$/, '\n\n') + d.text;
      else ta.value = d.text;
      if (!$('#im-name').value.trim()) $('#im-name').value = f.name.replace(/\.(docx?|txt|md)$/i, '');
      if (d.images) toast('原卷有 ' + d.images + ' 处图片或公式（显示成 [图片]），导不进来，这些题右边会标出来', 'bad');
    }
  }
  imDraft();
  imParse();
}

async function imParse() {
  const im = state.imp;
  if (!im) return;
  const text = $('#im-text').value;
  const seq = ++im.seq;
  let r;
  if (!text.trim()) r = { questions: [], by_type: {} };
  else {
    try { r = await api('/api/import/parse', { method: 'POST', body: { text: text } }); }
    catch (e) { $('#im-sum').innerHTML = '<div class="im-err">' + esc(e.message) + '</div>'; return; }
  }
  if (seq !== im.seq || !$('#im-list')) return;            // 打字快：只画最后一次的结果
  im.res = r;
  const qs = r.questions, cnt = f => qs.filter(q => q.flags.indexOf(f) >= 0).length;
  const types = Object.keys(r.by_type).map(t => (TYPE_NAME[t] || t) + ' ' + r.by_type[t]).join(' · ');
  $('#im-sum').innerHTML = !qs.length ? '<div class="im-empty">' + (text.trim() ?
      '还没认出题目。检查一下：题干后面有没有 A. B. C. 这样的选项、题目之间有没有分开；或者用「复制 AI 整理提示词」让 AI 先整理一遍。' :
      '左边放进卷子，这里会显示认出来的每一道题。') + '</div>' :
    '<div class="im-total">认出 <b>' + qs.length + '</b> 题<span class="muted"> · ' + esc(types) + '</span></div>' +
    '<div class="im-chips">' + Object.keys(IM_FLAG).map(f => cnt(f) ?
      '<span class="im-chip ' + IM_FLAG[f][1] + '">' + IM_FLAG[f][0] + ' ' + cnt(f) + '</span>' : '').join('') +
      (!cnt('no_answer') && !cnt('type_guess') && !cnt('doubt') ? '<span class="im-chip ok">都有答案</span>' : '') + '</div>' +
    (cnt('no_answer') ? '<div class="im-tip">缺答案的题可以在下面直接点答案，或者用「粘贴答案」把老师发的答案（如 1-5 CABDA）贴进来；不补也能导入，补上答案之前练习时会跳过。</div>' : '') +
    (cnt('type_guess') ? '<div class="im-tip">“题型待确认”：没有题型标记，也没有答案，单选还是多选是猜的。补上答案就定了，或者在左边题号后面加上【多选题】。</div>' : '');
  $('#im-list').innerHTML = qs.map((q, i) => imRow(q, i)).join('');
  const b = $('#im-save');
  b.disabled = !qs.length;
  b.textContent = !qs.length ? '还没有题目' : (im.st.key ? '保存修改（' + qs.length + ' 题）' : '导入（' + qs.length + ' 题）');
}

function imRow(q, i) {
  const fl = q.flags.filter(f => IM_FLAG[f]);
  const cls = q.flags.indexOf('no_answer') >= 0 ? ' bad' : (fl.length ? ' warn' : '');
  const choice = q.type === 'single' || q.type === 'multi' || q.type === 'reading' || q.type === 'poem';
  let ans;
  if (q.answer) ans = '<span class="im-ans">答案 ' + esc(q.answer.length > 40 ? q.answer.slice(0, 40) + '…' : q.answer) + '</span>';
  else if (choice && q.options.length) {
    ans = '<span class="im-pick" data-i="' + i + '" data-multi="' + (q.type === 'multi' ? 1 : 0) + '">' +
      q.options.map(o => '<button class="im-k" data-k="' + o[0] + '">' + o[0] + '</button>').join('') +
      (q.type === 'multi' ? '<button class="im-k ok" data-ok="1">确定</button>' : '') + '</span>';
  } else if (q.type === 'judge') {
    ans = '<span class="im-pick" data-i="' + i + '"><button class="im-k" data-k="对">对</button><button class="im-k" data-k="错">错</button></span>';
  } else ans = '<span class="im-ans none">没有参考答案</span>';
  return '<div class="im-q' + cls + '" data-i="' + i + '">' +
    '<div class="im-qh"><b>' + q.qno + '.</b><span class="im-type">' + (TYPE_NAME[q.type] || q.type) + '</span>' +
      fl.map(f => '<span class="im-chip ' + IM_FLAG[f][1] + '">' + IM_FLAG[f][0] + '</span>').join('') + '</div>' +
    (q.material ? '<div class="im-mat">材料：' + esc(q.material.replace(/\s+/g, ' ').slice(0, 40)) + '…</div>' : '') +
    '<div class="im-stem">' + esc(q.stem.replace(/\s+/g, ' ')) + '</div>' +
    (q.options.length ? '<div class="im-opts">' + q.options.map(o => '<span><b>' + o[0] + '</b> ' + esc(o[1].replace(/\s+/g, ' ')) + '</span>').join('') + '</div>' : '') +
    (q.doubt ? '<div class="im-doubt">AI 说：' + esc(q.doubt) + '</div>' : '') +
    '<div class="im-qf">' + ans + '</div>' +
  '</div>';
}

// 点题：跳到左边原文那几行；点答案按钮：在原文这道题后面补一行“答案：X”
function imListClick(e) {
  const k = e.target.closest('.im-k');
  const im = state.imp;
  if (k) {
    const pick = k.closest('.im-pick'), q = im.res.questions[+pick.dataset.i];
    if (pick.dataset.multi === '1' && !k.dataset.ok) { k.classList.toggle('on'); return; }
    const val = k.dataset.ok ? Array.from(pick.querySelectorAll('.im-k.on')).map(b => b.dataset.k).join('') : k.dataset.k;
    if (!val) { toast('先点选几个选项'); return; }
    const ta = $('#im-text'), ls = ta.value.split('\n');
    ls.splice(q.end + 1, 0, '答案：' + val);
    ta.value = ls.join('\n');
    imDraft();
    imParse();
    return;
  }
  const row = e.target.closest('.im-q');
  if (!row) return;
  const q = im.res.questions[+row.dataset.i], ta = $('#im-text'), ls = ta.value.split('\n');
  let a = 0;
  for (let i = 0; i < q.line; i++) a += ls[i].length + 1;
  let b = a;
  for (let i = q.line; i <= q.end && i < ls.length; i++) b += ls[i].length + 1;
  ta.focus();
  ta.setSelectionRange(a, Math.max(a, b - 1));
  // 滚到选中的那几行：按行高估算
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, q.line * lh - ta.clientHeight / 3);
}

function imPasteKey() {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-mask';
  sheet.innerHTML = '<div class="sheet" role="dialog">' +
    '<div class="sheet-h"><b>粘贴答案</b><button class="sheet-x" aria-label="关闭">×</button></div>' +
    '<div class="sheet-d">把老师在群里发的答案原样贴进来，按题号对上缺答案的题。这些写法都行：<br>' +
      '<code>1-5 CABDA 6-10 BBCDA</code>　<code>1.B 2.ACD 3.对</code>　<code>1.C2.A3.A</code></div>' +
    '<textarea class="im-keyta" placeholder="1-5 CABDA&#10;6.对 7.错"></textarea>' +
    '<div class="sheet-row" style="margin-top:12px"><button class="btn" data-act="ok">对上答案</button></div></div>';
  const close = () => sheet.remove();
  sheet.addEventListener('click', e => {
    if (e.target === sheet || e.target.closest('.sheet-x')) return close();
    if (!e.target.closest('[data-act="ok"]')) return;
    const v = sheet.querySelector('textarea').value.trim();
    if (!v) return close();
    const ta = $('#im-text');
    ta.value = ta.value.replace(/\s*$/, '\n\n') + v.split('\n').map(l => l.trim() ? '参考答案：' + l.trim() : '').join('\n') + '\n';
    close();
    imDraft();
    const before = state.imp.res ? state.imp.res.questions.filter(q => !q.answer).length : 0;
    imParse().then(() => {
      const r = state.imp.res, after = r.questions.filter(q => !q.answer).length;
      toast(before > after ? '对上了 ' + (before - after) + ' 题的答案' + (after ? '，还缺 ' + after + ' 题' : '') :
            '没对上：检查一下题号和格式（比如 1-5 CABDA）', before > after ? 'good' : 'bad');
    });
  });
  document.body.appendChild(sheet);
  sheet.querySelector('textarea').focus();
}

// 复制提示词 + 原文，拿去免费 AI（豆包、DeepSeek、Kimi……）整理成标准格式；题多就分段，每段一个按钮
async function imAiPrompt() {
  const text = $('#im-text').value.trim();
  if (!text) { toast('先把卷子放进左边'); return; }
  let d;
  try { d = await api('/api/import/prompt'); } catch (e) { toast(e.message, 'bad'); return; }
  const ls = $('#im-text').value.split('\n'), qs = (state.imp.res || {}).questions || [];
  const parts = [];
  if (qs.length > IM_CHUNK) {                    // 按题切开：每段从某道题的第一行开始
    for (let i = 0; i < qs.length; i += IM_CHUNK) {
      const a = i ? qs[i].line : 0, b = i + IM_CHUNK < qs.length ? qs[i + IM_CHUNK].line : ls.length;
      parts.push(ls.slice(a, b).join('\n').trim());
    }
  } else parts.push(text);
  const sheet = document.createElement('div');
  sheet.className = 'sheet-mask';
  sheet.innerHTML = '<div class="sheet" role="dialog">' +
    '<div class="sheet-h"><b>让 AI 整理格式</b><button class="sheet-x" aria-label="关闭">×</button></div>' +
    '<div class="sheet-d">1. 点下面的按钮，复制好的是“整理要求 + 卷子原文”。<br>' +
      '2. 打开豆包、DeepSeek、Kimi 这类免费 AI，<b>新开一个对话</b>，粘贴发送。<br>' +
      '3. 把 AI 回复的内容全部复制，回来粘贴到左边（替换原来的内容）' + (parts.length > 1 ? '；分了几段的，按顺序一段一段接起来' : '') + '。</div>' +
    '<div class="im-aibtns">' + parts.map((p, i) => '<button class="btn" data-p="' + i + '">' +
      (parts.length > 1 ? '复制第 ' + (i + 1) + ' 段（第 ' + (i * IM_CHUNK + 1) + '–' + Math.min(qs.length, (i + 1) * IM_CHUNK) + ' 题）' : '复制提示词和原文') + '</button>').join('') + '</div>' +
    '<div class="sheet-t" style="margin-top:14px">用 AI 要注意</div>' +
    '<ul class="im-aitips">' + d.tips.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div>';
  sheet.addEventListener('click', async e => {
    if (e.target === sheet || e.target.closest('.sheet-x')) return sheet.remove();
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const s = d.prompt + parts[+b.dataset.p] + '\n';
    try { await navigator.clipboard.writeText(s); }
    catch (er) {                                  // 老内核没有 clipboard API：退回选中复制
      const t = document.createElement('textarea');
      t.value = s; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e2) { /* 复制不了 */ }
      t.remove();
    }
    b.textContent = '已复制 ✓ ' + b.textContent.replace(/^已复制 ✓ /, '');
    toast('已复制，去 AI 那里新开一个对话粘贴', 'good');
  });
  document.body.appendChild(sheet);
}

// 用自己的 API 整理：和「复制 AI 整理提示词」同一份提示词，题多就一段一段整理再接起来；整理前的原文留着，可以撤销
async function imAiDo() {
  const ta = $('#im-text'), text = ta.value.trim();
  if (!text) { toast('先把卷子放进左边'); return; }
  const ls = ta.value.split('\n'), qs = (state.imp.res || {}).questions || [];
  const parts = [];
  if (qs.length > IM_CHUNK) {
    for (let i = 0; i < qs.length; i += IM_CHUNK) {
      const a = i ? qs[i].line : 0, b = i + IM_CHUNK < qs.length ? qs[i + IM_CHUNK].line : ls.length;
      parts.push(ls.slice(a, b).join('\n').trim());
    }
  } else parts.push(text);
  const b = $('#im-aido');
  b.disabled = true;
  const out = [];
  try {
    for (let i = 0; i < parts.length; i++) {
      b.textContent = parts.length > 1 ? '正在整理第 ' + (i + 1) + '/' + parts.length + ' 段……' : 'AI 正在整理……';
      out.push((await api('/api/ai/organize', { method: 'POST', body: { text: parts[i] } })).text.trim());
    }
  } catch (e) { toast('AI 整理失败：' + e.message, 'bad'); b.disabled = false; b.textContent = '用 AI 整理'; return; }
  b.disabled = false;
  b.textContent = '用 AI 整理';
  state.imp.undo = ta.value;
  $('#im-undo').hidden = false;
  ta.value = out.join('\n\n') + '\n';
  imDraft();
  await imParse();
  const r = state.imp.res;
  toast('AI 整理好了：' + r.questions.length + ' 题。对照原卷看一眼，特别是标黄（AI 存疑）和缺答案的题；不满意可以撤销', 'good');
}

async function imSave() {
  const im = state.imp, r = im.res;
  if (!r || !r.questions.length) return;
  const miss = r.questions.filter(q => !q.answer && SELF_TYPES.indexOf(q.type) < 0 && q.type !== 'qa').length;
  if (miss && !confirm('还有 ' + miss + ' 道题没有答案，导进去以后练习时会先跳过，以后点这张卷子里的「填答案」补上。\n现在就导入吗？')) return;
  const b = $('#im-save');
  b.disabled = true;
  b.textContent = '正在保存……';
  let d;
  try {
    d = await api('/api/import/save', { method: 'POST', body: { text: $('#im-text').value, name: $('#im-name').value.trim(),
                                                                subject: $('#im-subj').value, key: im.st.key || '' } });
  } catch (e) { toast(e.message, 'bad'); imParse(); return; }
  if (!im.st.key) { try { localStorage.removeItem(IM_DRAFT); } catch (e) { /* ignore */ } }
  toast((im.st.key ? '已保存：' : '已导入：') + d.paper.name + '，' + d.paper.total + ' 题' + (d.no_answer ? '（' + d.no_answer + ' 题没答案）' : ''), 'good');
  state.home.subj = $('#im-subj').value;
  state.home.group = '';
  state.home.q = '';
  location.hash = '#/home';
}

/* ================================================================ 填答案（导入的卷子）
 * #/answers/<卷子id>：答题卡式，每题点 A/B/C/D、对/错，问答题写参考答案；也能把老师发的“1-5 CABDA”粘进来一次对上。
 * 只改答案，不动题目（改题去导入整理台）。只有自己导入的卷子（upload-…）能改，题库自带的卷子答案以官方为准。
 * 没答案的题练习时会跳过，填上就能练。
 * 防止点几下就把答案改乱（用户要求）：已经有答案的题默认锁着，点「改答案」才能改；粘贴的答案只填空着的题，
 * 和已有答案不一样的先列出来问要不要替换；保存时改动了原有答案的，再列一遍“第几题 从什么改成什么”确认。 */
async function viewAnswers(args) {
  const pid = +(args && args[0]) || 0;
  app.innerHTML = '<div class="empty">加载中…</div>';
  let d;
  try { d = await api('/api/import/answers?paper_id=' + pid); }
  catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  // 改过还没保存的留在 state.ansDraft 里：中途离开这页再回来还在
  state.ansDraft = state.ansDraft || {};
  const dr = state.ansDraft[pid] = state.ansDraft[pid] || { edit: {}, open: {}, asMulti: {} };
  const qs = d.questions;
  const edit = dr.edit;                         // 改过还没保存的 {key: 答案}
  const open = dr.open;                         // 点了「改答案」、解开锁的题
  const asMulti = dr.asMulti;                   // 手动切成多选 / 单选的题（保存时后台按答案字母数定题型）
  const choice = q => (q.options || []).length && q.type !== 'judge';
  const multi = q => (q.key in asMulti ? asMulti[q.key] : q.type === 'multi');
  const val = q => (q.key in edit ? edit[q.key] : q.answer || '');
  const locked = q => !!q.answer && !open[q.key];
  const st = { onlyMissing: qs.some(q => !q.answer) };
  const short = s => (s.length > 30 ? s.slice(0, 30) + '…' : s) || '（空）';
  app.innerHTML =
    '<div class="crumb"><a href="#/home">首页</a> / 填答案</div>' +
    '<div class="ans-page">' +
      '<div class="ans-top card">' +
        '<div class="ans-title"><b>' + esc(d.paper.name) + '</b><span class="muted" id="ans-count"></span></div>' +
        '<div class="ans-paste"><input class="inp" id="ans-paste" placeholder="把老师发的答案粘贴到这里，比如 1-5 CABDA 6.对 7.ABD">' +
          '<button class="btn ghost sm" id="ans-apply">对上答案</button></div>' +
        '<div class="ans-tools"><label class="ans-only"><input type="checkbox" id="ans-only"' + (st.onlyMissing ? ' checked' : '') + '> 只看还没答案的题</label>' +
          '<span class="spacer"></span><a class="btn ghost sm" href="#/upload/' + d.paper.id + '">改题目（导入整理台）</a>' +
          '<button class="btn sm" id="ans-save" disabled>保存</button></div>' +
      '</div>' +
      '<div id="ans-list"></div>' +
    '</div>';
  const saveBtn = () => {
    const n = Object.keys(edit).length, b = $('#ans-save');
    b.disabled = !n;
    b.textContent = n ? '保存（改了 ' + n + ' 题）' : '保存';
  };
  const draw = () => {
    const miss = qs.filter(q => !val(q)).length;
    $('#ans-count').textContent = ' · ' + qs.length + ' 题' + (miss ? '，还有 ' + miss + ' 题没答案（练习时会先跳过）' : '，都有答案了');
    saveBtn();
    const list = qs.filter(q => !st.onlyMissing || !q.answer || q.key in edit || open[q.key]);
    $('#ans-list').innerHTML = list.length ? list.map(q => {
      const v = val(q);
      let pick;
      if (locked(q)) {
        pick = '<span class="ans-cur">答案 <b>' + esc(short(q.answer)) + '</b></span><button class="btn ghost sm ans-edit">改答案</button>';
      } else {
        if (q.type === 'judge') pick = ['对', '错'].map(k => '<button class="ans-k' + (v === k ? ' on' : '') + '" data-k="' + k + '">' + k + '</button>').join('');
        else if (choice(q)) pick = q.options.map(o => '<button class="ans-k' + (v.indexOf(o[0]) >= 0 ? ' on' : '') + '" data-k="' + o[0] + '">' + o[0] + '</button>').join('') +
          '<a href="javascript:void(0)" class="ans-mode">' + (multi(q) ? '多选（可以点几个）· 改成单选' : '单选 · 改成多选') + '</a>';
        else pick = '<textarea class="ans-ta" rows="2" placeholder="参考答案（可以不填，练习时自己对照）">' + esc(v) + '</textarea>';
        if (q.answer) pick += '<span class="ans-was">原答案 ' + esc(short(q.answer)) + '</span><button class="btn ghost sm ans-cancel">不改了</button>';
      }
      return '<div class="ans-q card' + (v ? '' : ' miss') + (q.key in edit ? ' changed' : '') + '" data-key="' + esc(q.key) + '">' +
        '<div class="ans-qh"><b>' + q.qno + '.</b><span class="im-type">' + (TYPE_NAME[q.type] || q.type) + '</span>' +
          (q.key in edit ? '<span class="im-chip warn">' + (q.answer ? '改了答案，还没保存' : '填了，还没保存') + '</span>' : (v ? '' : '<span class="im-chip bad">没答案</span>')) + '</div>' +
        '<div class="ans-stem">' + rich(q.stem) + '</div>' +
        (choice(q) ? '<div class="im-opts">' + q.options.map(o => '<span><b>' + o[0] + '</b> ' + rich(o[1]) + '</span>').join('') + '</div>' : '') +
        '<div class="ans-pick">' + pick + '</div></div>';
    }).join('') : '<div class="empty">' + (st.onlyMissing ? '都有答案了，可以去练习了。取消“只看还没答案的题”能看全部，要改哪题点「改答案」。' : '这张卷子没有题目') + '</div>';
  };
  const set = (key, v) => {
    const q = qs.find(x => x.key === key);
    if (v === (q.answer || '')) delete edit[key]; else edit[key] = v;
    draw();
  };
  $('#ans-list').addEventListener('click', e => {
    const row = e.target.closest('.ans-q');
    if (!row) return;
    const q = qs.find(x => x.key === row.dataset.key);
    if (e.target.closest('.ans-edit')) { open[q.key] = true; return draw(); }
    if (e.target.closest('.ans-cancel')) { delete open[q.key]; delete edit[q.key]; delete asMulti[q.key]; return draw(); }
    if (locked(q)) return;
    if (e.target.closest('.ans-mode')) {
      asMulti[q.key] = !multi(q);
      if (!asMulti[q.key] && val(q).length > 1) return set(q.key, val(q)[0]);   // 改回单选：只留第一个字母
      return draw();
    }
    const k = e.target.closest('.ans-k');
    if (!k) return;
    const cur = val(q);
    if (q.type === 'judge') return set(q.key, k.dataset.k === cur ? '' : k.dataset.k);
    // 选择题：单选点字母就是选这个（再点一下是清空），多选点字母是勾上 / 去掉，按选项顺序排
    const s = multi(q) ? (cur.indexOf(k.dataset.k) >= 0 ? cur.replace(k.dataset.k, '') : cur + k.dataset.k)
                       : (cur === k.dataset.k ? '' : k.dataset.k);
    set(q.key, q.options.map(o => o[0]).filter(x => s.indexOf(x) >= 0).join(''));
  });
  $('#ans-list').addEventListener('input', e => {
    const t = e.target.closest('.ans-ta');
    if (!t) return;
    const q = qs.find(x => x.key === t.closest('.ans-q').dataset.key);
    if (t.value.trim() === (q.answer || '')) delete edit[q.key]; else edit[q.key] = t.value.trim();
    saveBtn();                                   // 打字时不重画列表，免得输入框失去焦点
  });
  $('#ans-only').addEventListener('change', e => { st.onlyMissing = e.target.checked; draw(); });
  // 粘贴答案：空着的题直接填；已经有答案、又不一样的，列出来问要不要替换
  $('#ans-apply').addEventListener('click', async () => {
    const t = $('#ans-paste').value.trim();
    if (!t) { toast('先把答案粘贴进来'); return; }
    let r;
    try { r = await api('/api/import/keyparse', { method: 'POST', body: { text: t } }); } catch (e) { toast(e.message, 'bad'); return; }
    const fill = [], clash = [];
    Object.keys(r.key).forEach(no => {
      const q = qs.find(x => String(x.qno) === no);
      if (!q || (q.type !== 'judge' && !choice(q))) return;
      let v = r.key[no];
      if (q.type === 'judge' && /^[AB]$/.test(v)) v = v === 'A' ? '对' : '错';
      if (q.type !== 'judge') v = q.options.map(o => o[0]).filter(x => v.indexOf(x) >= 0).join('');
      if (!v || val(q) === v) return;
      (val(q) ? clash : fill).push([q, v]);
    });
    fill.forEach(([q, v]) => { edit[q.key] = v; });
    let swapped = 0;
    if (clash.length && confirm('粘贴的答案里有 ' + clash.length + ' 题和现在的答案不一样：\n\n' +
        clash.slice(0, 12).map(([q, v]) => '第 ' + q.qno + ' 题：' + val(q) + ' → ' + v).join('\n') +
        (clash.length > 12 ? '\n……还有 ' + (clash.length - 12) + ' 题' : '') +
        '\n\n要用粘贴的答案替换掉吗？（选“取消”就只填空着的题）')) {
      clash.forEach(([q, v]) => { open[q.key] = true; edit[q.key] = v; });
      swapped = clash.length;
    }
    draw();
    const n = fill.length + swapped;
    toast(n ? '填上 ' + fill.length + ' 题' + (swapped ? '、替换 ' + swapped + ' 题' : '') + '，检查一下没问题就点「保存」' :
          clash.length ? '没有改动' : '没对上：检查题号和写法（比如 1-5 CABDA、6.对）', n ? 'good' : 'bad');
    if (n) $('#ans-paste').value = '';
  });
  // 保存：改动了原有答案的，列出来确认一次
  $('#ans-save').addEventListener('click', async () => {
    const changed = qs.filter(q => q.answer && q.key in edit);
    if (changed.length && !confirm('下面 ' + changed.length + ' 题原来有答案，要改成新的：\n\n' +
        changed.slice(0, 12).map(q => '第 ' + q.qno + ' 题：' + short(q.answer) + ' → ' + short(edit[q.key])).join('\n') +
        (changed.length > 12 ? '\n……还有 ' + (changed.length - 12) + ' 题' : '') + '\n\n确定保存吗？')) return;
    const b = $('#ans-save');
    b.disabled = true;
    try {
      const r = await api('/api/import/answers', { method: 'POST', body: { paper_id: d.paper.id, answers: edit } });
      Object.keys(edit).forEach(k => { const q = qs.find(x => x.key === k); q.answer = edit[k]; delete edit[k]; delete open[k]; });
      toast('已保存 ' + r.changed + ' 题的答案', 'good');
    } catch (e) { toast(e.message, 'bad'); }
    draw();
  });
  // 改了没保存就离开：不拦着，提醒一句（改动留着，回到这页还在）
  const here = location.hash;
  const leave = () => {
    window.removeEventListener('hashchange', leave);
    if (location.hash !== here && Object.keys(edit).length)
      setTimeout(() => toast('「' + d.paper.name + '」有 ' + Object.keys(edit).length + ' 题的答案还没保存，回到填答案页面点「保存」才生效', 'bad'), 300);
  };
  window.addEventListener('hashchange', leave);
  draw();
}

/* ================================================================ 题库浏览 */

// 搜索题目的题型按钮：英语按专项（题型名和首页一致），其他科目按普通题型，只列当前范围里有的
const EN_TYPES = ['en_phon', 'en_vocab', 'en_pic', 'en_dia', 'en_cloze', 'en_read', 'en_write'];
const EN_PAPER_CAT = { 'english-phonetics': 'en_phon', 'english-vocab': 'en_vocab', 'english-picture': 'en_pic', 'english-dialogue': 'en_dia',
                       'english-cloze': 'en_cloze', 'english-reading': 'en_read', 'english-writing': 'en_write' };
function bankTypes(b, plist) {
  const ps = b.paper_id ? plist.filter(p => p.id === b.paper_id) : plist;
  const has = {};
  ps.forEach(p => {
    // 英语专项卷只有它自己那一类，学习通试卷什么都有
    if (p.subject === 'english') (EN_PAPER_CAT[p.key] ? [EN_PAPER_CAT[p.key]] : EN_TYPES).forEach(t => { has[t] = 1; });
    else Object.keys(p.counts || {}).forEach(t => { has[t] = 1; });
  });
  return Object.keys(TYPE_NAME).filter(t => has[t]);
}

async function viewBank() {
  const b = state.bank;
  await loadHidden();
  if (!b.papers.length) {
    try { b.papers = (await api('/api/papers')).papers; } catch (e) { /* ignore */ }
  }
  const plist = b.subject ? b.papers.filter(p => p.subject === b.subject) : b.papers.filter(p => !isHidden(p.subject));
  if (b.type && bankTypes(b, plist).indexOf(b.type) < 0) b.type = '';
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
    // 按做题记录筛（用户：找出我曾经错过的题）
    '<div class="filters">' + [['', '全部'], ['wrong', '错过的'], ['inwrong', '错题本里的'], ['done', '做过的'], ['new', '没做过的']].map(r =>
      '<button class="chip' + ((b.rec || '') === r[0] ? ' on' : '') + '" data-rec="' + r[0] + '">' + r[1] + '</button>').join('') + '</div>' +
    '<div class="filters">' +
      [''].concat(bankTypes(b, plist)).map(t =>
        '<button class="chip' + (b.type === t ? ' on' : '') + '" data-t="' + t + '">' + (t ? TYPE_NAME[t] : '全部题型') + '</button>').join('') +
    '</div>' +
    '<div id="q-list"></div>';

  $('#f-subj').addEventListener('change', e => { b.subject = e.target.value; b.paper_id = 0; reload(); });
  $('#f-paper').addEventListener('change', e => { b.paper_id = +e.target.value; reload(); });
  $$('.chip[data-t]').forEach(c => c.addEventListener('click', () => { b.type = c.dataset.t; reload(); }));
  $$('.chip[data-rec]').forEach(c => c.addEventListener('click', () => { b.rec = c.dataset.rec; reload(); }));
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
    (b.type ? '&type=' + b.type : '') + (b.q ? '&q=' + encodeURIComponent(b.q) : '') + (b.rec ? '&rec=' + b.rec : '');
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
  const REC = { wrong: '错过的', inwrong: '错题本里的', done: '做过的', new: '没做过的' };
  const parts = [paper ? paper.name : (b.subject ? SUBJECT_NAME[b.subject] : ''), b.type ? TYPE_NAME[b.type] : '', b.q ? '“' + b.q + '”' : '', REC[b.rec] || ''].filter(Boolean);
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
      (b.q ? '&q=' + encodeURIComponent(b.q) : '') + (b.rec ? '&rec=' + b.rec : '') +
      '&limit=30&offset=' + b.items.length);
  } catch (e) {
    box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    return;
  }
  // 老版电脑程序（没重启换上新后台）不认 rec，会把全部题返回：提示一下
  if (b.rec && !d.rec) { box.innerHTML = '<div class="empty">按做题记录筛选要重启一下程序（托盘图标右键退出，再打开）</div>'; return; }
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
  const show = state.bank.showAns && q.answer;
  return '<div class="card' + (show ? '' : ' ans-hidden') + '" id="qc' + q.id + '">' +
    '<div class="qhead">' +
      '<span class="tag t-' + q.type + '">' + (TYPE_NAME[q.cat] || TYPE_NAME[q.type]) + '</span>' +
      '<span class="qsrc">' + esc(q.paper_name) + ' · 第' + q.qno + '题' + (q.answer ? '' : ' · 无答案') + '</span>' +
      recBadge(q) + '<span class="spacer"></span>' + cnBtn(q) + aiBtn(q) +
    '</div>' +
    materialBox(q) +
    '<div class="stem">' + rich(q.stem) + '</div>' + stemCn(q) +
    (show ? optsStatic(q) + '<div class="ansbox">' + ansHtml(q) + '</div>'
      : optsStatic({ type: q.type, options: q.options, options_cn: q.options_cn, answer: '' }) +
        '<div style="margin-top:10px"><button class="btn ghost sm" onclick="revealAns(' + q.id + ',this)">显示答案</button></div>') +
    '</div>';
}

function revealAns(qid, btn) {
  const q = state.bank.items.find(x => x.id === qid);
  if (!q) return;
  const card = $('#qc' + qid);
  card.classList.remove('ans-hidden');
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
            '<span class="tag t-' + q.type + '">' + (TYPE_NAME[q.cat] || TYPE_NAME[q.type]) + '</span>' +
            '<span class="qsrc">' + esc(q.paper_name) + ' · 第' + q.qno + '题</span>' +
            '<span class="rec-badge bad">做错 ' + q.wrong_count + ' 次</span>' +
            (!q.mastered ? '<span class="rec-badge">' + streakText(q.streak) + (q.due ? ' · ' + q.due.slice(5) + ' 复习' : '') + '</span>' : '') +
            '<div style="flex:1"></div>' + cnBtn(q) + aiBtn(q) +
            (q.mastered
              ? '<button class="btn ghost sm" onclick="markWrong(' + q.id + ',false)">重新加入</button>'
              : '<button class="btn ghost sm" onclick="markWrong(' + q.id + ',true)">标记已掌握</button>') +
          '</div>' +
          materialBox(q, true) +
          '<div class="stem">' + rich(q.stem) + '</div>' + stemCn(q) +
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
  let list = sortUnits(opts.shuffleOpts ? d.items.map(q => shuffleQuestion(q, true)) : d.items);
  let olds = [];
  if (mixOldOn() && ['all', 'new'].indexOf(opts.scope || 'all') >= 0) {
    const tmp = { list: list }, starts = [];
    for (let i = 0; i < list.length; i = unitEnd(tmp, i)) starts.push(i);
    olds = await oldWrongs(opts.subject || list[0].subject, list, Math.min(OLD_MAX, Math.floor(starts.length / OLD_EVERY)), typeOf(opts.type));
    list = spreadIn(list, starts, olds.map(q => extraCopy(q, 'old')));
  }
  beginPractice(list, opts.title || '练习', 'practice');
  // 平时的练习都能手动存档；全部乱序连打乱后的选项顺序一起存（用户报：全部乱序做到一半退出，进度没了）。模拟考试另有自己的进度保存
  allowSave(opts.shuffleOpts ? Object.assign({}, opts, { mix: true }) : opts, opts.title);
  if (olds.length) toast('穿插了 ' + olds.length + ' 道以前错过的题，选项已打乱');
  if (opts.scope === 'wrongmix') {
    const w = d.items.filter(q => q.in_wrong).length;
    const back = d.items.filter(q => !q.in_wrong && q.wrong_count).length;
    toast(w + ' 道错题混在 ' + d.items.length + ' 道题里' + (back ? '，其中 ' + back + ' 道是以前错过、后来做对的' : ''));
  }
}

// 这一轮练习可以存档：存档按练习的来源（卷子 / 科目 / 题型 / 复习……）分开存，读档时按存下的题目顺序还原
function allowSave(src, title) {
  state.practice.saveKey = saveKeyOf(src);
  state.practice.saveOpts = Object.assign(practiceSrc(src), { title: title }, src.mix ? { mix: true } : {});
  // 从整卷 / 题型入口进来的练习，每答一题自动记下做到哪（和手动存档分开），下次进来可以接着做
  state.practice.autoKey = src.auto ? autoKeyOf(state.practice.saveKey) : null;
  if (location.hash === '#/practice') route();
}

function beginPractice(list, title, mode) {
  state.practice = { list: list, idx: 0, correct: 0, answered: false, results: [], title: title,
                     mode: mode, requeued: {},
                     done: {} };          // 题目序号 -> 当时的作答（选项字母数组，或自评 {self: true/false}），回看上一题用
  if (location.hash === '#/practice') route();
  else location.hash = '#/practice';
}

/* ---- 整卷 / 题型练习的两种方式 + 手动存档 ---- */

// 练习的范围：一张卷子，或者某科的某个题型（比如数学·单选题）
// 卷子带上 key：存档跟着账号同步到别的设备，那边的卷子 id 可能不一样（导入先后不同），key 才对得上
function practiceSrc(o) {
  return o.paper_id ? (o.paper_key ? { paper_id: o.paper_id, paper_key: o.paper_key } : { paper_id: o.paper_id })
                    : { subject: o.subject || '', type: o.type || '' };
}
function saveKeyOf(o) {
  const scope = (o.scope && o.scope !== 'all' ? '.' + o.scope : '') + (o.mix ? '.mix' : '');
  if (o.paper_key) return 'zx.save.paper.' + o.paper_key + scope;    // 整卷：zx.save.paper.<卷子key>
  if (o.paper_id) return 'zx.save.' + o.paper_id + scope;           // 旧的整卷存档：zx.save.<卷子id>（只在存的那台设备上对得上）
  return 'zx.save.' + (o.subject || 'all') + '.' + (o.type || '') + scope;
}
// 以前按卷子 id 存的整卷存档 / 自动进度，挪到按 key 的新位置。
// 同步过来的旧存档可能是别的设备上另一张卷子（id 不一样），所以只挪存档标题对得上这张卷子名字的
function migrateSave(src, name) {
  if (!src.paper_key) return;
  const oldKey = saveKeyOf({ paper_id: src.paper_id }), newKey = saveKeyOf(src);
  [[oldKey, newKey], [autoKeyOf(oldKey), autoKeyOf(newKey)]].forEach(([o, n]) => {
    const v = store.get(o);
    if (!v || store.get(n) || (v.title || '').indexOf(name) !== 0) return;
    if (v.opts) v.opts = Object.assign({}, v.opts, { paper_key: src.paper_key });
    if (v.auto) v.auto = autoKeyOf(newKey);
    store.set(n, v);
    store.del(o);
  });
}
// 自动保存的进度：zx.auto.<同上>。手动存档是回档点，自动进度是“上次退出时做到哪”，两者互不覆盖
function autoKeyOf(saveKey) { return saveKey.replace('zx.save.', 'zx.auto.'); }

// 选项里引用了别的选项（以上都对、A和B……）或图里标号的题，打乱会出错，不打乱（和模拟考试同一条规则）
const NO_SHUFFLE = /以上|上述|都(?:对|错|正确|不正确)|(?<![A-Za-z])[A-G]\s*[和与及、,，]\s*[A-G](?![A-Za-z])|^[A-G]{1,4}$|见材料|(?<!可)见图|\b(?:[Aa]ll|[Nn]one|[Bb]oth|[Nn]either) of the above\b|\b[A-G] and [A-G]\b/;

// 全乱序模式：把题目复制一份，选项打乱后重新标 A、B、C，答案、中文释义、每个选项的说明跟着换
// moveAns：再出现的题（做错了再来、以前错过的、背题小测）要求正确答案换到别的字母上，不能还在老位置（用户：看着像没打乱）；
// 不然完全随机时约 1/4 的机会答案还是原来那个字母。顺序也一定和原来不同（全部乱序也一样）
function shuffleQuestion(q, moveAns) {
  const opts = q.options || [];
  if (q.type === 'judge' || opts.length < 2 || opts.some(o => NO_SHUFFLE.test((o[1] || '').trim()))) return q;
  if (q.material && opts.length >= 5) return q;     // 一组题共用材料里列的 A～E（书面表达排序、信息匹配）：不打乱（同模拟考 exam.py）
  const ans = opts.map((o, i) => (q.answer || '').indexOf(o[0]) >= 0 ? i : -1).filter(i => i >= 0);
  let perm;
  for (let t = 0; t < 50; t++) {
    perm = opts.map((_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const same = perm.every((j, i) => j === i);
    const stay = moveAns && ans.length < opts.length && ans.some(i => perm[i] === i);   // 正确答案还在原来的字母上（全选的多选题没法挪）
    if (!same && !stay) break;
  }
  return permuteQuestion(q, perm);
}

// 按给定排列重排选项（perm[i] = 新的第 i 项是原来的第几项）；c.order 记原卷字母顺序（如 "CADB"），全部乱序存档靠它还原同样的选项顺序
function permuteQuestion(q, perm) {
  const opts = q.options || [];
  const L = i => String.fromCharCode(65 + i);
  const newKey = {};
  perm.forEach((j, i) => { newKey[opts[j][0]] = L(i); });
  const c = Object.assign({}, q, {
    options: perm.map((j, i) => [L(i), opts[j][1]]),
    answer: (q.answer || '').split('').map(k => newKey[k] || k).sort().join(''),
    shuffled: true, order: perm.map(j => opts[j][0]).join(''),
  });
  if (q.options_cn) c.options_cn = perm.map(j => q.options_cn[j]);
  if (q.option_notes) c.option_notes = perm.map(j => q.option_notes[j]);
  if (q.analysis) { c.analysis = remapLetters(q.analysis, newKey, q.subject); c.anaMapped = true; }
  return c;
}

// 读档时按存下的字母顺序重排；题目改过（选项数对不上）就返回 null
function reorderQuestion(q, order) {
  const opts = q.options || [];
  const perm = (order || '').split('').map(k => opts.findIndex(o => o[0] === k));
  if (perm.length !== opts.length || perm.some(j => j < 0) || new Set(perm).size !== perm.length) return null;
  return permuteQuestion(q, perm);
}

// 打乱后解析里提到的选项字母跟着换（用户报：答案是 A，解析却写“故选 C”）。
// 语文、思政、数字媒体的解析里单独的 A～F 都是指选项，全换；数学解析里还有“集合 A、点 A”，只换“A 项”“B、C 两项”“故选 A”这种
const OPT_RUN = /(?<![A-Za-z])[A-F](?:\s*[、，,和与及]\s*[A-F])*\s*(?:两|三|四)?(?:项|选项)/g;
const OPT_SEL = /(?:故选|应选|所以选|因此选|答案为|答案是|答案选|选)\s*[A-F]{1,4}(?![A-Za-z])/g;
function remapLetters(t, map, subject) {
  const one = s => s.replace(/[A-F]/g, k => map[k] || k);
  if (subject === 'chinese' || subject === 'politics' || subject === 'media')
    return t.replace(/(?<![A-Za-z])[A-F](?![A-Za-z0-9₀-₉])/g, k => map[k] || k);
  return t.replace(OPT_RUN, one).replace(OPT_SEL, one);
}

/* ---- 错题穿插（用户要求：做错的题过几题再蹦出来，以前高频错的题也穿插进来，选项重新打乱，加深记忆）----
   做题：做错的（单题、整篇里的小题）隔随机 AGAIN_GAP_MIN～AGAIN_GAP_MAX 题（篇）再出一次（用户要求：绝不能紧接着就出；
         后面剩下不到 AGAIN_MIN_BETWEEN 题就不再出，这题已进错题本，以后复习、背题还会排出来），一轮里同一题最多再出 AGAIN_MAX 次；
         开始整卷 / 题型练习时，每 OLD_EVERY 篇穿插一道同科（题型练习是同题型）以前错过的题。
   背题：点「没记住」的单题隔几张以「小测」再出（选项乱序，要自己选，选错还会再出）；同样按比例穿插以前错过的题做小测。
   以前错过的题：错题本里的在前，其次错的次数多的。穿插进来的是复制的一份（extra: 'again' 刚才错的 / 'old' 以前错的），
   作答照常记进度和错题本；不进存档，“再做一遍”也不带。设置「做题」里可以分别关掉（localStorage quiz.again / quiz.mixold，默认开）。 */
const AGAIN_GAP_MIN = 3, AGAIN_GAP_MAX = 6, AGAIN_MIN_BETWEEN = 2, AGAIN_MAX = 2;
// 这一次隔几题再出：AGAIN_GAP_MIN～AGAIN_GAP_MAX 随机，免得记成“隔几题就是它”
function againGap() { return AGAIN_GAP_MIN + Math.floor(Math.random() * (AGAIN_GAP_MAX - AGAIN_GAP_MIN + 1)); }
const OLD_EVERY = 5, OLD_MAX = 8;
function againOn() { return store.get('quiz.again') !== false; }
function mixOldOn() { return store.get('quiz.mixold') !== false; }
function extraCopy(q, kind) { return Object.assign({}, shuffleQuestion(q, true), { extra: kind }); }
function hintOn() { return !!store.get('quiz.hint'); }
function extraBadge(q) {
  if (!hintOn()) return '';
  return '<span class="rec-badge bad">' + (q.extra === 'old' ? '以前错过' + (q.wrong_count ? ' ' + q.wrong_count + ' 次' : '') + '，再练一次' :
                                     q.extra === 'last' ? '上次做错，再考一次' : '刚才做错，再来一次') +
    (q.shuffled ? ' · 选项已打乱' : '') + '</span>';
}
const baseKey = q => q.same_as || q.key;      // 学习通卷的题和原题共用做题进度，算同一道
// 同科以前错过的题（错题本里的在前，其次错的次数多的），去掉这一轮里已经有的；拿不到就算了，不影响开始练习
async function oldWrongs(subject, have, n, pred) {
  if (!subject || n <= 0) return [];
  let d;
  try { d = await api('/api/practice?scope=all&order=seq&subject=' + encodeURIComponent(subject)); } catch (e) { return []; }
  const seen = {};
  have.forEach(q => { seen[baseKey(q)] = 1; });
  const c = d.items.filter(q => q.answer && (q.in_wrong || q.wrong_count >= 2) && SELF_TYPES.indexOf(q.type) < 0 &&
                                (!pred || pred(q)) && !seen[baseKey(q)] && (seen[baseKey(q)] = 1));
  const rnd = {};
  c.forEach(q => { rnd[q.id] = Math.random(); });
  c.sort((a, b) => (b.in_wrong - a.in_wrong) || (b.wrong_count - a.wrong_count) || (rnd[a.id] - rnd[b.id]));
  return c.slice(0, n);
}
// 把 extras 均匀插进 arr：starts 是能插的位置（篇首），第 k 道插在第 round(k·U/(m+1)) 个位置前
function spreadIn(arr, starts, extras) {
  const out = arr.slice(), U = starts.length, m = extras.length;
  for (let k = m; k >= 1; k--) {                 // 从后往前插，前面的位置不受影响
    const j = Math.round(k * U / (m + 1));
    out.splice(j < U ? starts[j] : arr.length, 0, extras[k - 1]);
  }
  return out;
}
const typeOf = t => q => !t || q.cat === t || q.type === t;

function openPaperSheet(pid, name, pkey, missing) {
  openModeSheet(Object.assign(pkey ? { paper_id: pid, paper_key: pkey } : { paper_id: pid }, missing ? { missing: missing } : {}), name);
}

async function openModeSheet(src, name) {
  await lsPull();
  migrateSave(src, name);
  const key = saveKeyOf(src);
  const save = store.get(key);
  const auto = store.get(autoKeyOf(key));
  const mixKey = saveKeyOf(Object.assign({}, src, { mix: true }));
  const mixSave = store.get(mixKey), mixAuto = store.get(autoKeyOf(mixKey));
  const go = o => startPractice(Object.assign(practiceSrc(src), { scope: 'all', auto: true }, o));
  const at = s => '第 ' + (s.idx + 1) + '/' + s.ids.length + ' 题，' + esc(s.t.slice(5, 16));
  const sheet = document.createElement('div');
  sheet.className = 'sheet-mask';
  sheet.innerHTML =
    '<div class="sheet" role="dialog">' +
      '<div class="sheet-h"><b>' + esc(name) + '</b><button class="sheet-x" aria-label="关闭">×</button></div>' +
      (auto ? '<div class="sheet-sec"><div class="sheet-t">上次没做完</div>' +
        '<div class="sheet-d">上次退出时做到' + at(auto) + '。接着做，或者用下面的方式重新做。</div>' +
        '<button class="btn block" data-act="continue">接着上次做（' + at(auto) + '）</button></div>' : '') +
      '<div class="sheet-sec"><div class="sheet-t">' + (auto ? '重新做 · 选项不变' : '选项不变') + '</div>' +
        '<div class="sheet-d">选项顺序和原卷一样。每答一题自动记下进度，退出后下次进来可以接着做；' +
          '另外可以手动「存档」留一个回档点，以后「读档」回到那一刻重做。</div>' +
        (save ? '<button class="btn ghost block" data-act="resume">读档（存档点：' + at(save) + ' 存）</button>' : '') +
        '<div class="sheet-row"><button class="btn' + (auto ? ' ghost' : '') + '" data-act="seq">' + (src.paper_id ? '按原卷顺序' : '按卷子顺序') + '</button>' +
        '<button class="btn ghost" data-act="rand">题目打乱</button></div></div>' +
      '<div class="sheet-sec"><div class="sheet-t">全部乱序</div>' +
        '<div class="sheet-d">题目顺序和选项顺序都打乱，检验是不是真会，而不是记住了答案的位置。同样自动记进度，也能存档。</div>' +
        (mixAuto ? '<button class="btn block" data-act="mix-continue">接着上次做（' + at(mixAuto) + '）</button>' : '') +
        (mixSave ? '<button class="btn ghost block" data-act="mix-resume">读档（存档点：' + at(mixSave) + ' 存）</button>' : '') +
        '<button class="btn ghost block" data-act="all">' + (mixAuto ? '重新开始' : '开始') + '</button></div>' +
      '<div class="sheet-sec"><div class="sheet-t">考试模式 · 做完再判</div>' +
        '<div class="sheet-d">像学习通考试：一路做下去不显示对错，答题卡看进度、随时跳题改答案，交卷后一起出分数和每题解析，做错的进错题本。不限时，只考选择、判断题。</div>' +
        '<div class="sheet-row"><button class="btn ghost" data-act="ex-seq">选项不变</button>' +
        '<button class="btn ghost" data-act="ex-mix">选项打乱</button></div></div>' +
      '<div class="sheet-sec"><div class="sheet-t">背题</div>' +
        '<div class="sheet-d">不用选，直接看题目和答案内容，记住答案本身，选项怎么打乱都不怕。每题点「记住了 / 没记住」，没记住的会进复习。</div>' +
        '<div class="sheet-row"><button class="btn ghost" data-act="rc-seq">按顺序背</button>' +
        '<button class="btn ghost" data-act="rc-rand">打乱背</button></div></div>' +
      (src.type === 'dictation' || /^chinese-/.test(src.paper_key || '') ? '<div class="sheet-sec"><div class="sheet-t">古诗文划重点</div>' +
        '<div class="sheet-d">默写考到的古诗文全文都列出来，所有卷子考过的句子用荧光笔画出来，考得越多颜色越深；还能遮住考点自己默一遍。</div>' +
        '<button class="btn ghost block" data-act="poems">打开古诗文划重点</button></div>' : '') +
      // 自己导入的卷子（upload-…）：缺答案的题练习时跳过，在这里进导入整理台补上
      (!IS_APP && /^upload-/.test(src.paper_key || '') ? '<div class="sheet-sec"><div class="sheet-t">答案 / 题目</div>' +
        '<div class="sheet-d">' + (src.missing ? '这张卷子有 <b>' + src.missing + '</b> 题还没有答案，练习时会先跳过，填上就能练。' : '自己导入的卷子，答案和题目都可以改。') +
          '改了题号不变，做题记录还在。</div>' +
        '<div class="sheet-row"><button class="btn' + (src.missing ? '' : ' ghost') + '" data-act="answers">' + (src.missing ? '填答案' : '改答案') + '</button>' +
        '<button class="btn ghost" data-act="edit">改题目</button></div></div>' : '') +
    '</div>';
  const close = () => sheet.remove();
  sheet.addEventListener('click', e => {
    // 用 closest：老手机上 gap 兜底脚本会把按钮里的文字包进 <span>，点到的是 span 不是按钮
    if (e.target === sheet || e.target.closest('.sheet-x')) return close();
    const btn = e.target.closest('[data-act]');
    const act = btn && btn.dataset.act;
    if (!act) return;
    close();
    if (act === 'rc-seq' || act === 'rc-rand') return startRecite(practiceSrc(src), name, act === 'rc-seq' ? 'seq' : 'random');
    if (act === 'edit') { location.hash = '#/upload/' + src.paper_id; return; }
    if (act === 'answers') { location.hash = '#/answers/' + src.paper_id; return; }
    if (act === 'poems') { location.hash = '#/poems'; return; }
    if (act === 'ex-seq' || act === 'ex-mix') return startScopeExam(src, name, act === 'ex-mix');
    if (act === 'continue') loadSave(autoKeyOf(key));
    else if (act === 'resume') loadSave(key);
    else if (act === 'mix-continue') loadSave(autoKeyOf(mixKey));
    else if (act === 'mix-resume') loadSave(mixKey);
    else if (act === 'seq' || act === 'rand') {
      store.del(autoKeyOf(key));              // 选了重新做，上次的进度作废（手动存档还留着）
      if (act === 'seq') go({ order: 'seq', title: name });
      else go({ order: 'random', title: name + '·题目打乱' });
    }
    else { store.del(autoKeyOf(mixKey)); go({ order: 'random', shuffleOpts: true, title: name + '·全部乱序' }); }
  });
  document.body.appendChild(sheet);
}

// 当前这道已经答完就存“做完这道”，下次从下一道开始。
// 题目记 key（<卷子key>#<序号>，v: 2）：存档同步到别的设备时题目 id 可能不一样，key 是一样的
// 穿插进来的题（extra）不进存档：读档按存下的题目还原，穿插的下次重新安排
function snapshot(p) {
  const at = p.answered ? unitEnd(p, p.idx) : p.idx;
  const keep = [], map = {}, done = {};
  p.list.forEach((q, i) => { if (!q.extra) { map[i] = keep.length; keep.push(q); } });
  let idx = keep.length - 1;
  for (let i = at; i < p.list.length; i++) if (i in map) { idx = map[i]; break; }
  Object.keys(p.done).forEach(i => { if (i in map) done[map[i]] = p.done[i]; });
  const rs = p.results.filter(r => !r.q.extra);
  // 这一轮里最后一次做错的题（包括穿插、再出的）：下次接着做时在开头几题后再考一次；
  // 再出时已经做对的就不记了，交给今日复习按间隔再排
  const last = {};
  (p.pend || []).forEach(k => { last[k] = false; });
  p.results.forEach(r => { if (SELF_TYPES.indexOf(r.q.type) < 0) last[r.q.key] = r.correct; });
  const shuf = {};
  keep.forEach(q => { if (q.order) shuf[q.key] = q.order; });
  return {
    v: 2, ids: keep.map(q => q.key), idx: Math.max(idx, 0), done: done, shuf: shuf,
    pend: Object.keys(last).filter(k => last[k] === false),
    results: rs.map(r => [r.q.key, r.correct]), correct: rs.filter(r => r.correct).length,
    title: p.title, opts: p.saveOpts, auto: p.autoKey || null, t: nowText(),
  };
}

function saveProgress() {
  const p = state.practice;
  if (!p || !p.saveKey) return;
  store.set(p.saveKey, snapshot(p));
  toast('已存档：做完了 ' + Object.keys(p.done).length + ' 题，以后可以读档回到这里');
}

// 每答完一题自动记进度；最后一题也答完了就清掉（整套做完，下次从头来）
function autoSave() {
  const p = state.practice;
  if (!p || !p.autoKey) return;
  if (p.answered && unitEnd(p, p.idx) >= p.list.length) store.del(p.autoKey);
  else store.set(p.autoKey, snapshot(p));
}

async function loadSave(key) {
  const sv = store.get(key);
  const isAuto = key.indexOf('zx.auto.') === 0;
  if (!sv) { toast(isAuto ? '没有上次的进度' : '还没有存档'); return; }
  const o = Object.assign({}, sv.opts || {});
  const ids = Array.isArray(sv.ids) ? sv.ids : [];
  let d;
  try {
    // 存档里记的是卷子 key：换到这台设备上的卷子 id（别的设备同步过来的存档，id 可能不一样）
    if (o.paper_key) {
      const pp = ((await api('/api/papers')).papers || []).find(x => x.key === o.paper_key);
      if (!pp) { toast('这台设备上没有这张卷子，存档用不了', 'bad'); return; }
      o.paper_id = pp.id;
    }
    // 取这个范围里的全部题，再按存档里的题目顺序还原
    d = await api('/api/practice?scope=all&order=seq' + (o.paper_id ? '&paper_id=' + o.paper_id
      : (o.subject ? '&subject=' + encodeURIComponent(o.subject) : '') + (o.type ? '&type=' + encodeURIComponent(o.type) : '')));
  } catch (e) { toast(e.message, 'bad'); return; }
  // 新存档（v: 2）按题目 key 对；以前的存档记的是题目 id，只有在存的那台设备上对得上
  const byId = {};
  d.items.forEach(q => { byId[sv.v === 2 ? q.key : q.id] = q; });
  // 全部乱序的存档：每道题按存下的选项顺序重排，和退出前看到的一样（做过的题回看时选的字母也对得上）
  const shuf = sv.shuf || {};
  const list = ids.map(id => byId[id] && (shuf[id] ? reorderQuestion(byId[id], shuf[id]) : byId[id])).filter(Boolean);
  if (!list.length || list.length !== ids.length) {
    toast(sv.v === 2 ? '题目变过了，这个存档用不了' : '这是旧版本存的档，题目对不上（可能是在别的设备上存的），用不了', 'bad');
    return;
  }
  const extra = await resumeExtras(list, sv, byId, o);
  beginPractice(extra.list, sv.title, 'practice');
  const p = state.practice;
  Object.assign(p, { idx: sv.idx, done: sv.done || {}, correct: sv.correct || 0, pend: sv.pend || [],
                     results: (sv.results || []).map(r => ({ q: byId[r[0]], correct: r[1] })).filter(r => r.q),
                     saveKey: isAuto ? key.replace('zx.auto.', 'zx.save.') : key, saveOpts: Object.assign({}, sv.opts, { paper_id: o.paper_id }),
                     autoKey: isAuto ? key : (sv.auto || null) });
  route();
  toast((isAuto ? '接着上次：第 ' + (sv.idx + 1) + ' 题' : '已读档：回到第 ' + (sv.idx + 1) + ' 题') +
        (extra.again ? '，上次做错的 ' + extra.again + ' 道过几题再考一次' : '') +
        (extra.old ? '，穿插 ' + extra.old + ' 道以前错过的题' : ''));
}

// 接着做（自动进度、读档）时把穿插的题补回来——存档里不存穿插的题，只存题目本身：
// 1. 上次最后一次做错的（sv.pend）：从当前位置往后隔 2 篇出第一道，之后每隔 2 篇一道，选项重新打乱；
// 2. 剩下的部分照开始练习时一样，每 OLD_EVERY 篇穿插一道以前错过的题（已经在这一轮里的不算）。
// 都只插在当前位置后面，前面做过的题号不变
async function resumeExtras(list, sv, byId, o) {
  const at = Math.min(sv.idx || 0, list.length);
  const ahead = {};
  list.slice(at).forEach(q => { ahead[q.key] = 1; });
  const keys = (sv.pend || []).filter(k => !ahead[k]);
  const subject = o.subject || (list[0] && list[0].subject);
  let pool = byId;
  if (keys.some(k => !byId[k]) && subject) {                 // 穿插进来的旧错题可能是别的卷子的
    try {
      pool = Object.assign({}, byId);
      (await api('/api/practice?scope=all&order=seq&subject=' + encodeURIComponent(subject))).items.forEach(q => { if (!pool[q.key]) pool[q.key] = q; });
    } catch (e) { /* 拿不到就只补这个范围里的 */ }
  }
  const again = keys.map(k => pool[k]).filter(q => q && q.answer && SELF_TYPES.indexOf(q.type) < 0);
  let olds = [];
  const rest = list.slice(at), tmp = { list: rest }, starts = [];
  for (let i = 0; i < rest.length; i = unitEnd(tmp, i)) starts.push(i);
  if (mixOldOn() && subject) {
    olds = await oldWrongs(subject, list.concat(again), Math.min(OLD_MAX, Math.floor(starts.length / OLD_EVERY)), typeOf(o.type));
  }
  let out = olds.length ? spreadIn(rest, starts, olds.map(q => extraCopy(q, 'old'))) : rest;
  if (again.length) {
    const t2 = { list: out }, st = [];
    for (let i = 0; i < out.length; i = unitEnd(t2, i)) st.push(i);
    for (let k = again.length - 1; k >= 0; k--) {           // 从后往前插，前面的位置不受影响
      const j = 2 + 2 * k;
      out.splice(j < st.length ? st[j] : out.length, 0, extraCopy(again[k], 'last'));
    }
  }
  return { list: list.slice(0, at).concat(out), again: again.length, old: olds.length };
}

function nowText() {
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

function retryWrongOnly() {
  const p = state.practice;
  const seen = {};
  const wrongs = p.results.filter(r => !r.correct && !seen[r.q.id] && (seen[r.q.id] = 1)).map(r => Object.assign({}, r.q, { extra: undefined }));
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

/* ---- 整篇一张卡片（用户要求，照学习通考试的样子）----
   共用一段材料的选择题（一篇阅读、一篇完形、一组补全对话……）连在一起时做成一张卡片。
   阅读的答案要回材料里找，所以材料一直看得见，各自单独滚动：
   电脑（宽屏）照学习通：左边文章，显示翻译时下半截是参考译文；右边上面一排题号，下面所有小题依次列出。
   手机：文章在上面，紧贴着一排题号，再下面一次只显示一道小题，左右滑切换。
   点题号或按 ← → 切换当前小题；手机上单选第一次选好自动跳到下一道没选的（改答案不跳；电脑上小题都列着，不跳）；全部选完「提交本篇」一起判。
   进度按篇数（单独的题一题算一篇）。打乱时只打乱篇的先后和选项，篇里的题目顺序不变。
   p.idx 始终指向这一篇的第一题；作答记录还是逐题记（p.done[题目序号]、p.results），存档 / 读档不受影响。 */
function groupKey(q) {
  return q && q.material && q.material.trim() && SELF_TYPES.indexOf(q.type) < 0 ? q.paper_id + '\u0001' + q.material : null;
}
// 穿插进来的题（extra：做错了再来一次 / 以前错过的）不和紧挨着的原篇连在一起；穿插进来的同一篇几道小题之间照样连成一篇
function sameUnit(p, i, j) {
  const k = groupKey(p.list[i]);
  return !!k && groupKey(p.list[j]) === k && !p.list[i].extra === !p.list[j].extra;
}
function unitEnd(p, i) {
  let j = i + 1;
  while (j < p.list.length && sameUnit(p, i, j)) j++;
  return j;
}
function unitStart(p, i) {
  while (i > 0 && sameUnit(p, i, i - 1)) i--;
  return i;
}
// “3/8”：第几篇 / 共几篇
function unitNo(p) {
  let n = 0, cur = 0;
  for (let i = 0; i < p.list.length; i = unitEnd(p, i)) { n++; if (i <= p.idx) cur = n; }
  return cur + '/' + n;
}
// 连在一起的同一篇按原题号排
function sortUnits(list) {
  const out = list.slice();
  for (let i = 0; i < out.length;) {
    const k = groupKey(out[i]);
    let j = i + 1;
    if (k) while (j < out.length && groupKey(out[j]) === k) j++;
    if (j - i > 1) out.splice.apply(out, [i, j - i].concat(out.slice(i, j).sort((a, b) => a.qno - b.qno)));
    i = j;
  }
  return out;
}

function renderGroup() {
  const p = state.practice;
  const s = p.idx, e = unitEnd(p, s);
  const qs = p.list.slice(s, e);
  const q0 = qs[0];
  const cnQ = qs.find(hasCn);
  p.group = { s: s, e: e, cur: 0 };
  const pct = Math.round(100 * s / p.list.length);
  const no = unitNo(p).split('/');
  // 选项都很短（完形、补全对话那种几个单词）才排两列；中文一个字按两个英文字符的宽度算，免得中文选项挤成好几行
  const width = t => (t || '').replace(/[^\x00-\xff]/g, 'xx').length;
  const short = q => q.type !== 'judge' && optionList(q).every(o => width(o[1]) <= 20 && !/<img|\\\(|【图/.test(o[1] || ''));
  // 一列至少要多宽：按最长的选项算（一个宽度单位约 8px，加上字母、内边距），放得下一整行才并排，选项文字不折行（用户：挤成两行很丑）
  const colW = q => Math.max.apply(null, optionList(q).map(o => width(o[1]))) * 10 + 72;
  // 配对类（交际对话的问答配对、书面表达、阅读的信息匹配）：几道小题共用同一组 A～E。
  // 照学习通：选项只在左边列一次，右边每道小题一行，后面一排字母点选（用户：每题都重印一遍 A～E 太难看、做起来麻烦）
  const optKey = q => JSON.stringify(optionList(q).map(o => o[1]));
  const match = qs.length >= 2 && qs.every(q => q.type === 'single' && optionList(q).length >= 3 && optKey(q) === optKey(q0));
  const placeholder = match && optionList(q0).every(o => /见材料/.test(o[1] || ''));     // 书面表达：选项印在图里
  const bank = !match ? '' : '<div class="mbank' + (placeholder ? ' mbank-ph material-cn' : '') + '">' +
    '<div class="material-title">' + (placeholder ? '选项意思（选项原文在上面的图里）' : '选项') + '</div>' +
    optionList(q0).map((o, i) => '<div class="mbank-row"><span class="mbank-k">' + esc(o[0]) + '</span><span class="mbank-t">' +
      (placeholder ? '' : rich(o[1])) + optCn(q0, i) + '</span></div>').join('') + '</div>';
  const mStem = q => rich(q.stem.replace(/^第\d+[组篇]\s*/, '').replace(/\s*\/\s*第\d+句\s*$/, ''));
  app.innerHTML =
    '<div class="crumb crumb-row"><span class="crumb-t"><span class="crumb-pre">当前位置：</span><a href="#/home">首页</a> &gt; ' + esc(p.title) + '</span>' +
      '<span class="crumb-acts">' +
        (p.saveKey ? '<a href="javascript:void(0)" onclick="saveProgress()">存档</a>' +
          (store.get(p.saveKey) ? '<a href="javascript:void(0)" onclick="loadSave(' + jsq(p.saveKey) + ')">读档</a>' : '') : '') +
        '<a class="crumb-exit" href="javascript:void(0)" onclick="quitPractice()">退出练习</a></span></div>' +
    '<div class="pbar-wrap"><div class="pbar"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="card qcard-main group-card' + (match ? ' g-match' : '') + '">' +
      '<div class="qhead">' +
        '<span class="tag t-' + q0.type + '">' + (TYPE_NAME[q0.cat] || TYPE_NAME[q0.type]) + '</span>' +
        '<span class="qsrc">' + esc(q0.paper_name) + ' 第' + q0.qno + '–' + qs[qs.length - 1].qno + '题 · 第 ' + no[0] + ' / ' + no[1] + ' 篇</span>' +
        (q0.extra ? extraBadge(q0) : '') +
        '<span class="spacer"></span>' + (cnQ ? cnBtn(cnQ) : '') +
        (state.ai.on && !IS_APP ? '<button class="ai-btn" data-aigroup="1" title="让 AI 讲讲当前这道小题">问 AI</button>' : '') +
      '</div>' +
      '<div class="g-wrap">' +
        // 原文和参考译文分成上下两个框，各自滚动（译文不接在原文末尾，要看不用滚到底）
        '<div class="g-mat"><div class="material-box g-orig"><div class="material-title">' + (match ? '题目' : '原文') + '</div>' +
          '<div class="material-body">' + markBlanks(rich(q0.material)) + '</div>' + bank + '</div>' +
          (q0.material_cn ? '<div class="material-box g-orig-cn material-cn"><div class="material-title">参考译文</div>' + rich(q0.material_cn) + '</div>' : '') +
        '</div>' +
        '<div class="g-qs">' +
          '<div class="gq-tabs">' + qs.map((q, k) =>
            '<button class="gq-tab" onclick="gGo(' + k + ')">' + (k + 1) + '</button>').join('') + '</div>' +
          '<div class="gq-pane" id="gq-pane">' + qs.map((q, k) => match
            ? '<div class="gq gq-m" data-i="' + (s + k) + '" onclick="gPick(' + k + ')">' +
                '<div class="gm-row"><span class="gm-no">' + (k + 1) + '</span><div class="gm-stem">' + mStem(q) + stemCn(q) + '</div></div>' +
                '<div class="gm-chips">' + optionList(q).map(o =>
                  '<button class="opt chip" data-k="' + esc(o[0]) + '" onclick="gTap(this)"><span class="key">' + esc(o[0]) + '</span></button>').join('') +
                  '<span class="gm-pick"></span></div>' +
                '<div class="gq-fb"></div>' +
              '</div>'
            : '<div class="gq" data-i="' + (s + k) + '" onclick="gPick(' + k + ')">' +
              '<div class="stem">' + (k + 1) + '/' + qs.length + '、' + rich(q.stem.replace(/^第\d+篇\s*/, '')) +
                (q.type === 'multi' ? '（多选）' : '') + '</div>' + stemCn(q) +
              (q.type === 'judge'
                ? '<div class="judge-row">' + optionList(q).map(o =>
                  '<button class="opt" data-k="' + esc(o[0]) + '" onclick="gTap(this)"><span class="key">' + (o[0] === '对' ? '✓' : '✗') + '</span><span>' + esc(o[1]) + '</span></button>').join('') + '</div>'
                // 选项都很短（完形、补全对话常见）就横着排几列
                : '<div class="opts' + (short(q) ? ' opts-short" style="--ow:' + colW(q) + 'px' : '') + '">' + optionList(q).map((o, i) =>
                  '<button class="opt" data-k="' + esc(o[0]) + '" onclick="gTap(this)"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + optCn(q, i) + '</span></button>').join('') + '</div>') +
              '<div class="gq-fb"></div>' +
            '</div>').join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="qactions" id="qact">' + prevBtn(p).replace('上一题', '上一篇') + '<span class="muted kbd-tip" id="g-left"></span><div class="spacer"></div>' +
        '<button class="btn" id="confirm-btn" disabled onclick="submitGroup()">提交本篇</button></div>' +
      '<div class="msg-bar" id="pstats">' + statsHtml(p) + '</div>' +
    '</div>';
  gSwipe($('#gq-pane'));
  if (qs.every((_, k) => p.done[s + k])) {      // 回看做过的篇：显示当时的作答和解析，不再记分
    $$('.gq').forEach(div => {
      const sel = p.done[+div.dataset.i];
      Array.from(div.querySelectorAll('.opt')).forEach(b => { if (sel.indexOf(b.dataset.k) >= 0) b.classList.add('sel'); });
    });
    gradeGroup(true);
  } else {
    gGo(0);
    groupLeft();
  }
  fitOpts();
}

// 电脑宽屏：左右分栏，小题全部列出（和 style.css 里 .g-wrap 的断点一致）
function gSplit() { return window.matchMedia('(min-width: 761px)').matches; }
// 在框里滚到某个元素（只滚这个框，不带着整页动）；看得全就不滚，除非 always
function scrollInBox(box, el, pad, always) {
  if (!box || !el) return;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (!always && r.top >= b.top && r.bottom <= b.bottom) return;
  box.scrollTop = Math.max(0, box.scrollTop + r.top - b.top - pad);
}

// 切到第 k 道小题（noScroll：电脑上直接点在这道题上，不用再滚）
function gGo(k, noScroll) {
  const p = state.practice;
  if (!p || !p.group) return;
  const divs = $$('.gq'), tabs = $$('.gq-tab');
  if (k < 0 || k >= divs.length) return;
  p.group.cur = k;
  divs.forEach((d, i) => d.classList.toggle('cur', i === k));
  tabs.forEach((t, i) => t.classList.toggle('cur', i === k));
  fitOpts();
  hlBlank($('.g-orig'), p.list[+divs[k].dataset.i], true);
  if (gSplit() && !noScroll) scrollInBox($('#gq-pane'), divs[k], 8, true);
  if (p.answered) {                 // 判完以后：材料里只标黄这道小题的原文依据，并滚到那里
    clearEvidence();
    const q = p.list[+divs[k].dataset.i];
    markEvidence(q);
    const box = $('.g-mat .g-orig');
    scrollInBox(box, box && box.querySelector('mark.evidence'), 40);
  }
}
// 并排的短选项：上面按字数估的列宽不一定够（手机字体调大、字母宽），单词会被从中间截断（用户：一个单词还要换行，很难看）。
// 看得见的这几组量一下：放不下就把列宽加到正好放得下，一行一个都放不下就改回一行一个
function fitOpts() {
  $$('.opts-short').forEach(box => {
    if (!box.offsetWidth) return;                  // 手机上没切到的小题是隐藏的，切过去时再量
    const opts = Array.from(box.querySelectorAll('.opt'));
    const need = Math.max.apply(null, opts.map(o => o.scrollWidth));
    if (opts.every(o => o.scrollWidth <= o.clientWidth + 1)) return;
    if (need > box.clientWidth) box.classList.remove('opts-short');
    else box.style.setProperty('--ow', Math.ceil(need) + 'px');
  });
}
// 电脑上点到某道小题上（选项或题干）：它就是当前这道
function gPick(k) {
  const p = state.practice;
  if (p && p.group && p.group.cur !== k && gSplit()) gGo(k, true);
}

function clearEvidence() {
  $$('.qcard-main mark.evidence').forEach(m => {
    const par = m.parentNode;
    while (m.firstChild) par.insertBefore(m.firstChild, m);
    par.removeChild(m);
    par.normalize();
  });
}

// 左右滑动切换小题（竖着滑照常滚动）
function gSwipe(el) {
  if (!el) return;
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) gGo(state.practice.group.cur + (dx < 0 ? 1 : -1));
  });
}

function groupLeft() {
  const p = state.practice;
  const divs = $$('.gq'), tabs = $$('.gq-tab');
  const picked = divs.map(div => !!div.querySelector('.opt.sel'));
  if ($('.g-match')) {
    const used = {};
    divs.forEach(div => { const b = div.querySelector('.opt.sel'); if (b) used[b.dataset.k] = 1; });
    divs.forEach(div => {
      const b = div.querySelector('.opt.sel'), q = p.list[+div.dataset.i];
      div.querySelectorAll('.opt.chip').forEach(c => c.classList.toggle('used', !!used[c.dataset.k] && c !== b));
      const o = b && optionList(q).find(x => x[0] === b.dataset.k);
      const cn = o && ((q.options_cn || [])[optionList(q).indexOf(o)] || '').replace(/[（(【].*$/, '');
      div.querySelector('.gm-pick').innerHTML = !o ? '' : /见材料/.test(o[1] || '') ? esc(cn) : rich(o[1]);   // 书面表达的选项在图里：显示中文意思
    });
  }
  // 完形：选好的词直接填进原文的空里（学习通也是这样），读一遍就知道通不通
  const orig = $('.g-orig');
  if (orig) divs.forEach(div => {
    const q = p.list[+div.dataset.i], n = blankNo(q);
    const b = n && orig.querySelector('.blank[data-b="' + n + '"]');
    if (!b) return;
    if (!b.dataset.o) b.dataset.o = b.textContent;
    const s = div.querySelector('.opt.sel'), o = s && optionList(q).find(x => x[0] === s.dataset.k);
    b.classList.toggle('filled', !!o);
    b.innerHTML = o ? '<i>' + n + '</i>' + esc(o[1]) : esc(b.dataset.o);
  });
  picked.forEach((x, i) => tabs[i] && tabs[i].classList.toggle('picked', x));
  const n = divs.length, got = picked.filter(Boolean).length;
  const tip = $('#g-left');
  if (tip) tip.textContent = got < n ? '已选 ' + got + '/' + n + ' 题，' + ($('.g-match') ? '' : TOUCH ? '左右滑动或点题号切换，' : '点题号或按 ← → 切换，') + '全部选完再提交'
                                     : '都选好了，' + (TOUCH ? '点「提交本篇」' : '点「提交本篇」或按回车');
  const ok = $('#confirm-btn');
  if (ok) ok.disabled = got < n;
  return picked;
}

function gTap(btn) {
  const p = state.practice;
  if (!p || p.answered) return;
  const div = btn.closest('.gq');
  const k = $$('.gq').indexOf(div);              // 点的是第几道（电脑上点之前 p.group.cur 可能还是别的题）
  const multi = p.list[+div.dataset.i].type === 'multi';
  const first = !div.querySelector('.opt.sel');  // 这道题是不是第一次选
  if (multi) btn.classList.toggle('sel');
  else Array.from(div.querySelectorAll('.opt')).forEach(b => b.classList.toggle('sel', b === btn));
  const picked = groupLeft();
  // 电脑上小题都列在右边，不自动跳（用户：点着点着瞬移到下一题不对），点到哪道哪道就是当前题；
  // 手机上一次只显示一道：单选第一次选好才跳到下一道没选的，改答案不跳
  if (gSplit()) { if (p.group.cur !== k) gGo(k, true); return; }
  if (multi || !first) return;
  // 单选选好了：稍停一下跳到后面第一道还没选的小题（都选完了就停在这里）
  let nk = -1;
  for (let i = 1; i < picked.length && nk < 0; i++) { const j = (k + i) % picked.length; if (!picked[j]) nk = j; }
  if (nk >= 0) setTimeout(() => { if (state.practice === p && !p.answered && p.group.cur === k) gGo(nk); }, 280);
}

function submitGroup() {
  const p = state.practice;
  if (!p || p.answered || !p.group) return;
  const divs = $$('.gq');
  const miss = divs.findIndex(div => !div.querySelector('.opt.sel'));
  if (miss >= 0) { gGo(miss); groupLeft(); toast('还有题没选'); return; }
  divs.forEach(div => { p.done[+div.dataset.i] = Array.from(div.querySelectorAll('.opt.sel')).map(b => b.dataset.k); });
  gradeGroup(false);
}

function gradeGroup(replay) {
  const p = state.practice;
  const divs = $$('.gq'), tabs = $$('.gq-tab');
  const n = divs.length;
  p.answered = true;
  $('.qcard-main').classList.add('answered');
  let right = 0, firstBad = -1;
  const bad = [];
  divs.forEach((div, k) => {
    const i = +div.dataset.i, q = p.list[i], sel = p.done[i];
    const ans = q.type === 'multi' ? q.answer.split('') : [q.answer];
    const ok = q.type === 'multi' ? sel.slice().sort().join('') === ans.slice().sort().join('') : sel[0] === q.answer;
    if (ok) right++;
    else if (firstBad < 0) firstBad = k;
    if (!replay) recordResult(q, ok, true);
    if (!ok) bad.push(q);
    Array.from(div.querySelectorAll('.opt')).forEach(b => {
      b.disabled = true;
      if (ans.indexOf(b.dataset.k) >= 0) b.classList.add('ok');
      else if (sel.indexOf(b.dataset.k) >= 0) b.classList.add('bad');
    });
    if (tabs[k]) tabs[k].classList.add(ok ? 'ok' : 'bad');
    const bl = blankNo(q) && $('.g-orig .blank[data-b="' + blankNo(q) + '"]');   // 完形原文里填的词按对错上色
    if (bl) bl.classList.add(ok ? 'ok' : 'bad');
    div.querySelector('.gq-fb').innerHTML = '<div class="feedback ' + (ok ? 'good' : 'bad') + '">' +
      '<div class="ans-line">' + (ok ? '✓ 答对了' : '✗ 答错了') + '<span class="ans-key">正确答案 <b>' + esc(q.answer) + '</b></span></div>' +
      (ok ? rightBox(q) : whyBox(q, sel)) +
      (q.analysis ? '<div class="analysis">' + rich(q.analysis) + '</div>' +
        (q.shuffled && !q.anaMapped && /[A-F]/.test(q.analysis) ? '<div class="muted">选项已打乱，解析里提到的字母是原卷的顺序</div>' : '') : '') +
      evidenceBox(q) + pointBox(q) + phraseBox(q) + '</div>';
  });
  if (!replay) {
    requeueWrong(bad);
    autoSave();
    toast('本篇 ' + n + ' 题，答对 ' + right + ' 题', right === n ? 'good' : '');
  }
  $('#qact').innerHTML = prevBtn(p).replace('上一题', '上一篇') + '<span class="muted kbd-tip">本篇答对 ' + right + '/' + n + ' 题' + ($('.g-match') ? '，解析在每题下面' : '，点题号看每题的解析') + '</span><div class="spacer"></div>' +
    '<button class="btn" id="nextbtn" onclick="nextQ()">' + (p.group.e >= p.list.length ? '查看结果' : '下一篇') + '</button>';
  cnAfterAnswer();
  gGo(firstBad >= 0 ? firstBad : 0);     // 先看第一道做错的
}

// 整篇卡片的键盘：← → 切小题，1-6 / A-F 给当前小题选选项，回车提交 / 下一篇
function groupKey2(e) {
  const p = state.practice, g = p.group;
  if (e.key === 'ArrowLeft') return gGo(g.cur - 1);
  if (e.key === 'ArrowRight') return gGo(g.cur + 1);
  if (e.key === 'Enter') { e.preventDefault(); return p.answered ? nextQ() : submitGroup(); }
  if (p.answered) return;
  const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
  const i = map[e.key.toLowerCase()];
  const div = $$('.gq')[g.cur];
  const btn = i === undefined || !div ? null : div.querySelectorAll('.opt')[i];
  if (btn) gTap(btn);
}

function renderQ() {
  const p = state.practice;
  const q = p.list[p.idx];
  if (unitEnd(p, p.idx) - p.idx > 1) return renderGroup();
  p.group = null;
  if (p.shownIdx !== p.idx) { p.shownIdx = p.idx; p.shownAt = Date.now(); }   // 换到新题的时间（optTap 防误触用）
  const opts = optionList(q);
  const pct = Math.round(100 * p.idx / p.list.length);
  app.innerHTML =
    '<div class="crumb crumb-row"><span class="crumb-t"><span class="crumb-pre">当前位置：</span><a href="#/home">首页</a> &gt; ' + esc(p.title) + '</span>' +
      '<span class="crumb-acts">' +
        (p.saveKey ? '<a href="javascript:void(0)" onclick="saveProgress()">存档</a>' +
          (store.get(p.saveKey) ? '<a href="javascript:void(0)" onclick="loadSave(' + jsq(p.saveKey) + ')">读档</a>' : '') : '') +
        '<a class="crumb-exit" href="javascript:void(0)" onclick="quitPractice()">退出练习</a></span></div>' +
    '<div class="pbar-wrap"><div class="pbar"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="card qcard-main">' +
      '<div class="qhead">' +
        '<span class="tag t-' + q.type + '">' + (TYPE_NAME[q.cat] || TYPE_NAME[q.type]) + '</span>' +
        '<span class="qsrc">' + esc(q.paper_name) + ' 第' + q.qno + '题</span>' +
        (q.extra ? extraBadge(q) : hintOn() ? recBadge(q) : '') +
        '<span class="spacer"></span>' + cnBtn(q) + aiBtn(q) +
      '</div>' +
      materialBox(q) +
      // 完形的一个空单独出来（错题再考）：不写“2/10、第1篇 第7空”（进度和空号放一起容易看混），直接说原文第几空、标黄了
      (blankNo(q) && q.material && /_{2,}\s*\d+\s*_{2,}/.test(q.material)
        ? '<div class="stem">原文第 ' + blankNo(q) + ' 空<span class="blank-tip">上面黄色标出的那一空</span></div>'
        : '<div class="stem">' + unitNo(p) + '、' + rich(q.stem) + '</div>') + stemCn(q) +
      '<div id="qbody"></div>' +
      '<div class="msg-bar" id="pstats">' + statsHtml(p) + '</div>' +
    '</div>';

  hlBlank($('.qcard-main'), q, true);
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
          '<button class="opt" data-k="' + esc(o[0]) + '" onclick="optTap(this)"><span class="key">' + (o[0] === '对' ? '✓' : '✗') + '</span><span>' + esc(o[1]) + '</span></button>').join('') + '</div>'
        : '<div class="opts" id="optsbox">' + opts.map((o, i) =>
          '<button class="opt" data-k="' + esc(o[0]) + '" onclick="optTap(this)"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + optCn(q, i) + '</span></button>').join('') + '</div>') +
      '<div class="qactions" id="qact">' + prevBtn(p) + '<span class="muted kbd-tip">' + (multi ? '多选题，可选多项。' : '') + (TOUCH ? '双击选项直接确认' : '双击选项或按回车确认') + '</span><div class="spacer"></div>' +
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

// 双击（手机上双击、电脑上双击鼠标）一个选项 = 选中并确认；确认以后点绿色的正确答案 = 下一题。
// 电脑上回车、「确认答案」「下一题」按钮照样能用
const TOUCH = IS_APP || !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);
let lastTap = { btn: null, t: 0 };
function optTap(btn) {
  const p = state.practice;
  if (!p) return;
  if (p.answered) {
    // 只有点绿色的正确答案才进下一题。判完 0.6 秒内不算：双击确认时手快多点了一下，不会连解析都没看就跳到下一题
    if (btn.classList.contains('ok') && Date.now() - (p.gradedAt || 0) > 250) nextQ();
    return;
  }
  const now = Date.now();
  // 新题刚出来 0.6 秒内点选项不算：点正确答案翻页时手指多点了一下，不会直接点到下一题的选项上
  if (now - (p.shownAt || 0) < 600) { lastTap = { btn: null, t: 0 }; return; }
  // 双击确认只给单选、判断用；多选要一个个点，双击容易误触，只能按「确认答案」或回车（用户）
  const dbl = lastTap.btn === btn && now - lastTap.t < 400 && p.list[p.idx].type !== 'multi';
  lastTap = { btn: dbl ? null : btn, t: now };
  if (!dbl) return pickOpt(btn);
  btn.classList.add('sel');                       // 双击的第二下：不再切换（多选题第一下可能刚好取消了它），直接确认
  confirmChoice();
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


function recordResult(q, ok, quiet) {
  const p = state.practice;
  p.results.push({ q: q, correct: ok });
  if (ok) p.correct++;
  const st = $('#pstats');
  if (st) st.innerHTML = statsHtml(p);
  if (!ok && !quiet) requeueWrong([q]);           // 整篇的小题由 gradeGroup 一起排
  api('/api/record', { method: 'POST', body: { question_id: q.id, correct: ok, mode: p.mode } })
    .then(d => {
      if (quiet) return;
      if (d.event === 'released') toast('连续答对 ' + MASTER_STREAK + ' 次，这道错题已消灭', 'good');
      else if (d.event === 'entered') toast('已加入错题本');
    })
    .catch(e => toast('记录失败：' + e.message, 'bad'));
}

// 做错的题过随机 3～6 题（篇）再出一次（至少隔 AGAIN_MIN_BETWEEN 题，不够就不出），选项重新打乱；整篇里错的几道小题放在一起，带着材料成一篇。
// 关掉「做错的题稍后再出」以后，只有今日复习还像以前一样再来一次
function requeueWrong(qs) {
  const p = state.practice;
  if (!p || !qs.length || (!againOn() && p.mode !== 'review')) return;
  const max = againOn() ? AGAIN_MAX : 1;
  const go = qs.filter(q => (p.requeued[q.id] || 0) < max);
  if (!go.length) return;
  const gap = againGap();
  let at = unitEnd(p, p.idx), k = 0;
  while (k < gap && at < p.list.length) { at = unitEnd(p, at); k++; }
  if (k < AGAIN_MIN_BETWEEN) return;               // 后面剩的题太少，再出就是紧挨着了：不出
  go.forEach(q => { p.requeued[q.id] = (p.requeued[q.id] || 0) + 1; });
  p.list.splice.apply(p.list, [at, 0].concat(go.map(q => extraCopy(q, 'again'))));
}

function gradeAndShow(selKeys, replay) {
  const p = state.practice;
  const q = p.list[p.idx];
  const isRight = q.type === 'multi'
    ? selKeys.slice().sort().join('') === q.answer.split('').sort().join('')
    : selKeys[0] === q.answer;
  p.answered = true;
  p.gradedAt = lastTap.btn === null && Date.now() - lastTap.t < 50 ? Date.now() : 0;   // 双击确认的那一下：250ms 内再点不算翻页
  $('.qcard-main').classList.add('answered');
  if (!replay) {
    p.done[p.idx] = selKeys.slice();
    recordResult(q, isRight);
    autoSave();
  }

  $$('#qbody .opt').forEach(b => {
    const k = b.dataset.k;
    const inAns = q.type === 'multi' ? q.answer.indexOf(k) >= 0 : k === q.answer;
    b.disabled = !inAns;                         // 正确答案还能点，点它进入下一题
    if (inAns) b.classList.add('ok');
    else if (selKeys.indexOf(k) >= 0) b.classList.add('bad');
  });

  const fb = document.createElement('div');
  fb.className = 'feedback ' + (isRight ? 'good' : 'bad');
  fb.innerHTML = '<div class="ans-line">' + (isRight ? '✓ 答对了' : '✗ 答错了') +
    '<span class="ans-key">正确答案 <b>' + esc(q.answer) + '</b></span></div>' +
    (isRight ? rightBox(q) : whyBox(q, selKeys)) +
    (q.analysis ? '<div class="analysis">' + (isRight ? '' : '<b>怎么解：</b>') + rich(q.analysis) + '</div>' +
      (q.shuffled && !q.anaMapped && /[A-F]/.test(q.analysis) ? '<div class="muted">选项已打乱，解析里提到的字母是原卷的顺序</div>' : '') : '') +
    evidenceBox(q) + pointBox(q) + phraseBox(q);
  $('#qbody').insertBefore(fb, $('#qact'));
  markEvidence(q);
  cnAfterAnswer();

  $('#qact').innerHTML = nextActions(p);
}

// 答完以后的按钮：上一题 / 下一题（或查看结果）
function nextActions(p) {
  return prevBtn(p) + '<span class="muted kbd-tip">' + (TOUCH ? '点绿色的正确答案也能下一题' : '点绿色的正确答案或按回车 = 下一题') + '</span><div class="spacer"></div>' +
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
  cnAfterAnswer();
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
  p.answered = true;
  autoSave();
  nextQ();
}

function nextQ() {
  const p = state.practice;
  if (!p) return;
  if (!p.answered && !p.done[p.idx]) return;     // 还没作答，不能跳过去
  p.answered = false;
  p.idx = unitEnd(p, p.idx);
  if (p.idx >= p.list.length) p.finished = true;
  route();
}

function prevQ() {
  const p = state.practice;
  if (!p || p.idx <= 0) return;
  p.answered = false;
  p.idx = unitStart(p, p.idx - 1);
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
        (p.mode === 'practice' ? '<button class="btn ghost" onclick="beginPractice(state.practice.list.filter(q=>!q.extra),state.practice.title,\'practice\')">再做一遍</button>' : '') +
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
            '<div class="qhead"><span class="tag t-' + q.type + '">' + (TYPE_NAME[q.cat] || TYPE_NAME[q.type]) + '</span>' +
            '<span class="qsrc">' + esc(q.paper_name || '') + ' · 第' + q.qno + '题</span><span class="spacer"></span>' + cnBtn(q) + aiBtn(q) + '</div>' +
            materialBox(q, true) +
            '<div class="stem">' + rich(q.stem) + '</div>' + stemCn(q) +
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

// 考试模式（做完再判，用户要求：像学习通考试，不是做一题判一题）：把这张卷子 / 这个题型的题按顺序做成一场不限时的考试，
// 用的是模拟考试那一套（答题卡、交卷、成绩报告、做错进错题本）
async function startScopeExam(src, name, shuffle) {
  if (store.get('quiz.exam') && !confirm('还有一场没交卷的考试，放弃它并开始新的？')) return;
  let d;
  try {
    const items = await exportQs(practiceSrc(src));
    d = await api('/api/exam/start', { method: 'POST', body: { keys: items.map(q => q.key), title: name + ' · 考试', shuffle: !!shuffle } });
  } catch (e) { toast(e.message, 'bad'); return; }
  store.set('quiz.exam', { exam: d.exam, answers: {}, startedAt: Date.now(), deadline: 0 });     // deadline 0 = 不限时
  location.hash = '#/exam/run';
}

function abandonExam() {
  if (!confirm('放弃这场考试？作答不会被记录。')) return;
  store.del('quiz.exam');
  route();
}

// 考试里的材料：去掉题库里的“第N组 / 第N篇”编号（在这张卷子里没意义）
function examMat(q) {
  return materialBox(Object.assign({}, q, { material: q.material.replace(/^第\d+[组篇]\s*/, '') }));
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
    e.sections.map((sec, si) => {
      let lastMat = null;
      // 和老师在学习通上组的卷子一样：「一、单选题（共 35 题，35 分）」，共用一段材料的一组算一道题
      const groups = new Set(sec.items.map(q => q.material ? 'm' + q.material : 'q' + q.id)).size;
      const total = Math.round(sec.items.length * (sec.points || 1) * 10) / 10;
      return '<div class="sec-title">' + '一二三四五六七八九十'.charAt(si) + '、' + esc(sec.name) +
        '<span class="muted">（共 ' + groups + ' 题，' + fmtPts(total) + ' 分' +
        (groups !== sec.items.length ? '，' + sec.items.length + ' 个空 / 小题' : '') +
        (sec.points && sec.points !== 1 ? '，每小题 ' + fmtPts(sec.points) + ' 分' : '') + '）</span></div>' +
        sec.items.map((q, qi) => {
          n++;
          allItems.push({ q: q, n: n });
          const first = q.material && q.material !== lastMat;
          lastMat = q.material;
          const opts = optionList(q);
          // 排序、连线这种一组题共用同一套 A～E：像老师卷一样，选项只列一次，每个空一行字母
          const grp = q.material ? sec.items.filter(x => x.material === q.material) : [q];
          const shared = grp.length > 1 && opts.length >= 5 &&
            grp.every(x => JSON.stringify(optionList(x)) === JSON.stringify(opts));
          if (shared) {
            const inPic = opts.every(o => /见材料/.test(o[1]));       // 选项在材料的图里，不再列一遍
            return (first ? examMat(q) + (inPic ? '' : '<div class="card exam-optlist">' + opts.map(o =>
                '<div class="exam-optline"><b>' + esc(o[0]) + '.</b> ' + rich(o[1]) + '</div>').join('') + '</div>') : '') +
              '<div class="card exam-q exam-q-mini" id="eq' + q.id + '">' +
                '<span class="qno">' + n + '</span><span class="exam-blank">' + esc(q.stem.replace(/^第\d+组\s*/, '')) + '</span>' +
                '<span class="mini-opts">' + opts.map(o =>
                  '<button class="opt mini" data-q="' + q.id + '" data-k="' + esc(o[0]) + '" onclick="examPick(' + q.id + ',\'' + esc(o[0]) + '\',false)">' + esc(o[0]) + '</button>').join('') +
                '</span></div>';
          }
          const mat = first ? examMat(q) : '';
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
    const el = $('#timer');
    if (!el) { stopExamTimer(); return; }
    if (!s.deadline) {                     // 不限时（考试模式）：显示已经用了多久
      const used = Math.round((Date.now() - s.startedAt) / 1000);
      el.textContent = '用时 ' + String(Math.floor(used / 60)).padStart(2, '0') + ':' + String(used % 60).padStart(2, '0');
      return;
    }
    const left = Math.max(0, Math.round((s.deadline - Date.now()) / 1000));
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
    const used = Math.round(((st.deadline ? Math.min(Date.now(), st.deadline) : Date.now()) - st.startedAt) / 1000);
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
      '<div class="muted">答对 ' + e.correct + '/' + e.total + ' · 用时 ' + fmtDur(e.used_seconds) + (e.minutes ? '(限时 ' + e.minutes + ' 分钟)' : '（不限时）') + ' · ' + esc(e.finished) + '</div>' +
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
          '<div class="qhead"><span class="tag t-' + q.type + '">' + (TYPE_NAME[q.cat] || TYPE_NAME[q.type]) + '</span>' +
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
  if (location.hash === '#/recite') return reciteKey(e);
  const p = state.practice;
  if (!p || location.hash !== '#/practice' || p.finished) return;
  const q = p.list[p.idx];
  if (!q) return;
  // 焦点在可交互控件上时交给控件自身(避免回车双触发/输入误触)
  const t = e.target;
  const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
  // 选项按钮、整篇卡片的题号按钮点过以后焦点会停在上面，← → 和回车照样走「切换 / 确认 / 下一题」，所以它们不算
  // （回车由下面 preventDefault 拦住，不会再点一次题号）
  const interactive = (tag === 'input' || tag === 'textarea' || tag === 'select' ||
                      (tag === 'button' && !t.disabled && !t.classList.contains('opt') && !t.classList.contains('gq-tab')));
  if (interactive) return;
  if (p.group) return groupKey2(e);
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

/* ================================================================ 背题模式
   不用选，直接看“题目 + 答案内容”，记住答案本身（老师打乱选项也不怕）。
   单选把正确答案填进句子；完形、补全对话把整篇的空都填好；配对题一问一答列出来；阅读题列出问题和答案、原文依据标黄。
   顶部可切换：答案直接显示 / 先盖住点一下再看。每张卡片点「记住了 / 没记住」，记一次作答（mode=recite），没记住的进复习和错题本。
   共用一段材料的题（一篇阅读、一篇完形、一组配对）是一张卡片。 */

routes.recite = viewRecite;
const RC_BLANK = /_{2,}|＿{2,}|（\s*▲\s*）|\(\s*▲\s*\)/;
const RC_A = '\u0001', RC_B = '\u0002';            // 填进去的答案先用这两个控制字符包起来，rich() 之后再换成高亮

function rcHide() { return !!store.get('zx.recite.hide'); }
function rcMark(s) { return s.split(RC_A).join('<b class="rc-ans">').split(RC_B).join('</b>'); }
function rcAnsTexts(q) {
  if (q.type === 'judge') return [q.answer];
  return optionList(q).filter(o => (q.answer || '').indexOf(o[0]) >= 0).map(o => o[1]);
}
function rcAnsLabel(q) {
  // 答案的“内容”：选项文字；选项文字在材料图里（“见材料”）的，用中文释义
  return optionList(q).filter(o => (q.answer || '').indexOf(o[0]) >= 0).map(o => {
    const i = optionList(q).indexOf(o);
    if (/见材料/.test(o[1])) return (q.options_cn && q.options_cn[i] && cnForm(q.options_cn[i])) || o[1];
    return o[1];
  }).join('；') || q.answer;
}
// 单选：把答案填进题干的空里（“A; B”两空的按顺序填）。填不进去返回 null
function rcFillStem(q) {
  if (q.type !== 'single' || !RC_BLANK.test(q.stem)) return null;
  const t = rcAnsTexts(q)[0];
  if (!t || /见材料/.test(t)) return null;
  const parts = t.split(/\s*[;；]\s*/);
  let i = 0;
  const s = q.stem.replace(new RegExp(RC_BLANK.source, 'g'), (m, at, str) =>
    (i < parts.length ? rcPad(str, at, m.length, RC_A + parts[i++] + RC_B) : m));
  return i ? s : null;
}
// 填进去的词和前后英文之间补空格（原题的空常常紧贴着后面的词：“____failing”）
function rcPad(str, at, len, text) {
  const before = str[at - 1] || '', after = str[at + len] || '';
  return (/[A-Za-z0-9,.;:!?'"’)]/.test(before) ? ' ' : '') + text + (/[A-Za-z0-9('"‘]/.test(after) ? ' ' : '');
}

// 导出 Word（static/word.js 生成 .docx），只在电脑上有，直接下载
const exportSec = q => q.section || TYPE_NAME[q.cat] || TYPE_NAME[q.type] || '题目';
const fileSafe = s => String(s).replace(/[\\/:*?"<>|]/g, '');
function exportQs(src, scope) {
  return api('/api/practice?paper_id=' + (src.paper_id || 0) + '&scope=' + (scope || 'all') + '&order=seq' +
    (src.subject ? '&subject=' + encodeURIComponent(src.subject) : '') + (src.type ? '&type=' + encodeURIComponent(src.type) : ''))
    .then(d => d.items);
}
function saveBlob(blob, fname) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}

// 多张卷子一起导出：搜索 / 按科目勾卷子，可以只要某几种题型、只要错题本里的题；
// 空白卷 / 答案卷 / 两种都要，合成一个 Word 或每张一个（不止一个文件就打包成 zip）。
// 上次选的导出内容、文件方式记在本机 localStorage quiz.export（只图方便，不同步）
function exportPrefs() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem('quiz.export') || 'null'); } catch (e) { /* 读不了就用默认 */ }
  return Object.assign({ kind: 'blank', split: false }, o || {});
}
/* ---- 导入 / 导出（用户要求 2026-10-21：导出统一放到左边栏，和导入合在一起，别处不再放导出入口）----
   左边栏「导入 / 导出」→ 上面两个大标签切换：#/upload 导入试卷（导入整理台），#/export 导出 Word（多张卷子一起导出）。 */
function ioTabs(cur) {
  const tab = (k, href, ic, t, d) => '<a class="io-tab' + (cur === k ? ' on' : '') + '" href="' + href + '">' +
    '<span class="io-ic">' + icon(ic) + '</span><span><b>' + t + '</b><small>' + d + '</small></span></a>';
  return '<div class="io-head">' +
    tab('upload', '#/upload', 'upload', '导入试卷', '拖进 Word / 粘贴文字，自动识别成题库') +
    tab('export', '#/export', 'download', '导出 Word', '空白卷、答案卷，多张卷子一起导出') +
  '</div>';
}

async function viewExport() {
  if (IS_APP) { app.innerHTML = '<div class="empty">导出 Word 只在电脑版上有</div>'; return; }
  app.innerHTML = ioTabs('export') + '<div id="xp-host"><div class="empty">加载中…</div></div>';
  openExportSheet(null, $('#xp-host'));
}

// host：渲染进页面（导入 / 导出页）；不给就是弹窗
async function openExportSheet(pre, host) {
  let papers, subjects;
  try {
    await loadHidden();
    papers = (await api('/api/papers')).papers.filter(p => !isHidden(p.subject));
    subjects = (await api('/api/dashboard')).data.subjects;
  } catch (e) { toast(e.message, 'bad'); return; }
  if (!papers.length) { toast('没有卷子可以导出'); return; }
  const pf = exportPrefs();
  const sel = {}, offTypes = {};          // offTypes：不要的题型（默认全要）
  let q = '', wrongOnly = false;
  (pre || []).forEach(k => { sel[k] = 1; });
  const subjs = [];
  papers.forEach(p => { if (subjs.indexOf(p.subject) < 0) subjs.push(p.subject); });
  // 科目胶囊只是筛选列表（和首页一样），勾选靠复选框；带着预选进来时先筛到那一科
  const preSj = papers.filter(p => sel[p.key]).map(p => p.subject);
  let fsj = preSj.length && preSj.every(x => x === preSj[0]) ? preSj[0] : '';
  const typesOf = sj => ((subjects.find(s => s.subject === sj) || {}).types || []).map(t => t.type);
  const seg = (name, cur, opts) => '<div class="xp-seg" data-name="' + name + '">' + opts.map(o =>
    '<button class="pill-tab' + (cur === o[0] ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
  const sheet = document.createElement('div');
  sheet.className = host ? 'xp-page-wrap' : 'sheet-mask';
  sheet.innerHTML =
    '<div class="' + (host ? 'card xp xp-page' : 'sheet xp') + '" role="' + (host ? 'region' : 'dialog') + '">' +
      (host ? '' : '<div class="sheet-h"><b>导出 Word</b><button class="sheet-x" aria-label="关闭">×</button></div>') +
      '<div class="xp-body"><div class="xp-left">' +
        '<div class="sheet-t xp-t"><span>选卷子<span class="xp-n"></span></span>' +
          '<span class="xp-links"><a href="javascript:void(0)" data-all="1">全选列表里的</a><a href="javascript:void(0)" data-all="0">清空</a></span></div>' +
        '<div class="xp-subjs">' + [''].concat(subjs).map(sj => '<button class="pill-tab' + (sj === fsj ? ' on' : '') + '" data-sj="' + esc(sj) + '">' +
          esc(sj ? SUBJECT_NAME[sj] || sj : '全部') + '</button>').join('') + '</div>' +
        '<label class="search-pill xp-q">' + icon('search') + '<input placeholder="搜索卷子，比如 练习卷、模拟、(3)"></label>' +
        '<div class="xp-list"></div>' +
      '</div><div class="xp-right">' +
        '<div class="sheet-t">题型</div>' +
        '<div class="sheet-d xp-td">默认全要，点掉不要的。</div>' +
        '<div class="xp-chks xp-types"></div>' +
        '<div class="sheet-t xp-gap">范围</div>' +
        '<div class="xp-seg xp-scope"></div>' +
        '<div class="sheet-t xp-gap">导出内容</div>' +
        '<div class="sheet-d">答案卷用红字标答案，每张卷子后面附答案速查（不带解析）。</div>' +
        seg('kind', pf.kind, [['blank', '空白卷'], ['ans', '答案卷'], ['both', '两种都要']]) +
        '<div class="sheet-t xp-gap">文件</div>' +
        '<div class="sheet-d">合成一个：每张卷子另起一页，题号各自从 1 开始。不止一个文件时打包成 zip。</div>' +
        seg('split', pf.split ? '1' : '0', [['0', '合成一个 Word'], ['1', '每张卷子一个 Word']]) +
        '<button class="btn block xp-go"></button>' +
      '</div></div>' +
    '</div>';
  const $s = s => sheet.querySelector(s);
  const visible = () => papers.filter(p => (!fsj || p.subject === fsj) &&
                                           (!q || p.name.indexOf(q) >= 0 || (SUBJECT_NAME[p.subject] || '').indexOf(q) >= 0));
  const picked = () => papers.filter(p => sel[p.key]);
  const pickedTypes = () => {           // 选中的卷子所在科目的题型（英语按细分题型）
    const out = [];
    picked().forEach(p => typesOf(p.subject).forEach(t => { if (out.indexOf(t) < 0) out.push(t); }));
    return out;
  };
  const drawList = () => {
    const vs = visible();
    $s('.xp-list').innerHTML = subjs.map(sj => {
      const ps = vs.filter(p => p.subject === sj);
      if (!ps.length) return '';
      const n = ps.filter(p => sel[p.key]).length;
      return '<label class="xp-subj"><input type="checkbox" data-subj="' + esc(sj) + '"' + (n === ps.length ? ' checked' : '') + '>' +
        esc(SUBJECT_NAME[sj] || sj) + '</label>' +
        ps.map(p => '<label class="xp-item"><input type="checkbox" data-key="' + esc(p.key) + '"' + (sel[p.key] ? ' checked' : '') + '>' +
          '<span class="xp-name">' + esc(p.name) + '</span>' + (p.wrong_open ? '<span class="xp-w">错 ' + p.wrong_open + '</span>' : '') +
          '<span class="xp-c">' + p.total + ' 题</span></label>').join('');
    }).join('') || '<div class="empty">没有符合条件的卷子</div>';
    Array.from(sheet.querySelectorAll('input[data-subj]')).forEach(b => {
      const ps = vs.filter(p => p.subject === b.dataset.subj), n = ps.filter(p => sel[p.key]).length;
      b.indeterminate = n > 0 && n < ps.length;
    });
  };
  const refresh = () => {
    drawList();
    Array.from(sheet.querySelectorAll('[data-sj]')).forEach(b => b.classList.toggle('on', b.dataset.sj === fsj));
    const ts = pickedTypes();
    $s('.xp-types').innerHTML = ts.length ? ts.map(t => '<button class="xp-chk' + (offTypes[t] ? '' : ' on') + '" data-t="' + esc(t) + '">' +
      '<i></i>' + esc(TYPE_NAME[t] || t) + '</button>').join('') : '<span class="muted">先在左边勾卷子</span>';
    $s('.xp-td').style.display = ts.length ? '' : 'none';
    const wn = picked().reduce((s, p) => s + (p.wrong_open || 0), 0);
    if (!wn) wrongOnly = false;                                   // 没有错题时这一项点不了
    $s('.xp-scope').innerHTML = '<button class="pill-tab' + (wrongOnly ? '' : ' on') + '" data-w="0">全部题目</button>' +
      '<button class="pill-tab' + (wrongOnly ? ' on' : '') + '" data-w="1"' + (wn ? '' : ' disabled title="选中的卷子里没有错题"') + '>只要错题本里的' +
        (picked().length ? '（' + wn + ' 题）' : '') + '</button>';
    const n = picked().length, go = $s('.xp-go');
    $s('.xp-n').textContent = n ? '（已选 ' + n + ' 张）' : '';
    const noType = ts.length && ts.every(t => offTypes[t]);
    go.disabled = !n || noType;
    go.textContent = !n ? '先在左边勾选卷子' : noType ? '至少留一种题型' : '导出（' + n + ' 张卷子）';
  };
  let busy = false;
  const close = () => { if (!busy && !host) sheet.remove(); };
  sheet.addEventListener('change', e => {
    const b = e.target;
    if (b.dataset.key) sel[b.dataset.key] = b.checked ? 1 : 0;
    else if (b.dataset.subj) visible().forEach(p => { if (p.subject === b.dataset.subj) sel[p.key] = b.checked ? 1 : 0; });
    else return;
    refresh();
  });
  $s('.xp-q input').addEventListener('input', e => { q = e.target.value.trim(); drawList(); });
  sheet.addEventListener('click', async e => {
    if (e.target === sheet || e.target.closest('.sheet-x')) return close();
    const all = e.target.closest('[data-all]');                 // 全选：列表里（筛选、搜索后）看得见的；清空：全部不选
    if (all) { (+all.dataset.all ? visible() : papers).forEach(p => { sel[p.key] = +all.dataset.all; }); return refresh(); }
    const sj = e.target.closest('[data-sj]');                   // 科目胶囊：筛选列表
    if (sj) { fsj = sj.dataset.sj; return refresh(); }
    const t = e.target.closest('[data-t]');
    if (t) { offTypes[t.dataset.t] = !offTypes[t.dataset.t]; return refresh(); }
    const w = e.target.closest('[data-w]');
    if (w) { if (!w.disabled) wrongOnly = w.dataset.w === '1'; return refresh(); }
    const opt = e.target.closest('.xp-seg[data-name] .pill-tab');
    if (opt) {
      Array.from(opt.parentNode.querySelectorAll('.pill-tab')).forEach(x => x.classList.toggle('on', x === opt));
      if (opt.parentNode.dataset.name === 'kind') pf.kind = opt.dataset.v; else pf.split = opt.dataset.v === '1';
      try { localStorage.setItem('quiz.export', JSON.stringify(pf)); } catch (er) { /* 记不住也照样导出 */ }
      return;
    }
    const go = e.target.closest('.xp-go');
    if (!go || go.disabled || busy) return;
    busy = true;
    go.disabled = true;
    const types = pickedTypes().filter(x => !offTypes[x]);
    const filt = types.length === pickedTypes().length ? null : types;
    try { await exportMany(picked(), { kind: pf.kind, split: pf.split, wrong: wrongOnly, types: filt }, x => { go.textContent = x; }); busy = false; if (host) refresh(); else sheet.remove(); }
    catch (er) { busy = false; toast('导出失败：' + er.message, 'bad'); refresh(); }
  });
  if (host) { host.innerHTML = ''; host.appendChild(sheet); } else document.body.appendChild(sheet);
  refresh();
}

// o：{ kind: blank/ans/both, split, wrong: 只要错题本里的, types: 只要这些题型（null = 全要） }
async function exportMany(sel, o, say) {
  const parts = [];
  for (let i = 0; i < sel.length; i++) {
    say('正在读取题目 ' + (i + 1) + '/' + sel.length + '……');
    let qs = await exportQs({ paper_id: sel[i].id }, o.wrong ? 'wrong' : 'all');
    if (o.types) qs = qs.filter(x => o.types.some(t => typeOf(t)(x)));
    if (qs.length) parts.push({ title: sel[i].name + (o.wrong ? '·错题' : ''), qs: qs, subject: sel[i].subject });
  }
  if (!parts.length) throw new Error(o.wrong ? '选中的卷子里没有错题本里的题' : '选中的卷子里没有符合条件的题');
  const kinds = o.kind === 'both' ? [false, true] : [o.kind === 'ans'];
  const tag = ans => '（' + (ans ? '答案' : '空白卷') + '）';
  const sj = parts.every(p => p.subject === parts[0].subject) ? (SUBJECT_NAME[parts[0].subject] || '') : '';
  const base = parts.length === 1 ? parts[0].title : (sj || '智学题库') + ' ' + parts.length + ' 张卷子' + (o.wrong ? '·错题' : '');
  const files = [], used = {};
  const add = (name, blob) => {           // zip 里不能有重名文件
    const stem = fileSafe(name);
    let n = stem + '.docx', k = 2;
    while (used[n]) n = stem + '-' + (k++) + '.docx';
    used[n] = 1;
    files.push([n, blob]);
  };
  const total = kinds.length * (o.split ? parts.length : 1);
  for (const ans of kinds) {
    for (const p of (o.split ? parts : [null])) {
      say('正在生成 Word ' + (files.length + 1) + '/' + total + '……');
      if (p) add(p.title + tag(ans), await WX.build(p.title, p.qs, ans, exportSec));
      else add(base + tag(ans), await WX.buildMany(parts, ans, exportSec));
    }
  }
  let fname;
  if (files.length === 1) { fname = files[0][0]; saveBlob(files[0][1], fname); }
  else {
    say('正在打包……');
    fname = fileSafe(base + (kinds.length > 1 ? '（空白卷和答案）' : tag(kinds[0]))) + '.zip';
    saveBlob(await WX.zipFiles(files), fname);
  }
  const skipped = sel.length - parts.length;
  toast('已导出：' + fname + (files.length > 1 ? '（' + files.length + ' 个 Word）' : '') +
        (skipped ? '，' + skipped + ' 张卷子没有符合条件的题，没导出' : ''), 'good');
}

async function startRecite(src, name, order) {
  let d;
  try {
    d = await api('/api/practice?paper_id=' + (src.paper_id || 0) + '&scope=all&order=' + order +
      (src.subject ? '&subject=' + encodeURIComponent(src.subject) : '') + (src.type ? '&type=' + encodeURIComponent(src.type) : ''));
  } catch (e) { toast(e.message, 'bad'); return; }
  const items = d.items.filter(q => q.answer);
  if (!items.length) { toast('这里没有能背的题'); return; }
  const cards = [];
  items.forEach(q => {
    const last = cards[cards.length - 1];
    if (q.material && last && last[0].material === q.material && last[0].paper_id === q.paper_id) last.push(q);
    else cards.push([q]);
  });
  // 每 OLD_EVERY 张穿插一道以前错过的题做小测
  let all = cards, olds = [];
  if (mixOldOn()) {
    olds = await oldWrongs(src.subject || items[0].subject, items, Math.min(OLD_MAX, Math.floor(cards.length / OLD_EVERY)),
                           q => rcQuizable(q) && typeOf(src.type)(q));
    all = spreadIn(cards, cards.map((_, i) => i), olds.map(q => rcQuizCard(q, 'old')));
  }
  state.recite = { title: name + '·背题', cards: all, idx: 0, shown: false, res: {}, src: src, order: order, quiz: {}, again: {} };
  if (location.hash === '#/recite') route(); else location.hash = '#/recite';
  if (olds.length) setTimeout(() => toast('穿插了 ' + olds.length + ' 道以前错过的题做小测，选项已打乱'), 300);
}

function rcHead(r) {
  return '<div class="crumb crumb-row"><span class="crumb-t"><span class="crumb-pre">当前位置：</span><a href="#/home">首页</a> &gt; ' + esc(r.title) + '</span>' +
      '<span class="crumb-acts"><a href="javascript:void(0)" onclick="rcToggleHide()">' + (rcHide() ? '答案：先盖住' : '答案：直接显示') + '</a>' +
      '<a class="crumb-exit" href="javascript:void(0)" onclick="rcQuit()">退出背题</a></span></div>' +
    '<div class="pbar-wrap"><div class="pbar"><i style="width:' + Math.round(100 * r.idx / r.cards.length) + '%"></i></div></div>';
}
function rcStats(r) {
  const vals = Object.values(r.res), qz = Object.values(r.quiz || {});
  return '<div class="msg-bar">已背 ' + vals.length + ' 题 · 记住 ' + vals.filter(Boolean).length + ' · 没记住 ' + vals.filter(x => !x).length +
    (qz.length ? ' · 小测 ' + qz.filter(x => x.ok).length + '/' + qz.length : '') + '</div>';
}

function viewRecite() {
  const r = state.recite;
  if (!r) { location.hash = '#/home'; return; }
  if (r.idx >= r.cards.length) return rcFinish();
  const g = r.cards[r.idx], q0 = g[0];
  if (g.quiz) return rcQuizView(g);
  const hide = rcHide(), open = !hide || r.shown;
  const cat = TYPE_NAME[q0.cat] || TYPE_NAME[q0.type] || '';
  // 点「上一张」回看已经记过的卡片：只看不再记（和练习回看上一题不再记分一样）
  const marked = g.every(q => q.id in r.res) ? (g.every(q => r.res[q.id]) ? 'ok' : 'bad') : '';
  app.innerHTML = rcHead(r) +
    '<div class="card qcard-main rc-card' + (open ? ' rc-open' : ' rc-closed') + '"' + (open ? '' : ' onclick="rcReveal()"') + '>' +
      '<div class="qhead"><span class="tag t-' + q0.type + '">' + esc(cat) + '</span>' +
        '<span class="qsrc">' + esc(q0.paper_name) + (g.length > 1 ? ' 第' + g[0].qno + '–' + g[g.length - 1].qno + '题' : ' 第' + q0.qno + '题') + '</span>' +
        '<span class="spacer"></span><span class="muted">' + (r.idx + 1) + ' / ' + r.cards.length + '</span>' + cnBtn(q0) + aiBtn(q0) + '</div>' +
      rcBody(g) +
      (open ? '' : '<div class="rc-tap">点一下看答案</div>') +
    '</div>' +
    '<div class="qactions rc-acts">' +
      (r.idx > 0 ? '<button class="btn ghost" onclick="rcPrev()">上一张</button>' : '') +
      '<span class="muted">' + (!open ? '先在心里想答案，再点卡片看' : marked ? '这张记过了：' + (marked === 'ok' ? '记住了' : '没记住') : '记住了吗？') + '</span><div class="spacer"></div>' +
      (!open ? '<button class="btn" onclick="rcReveal()">看答案</button>'
        : marked ? '<button class="btn" onclick="rcMarkCard()">下一张</button>'
        : '<button class="btn danger" onclick="rcMarkCard(false)">没记住</button><button class="btn green" onclick="rcMarkCard(true)">记住了</button>') +
    '</div>' +
    rcStats(r) +
    (TOUCH ? '' : '<div class="muted kbd-tip rc-kbd">回车或 →：看答案 / 记住了，下一张　N 或 0：没记住　←：上一张</div>');
  if (open) g.forEach(q => markEvidence(q));
  applyCn();
}

function rcBody(g) {
  const q0 = g[0];
  const blanks = g.every(q => /第\d+空/.test(q.stem));
  // 完形、补全对话：把整篇的空填好
  if (q0.material && blanks) {
    const ans = {};
    g.forEach(q => { const m = q.stem.match(/第(\d+)空/); if (m) ans[m[1]] = q; });
    const used = {};
    const mat = q0.material.replace(/[（(]?\s*_{1,}\s*(\d+)\s*_{1,}\s*[）)]?/g, (m, n, at, str) => {
      const q = ans[n];
      if (!q || /见材料/.test(rcAnsTexts(q)[0] || '')) return m;
      used[n] = 1;
      return rcPad(str, at, m.length, RC_A + '(' + n + ') ' + rcAnsTexts(q)[0] + RC_B);
    });
    const rest = g.filter(q => !used[(q.stem.match(/第(\d+)空/) || [])[1]]);
    return '<div class="material-box"><div class="material-body">' + rcMark(rich(mat)) + '</div>' + materialCn(q0) + '</div>' +
      (rest.length ? '<div class="rc-list">' + rest.map(q => '<div class="rc-row"><span class="rc-k">' + esc(q.stem.replace(/^第\d+组\s*/, '')) + '</span>' +
        '<b class="rc-ans">' + rich(q.answer + '　' + rcAnsLabel(q)) + '</b></div>').join('') + '</div>' : '') +
      rcPoints(g);
  }
  // 配对题、阅读匹配：一问一答
  const shared = g.length > 1 && g.every(q => JSON.stringify(q.options) === JSON.stringify(q0.options)) && q0.options.length;
  const mat = q0.material ? materialBox(q0) : '';
  if (shared && q0.type !== 'judge') {
    return mat + '<div class="rc-list">' + g.map(q => '<div class="rc-row"><span class="rc-k">' + q.qno + '. ' + rich(q.stem.replace(/^第\d+组\s*/, '')) + '</span>' +
      '<b class="rc-ans">→ ' + rich(rcAnsLabel(q)) + '</b></div>').join('') + '</div>' + rcPoints(g);
  }
  // 阅读理解等：材料 + 每题问题和答案
  if (g.length > 1 || q0.material) {
    return mat + '<div class="rc-list">' + g.map(q => '<div class="rc-item">' + rcOne(q, true) + '</div>').join('') + '</div>';
  }
  return rcOne(q0, false);
}

function rcOne(q, inGroup) {
  const num = inGroup ? q.qno + '. ' : '';
  // 语音：四个词都列出来，读音不同的那个高亮
  if (q.cat === 'en_phon') {
    return '<div class="stem">' + rich(q.stem) + '</div><div class="rc-phon">' + optionList(q).map((o, i) => {
      const on = (q.answer || '').indexOf(o[0]) >= 0;
      const cn = (q.options_cn && q.options_cn[i]) || '';
      return '<div class="rc-row' + (on ? ' rc-hit' : '') + '"><span class="rc-k">' + rich(o[1]) + '</span>' +
        (on ? '<b class="rc-ans">' + esc(cn) + '（读音不同）</b>' : '<span class="muted rc-more">' + esc(cn) + '</span>') + '</div>';
    }).join('') + '</div>' + rcPoints([q]);
  }
  const filled = rcFillStem(q);
  if (filled) return '<div class="stem">' + num + rcMark(rich(filled)) + '</div>' + '<div class="rc-more">' + stemCn(q).replace(' peek', ' ') + '</div>' + rcPoints([q]);
  const label = q.type === 'judge' ? q.answer : (q.type === 'multi' || q.type === 'single' ? rcAnsLabel(q) : q.answer);
  return '<div class="stem">' + num + rich(q.stem) + '</div>' + '<div class="rc-more">' + stemCn(q).replace(' peek', ' ') + '</div>' +
    '<div class="rc-row"><span class="rc-k">答案</span><b class="rc-ans">' + rich(label) + '</b></div>' + rcPoints([q]);
}

function rcPoints(g) {
  const ps = g.filter(q => q.point || q.analysis).map(q => (g.length > 1 ? q.qno + '. ' : '') + (q.point || q.analysis));
  return ps.length ? '<div class="point-box rc-more"><b>要点</b>' + ps.map(p => '<div>' + rich(p) + '</div>').join('') + '</div>' : '';
}

function rcReveal() {
  const r = state.recite;
  if (!r || r.shown) return;
  r.shown = true;
  viewRecite();
}
function rcToggleHide() { store.set('zx.recite.hide', !rcHide()); viewRecite(); }
function rcPrev() { const r = state.recite; if (r.idx > 0) { r.idx--; r.shown = false; viewRecite(); window.scrollTo(0, 0); } }
function rcQuit() { state.recite = null; location.hash = '#/home'; }

function rcMarkCard(ok) {
  const r = state.recite;
  const g = r.cards[r.idx];
  if (!g.quiz) g.forEach(q => {
    if (q.id in r.res || ok === undefined) return;    // 这张已经记过（回看上一张）：不重复记
    r.res[q.id] = ok;
    api('/api/record', { method: 'POST', body: { question_id: q.id, correct: ok, mode: 'recite' } }).catch(e => toast('记录失败：' + e.message, 'bad'));
    if (!ok && g.length === 1 && rcQuizable(q)) rcRequeue(q);    // 没记住的单题过几张考一次
  });
  r.idx++;
  r.shown = false;
  viewRecite();
  window.scrollTo(0, 0);
}

/* ---- 背题里的小测：没记住的单题、以前错过的题，选项打乱，自己选一次 ---- */
function rcQuizable(q) { return ['single', 'multi', 'judge'].indexOf(q.type) >= 0 && optionList(q).length >= 2; }
function rcQuizCard(q, kind) { const c = [extraCopy(q, kind)]; c.quiz = kind; return c; }
function rcRequeue(q) {
  const r = state.recite;
  if (!againOn()) return false;
  const n = r.again[q.id] || 0;
  if (n >= AGAIN_MAX) return false;
  const left = r.cards.length - r.idx - 1;            // 这张后面还剩几张
  if (left < AGAIN_MIN_BETWEEN) return false;          // 太少：再出就是紧挨着了，不出
  r.again[q.id] = n + 1;
  r.cards.splice(r.idx + 1 + Math.min(againGap(), left), 0, rcQuizCard(q, 'again'));
  return true;
}

function rcQuizView(g) {
  const r = state.recite, q = g[0], st = r.quiz[r.idx];
  const sel = st ? st.sel : [];
  const ans = q.type === 'multi' ? q.answer.split('') : [q.answer];
  const judge = q.type === 'judge';
  const btn = (o, i) => {
    let cls = 'opt';
    if (st) cls += (ans.indexOf(o[0]) >= 0 ? ' ok' : sel.indexOf(o[0]) >= 0 ? ' bad' : '') + (sel.indexOf(o[0]) >= 0 ? ' sel' : '');   // sel：圆点标出你选的
    return '<button class="' + cls + '" data-k="' + esc(o[0]) + '"' + (st ? ' disabled' : '') + ' onclick="rcQuizPick(this)">' +
      '<span class="key">' + (judge ? (o[0] === '对' ? '✓' : '✗') : esc(o[0])) + '</span>' +
      '<span>' + (judge ? esc(o[1]) : rich(o[1]) + optCn(q, i)) + '</span></button>';
  };
  app.innerHTML = rcHead(r) +
    '<div class="card qcard-main rc-quiz' + (st ? ' answered' : '') + '">' +
      '<div class="qhead"><span class="tag t-' + q.type + '">小测</span>' +
        '<span class="qsrc">' + esc(q.paper_name) + ' 第' + q.qno + '题</span>' + extraBadge(q) +
        '<span class="spacer"></span><span class="muted">' + (r.idx + 1) + ' / ' + r.cards.length + '</span>' + cnBtn(q) + aiBtn(q) + '</div>' +
      materialBox(q, true) +
      '<div class="stem">' + rich(q.stem) + (q.type === 'multi' ? '（多选）' : '') + '</div>' + stemCn(q) +
      '<div class="' + (judge ? 'judge-row' : 'opts') + ' rcq-opts">' + optionList(q).map(btn).join('') + '</div>' +
      (st ? '<div class="feedback ' + (st.ok ? 'good' : 'bad') + '">' +
        '<div class="ans-line">' + (st.ok ? '✓ 答对了' : '✗ 答错了') + '<span class="ans-key">正确答案 <b>' + esc(q.answer) + '</b></span></div>' +
        (st.ok ? rightBox(q) : whyBox(q, sel)) + evidenceBox(q) + pointBox(q) + phraseBox(q) + '</div>' : '') +
    '</div>' +
    '<div class="qactions rc-acts">' +
      (r.idx > 0 ? '<button class="btn ghost" onclick="rcPrev()">上一张</button>' : '') +
      '<span class="muted">' + (!st ? (q.type === 'multi' ? '选好了点「确认」' : '选出答案') : st.ok ? '答对了' : st.again ? '答错了，过几张还会再考一次' : '答错了，已记进错题本') + '</span><div class="spacer"></div>' +
      (st ? '<button class="btn" onclick="rcMarkCard()">下一张</button>'
        : q.type === 'multi' ? '<button class="btn" id="rcq-ok" disabled onclick="rcQuizConfirm()">确认</button>' : '') +
    '</div>' + rcStats(r) +
    (TOUCH ? '' : '<div class="muted kbd-tip rc-kbd">1–4 或 A–D：选　回车或 →：' + (q.type === 'multi' ? '确认 / ' : '') + '下一张　←：上一张</div>');
  if (st) { markEvidence(q); cnAfterAnswer(); }
  applyCn();
}
function rcQuizPick(btn) {
  const r = state.recite, q = r.cards[r.idx][0];
  if (r.quiz[r.idx]) return;
  if (q.type === 'multi') {
    btn.classList.toggle('sel');
    const ok = $('#rcq-ok');
    if (ok) ok.disabled = !$$('.rcq-opts .opt.sel').length;
    return;
  }
  rcQuizGrade([btn.dataset.k]);
}
function rcQuizConfirm() {
  const sel = $$('.rcq-opts .opt.sel').map(b => b.dataset.k);
  if (sel.length) rcQuizGrade(sel);
}
function rcQuizGrade(sel) {
  const r = state.recite, q = r.cards[r.idx][0];
  const ok = q.type === 'multi' ? sel.slice().sort().join('') === q.answer.split('').sort().join('') : sel[0] === q.answer;
  r.quiz[r.idx] = { sel: sel, ok: ok, again: !ok && rcRequeue(q) };
  api('/api/record', { method: 'POST', body: { question_id: q.id, correct: ok, mode: 'recite' } }).catch(e => toast('记录失败：' + e.message, 'bad'));
  viewRecite();
}
// 小测的键盘：1–6 / A–F 选，回车或 → 确认（多选）/ 下一张，← 上一张
function rcQuizKey(e, g) {
  const r = state.recite, st = r.quiz[r.idx];
  if (e.key === 'ArrowLeft') { e.preventDefault(); return rcPrev(); }
  if (e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (st) rcMarkCard();
    else if (g[0].type === 'multi') rcQuizConfirm();
    return;
  }
  if (st) return;
  const i = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 }[e.key.toLowerCase()];
  const b = i === undefined ? null : $$('.rcq-opts .opt')[i];
  if (b) { e.preventDefault(); rcQuizPick(b); }
}

// 背题的键盘（电脑上用）：回车 / → 盖着时看答案，看过了 = 记住了、下一张（这张记过了就只翻到下一张）；N 或 0 = 没记住；← 上一张。
// 焦点停在背题页的按钮上也照样走这里（回车 preventDefault，不会再点一次按钮、重复记作答）
function reciteKey(e) {
  const r = state.recite;
  if (!r || r.idx >= r.cards.length || $('.sheet-mask') || $('.zoom')) return;     // 背完的结果页、开着弹窗时不管
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
  if (r.cards[r.idx].quiz) return rcQuizKey(e, r.cards[r.idx]);
  const open = !rcHide() || r.shown;
  const marked = r.cards[r.idx].every(q => q.id in r.res);
  if (e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (!open) rcReveal();
    else rcMarkCard(marked ? undefined : true);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    rcPrev();
  } else if ((e.key === 'n' || e.key === 'N' || e.key === '0') && open && !marked) {
    e.preventDefault();
    rcMarkCard(false);
  }
}

function rcFinish() {
  const r = state.recite;
  const vals = Object.values(r.res), ok = vals.filter(Boolean).length;
  const missIds = Object.keys(r.res).filter(k => !r.res[k]).map(Number);
  app.innerHTML = '<div class="card result-card"><h2 style="margin:0 0 10px">背完了</h2>' +
    '<div class="msg-bar">共 ' + vals.length + ' 题 · 记住 ' + ok + ' · 没记住 ' + (vals.length - ok) +
      (Object.keys(r.quiz || {}).length ? ' · 小测答对 ' + Object.values(r.quiz).filter(x => x.ok).length + '/' + Object.keys(r.quiz).length : '') + '</div>' +
    '<div class="muted" style="margin:8px 0 14px">没记住的、小测答错的已经放进复习和错题本，过几天会再出现。</div>' +
    '<div class="qactions">' + (missIds.length ? '<button class="btn" onclick="rcAgain()">没记住的再背一遍</button>' : '') +
    '<button class="btn ghost" onclick="rcQuit()">回首页</button></div></div>';
}

function rcAgain() {
  const r = state.recite;
  const miss = r.cards.filter(g => !g.quiz && g.some(q => r.res[q.id] === false));
  state.recite = { title: r.title.replace(/·再背$/, '') + '·再背', cards: miss, idx: 0, shown: false, res: {}, src: r.src, order: r.order, quiz: {}, again: {} };
  viewRecite();
}

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
  let sy = null;
  try { sy = await api('/api/sync/status'); } catch (e) { /* 老版本程序：没有同步 */ }
  let aic = null;
  if (!IS_APP) try { aic = await api('/api/ai/config'); } catch (e) { /* 老版本程序：没有 AI 助手 */ }
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
  const canUpd = (a.frozen || a.mobile) && !a.web;
  const backLabel = state.backTo ? (state.backTo === '#/recite' ? '返回背题' : '返回做题') : '返回';
  app.innerHTML =
    // 从做题 / 背题进来的：左上角的返回就是回到刚才那道题（goBack 里处理），不另放按钮（用户：多一个「返回做题」很奇怪）
    '<h2 class="page-h"><a class="page-back" href="javascript:void(0)" onclick="goBack()" aria-label="' + backLabel + '" title="' + backLabel + '">' +
      '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></a>设置</h2>' +
    '<div class="set-page">' +
    subjList('culture') + subjList('pro') + subjList('other') +
    '<div class="set-foot">关掉的科目不再出现在首页、复习、错题本和模拟考里，做题记录会保留。</div>' +

    '<div class="set-group-t">做题</div><div class="set-list">' +
      '<label class="set-item"><span class="set-main">答题后自动显示翻译</span>' +
        '<input type="checkbox" class="switch" id="cn-after"' + (cnAfterOn() ? ' checked' : '') + '></label>' +
      '<label class="set-item"><span class="set-main">提示这题以前做错过</span>' +
        '<input type="checkbox" class="switch" id="hint-on"' + (hintOn() ? ' checked' : '') + '></label>' +
      '<label class="set-item"><span class="set-main">做错的题过几题再考一次</span>' +
        '<input type="checkbox" class="switch" id="again-on"' + (againOn() ? ' checked' : '') + '></label>' +
      '<label class="set-item"><span class="set-main">穿插以前错过的题</span>' +
        '<input type="checkbox" class="switch" id="mixold-on"' + (mixOldOn() ? ' checked' : '') + '></label>' +
    '</div>' +
    '<div class="set-foot">翻译：英语题答完（单题确认答案、整篇提交）后，中文翻译自动显示出来，作答前还是不显示。<br>' +
      '做错的题：做题时做错、背题时点「没记住」的题，隔几题会再出一次，选项重新打乱；再错还会再出。<br>' +
      '以前错过的题：整卷、题型练习和背题时，每隔几题穿插一道同科以前错过的题（错题本里的、错得多的优先），选项打乱。</div>' +

    '<div class="set-group-t">更新</div><div class="set-list">' +
      item('当前版本', (a.web ? '网页版' : 'v' + esc(a.version)) + (a.content_version ? ' · 内容第 ' + a.content_version + ' 版' : '')) +   // 程序版本只在发安装包时变，平时的题库 / 界面更新看内容版本
      (canUpd ? '<label class="set-item"><span class="set-main">自动更新题库和界面</span>' +
        '<input type="checkbox" class="switch" id="auto-upd"' + (autoUpdOn() ? ' checked' : '') + '></label>' : '') +
      (a.web ? '' : '<button class="set-item set-link" id="upd-check"' + (canUpd ? '' : ' disabled data-off="1"') + '><span class="set-main upd-label">检查更新</span></button>') +
    '</div>' +
    '<div id="upd-out"></div>' +
    '<div class="set-foot">' + (a.web ? '网页版总是最新的：有新版时在首页等页面自动刷新换上，做题时不打断。' : canUpd ? '打开自动更新后，题库和界面有新版时会在后台自己下载装好（只下载改动的部分）；正在做题、背题、模拟考时不打断，' +
      '回到首页等页面才换上。做题记录不会受影响。新版程序（安装包）要重新安装，有的话「检查更新」上会有小红点。' : '源码运行，用 git pull 更新。') + '</div>' +

    (sy && sy.available ? '<div class="set-group-t">' + (IS_WEB ? '账号' : '账号同步（内测）') + '</div><div id="sync-box">' + syncBoxHtml(sy) + '</div>' : '') +

    (aic ? aiSettingsHtml(aic) : '') +

    '<div class="set-group-t">我的数据</div><div class="set-list">' +
      (a.web ? item('保存位置', '账号里（服务器上）') : a.mobile ? item('保存位置', '本机') : '<div class="set-item set-col"><span class="set-main">保存位置</span><span class="set-sub">' + esc(a.data_dir) + '</span></div>') +
      (a.open_data ? item('打开数据文件夹', '', ' onclick="openDataDir()"', 'set-link') : '') +
      (canShareProgress() ? item('分享做题记录', '', ' onclick="shareProgress()"', 'set-link') : '') +
      (a.web ? '' : item('清除做题记录', '', ' onclick="clearMyData()"', 'set-link set-danger')) +   // 网页版的记录在账号里，清本机没意义
    '</div>' +
    '<div class="set-foot">' + (a.web ? '做题记录存在账号里，换电脑、清浏览器缓存都不会丢。' : a.mobile
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
  if (aic) bindAiSettings(aic);
  const au = $('#auto-upd');
  if (au) au.addEventListener('change', () => {
    store.set('zx.autoUpd', au.checked);
    toast(au.checked ? '已打开自动更新：题库和界面有新版时会在后台自己装好' : '已关闭自动更新：有新版时只在「检查更新」上提示');
    if (au.checked) { store.del('zx.lastAutoCheck'); api('/api/app').then(autoCheckUpdate).catch(() => {}); }
  });
  markUpdDots();
  updRestore();
  // 热更新了后端代码、还没重启：提醒一下（重启后 a.py.active 会追上来）
  const nr = store.get('zx.needRestart');
  if (nr && a.py && a.frozen) {
    if ((a.py.active || 0) >= nr) store.del('zx.needRestart');
    else if (!upd.busy && !upd.html) updShow('<div class="upd-box"><b>后台程序的更新还没生效</b><div class="muted">重启题库后生效，几秒钟，做题记录不受影响。</div>' +
      '<button class="btn" onclick="restartApp()">现在重启</button></div>');
  }
  [['#hint-on', 'quiz.hint', '做题时题目上会标出“以前做错过 / 刚才做错，再来一次”', '做题时不再标出这题以前做错过（和考试一样）'],
   ['#again-on', 'quiz.again', '做错的题过几题会再考一次', '做错的题不再穿插（今日复习照旧在后面再来一次）'],
   ['#mixold-on', 'quiz.mixold', '练习和背题时会穿插以前错过的题', '不再穿插以前错过的题']].forEach(([id, key, on, off]) => {
    const el = $(id);
    if (el) el.addEventListener('change', () => { store.set(key, el.checked); toast(el.checked ? '已打开：' + on : '已关闭：' + off); });
  });
  const ca = $('#cn-after');
  if (ca) ca.addEventListener('change', () => {
    store.set('quiz.cnafter', ca.checked);
    toast(ca.checked ? '已打开：英语题答完后自动显示翻译' : '已关闭：答完后要看翻译点「译」');
  });
  $$('.subj-check input').forEach(c => c.addEventListener('change', () => {
    c.closest('.subj-check').classList.toggle('off', !c.checked);     // 关掉的科目名变灰（老 WebView 不支持 :has，用 class）
    saveHidden();
  }));
}

function syncStateText(sy) {
  if (sy.running) return '正在同步…';
  if (sy.last_err) return '没同步上：' + sy.last_err;
  if (sy.last_ok) return '已同步 ' + sy.last_ok.slice(5, 16);
  return '等待同步';
}

function syncBoxHtml(sy) {
  if (!sy.user) {
    return '<div class="set-list"><div class="set-item set-col sync-form">' +
        '<input class="input" id="sync-user" autocomplete="username" placeholder="用户名">' +
        '<input class="input" id="sync-pass" type="password" autocomplete="current-password" placeholder="密码">' +
        '<button class="btn" onclick="syncLogin()">登录</button></div></div>' +
      '<div class="set-foot">' + (sy.owner ? '这台设备上的做题记录属于账号 <b>' + esc(sy.owner) + '</b>。登录别的账号时会先备份并清空本机记录，不会混到别人账号里。<br>' : '') +
        '登录后，电脑和手机上的做题记录、错题本、复习进度、模拟考和存档会自动合并。' +
        '没网也能照常做题，联网后自动补上；同步不成功不影响使用。账号找管理员要。</div>';
  }
  return '<div class="set-list">' +
      '<div class="set-item"><span class="set-main">账号</span><span class="set-val">' + esc(sy.user) + '</span></div>' +
      '<div class="set-item"><span class="set-main">状态</span><span class="set-val' + (sy.last_err ? ' sync-err' : '') + '">' + esc(syncStateText(sy)) + '</span></div>' +
      (sy.pending ? '<div class="set-item"><span class="set-main">等待上传</span><span class="set-val">' + sy.pending + ' 条</span></div>' : '') +
      '<button class="set-item set-link" onclick="syncNow(this)"><span class="set-main">立即同步</span></button>' +
      '<button class="set-item set-link" onclick="syncNameForm()"><span class="set-main">修改用户名</span></button>' +
      '<button class="set-item set-link" onclick="syncPwForm()"><span class="set-main">修改密码</span></button>' +
      '<button class="set-item set-link set-danger" onclick="syncLogout()"><span class="set-main">退出登录</span></button>' +
    '</div><div id="sync-pw"></div>' +
    '<div class="set-foot">做完题会自动同步，每 5 分钟也会同步一次。' + (IS_WEB ? '退出登录会清掉这台浏览器里的记录（账号里的不动）。' : '退出登录不会删本机的做题记录。') + '</div>';
}

function syncRender(sy) { const b = $('#sync-box'); if (b) b.innerHTML = syncBoxHtml(sy); }

// 登录：绝不把一个人的记录并进另一个人的账号。本机已经属于别的账号、或者本机有记录但没绑定过账号，
// 后台不会直接登录，而是回 need，这里让用户选：合并（是自己的记录）/ 备份后清空本机再下载账号里的
async function syncLogin(mode) {
  const u = ($('#sync-user') || {}).value || '', p = ($('#sync-pass') || {}).value || '';
  if (!u.trim() || !p) { if (!(IS_WEB && webLoginErr('请输入用户名和密码'))) toast('请输入用户名和密码', 'bad'); return; }
  const lb = $('#web-login-btn');
  if (lb) { if (lb.disabled) return; lb.disabled = true; lb.textContent = '登录中…'; }
  try {
    const sy = await api('/api/sync/login', { method: 'POST', body: { user: u, pass: p, mode: mode || '' } });
    if (sy.need) return syncAskOwner(sy, u.trim());
    if (mode === 'fresh') lsClearLocal();            // 本机的练习存档也是原来那个人的
    lsPushAll();
    if (IS_WEB) return webEnter(sy);
    syncRender(sy);
    toast(sy.backup ? '登录成功。本机原来的记录已备份并清空，正在下载这个账号的记录' : '登录成功，正在同步', 'good');
    syncNow();
  } catch (e) { if (!(IS_WEB && webLoginErr(e.message))) toast(e.message, 'bad'); }
  finally { const b = $('#web-login-btn'); if (b) { b.disabled = false; b.textContent = '登录'; } }
}

function syncAskOwner(sy, user) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-mask';
  const head = '<div class="sheet-h"><b>' + (sy.need === 'switch' ? '换账号登录' : '这些记录是你的吗？') + '</b><button class="sheet-x" aria-label="关闭">×</button></div>' +
    '<div class="sheet-d" style="margin:0 0 6px">密码正确。<b>还差一步</b>：选下面一项才算登录成功。</div>';
  const body = sy.need === 'switch'
    ? '<div class="sheet-sec"><div class="sheet-d">这台设备上的 ' + sy.count + ' 条做题记录属于账号 <b>' + esc(sy.owner) + '</b>，不能合并进 <b>' + esc(user) + '</b>。<br>' +
        '继续登录会先把本机记录<b>备份</b>，再清空本机、下载 ' + esc(user) + ' 的记录。' + esc(sy.owner) + ' 的记录在服务器上一条不少，以后登录 ' + esc(sy.owner) + ' 就能拿回来' +
        (sy.unsent ? '；但其中 <b>' + sy.unsent + ' 条还没传上服务器</b>，只在备份里，建议先登录 ' + esc(sy.owner) + ' 同步一次' : '') + '。</div>' +
        '<button class="btn block" data-act="fresh">备份本机记录，登录 ' + esc(user) + '</button></div>'
    : '<div class="sheet-sec"><div class="sheet-d">这台设备上已经有 ' + sy.count + ' 条做题记录，还没绑定过账号。</div>' +
        '<button class="btn block" data-act="merge">是我自己的，合并进账号 ' + esc(user) + '</button>' +
        '<div class="sheet-d" style="margin-top:12px">不是你的（比如借用别人的手机、电脑），选下面这个：本机记录会先备份再清空，然后下载你账号里的记录，别人的记录不会进你的账号。</div>' +
        '<button class="btn ghost block" data-act="fresh">不是我的，备份后清空本机</button></div>';
  sheet.innerHTML = '<div class="sheet" role="dialog">' + head + body + '</div>';
  sheet.addEventListener('click', e => {
    if (e.target.closest('.sheet-x')) {          // 点弹窗外面不关（容易误以为已经登录了）
      sheet.remove();
      toast('还没登录：要先选一项才会登录', 'bad');
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    sheet.remove();
    syncLogin(btn.dataset.act);
  });
  document.body.appendChild(sheet);
}

// 换账号 / 不合并时：本机浏览器里的练习存档、自动进度也清掉（是原来那个人的）
function lsClearLocal() {
  try { Object.keys(localStorage).filter(lsSynced).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
}

async function syncNow(btn) {
  if (btn) btn.disabled = true;
  syncRender(Object.assign({}, (await api('/api/sync/status').catch(() => ({}))), { running: true }));
  try {
    const sy = await api('/api/sync/now', { method: 'POST', body: {} });
    await lsPull();
    syncRender(sy);
    const got = sy.result && sy.result.got;
    toast(got ? '同步完成，从别的设备拿到 ' + got + ' 条' : '同步完成', 'good');
  } catch (e) {
    toast(e.message, 'bad');
    try { syncRender(await api('/api/sync/status')); } catch (e2) { /* ignore */ }
  }
}

function syncPwForm() {
  const o = $('#sync-pw');
  if (!o) return;
  o.innerHTML = '<div class="set-list"><div class="set-item set-col sync-form">' +
    '<input class="input" id="sync-old" type="password" placeholder="原密码">' +
    '<input class="input" id="sync-new" type="password" placeholder="新密码（至少 6 位）">' +
    '<button class="btn" onclick="syncChangePw()">确认修改</button></div></div>';
}

// 改用户名：记录按账号存、设备按账号 ID 认，改名不影响做题记录；别的设备下次同步时自动换成新名字
function syncNameForm() {
  const o = $('#sync-pw');
  if (!o) return;
  o.innerHTML = '<div class="set-list"><div class="set-item set-col sync-form">' +
    '<input class="input" id="sync-newname" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="新用户名（汉字、字母、数字都行）">' +
    '<input class="input" id="sync-namepw" type="password" autocomplete="current-password" placeholder="当前密码">' +
    '<button class="btn" onclick="syncChangeName()">确认修改</button></div></div>' +
    '<div class="set-foot">做题记录不受影响。电脑、手机、网页上登录着这个账号的，下次同步时自动换成新名字；以后登录用新用户名。</div>';
  $('#sync-newname').focus();
}

async function syncChangeName() {
  try {
    const sy = await api('/api/sync/rename', { method: 'POST', body: { name: $('#sync-newname').value, pass: $('#sync-namepw').value } });
    if (IS_WEB) state.webUser = sy.user;
    syncRender(sy);
    toast('用户名已改成 ' + sy.user + '，以后登录用新名字', 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

async function syncChangePw() {
  try {
    await api('/api/sync/password', { method: 'POST', body: { old: $('#sync-old').value, new: $('#sync-new').value } });
    $('#sync-pw').innerHTML = '';
    toast('密码已修改', 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

async function syncLogout() {
  if (!confirm(IS_WEB ? '退出登录？做题记录都在账号里，这台浏览器里的会清掉，下次登录再下载回来。' : '退出同步账号？本机的做题记录会保留。')) return;
  try {
    const sy = await api('/api/sync/logout', { method: 'POST', body: {} });
    if (IS_WEB) {
      if (sy.wiped) lsClearLocal();
      else if (sy.left) alert('有 ' + sy.left + ' 条记录还没传上服务器（可能断网了），先留在这台浏览器里，下次登录同一个账号会自动补传。');
      state.webUser = null;
      location.hash = '#/home';
      return route();
    }
    syncRender(sy);
    toast('已退出');
  }
  catch (e) { toast(e.message, 'bad'); }
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
const UPD_EVERY = 3600 * 1000;

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
  // 同步服务器说这个版本太旧（管理员设了 mincontent）：不等一小时，马上查、马上强制更新
  let urgent = false;
  try { urgent = !!(await api('/api/sync/status')).need_update; } catch (e) { /* ignore */ }
  if (urgent) store.del('zx.lastAutoCheck');
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
  if (!cont.failed && (cont.force || (urgent && cont.has_update))) return forceContentUpdate(cont);
  if (!cont.failed) autoContentUpdate(cont);
}

/* ---- 强制更新（用户要求：我们要能在一定程度上控制大家的更新）----
   两个开关：发布时 release.py --force（content.json 的 force_min），或者服务器上 zhixue-user mincontent N（同步时回 426）。
   低于门槛的：不管自动更新开没开、在不在做题，马上下载，弹出关不掉的窗口，装好点「立即更新」刷新换上。
   作答每点一下就已经存了，刷新不丢记录。下载失败（断网）不锁人：关掉窗口照常用，过几分钟再试。 */
let forcing = false;
async function forceContentUpdate(cont) {
  if (forcing || IS_WEB) return;
  forcing = true;
  const mask = document.createElement('div');
  mask.className = 'sheet-mask force-upd';
  mask.innerHTML = '<div class="sheet" role="alertdialog"><div class="sheet-h"><b>需要更新</b></div>' +
    '<div class="sheet-d">这次更新修正了重要问题，必须更新到第 ' + esc(cont.latest) + ' 版才能接着用。做题记录不受影响。</div>' +
    (cont.notes ? '<div class="sheet-d force-notes">' + esc(cont.notes) + '</div>' : '') +
    '<div class="force-bar"><i style="width:0"></i></div><div class="sheet-d" id="force-st">正在下载…</div>' +
    '<button class="btn block" id="force-go" hidden>立即更新</button></div>';
  document.body.appendChild(mask);
  const st = mask.querySelector('#force-st'), bar = mask.querySelector('.force-bar i'), go = mask.querySelector('#force-go');
  try {
    let p = await api('/api/content/update', { method: 'POST' });
    while (p.state === 'downloading') {
      bar.style.width = (p.total ? Math.round(100 * p.done / p.total) : 5) + '%';
      st.textContent = '正在下载…' + (p.total ? ' ' + fmtMB(p.done) + ' / ' + fmtMB(p.total) : '');
      await new Promise(r => setTimeout(r, 1000));
      p = await api('/api/content/progress');
    }
    if (p.state !== 'done') throw new Error(p.error || '没下载完');
    bar.style.width = '100%';
    if (p.restart && !IS_APP) store.set('zx.needRestart', p.version);
    st.textContent = p.restart && !IS_APP ? '下载好了。点下面的按钮刷新；电脑版还要从托盘退出再打开一次题库，后台部分才换成新的。' : '下载好了，点下面的按钮换上新版。';
    go.hidden = false;
    go.onclick = () => { store.set('zx.updDone', p.version || cont.latest); location.reload(); };
  } catch (e) {
    st.textContent = '没下载下来（' + e.message + '）。先接着用，联网后会自动再试。';
    const close = document.createElement('button');
    close.className = 'btn ghost block';
    close.textContent = '先接着用';
    close.onclick = () => mask.remove();
    mask.querySelector('.sheet').appendChild(close);
    forcing = false;
    store.del('zx.lastAutoCheck');
    setTimeout(() => api('/api/app').then(autoCheckUpdate).catch(() => {}), 5 * 60 * 1000);
  }
}

/* ---- 自动更新题库和界面（用户要求：很多人不会自己去更新）----
   查到内容更新（只下载改动的文件，和手动「现在更新」同一套：先下到临时文件夹、逐个核对指纹、齐了才整个换上，
   失败就还用原来那份；做题记录在数据文件夹里，不受影响）就在后台下载装好，不弹窗。
   装好后不马上刷新：正在做题、背题、模拟考、技能实操、导入试卷时不打断，等回到首页、错题本、搜索、设置这些页面再刷新换上新界面，
   刷新后提示一句。程序整包（exe / apk）要重装，仍然只亮小红点。设置里可以关掉（localStorage zx.autoUpd = false）。 */
function autoUpdOn() { return store.get('zx.autoUpd') !== false; }
const RELOAD_OK = ['home', 'subject', 'wrong', 'bank', 'settings'];   // 在这些页面刷新不会丢掉正在做的东西
let autoUpdRunning = false;
function idlePage() {
  const name = (location.hash || '#/home').replace(/^#\/?/, '').split('/')[0] || 'home';
  if (name === 'settings' && state.backTo) return false;   // 做题、背题中途点齿轮来的设置（有「返回做题」）：刷新会丢掉做到一半的
  return RELOAD_OK.indexOf(name) >= 0;
}
async function autoContentUpdate(cont) {
  if (!autoUpdOn() || autoUpdRunning || upd.busy || !cont || !cont.has_update) return;
  // 正在做题、背题、模拟考：先不下载（手机上写大文件会卡一下），回到首页这类页面再开始
  if (!idlePage()) { state.updWanted = cont; return; }
  state.updWanted = null;
  autoUpdRunning = true;
  try {
    let p = await api('/api/content/update', { method: 'POST' });
    while (p.state === 'downloading') {
      await new Promise(r => setTimeout(r, 1500));
      p = await api('/api/content/progress');
    }
    if (p.state !== 'done') return;                  // 失败了不打扰，下次检查再试；小红点还在
    store.del('zx.updNotice');
    markUpdDots();
    if (p.restart && !IS_APP) store.set('zx.needRestart', p.version);   // 电脑版后台代码下次打开题库时生效
    state.pendingReload = p.version || 1;
    reloadIfIdle();
  } catch (e) { /* 网络不好之类，下次再试 */ }
  finally { autoUpdRunning = false; }
}
// 装好了新内容：不在做题等页面、也没开着弹窗时，刷新换上新界面
function reloadIfIdle() {
  if (!state.pendingReload || upd.busy) return;
  if (!idlePage() || $('.sheet-mask') || $('.zoom')) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.value))) return;   // 正在输入
  store.set('zx.updDone', state.pendingReload);
  location.reload();
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

/* ================================================================ AI 助手（可选）
 * 设置里打开、填自己的 API Key 才有（llm.py，只在电脑版；手机上不显示）。没打开时界面上不出现任何 AI 的东西：
 * aiBtn() 返回空、设置页只有一个开关、导入整理台没有「用 AI 整理」。
 * 打开后：做题 / 背题 / 错题本 / 搜索的题目卡片右上角多一个「问 AI」，点开右侧对话框，带着这道题（官方答案、你选的）聊；
 * 模拟考试里没有。对话只留在这次打开的页面里（state.ai.chats），不存盘、不同步。 */
state.ai = { on: false, chats: {}, qs: {} };
function loadAi() {
  if (IS_APP) return Promise.resolve();
  return api('/api/ai/config').then(c => { state.ai.on = !!c.enabled; }).catch(() => { state.ai.on = false; });
}
function aiBtn(q) {
  if (!state.ai.on || IS_APP || !q || /^#\/exam/.test(location.hash)) return '';
  state.ai.qs[q.id] = q;
  return '<button class="ai-btn" data-aiq="' + q.id + '" title="让 AI 讲讲这道题">问 AI</button>';
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.ai-btn');
  if (!b) return;
  e.stopPropagation();
  const p = state.practice;                     // 整篇卡片：问的是当前那道小题
  const q = b.dataset.aigroup ? (p && p.group && p.list[p.group.s + p.group.cur]) : state.ai.qs[b.dataset.aiq];
  if (q) openAiChat(q);
}, true);

// 这道题现在的作答情况（做题页里才有）：给 AI 当背景，没作答时 AI 只给提示
function aiQState(q) {
  const p = state.practice;
  if (location.hash !== '#/practice' || !p) return {};
  const a = unitStart(p, p.idx), z = unitEnd(p, p.idx);
  const i = p.list.findIndex((x, k) => x.id === q.id && k >= a && k < z);
  if (i < 0) return {};
  const sel = p.done[i];
  if (!sel || sel.self !== undefined) return { answered: !!sel };
  const s = sel.join('');
  const ok = q.type === 'multi' ? s.split('').sort().join('') === q.answer.split('').sort().join('') : s === q.answer;
  return { answered: true, selected: s, correct: ok };
}

function aiText(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*/gm, '').replace(/\n/g, '<br>');
}

function openAiChat(q) {
  closeAiChat();
  const st = aiQState(q);
  const chat = state.ai.chats[q.id] = state.ai.chats[q.id] || [];
  const quick = [['讲解这道题', '讲解一下这道题。']];
  if (st.answered && st.correct === false) quick.unshift(['我为什么错', '我选了 ' + st.selected + '，为什么不对？']);
  if (!st.answered && SELF_TYPES.indexOf(q.type) < 0) quick.unshift(['给点提示', '先别告诉我答案，给我一点提示。']);
  quick.push(['讲讲知识点', '这道题考的是什么知识点？帮我梳理一下要记住的内容。']);
  const box = document.createElement('div');
  box.className = 'ai-panel';
  box.innerHTML =
    '<div class="ai-head"><b>问 AI</b><span class="muted ai-sub">' + esc((q.paper_name ? q.paper_name + ' · ' : '') + '第 ' + q.qno + ' 题') + '</span>' +
      '<button class="sheet-x" aria-label="关闭">×</button></div>' +
    '<div class="ai-q">' + esc(String(q.stem || '').replace(/\[\[img:[^\]]+\]\]/g, '[图]').replace(/\s+/g, ' ').slice(0, 80)) + '</div>' +
    '<div class="ai-msgs"></div>' +
    '<div class="ai-quick">' + quick.map(x => '<button class="pill-tab" data-say="' + esc(x[1]) + '">' + x[0] + '</button>').join('') + '</div>' +
    '<div class="ai-input"><textarea rows="2" placeholder="问点什么，回车发送（Shift+回车换行）"></textarea><button class="btn" data-send="1">发送</button></div>' +
    '<div class="ai-foot">AI 的回答可能出错，只作参考；答案以官方答案为准。</div>';
  document.body.appendChild(box);
  document.body.classList.add('ai-open');
  const msgs = box.querySelector('.ai-msgs'), ta = box.querySelector('textarea');
  const draw = () => {
    msgs.innerHTML = chat.length ? chat.map(m => '<div class="ai-m ' + m.role + (m.err ? ' err' : '') + '">' + aiText(m.content) + '</div>').join('') +
      (box.dataset.busy ? '<div class="ai-m assistant typing">正在想……</div>' : '') :
      '<div class="ai-empty">点下面的按钮，或者直接问。AI 看得到这道题的题目、选项和官方答案' + (st.answered ? '，也知道你选了什么' : '') + '。</div>';
    msgs.scrollTop = msgs.scrollHeight;
  };
  const send = async text => {
    text = (text || '').trim();
    if (!text || box.dataset.busy) return;
    chat.push({ role: 'user', content: text });
    box.dataset.busy = '1';
    ta.value = '';
    draw();
    const ctx = Object.assign({ subject: SUBJECT_NAME[q.subject] || q.subject || '', type: q.type, stem: q.stem, material: q.material,
                                options: q.options, answer: q.answer, analysis: q.analysis }, st);
    try {
      const r = await api('/api/ai/ask', { method: 'POST', body: { q: ctx, messages: chat.filter(m => !m.err) } });
      chat.push({ role: 'assistant', content: r.reply || '（AI 没有回复内容）' });
    } catch (e) {
      chat.push({ role: 'assistant', content: e.message, err: true });
    }
    delete box.dataset.busy;
    if (document.body.contains(box)) draw();
  };
  box.addEventListener('click', e => {
    if (e.target.closest('.sheet-x')) return closeAiChat();
    const s = e.target.closest('[data-say]');
    if (s) return send(s.dataset.say);
    if (e.target.closest('[data-send]')) send(ta.value);
  });
  ta.addEventListener('keydown', e => {
    e.stopPropagation();                         // 打字时不触发做题页的快捷键
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); }
  });
  draw();
  ta.focus();
}
function closeAiChat() {
  const b = document.querySelector('.ai-panel');
  if (b) b.remove();
  document.body.classList.remove('ai-open');
}
window.addEventListener('hashchange', closeAiChat);

// 本机地址（Ollama）：不用 Key
const aiLocal = u => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(u || '');

// 设置页「AI 助手」一节
function aiSettingsHtml(c) {
  const pv = c.providers.find(p => p.id === c.provider) || c.providers[0];
  return '<div class="set-group-t">AI 助手（可选）</div><div class="set-list">' +
      '<label class="set-item"><span class="set-main">打开 AI 助手</span><input type="checkbox" class="switch" id="ai-on"' + (c.enabled ? ' checked' : '') + '></label>' +
      '<div class="set-item set-col ai-form" id="ai-form"' + (c.enabled || state.ai.editing ? '' : ' hidden') + '>' +
        '<label class="ai-f"><span>服务商</span><select class="inp" id="ai-prov">' + c.providers.map(p =>
          '<option value="' + p.id + '"' + (p.id === pv.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>' +
        '<label class="ai-f"><span>API Key</span><input class="inp" id="ai-key" type="password" autocomplete="off" placeholder="' +
          (aiLocal(c.base_url || pv.base_url) ? '本机 Ollama 不用填' : c.has_key ? '已保存（尾号 ' + esc(c.key_tail || '****') + '），不改就留空' : '粘贴你的 API Key') + '"></label>' +
        '<label class="ai-f"><span>接口地址</span><input class="inp" id="ai-url" value="' + esc(c.base_url || pv.base_url) + '" placeholder="https://…/v1"></label>' +
        '<label class="ai-f"><span>模型</span><input class="inp" id="ai-model" list="ai-models" value="' + esc(c.model || pv.model) + '" placeholder="模型名称"></label>' +
        '<datalist id="ai-models"></datalist>' +
        '<div class="ai-f ai-acts"><a href="javascript:void(0)" id="ai-site"' + (pv.site ? '' : ' hidden') + '>去申请 Key</a><span class="spacer"></span>' +
          '<button class="btn ghost sm" id="ai-test">测试连接</button><button class="btn sm" id="ai-save">保存</button></div>' +
        '<div class="ai-test-out" id="ai-test-out"></div>' +
      '</div>' +
    '</div>' +
    '<div class="set-foot">打开后：做题、背题、错题本里每道题右上角有「问 AI」，可以让它讲题、说你为什么错；导入试卷时可以「用 AI 整理」格式。' +
      '关掉后界面上不会出现任何 AI 的按钮。<br>Key 只存在这台电脑上，不会同步到账号；问题会发给你选的服务商，费用按他们的规则算' +
      '（智谱 glm-4-flash、硅基流动的部分模型免费，DeepSeek 很便宜）。AI 的回答可能出错，答案以官方答案为准。</div>';
}

function bindAiSettings(c) {
  const on = $('#ai-on');
  if (!on) return;
  const form = $('#ai-form');
  const prov = () => c.providers.find(p => p.id === $('#ai-prov').value) || {};
  const keyOk = () => c.has_key || !!$('#ai-key').value.trim() || aiLocal($('#ai-url').value);
  // 本机 Ollama：读出装了哪些模型，模型框里可以直接选；没填模型就先用第一个
  const loadModels = async () => {
    const url = $('#ai-url').value.trim();
    $('#ai-key').placeholder = aiLocal(url) ? '本机 Ollama 不用填' : (c.has_key ? '已保存（尾号 ' + (c.key_tail || '****') + '），不改就留空' : '粘贴你的 API Key');
    if (!aiLocal(url)) { $('#ai-models').innerHTML = ''; return; }
    let ms = [];
    try { ms = (await api('/api/ai/models', { method: 'POST', body: { base_url: url } })).models; } catch (e) { /* 连不上就算了 */ }
    $('#ai-models').innerHTML = ms.map(m => '<option value="' + esc(m) + '">').join('');
    if (!ms.length) toast('没连上本机的 Ollama：先打开 Ollama，再点「测试连接」', 'bad');
    else if (!$('#ai-model').value.trim()) $('#ai-model').value = ms.find(m => !/:cloud$/.test(m)) || ms[0];
  };
  const body = () => ({ provider: $('#ai-prov').value, base_url: $('#ai-url').value.trim(), model: $('#ai-model').value.trim(),
                        api_key: $('#ai-key').value.trim() });
  const save = async enabled => {
    try {
      const r = await api('/api/ai/config', { method: 'POST', body: Object.assign(body(), { enabled: enabled }) });
      c.has_key = r.has_key;
      c.key_tail = r.key_tail;
      state.ai.on = r.enabled;
      on.checked = r.enabled;
      return r;
    } catch (e) { toast(e.message, 'bad'); return null; }
  };
  on.addEventListener('change', async () => {
    if (on.checked) {
      form.hidden = false;
      state.ai.editing = true;
      if (!keyOk()) { on.checked = false; toast('先填 API Key，点「保存」就打开了'); $('#ai-key').focus(); return; }
      const r = await save(true);
      if (r && r.enabled) toast('已打开 AI 助手', 'good');
    } else {
      form.hidden = true;
      state.ai.editing = false;
      await save(false);
      closeAiChat();
      toast('已关闭 AI 助手：界面上不再出现 AI 的按钮');
    }
  });
  $('#ai-prov').addEventListener('change', () => {
    const p = prov();
    if (p.id !== 'custom') { $('#ai-url').value = p.base_url; $('#ai-model').value = p.model; }
    $('#ai-site').hidden = !p.site;
    if (p.id === 'doubao') toast('豆包的“模型”要填你在火山方舟上建的接入点 ID（ep-…）');
    loadModels();
  });
  $('#ai-url').addEventListener('change', loadModels);
  if (aiLocal($('#ai-url').value)) loadModels();
  $('#ai-site').addEventListener('click', () => { const p = prov(); if (p.site) openExternal(p.site); });
  $('#ai-test').addEventListener('click', async () => {
    const out = $('#ai-test-out'), tb = $('#ai-test');
    tb.disabled = true;                            // 连点两下，两次的结果会互相盖掉
    out.className = 'ai-test-out';
    out.textContent = '正在连接……';
    try {
      const r = await api('/api/ai/test', { method: 'POST', body: body() });
      out.className = 'ai-test-out ok';
      out.textContent = '连上了，AI 回复：' + r.reply;
    } catch (e) { out.className = 'ai-test-out bad'; out.textContent = e.message; }
    tb.disabled = false;
  });
  $('#ai-save').addEventListener('click', async () => {
    const b = body();
    if (!keyOk()) { toast('先填 API Key', 'bad'); return; }
    const r = await save(true);
    if (r) { $('#ai-key').value = ''; $('#ai-key').placeholder = '已保存（尾号 ' + (r.key_tail || '****') + '），不改就留空'; toast('已保存，AI 助手已打开', 'good'); }
  });
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

/* ================================================================ 网页版登录
   网页版必须登录（用户：不然记录容易丢——浏览器缓存一清就没了）。账号就是电脑 / 手机「账号同步」用的那个，
   做题记录存在服务器上，三边互通。没登录只显示登录页；退出登录时清掉这台浏览器里的记录（可能是别人的电脑）。 */
const WEB_EYE = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
async function webGate() {
  let sy = null;
  app.innerHTML = '<div class="empty">正在打开…</div>';
  try { sy = await api('/api/sync/status'); }
  catch (e) {                       // 弱网：题库没下下来。别显示登录页（可能已经登录过），给个重试
    document.body.classList.add('login-page');
    app.innerHTML = '<div class="web-login"><div class="wl-card wl-msg"><div class="wl-msg-t">网络不太好</div>' +
      '<div class="wl-msg-d">' + esc(e.message) + '</div><button class="btn wl-btn" onclick="webGate()">再试一次</button></div></div>';
    return;
  }
  if (sy.user) { state.webUser = sy.user; document.body.classList.remove('login-page'); webNetWatch(); return route(); }
  document.body.classList.add('login-page');
  const feat = (t, d) => '<li><b>' + t + '</b><span>' + d + '</span></li>';
  app.innerHTML =
    '<div class="web-login"><div class="wl-card">' +
      '<div class="wl-brand">' +
        '<div class="wl-logo"><span class="wl-seal">题</span><span><b>智学题库</b><small>江苏中职学测刷题 · 网页版</small></span></div>' +
        '<ul class="wl-feat">' +
          feat('记录存在账号里', '换电脑、清浏览器缓存都不会丢') +
          feat('三端互通', '电脑版、手机 App 登录同一个账号，记录自动合并') +
          feat('断网也能做', '记录先存在这台浏览器里，联网后自动上传') +
        '</ul>' +
      '</div>' +
      '<form class="wl-form" onsubmit="return false" autocomplete="on">' +
        '<div class="wl-h">登录</div>' +
        '<label class="wl-field"><span>用户名</span><input class="input" id="sync-user" name="username" autocomplete="username" autocapitalize="off" spellcheck="false"></label>' +
        '<label class="wl-field"><span>密码</span><span class="wl-pw"><input class="input" id="sync-pass" name="password" type="password" autocomplete="current-password">' +
          '<button type="button" class="wl-eye" id="wl-eye" title="显示密码" aria-label="显示密码">' + WEB_EYE + '</button></span></label>' +
        '<div class="wl-err" id="web-login-err" hidden></div>' +
        '<button type="submit" class="btn wl-btn" id="web-login-btn">登录</button>' +
        '<div class="wl-tip">账号找管理员要。在学校机房、别人的电脑上用完记得到「设置」里退出登录。</div>' +
      '</form>' +
    '</div>' +
    '<div class="wl-foot">作者 十三、chen_pi</div></div>';
  const go = () => syncLogin();
  $('#web-login-btn').addEventListener('click', go);
  $('#wl-eye').addEventListener('click', () => {
    const i = $('#sync-pass'), show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    $('#wl-eye').classList.toggle('on', show);
  });
  ['#sync-user', '#sync-pass'].forEach(k => $(k).addEventListener('input', () => { $('#web-login-err').hidden = true; }));
  $('#sync-user').focus();
}
// 登录页上的出错提示直接写在表单里（不用一闪就没的 toast）
function webLoginErr(msg) {
  const b = $('#web-login-err');
  if (!b) return false;
  b.textContent = msg;
  b.hidden = false;
  return true;
}

// 网页版登录成功：先把账号里的记录下载下来，再进首页（不然首页一开始是空的）。
// 弱网时最多等 8 秒，下不完就先进去，后台接着同步（做题照常记，不会丢）
async function webEnter(sy) {
  app.innerHTML = '<div class="web-login"><div class="wl-card wl-msg"><div class="wl-msg-t">登录成功</div><div class="wl-msg-d">正在下载你的做题记录…</div></div></div>';
  const sync = api('/api/sync/now', { method: 'POST', body: {} }).then(() => lsPull());
  const slow = new Promise(r => setTimeout(() => r('slow'), 8000));
  try {
    if (await Promise.race([sync, slow]) === 'slow') toast('网络有点慢，记录在后台接着下载，先做题不影响');
  } catch (e) { toast('记录还没下载完：' + e.message + '，联网后会自动再试', 'bad'); }
  sync.catch(() => {});
  state.webUser = sy.user;
  document.body.classList.remove('login-page');
  webNetWatch();
  if (!/^#\/(home)?$/.test(location.hash)) location.hash = '#/home';
  route();
}

// 网页版顶栏上的网络状态：断网、有记录没传上去时显示，点一下立即同步。
// 关页面时还有没传上去的，浏览器会问一句（记录在这台浏览器里不会丢，只是别的设备暂时看不到）
let webNetTimer = null;
function webNetWatch() {
  if (webNetTimer) return;
  let pill = $('#web-net');
  if (!pill) {
    pill = document.createElement('button');
    pill.id = 'web-net';
    pill.className = 'web-net';
    pill.hidden = true;
    const days = $('#top-days');
    days.parentNode.insertBefore(pill, days.nextSibling);
    pill.addEventListener('click', async () => {
      if (!navigator.onLine) { toast('现在没网：做题照常，记录先存在这台浏览器里，联网后自动上传'); return; }
      pill.textContent = '同步中…';
      try { await api('/api/sync/now', { method: 'POST', body: {} }); toast('已同步', 'good'); }
      catch (e) { toast(e.message, 'bad'); }
      upd();
    });
  }
  let last = { pending: 0 };
  async function upd() {
    try { last = await api('/api/sync/status'); } catch (e) { return; }
    if (last.need_update) return webForceReload(0);           // 服务器要求先更新：网页刷新就是最新版
    if (!last.user) { pill.hidden = true; return; }
    const off = !navigator.onLine;
    pill.hidden = !off && !(last.pending && last.last_err);
    pill.classList.toggle('off', off);
    pill.textContent = off ? '离线' + (last.pending ? ' · ' + last.pending + ' 条未上传' : '') : last.pending + ' 条未上传';   // 手机顶栏窄，字要短
    pill.title = off ? '没网也能做题，记录先存在这台浏览器里，联网后自动上传' : (last.last_err || '') + '（点一下重试）';
  }
  window.addEventListener('online', () => setTimeout(upd, 1500));
  window.addEventListener('offline', upd);
  window.addEventListener('beforeunload', e => {
    if (state.webUser && last.pending && (!navigator.onLine || last.last_err)) { e.preventDefault(); e.returnValue = ''; }
  });
  webNetTimer = setInterval(upd, 15000);
  upd();
}

// 网页版强制更新：刷新一次就是最新版。同一个版本只刷一次，免得服务器上的网页还没换新时一直刷
function webForceReload(v) {
  let done = '';
  try { done = sessionStorage.getItem('zx.forceReloaded') || ''; } catch (e) { /* ignore */ }
  if (done === String(window.ZX_WEB.v)) return;
  try { sessionStorage.setItem('zx.forceReloaded', String(window.ZX_WEB.v)); } catch (e) { /* ignore */ }
  if (v) store.set('zx.updDone', v);
  location.reload();
}

// 网页版：内容更新了（服务器上换了新版）就在空闲页面自动刷新，每 10 分钟看一次
function webWatchUpdate() {
  setInterval(async () => {
    try {
      const r = await fetch('content.json', { cache: 'no-store' });
      const m = await r.json(), v = m.content_version || 0;
      // 强制更新（force_min 比这个页面新）：不等空闲页面，马上刷新（作答点一下就存了，不丢）
      if ((m.force_min || 0) > (window.ZX_WEB.v || 0)) return webForceReload(v);
      if (v > (window.ZX_WEB.v || 0)) { state.pendingReload = v; if (RELOAD_OK.indexOf(state.lastPage) >= 0) reloadIfIdle(); }
    } catch (e) { /* ignore */ }
  }, 10 * 60 * 1000);
}

/* ================================================================ 启动 */

window.addEventListener('DOMContentLoaded', () => {
  route();
  loadAi().then(() => { if (state.ai.on) route(); });
  lsPull();                 // 别的设备的练习存档（登录了同步才有）
  if (IS_WEB) webWatchUpdate();
  // 打包好的程序（exe / 手机 App）每天自动查一次更新；源码运行时、网页版不查（网页版刷新就是最新）
  api('/api/app').then(a => {
    if (!(a.frozen || a.mobile) || a.web) return;
    setTimeout(() => autoCheckUpdate(a), 1500);
    // 开着不关的也每小时查一次（autoCheckUpdate 里按上次检查的时间节流）
    setInterval(() => api('/api/app').then(autoCheckUpdate).catch(() => {}), 10 * 60 * 1000);
  }).catch(() => {});
  const done = store.get('zx.updDone');
  if (done) { store.del('zx.updDone'); setTimeout(() => toast('题库和界面已自动更新到第 ' + done + ' 版', 'good'), 600); }
});
