'use strict';
/* 智学题库 前端逻辑(纯原生JS,无框架无CDN) */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = v => String(v == null ? '' : v)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 题目文本:转义后把 [[img:x]] 换成图片,「」换成下划线,〔〕换成加点字
function rich(s) {
  return esc(s)
    .replace(/\[\[img:([^\]]+)\]\]/g, (m, p) =>
      '<img class="qimg" loading="lazy" src="/media/' + p.split('/').map(encodeURIComponent).join('/') + '" onclick="zoomImg(this.src)">')
    .replace(/「([^「」]*)」/g, '<u>$1</u>')
    .replace(/〔([^〔〕]*)〕/g, '<span class="emph">$1</span>');
}

function zoomImg(src) {
  const d = document.createElement('div');
  d.className = 'zoom';
  d.innerHTML = '<img src="' + esc(src) + '">';
  d.onclick = () => d.remove();
  document.body.appendChild(d);
}

async function api(path, opts) {
  opts = opts || {};
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

// 阅读材料/情境材料展示框
// fold:长材料默认折叠(错题本、报告里同一篇材料会重复出现)
function materialBox(q, fold) {
  if (!q.material || !q.material.trim()) return '';
  if (fold && q.material.length > 160) {
    return '<details class="material-box"><summary class="material-title">材料(点开查看)· ' +
      esc(q.material.split('\n')[0].slice(0, 40)) + '…</summary>' +
      '<div class="material-body">' + rich(q.material) + '</div>' + materialCn(q) + '</details>';
  }
  return '<div class="material-box"><div class="material-title">材料</div>' +
    '<div class="material-body">' + rich(q.material) + '</div>' + materialCn(q) + '</div>';
}

function materialCn(q) {
  return q.material_cn ? '<div class="material-cn"><div class="material-title">参考译文</div>' + rich(q.material_cn) + '</div>' : '';
}

function recBadge(q) {
  if (!q.wrong_count && !q.right_count) return '';
  if (q.in_wrong) return '<span class="rec-badge bad">错题 · 已连对 ' + q.streak + '/' + MASTER_STREAK + '</span>';
  return '<span class="rec-badge">对' + q.right_count + ' 错' + q.wrong_count + '</span>';
}

function ansHtml(q) {
  return '正确答案 <b>' + rich(q.answer) + '</b>' +
    (q.analysis ? '<div class="analysis">解析:' + rich(q.analysis) + '</div>' : '') + pointBox(q);
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
  if (name !== 'exam') stopExamTimer();
  window.scrollTo(0, 0);
  routes[name](parts.slice(1));
}
window.addEventListener('hashchange', route);
applyCn();

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
        (unfinished ? '<div class="notice">有一场模拟考还没交卷:' + esc(unfinished.exam.title) + ' <a href="#/exam/run">继续作答</a></div>' : '') +
        tagRow('culture') + tagRow('pro') +
        '<div class="group-tabs">' + [['', '全部'], ['culture', GROUP_NAME.culture], ['pro', GROUP_NAME.pro]].map(g =>
          '<button class="group-tab' + (h.group === g[0] ? ' on' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>').join('') +
        '</div>' +
        '<div class="pill-row">' +
          '<button class="pill-tab' + (h.subj === '' ? ' on' : '') + '" data-s="">' + (h.group ? '全部' + GROUP_NAME[h.group] : '全部卷子') + '</button>' +
          entries.filter(inGroup).map(e => '<button class="pill-tab' + (h.subj === e.key ? ' on' : '') + '" data-s="' + e.key + '">' +
            '<span class="dot ' + e.dot + '"></span>' + esc(e.name) + '</button>').join('') +
        '</div>' +
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

function paperRow(p, i) {
  const st = p.mastery >= 80 ? ['已掌握', 'st-done'] : (p.seen ? ['练习中', 'st-doing'] : ['未开始', 'st-new']);
  return '<a class="prow" href="javascript:void(0)" onclick="startPractice({paper_id:' + p.id + ',scope:\'all\',order:\'seq\',title:' + jsq(p.name) + '})">' +
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
  const days = examDays(d.settings.exam_date);
  return '<div class="side-card">' +
    '<div class="sc-head"><b>今日复习</b>' +
      (days != null ? '<a href="javascript:void(0)" class="sc-link" onclick="editExamDate(' + jsq(d.settings.exam_date) + ')" title="点击修改学测日期">' +
        (days > 0 ? '距学测 <em>' + days + '</em> 天' : (days === 0 ? '今天学测' : '学测已结束')) + '</a>' : '') +
    '</div>' +
    '<div class="sc-stats">' +
      '<div><em>' + t.due + '</em><span>到期</span></div>' +
      '<div><em>' + (t.new != null ? t.new : t.new_left) + '</em><span>新题</span></div>' +
      '<div><em>' + t.done + '</em><span>已做</span></div>' +
      '<div><em>' + (t.done ? Math.round(100 * t.right / t.done) + '%' : '-') + '</em><span>正确率</span></div>' +
    '</div>' +
    (todo ? '<button class="btn block" onclick="startReview(\'\')">开始复习 ' + todo + ' 题</button>'
          : '<div class="sc-done">今天的复习已完成</div>') +
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

async function editExamDate(cur) {
  const v = prompt('学测日期(格式 2026-11-07):', cur);
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
        (s.wrong_open ? '<button class="btn danger" onclick="startPractice({subject:\'' + subj + '\',scope:\'wrong\',title:\'' + name + '·错题\'})">错题重练(' + s.wrong_open + ')</button>' : '') +
        (subj !== 'general' ? '<a class="btn ghost" href="#/exam/new/' + subj + '">模拟考</a>' : '') +
        '<button class="btn ghost" onclick="goBank(0,\'' + subj + '\')">浏览题目</button>' +
      '</div>' +
    '</div>' +

    '<div class="sec-title">按题型练习' + (weak.length ? ' <span class="muted">· 标红的是薄弱题型(最近正确率低于 70%)</span>' : '') + '</div>' +
    '<div class="typegrid">' + s.types.map(t =>
      '<button class="typebtn' + (weak.indexOf(t.type) >= 0 ? ' weak' : '') + '" onclick="startPractice({subject:\'' + subj +
        '\',type:\'' + t.type + '\',scope:\'all\',title:\'' + name + '·' + TYPE_NAME[t.type] + '\'})">' +
        '<span class="ti">' + (TYPE_ICON[t.type] || '') + '</span>' +
        '<span class="tn">' + (TYPE_NAME[t.type] || t.type) + '</span>' +
        '<span class="tc">' + t.total + ' 题 · 掌握 ' + t.mastery + '%' + (t.accuracy != null ? ' · 对 ' + t.accuracy + '%' : '') + '</span>' +
        bar(t.mastery, 'thin') +
      '</button>').join('') + '</div>' +

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
      '<button class="btn sm" onclick="startPractice({paper_id:' + p.id + ',scope:\'all\',order:\'seq\',title:' + jsq(p.name) + '})">按顺序做</button>' +
      '<button class="btn ghost sm" onclick="startPractice({paper_id:' + p.id + ',scope:\'all\',title:' + jsq(p.name + '·乱序') + '})">乱序做</button>' +
      (p.wrong_open ? '<button class="btn danger sm" onclick="startPractice({paper_id:' + p.id + ',scope:\'wrong\',title:' + jsq(p.name + '·错题') + '})">错题(' + p.wrong_open + ')</button>' : '') +
      '<button class="btn ghost sm" onclick="goBank(' + p.id + ')">浏览</button>' +
      '<button class="btn danger sm" onclick="delPaper(' + p.id + ',' + jsq(p.name) + ')">删除</button>' +
    '</div></div>';
}

async function delPaper(pid, name) {
  if (!confirm('删除卷子「' + name + '」及其全部题目和练习记录?')) return;
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
        '<b style="font-size:14px">科目:</b>' +
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
      '<div class="muted" style="margin-top:10px">含图片、公式的大题库请用题库包导入:在 学测/_脚本 运行 build_packs.py,' +
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
      line.textContent = '正在识别:' + f.name + ' …';
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
              (d.no_answer ? '<div class="muted" style="color:var(--amber)">' + d.no_answer + ' 题未识别到答案,仅收入题库浏览</div>' : '') +
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
    ? b.items.map(qCard).join('') +
      (b.items.length < b.total
        ? '<div class="loadmore"><button class="btn ghost" onclick="loadMore()">加载更多(' + b.items.length + '/' + b.total + ')</button></div>'
        : '<div class="muted" style="text-align:center;padding:10px">共 ' + b.total + ' 题</div>')
    : '<div class="empty">没有符合条件的题目,换个题型或关键词试试。</div>';
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
        ? '<button class="btn sm" onclick="startPractice({subject:' + jsq(subj) + ',scope:\'wrong\',title:\'错题重练\'})">错题重练</button>' +
          '<a class="btn ghost sm" href="/api/export/wrong">导出</a>'
        : '') +
    '</div>' +
    (!tab ? '<div class="muted" style="margin:-4px 0 12px">错题要在<b>不同的日子</b>里连续答对 ' + MASTER_STREAK + ' 次才会消灭,今日复习会按时把它们排出来。</div>' : '') +
    (list.length
      ? list.map(q =>
        '<div class="card">' +
          '<div class="qhead">' +
            '<span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
            '<span class="qsrc">' + esc(q.paper_name) + ' · 第' + q.qno + '题</span>' +
            '<span class="rec-badge bad">做错 ' + q.wrong_count + ' 次</span>' +
            (!q.mastered ? '<span class="rec-badge">已连对 ' + q.streak + '/' + MASTER_STREAK + (q.due ? ' · ' + q.due.slice(5) + ' 复习' : '') + '</span>' : '') +
            '<div style="flex:1"></div>' +
            (q.mastered
              ? '<button class="btn ghost sm" onclick="markWrong(' + q.id + ',false)">重新加入</button>'
              : '<button class="btn green sm" onclick="markWrong(' + q.id + ',true)">标记已掌握</button>') +
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
  if (!d.items.length) { toast('今天没有要复习的题了,新题额度也用完了'); return; }
  beginPractice(d.items, (subject ? SUBJECT_NAME[subject] + ' · ' : '') + '今日复习', 'review');
  toast('到期 ' + d.due + ' 题 + 新题 ' + d.new + ' 题');
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
  if (!d.items.length) {
    toast(opts.scope === 'wrong' ? '现在没有待消灭的错题' : (opts.scope === 'new' ? '这里的题都做过了' : '该范围暂无可练习的题目'));
    return;
  }
  beginPractice(d.items, opts.title || '练习', 'practice');
}

function beginPractice(list, title, mode) {
  state.practice = { list: list, idx: 0, correct: 0, answered: false, results: [], title: title,
                     mode: mode, requeued: {}, firstTotal: list.length };
  if (location.hash === '#/practice') route();
  else location.hash = '#/practice';
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

function renderQ() {
  const p = state.practice;
  const q = p.list[p.idx];
  const opts = optionList(q);
  const pct = Math.round(100 * p.idx / p.list.length);
  const again = p.idx >= p.firstTotal;
  const wrongN = p.results.filter(r => !r.correct).length;
  const doneN = p.results.length;
  app.innerHTML =
    '<div class="crumb">当前位置:<a href="#/home">首页</a> &gt; ' + esc(p.title) +
      '<a class="crumb-exit" href="javascript:void(0)" onclick="quitPractice()">退出练习</a></div>' +
    '<div class="pbar-wrap"><div class="pbar"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="card qcard-main">' +
      '<div class="qhead">' +
        '<span class="tag t-' + q.type + '">' + TYPE_NAME[q.type] + '</span>' +
        '<span class="qsrc">' + esc(q.paper_name) + ' 第' + q.qno + '题</span>' +
        (again ? '<span class="rec-badge bad">刚才做错,再来一次</span>' : recBadge(q)) +
        '<span class="spacer"></span>' + cnBtn(q) +
      '</div>' +
      materialBox(q) +
      '<div class="stem">' + (p.idx + 1) + '/' + p.list.length + '、' + rich(q.stem) + '</div>' + stemCn(q) +
      '<div id="qbody"></div>' +
      '<div class="msg-bar"><span class="muted">答对:</span><span class="num-green">' + p.correct + ' 题</span>' +
        '<span class="muted">答错:</span><span class="num-red">' + wrongN + ' 题</span>' +
        '<span class="muted">正确率:</span>' + (doneN ? Math.round(100 * p.correct / doneN) : 0) + '%</div>' +
    '</div>';

  const body = $('#qbody');
  if (SELF_TYPES.indexOf(q.type) >= 0) {
    const ph = { dictation: '在纸上或这里默写诗句,再对照答案(选填)…',
                 essay: '可以先列提纲,写完再对照参考思路自评(选填)…',
                 solution: '在草稿纸上推演,做完再来对照(此栏可记关键步骤,选填)…',
                 blank: '在纸上写出结果,再来对照(选填)…' }[q.type] || '可以在这里写下你的思路(选填)…';
    const btnText = { dictation: '查看默写答案', essay: '查看写作思路',
                      solution: '做完了,对照解答', blank: '做完了,对照答案' }[q.type] || '查看参考答案';
    body.innerHTML =
      '<textarea class="selfarea" id="self-input" placeholder="' + ph + '"></textarea>' +
      '<div class="qactions" id="qact"><button class="btn" onclick="showQaAns()">' + btnText + '</button></div>';
  } else if (q.type === 'multi') {
    body.innerHTML =
      '<div class="opts" id="optsbox">' + opts.map((o, i) =>
        '<button class="opt" data-k="' + esc(o[0]) + '" onclick="toggleMulti(this)"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + optCn(q, i) + '</span></button>').join('') + '</div>' +
      '<div class="qactions" id="qact"><span class="muted">多选题:选择多项后确认</span><div class="spacer"></div>' +
        '<button class="btn" id="multi-ok" disabled onclick="confirmMulti()">确认答案</button></div>';
  } else {
    body.innerHTML =
      (q.type === 'judge'
        ? '<div class="judge-row">' + opts.map(o =>
          '<button class="opt" data-k="' + esc(o[0]) + '" onclick="submitChoice(\'' + esc(o[0]) + '\')"><span class="key">' + (o[0] === '对' ? '✓' : '✗') + '</span><span>' + esc(o[1]) + '</span></button>').join('') + '</div>'
        : '<div class="opts" id="optsbox">' + opts.map((o, i) =>
          '<button class="opt" data-k="' + esc(o[0]) + '" onclick="submitChoice(\'' + esc(o[0]) + '\')"><span class="key">' + esc(o[0]) + '</span><span>' + rich(o[1]) + optCn(q, i) + '</span></button>').join('') + '</div>') +
      '<div class="qactions" id="qact"></div>';
  }
}

function toggleMulti(btn) {
  const p = state.practice;
  if (!p || p.answered) return;
  btn.classList.toggle('sel');
  const ok = $('#multi-ok');
  if (ok) ok.disabled = !$$('#optsbox .opt.sel').length;
}

function confirmMulti() {
  const p = state.practice;
  if (!p || p.answered) return;
  const sel = $$('#optsbox .opt.sel').map(b => b.dataset.k);
  if (sel.length) gradeAndShow(sel);
}

function submitChoice(key) {
  const p = state.practice;
  if (!p || p.answered) return;
  gradeAndShow([key]);
}

function recordResult(q, ok) {
  const p = state.practice;
  p.results.push({ q: q, correct: ok });
  if (ok) p.correct++;
  // 复习模式:做错的题在本轮末尾再出现一次
  if (!ok && p.mode === 'review' && !p.requeued[q.id]) {
    p.requeued[q.id] = 1;
    p.list.push(q);
  }
  api('/api/record', { method: 'POST', body: { question_id: q.id, correct: ok, mode: p.mode } })
    .then(d => {
      if (d.event === 'released') toast('连续答对 ' + MASTER_STREAK + ' 次,这道错题已消灭', 'good');
      else if (d.event === 'entered') toast('已加入错题本');
    })
    .catch(e => toast('记录失败:' + e.message, 'bad'));
}

function gradeAndShow(selKeys) {
  const p = state.practice;
  const q = p.list[p.idx];
  const isRight = q.type === 'multi'
    ? selKeys.slice().sort().join('') === q.answer.split('').sort().join('')
    : selKeys[0] === q.answer;
  p.answered = true;
  $('.qcard-main').classList.add('answered');
  recordResult(q, isRight);

  $$('#qbody .opt').forEach(b => {
    b.disabled = true;
    const k = b.dataset.k;
    const inAns = q.type === 'multi' ? q.answer.indexOf(k) >= 0 : k === q.answer;
    if (inAns) b.classList.add('ok');
    else if (selKeys.indexOf(k) >= 0) b.classList.add('bad');
  });
  const okBtn = $('#multi-ok');
  if (okBtn) okBtn.style.display = 'none';

  const fb = document.createElement('div');
  fb.className = 'feedback ' + (isRight ? 'good' : 'bad');
  fb.innerHTML = '<div class="ans-line">' + (isRight ? '✓ 答对了' : '✗ 答错了') +
    ' 正确答案:<b>' + esc(q.answer) + '</b></div>' +
    (q.analysis ? '<div class="analysis">' + rich(q.analysis) + '</div>' : '') + pointBox(q);
  $('#qbody').insertBefore(fb, $('#qact'));

  $('#qact').innerHTML = '<span class="muted">回车 = 下一题</span><div class="spacer"></div>' +
    '<button class="btn" id="nextbtn" onclick="nextQ()">' +
    (p.idx + 1 >= p.list.length ? '查看结果' : '下一题') + '</button>';
  $('#nextbtn').focus();
}

function showQaAns() {
  const p = state.practice;
  const q = p.list[p.idx];
  p.answered = true;
  $('.qcard-main').classList.add('answered');
  const ta = $('#self-input');
  const fb = document.createElement('div');
  fb.className = 'feedback';
  fb.style.background = 'var(--primary-l)';
  fb.innerHTML = '<div class="ans-line">参考答案</div><div class="analysis">' + rich(q.answer) + '</div>' +
    (q.analysis ? '<div class="analysis">' + rich(q.analysis) + '</div>' : '') + pointBox(q);
  $('#qbody').insertBefore(fb, $('#qact'));
  if (ta) ta.disabled = true;
  $('#qact').innerHTML =
    '<span class="muted">对照参考答案,诚实自评:</span><div class="spacer"></div>' +
    '<button class="btn green" onclick="selfGrade(true)">✓ 我答对了</button>' +
    '<button class="btn danger" onclick="selfGrade(false)">✗ 没答好</button>';
}

function selfGrade(ok) {
  const p = state.practice;
  recordResult(p.list[p.idx], ok);
  nextQ();
}

function nextQ() {
  const p = state.practice;
  if (!p) return;
  p.answered = false;
  p.idx++;
  if (p.idx >= p.list.length) p.finished = true;
  route();
}

function quitPractice() {
  if (!state.practice || state.practice.finished || !state.practice.results.length ||
      confirm('退出练习?已作答的题都已记录。')) {
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
    pct >= 50 ? '先把这次的错题重练一遍。' : '建议先把错题本过一遍,再做新题。';
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
      ? '<div class="sec-title">本次错题(正确答案已标绿)</div>' +
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
    (unfinished ? '<div class="card notice">还没交卷:<b>' + esc(unfinished.exam.title) + '</b><div class="spacer"></div>' +
      '<a class="btn sm" href="#/exam/run">继续作答</a><button class="btn danger sm" onclick="abandonExam()">放弃</button></div>' : '') +
    '<div class="card">' +
      '<div class="sec-title" style="margin-top:0">开始一场模拟考</div>' +
      '<div class="muted" style="margin-bottom:12px">和正式考试一样:从该科所有卷子里随机抽题拼成一张新卷,选项顺序也打乱(引用“以上都对”或图中标号的题除外);限时作答,交卷后统一判分,报告按原卷选项顺序显示,方便对照解析。做错和没做的题自动进错题本和复习计划。</div>' +
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
  if (store.get('quiz.exam') && !confirm('还有一场没交卷的考试,放弃它并开始新的?')) return;
  let d;
  try { d = await api('/api/exam/start', { method: 'POST', body: { subject: subject, preset: preset } }); } catch (e) { toast(e.message, 'bad'); return; }
  const now = Date.now();
  store.set('quiz.exam', { exam: d.exam, answers: {}, startedAt: now, deadline: now + d.exam.minutes * 60000 });
  location.hash = '#/exam/run';
}

function abandonExam() {
  if (!confirm('放弃这场考试?作答不会被记录。')) return;
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
      return '<div class="sec-title">' + esc(sec.name) + '<span class="muted"> · ' + sec.items.length + ' 题</span></div>' +
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
                (q.type === 'multi' ? '<div class="muted" style="margin-top:6px">多选题,可选多项</div>' : '')) +
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
    if (left <= 0) { stopExamTimer(); toast('时间到,自动交卷'); submitExam(true); }
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
    if (!confirm(done < total ? '还有 ' + (total - done) + ' 题没答,确定交卷?' : '确定交卷?')) return;
  }
  submitting = true;
  try {
    const used = Math.round((Math.min(Date.now(), st.deadline) - st.startedAt) / 1000);
    const d = await api('/api/exam/submit', { method: 'POST', body: { id: st.exam.id, answers: st.answers, used_seconds: used } });
    store.del('quiz.exam');
    stopExamTimer();
    location.hash = '#/exam/' + d.exam.id;
  } catch (e) {
    toast('交卷失败:' + e.message, 'bad');
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
          return '<div class="report-cell"><div class="rc-name">' + esc(s.name) + '</div><div class="rc-num">' + s.correct + '/' + s.total + '</div>' + bar(p, p < 60 ? 'red' : '') + '</div>';
        }).join('') +
      '</div>' +
      '<div class="muted" style="margin-top:8px">按题型:' + Object.keys(bt).map(t =>
        (TYPE_NAME[t] || t) + ' ' + bt[t].correct + '/' + bt[t].total).join(' · ') + '</div>' +
      '<div class="acts">' +
        '<button class="btn" onclick="startExam(\'' + e.subject + '\',\'standard\')">再考一场</button>' +
        (wrongs.length ? '<button class="btn danger" onclick="practiceExamWrongs()">重练这次的错题(' + wrongs.length + ')</button>' : '') +
        '<a class="btn ghost" href="#/home">返回首页</a>' +
      '</div>' +
    '</div>' +
    (wrongs.length ? '<div class="sec-title">错题(红色是你的选择,绿色是正确答案)</div>' +
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
  const interactive = (tag === 'input' || tag === 'textarea' || tag === 'select' ||
                      (tag === 'button' && !t.disabled));
  if (interactive) return;
  if (e.key === 'Enter') {
    if (p.answered && SELF_TYPES.indexOf(q.type) < 0) nextQ();
    return;
  }
  if (p.answered || SELF_TYPES.indexOf(q.type) >= 0) return;
  const opts = optionList(q);
  const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5 };
  const km = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
  let i = map[e.key];
  if (i === undefined) i = km[e.key.toLowerCase()];
  if (i === undefined || !opts[i]) return;
  if (q.type === 'multi') {
    const btns = $$('#optsbox .opt');
    if (btns[i]) toggleMulti(btns[i]);
  } else {
    submitChoice(opts[i][0]);
  }
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
  const subjBox = g => {
    const os = subjOpts.filter(o => subjectGroup(o.key) === g);
    return os.length ? '<div class="subj-pick"><span class="muted">' + (GROUP_NAME[g] || '其他') + '</span>' + os.map(o =>
      '<label class="subj-check"><input type="checkbox" data-k="' + esc(o.key) + '"' + (isHidden(o.key) ? '' : ' checked') + '>' +
        esc(o.name) + '<span class="muted">' + esc(o.note) + '</span></label>').join('') + '</div>' : '';
  };
  app.innerHTML =
    '<h2 class="page-h">设置</h2>' +
    '<div class="card set-card">' +
      '<div class="set-row"><div><b>我要学的科目</b><div class="muted">不用考的科目取消勾选，它就不会出现在首页、今日复习、错题本、搜索和模拟考里。做题记录会保留，以后再勾上就回来了。</div></div></div>' +
      subjBox('culture') + subjBox('pro') + subjBox('other') +
    '</div>' +
    '<div class="card set-card">' +
      '<div class="set-row"><div><b>版本</b><div class="muted">当前 v' + esc(a.version) + (a.frozen ? '' : '(源码运行,用 git pull 更新)') + '</div></div>' +
        '<button class="btn ghost" id="upd-check"' + (a.frozen ? '' : ' disabled') + '>检查更新</button></div>' +
      '<div id="upd-out"></div>' +
      '<div class="muted set-note">更新只替换程序和题库,你的做题记录、错题本、模拟考成绩都会保留。</div>' +
    '</div>' +
    '<div class="card set-card">' +
      '<div class="set-row"><div><b>我的数据</b><div class="muted">保存在 ' + esc(a.data_dir) + '</div></div></div>' +
      '<div class="set-row"><div><b>清除做题记录</b><div class="muted">清空复习进度、错题本、模拟考记录、技能实操成绩和练习文件。题库和设置不受影响。<br>清除前会自动备份到数据文件夹的 backups 里。</div></div>' +
        '<button class="btn danger" onclick="clearMyData()">清除记录</button></div>' +
    '</div>' +
    '<div class="card set-card"><div class="set-row"><div><b>项目地址</b><div class="muted">' +
      '<a href="' + esc(a.repo) + '" target="_blank">' + esc(a.repo) + '</a></div></div></div></div>';
  const btn = $('#upd-check');
  if (btn) btn.addEventListener('click', checkUpdate);
  $$('.subj-check input').forEach(c => c.addEventListener('change', saveHidden));
}

async function saveHidden() {
  const hidden = $$('.subj-check input').filter(c => !c.checked).map(c => c.dataset.k);
  try {
    await api('/api/settings', { method: 'POST', body: { hidden_subjects: hidden } });
    state.hidden = hidden;
    toast(hidden.length ? '已保存，' + hidden.length + ' 个科目不再显示' : '已保存，全部科目都显示', 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

async function checkUpdate() {
  const out = $('#upd-out');
  out.innerHTML = '<div class="muted set-note">正在检查…</div>';
  try {
    const u = await api('/api/update/check');
    out.innerHTML = u.has_update
      ? '<div class="upd-box"><b>有新版本 v' + esc(u.latest) + '</b>' +
          (u.notes ? '<div class="upd-notes">' + esc(u.notes) + '</div>' : '') +
          '<button class="btn" id="upd-go">下载并安装</button></div>'
      : '<div class="muted set-note">已经是最新版本。</div>';
    const go = $('#upd-go');
    if (go) go.addEventListener('click', applyUpdate);
  } catch (e) { out.innerHTML = '<div class="set-note num-red">' + esc(e.message) + '</div>'; }
}

async function applyUpdate() {
  const out = $('#upd-out');
  out.innerHTML = '<div class="muted set-note">正在下载新版本(约 55MB),下载完程序会自动重启,请不要关闭…</div>';
  try {
    await api('/api/update/apply', { method: 'POST', body: {} });
  } catch (e) { out.innerHTML = '<div class="set-note num-red">' + esc(e.message) + '</div>'; return; }
  out.innerHTML = '<div class="muted set-note">下载完成,正在重启…页面会自动刷新。</div>';
  // 等新程序启动后刷新
  const start = Date.now();
  const poll = setInterval(async () => {
    try { await api('/api/app'); clearInterval(poll); location.reload(); } catch (e) {
      if (Date.now() - start > 60000) { clearInterval(poll); out.innerHTML = '<div class="set-note">重启时间有点长,稍后手动打开智学题库即可。</div>'; }
    }
  }, 2000);
}

async function clearMyData() {
  const v = prompt('确定要清除所有做题记录吗?清除后错题本、复习进度、考试记录都会清空。\n确认请输入:清除');
  if (v !== '清除') { if (v != null) toast('输入不对,没有清除'); return; }
  try {
    const d = await api('/api/data/clear', { method: 'POST', body: { confirm: '清除' } });
    toast('已清除,备份在 ' + d.backup.split(/[\\/]/).slice(-2).join('/'), 'good');
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

window.addEventListener('DOMContentLoaded', route);
