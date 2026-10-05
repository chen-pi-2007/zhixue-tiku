'use strict';
/* 技能实操:计算机应用方向 / 网络技术方向 技能卷(依赖 app.js 里的 $、api、esc、rich、toast、bar 等) */

const DIR_NAME = { comp: '计算机应用方向', net: '网络技术方向' };
// 模块印章字
const MOD_ICON = { assembly: '装', typing: '录', word: 'W', excel: 'X', ppt: 'P', web: '页', program: 'C',
                   cabling: '线', netcfg: '网', server: '服' };
const MOD_SHORT = { assembly: '组装', typing: '打字', word: 'Word', excel: 'Excel', ppt: 'PPT', web: '网页', program: '程序',
                    cabling: '布线', netcfg: '组网', server: '服务器' };
const EXT_OF = { word: '.docx', excel: '.xlsx', ppt: '.pptx' };

const sk = { detail: null, caps: {}, results: {}, typing: null };

function answerMode() { return !!store.get('quiz.answerMode'); }
function setAnswerMode(v) { store.set('quiz.answerMode', !!v); route(); }

routes.skills = viewSkills;

async function viewSkills(args) {
  stopTyping();
  if (args[0] && args[1]) return viewSkillModule(args[0], args[1]);
  if (args[0]) return viewSkillSet(args[0]);
  app.innerHTML = '<div class="empty">加载中…</div>';
  let d;
  try { d = await api('/api/skills'); } catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  if (!d.items.length) {
    app.innerHTML = '<div class="empty">还没有导入技能题库<br><span class="muted">在 学测/_脚本 运行 build_skills.py,再关掉本服务运行 python import_packs.py ..\\学测\\题库包</span></div>';
    return;
  }
  const groups = {};
  d.items.forEach(s => (groups[s.direction] = groups[s.direction] || []).push(s));
  app.innerHTML = Object.keys(groups).map(dir =>
    '<div class="sec-title">' + (DIR_NAME[dir] || dir) + ' 技能卷</div>' +
    '<div class="subj-grid">' + groups[dir].map(s =>
      '<a class="card skill-card" href="#/skills/' + s.key + '">' +
        '<div class="subj-name">' + esc(s.name) + '</div>' +
        '<div class="muted">最好成绩合计 ' + fmtScore(s.best_total) + ' / ' + s.total + ' 分</div>' +
        bar(100 * s.best_total / s.total) +
        '<div class="mod-chips">' + s.modules.map(m =>
          '<span class="mod-chip' + (m.best != null ? (m.best >= m.points * 0.999 ? ' full' : ' done') : '') + '" title="' + esc(m.title) + '">' +
            (MOD_SHORT[m.id] || m.id) + ' ' + (m.best != null ? fmtScore(m.best) : '–') + '/' + m.points + '</span>').join('') +
        '</div></a>').join('') + '</div>').join('');
}

function fmtScore(v) { return v == null ? '–' : (Math.round(v * 100) / 100).toString(); }

async function loadSkill(key) {
  const d = await api('/api/skills/' + key);
  sk.detail = d.skill;
  sk.caps = { can_open: d.can_open, dreamweaver: d.dreamweaver };
  return d.skill;
}

function answerSwitch() {
  const on = answerMode();
  return '<label class="ans-switch' + (on ? ' on' : '') + '"><input type="checkbox"' + (on ? ' checked' : '') +
    ' onchange="setAnswerMode(this.checked)"> 答案模式</label>';
}

async function viewSkillSet(key) {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let s;
  try { s = await loadSkill(key); } catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  app.innerHTML =
    '<div class="crumb"><a href="#/skills">技能实操</a> / ' + esc(s.name) + '</div>' +
    '<div class="card skill-top"><div><div class="subj-name big">' + esc(s.name) + '</div>' +
      '<div class="muted">满分 ' + s.total + ' 分 · 练习文件夹:' + esc(s.work_dir) + '</div></div>' + answerSwitch() + '</div>' +
    (s.intro ? '<div class="card"><div class="material-body">' + richBlock(s.intro) + '</div></div>' : '') +
    '<div class="subj-grid">' + s.modules.map(m => {
      const best = m.history.length ? Math.max.apply(null, m.history.map(h => h.score)) : null;
      return '<a class="card skill-card" href="#/skills/' + key + '/' + m.id + '">' +
        '<div class="subj-name"><span class="ti">' + (MOD_ICON[m.id] || '') + '</span>' + esc(m.title) + '</div>' +
        '<div class="muted">' + m.points + ' 分 · ' + ({ office: '上机操作 · 自动评分', web: '上机操作 · 自动评分', typing: '打字计时 · 自动评分',
          program: '程序填空 · 自动评分', netcfg: '粘贴配置 · 自动评分', card: '实物操作 · 对照评分标准自查' }[m.kind] || '') + '</div>' +
        (best != null ? '<div class="muted">最好 ' + fmtScore(best) + ' 分 · 练了 ' + m.history.length + ' 次</div>' + bar(100 * best / m.points) : '<div class="muted">还没练过</div>') +
      '</a>';
    }).join('') + '</div>' +
    (s.deviations && s.deviations.length ? '<div class="card notice-soft"><b>参考答案的疏漏</b>(判分以题目要求为准):<ul>' +
      s.deviations.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '');
}

async function viewSkillModule(key, mid) {
  app.innerHTML = '<div class="empty">加载中…</div>';
  let s;
  try { s = (sk.detail && sk.detail.key === key && sk.fresh) ? sk.detail : await loadSkill(key); } catch (e) { app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
  sk.fresh = false;
  const m = s.modules.find(x => x.id === mid);
  if (!m) { app.innerHTML = '<div class="empty">没有这个模块</div>'; return; }
  const best = m.history.length ? Math.max.apply(null, m.history.map(h => h.score)) : null;
  app.innerHTML =
    '<div class="crumb"><a href="#/skills">技能实操</a> / <a href="#/skills/' + key + '">' + esc(s.name) + '</a> / ' + esc(m.title) + '</div>' +
    '<div class="card skill-top"><div><div class="subj-name big"><span class="ti">' + (MOD_ICON[m.id] || '') + '</span>' + esc(m.title) + '</div>' +
      '<div class="muted">' + m.points + ' 分' + (best != null ? ' · 最好 ' + fmtScore(best) + ' 分 · 练了 ' + m.history.length + ' 次' : '') + '</div></div>' +
      answerSwitch() + '</div>' +
    '<div id="skbody"></div>' +
    (m.history.length ? '<div class="muted hist">历史得分:' + m.history.slice(-10).reverse().map(h => h.t.slice(5) + ' <b>' + fmtScore(h.score) + '</b>').join(' · ') + '</div>' : '');
  const body = $('#skbody');
  ({ office: renderOffice, web: renderOffice, typing: renderTyping, program: renderProgram, netcfg: renderNet, card: renderCard }[m.kind])(body, s, m);
}

// 卷子正文:把“| a | b |”行渲染成表格,其余按 rich 显示
function richBlock(text) {
  const lines = String(text || '').split('\n');
  let out = '', tbl = [];
  const flush = () => {
    if (!tbl.length) return;
    out += '<table class="plan">' + tbl.map((r, i) => '<tr>' + r.map(c => (i ? '<td>' : '<th>') + rich(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table>';
    tbl = [];
  };
  for (const l of lines) {
    const t = l.trim();
    if (/^\|.*\|$/.test(t)) { tbl.push(t.slice(1, -1).split('|').map(x => x.trim())); continue; }
    flush();
    out += rich(l) + '\n';
  }
  flush();
  return out.replace(/\n{3,}/g, '\n\n');
}

/* ---------------------------------------------------------------- Office / 网页 */

function taskList(m, result) {
  return '<div class="tasks">' + (m.tasks || []).map((t, i) => {
    const r = result && result.tasks[i];
    const cl = (m.checklist || [])[i] || [];
    let checks = '';
    if (r) {
      checks = '<ul class="checks">' + r.checks.map(c =>
        '<li class="' + (c.ok ? 'ok' : 'bad') + '"><span class="ck">' + (c.ok ? '✓' : '✗') + '</span><b>' + esc(c.desc) + '</b> <span class="pts">' + fmtScore(c.score) + '/' + c.points + '</span>' +
        '<div class="ck-detail">' + esc(c.detail) + '</div></li>').join('') + '</ul>';
    } else if (answerMode() && cl.length) {
      checks = '<ul class="checks plain">' + cl.map(c => '<li><span class="ck">•</span>' + esc(c.desc) + ' <span class="pts">' + c.points + '分</span></li>').join('') + '</ul>';
    }
    return '<div class="task' + (r ? (r.score >= r.points - 0.001 ? ' full' : ' part') : '') + '">' +
      '<div class="task-head"><span class="task-text">' + esc(t.text) + '</span>' +
        '<span class="task-pts">' + (r ? '<b>' + fmtScore(r.score) + '</b>/' : '') + t.points + '分</span></div>' +
      (answerMode() && t.rubric ? '<div class="rubric">评分细则:' + esc(t.rubric) + '</div>' : '') +
      checks + '</div>';
  }).join('') + '</div>';
}

function renderOffice(body, s, m) {
  const isWeb = m.kind === 'web';
  const ext = EXT_OF[m.id];
  const canOpen = isWeb || (sk.caps.can_open || {})[ext];
  const result = sk.results[s.key + '/' + m.id];
  const btns = [];
  btns.push('<button class="btn" onclick="skStart(\'' + s.key + '\',\'' + m.id + '\',true)">开始练习' + (isWeb ? '' : '(复制素材并打开)') + '</button>');
  if (m.work_exists) btns.push('<button class="btn ghost" onclick="skOpen(\'' + s.key + '\',\'' + m.id + '\',\'work\')">继续上次' + (m.work_mtime ? '(' + m.work_mtime + ')' : '') + '</button>');
  btns.push('<button class="btn ghost" onclick="skOpen(\'' + s.key + '\',\'' + m.id + '\',\'folder\')">打开练习文件夹</button>');
  if (isWeb && m.work_exists) btns.push('<a class="btn ghost" target="_blank" href="/work/' + s.key + '/web/index.html">在浏览器里预览</a>');
  btns.push('<button class="btn green" onclick="skCheck(\'' + s.key + '\',\'' + m.id + '\')" ' + (m.can_check ? '' : 'disabled') + '>检查评分</button>');
  body.innerHTML =
    '<div class="card">' +
      (m.intro ? '<div class="muted" style="margin-bottom:8px">' + esc(m.intro) + '</div>' : '') +
      '<div class="paper-acts">' + btns.join('') + '</div>' +
      '<div class="muted tip">' + (isWeb
        ? (sk.caps.dreamweaver ? '“开始练习”会用 Dreamweaver 打开 index.html。' : '没找到 Dreamweaver:“开始练习”会打开练习文件夹,用 Dreamweaver(或其他网页编辑器)打开 index.html 操作。') + '保存所有框架和网页后点“检查评分”。'
        : (canOpen ? '在 Office / WPS 里按要求操作,<b>保存(Ctrl+S)</b>后回到这里点“检查评分”。不用关闭文件。' :
          '这台电脑没有能打开 ' + ext + ' 的程序(没装 Office/WPS),没法上机练习。可以打开右上角的“答案模式”看参考答案。')) + '</div>' +
      (result && result.warning ? '<div class="warn-line">' + esc(result.warning) + '</div>' : '') +
      (result ? '<div class="score-line">本次得分 <b>' + fmtScore(result.score) + '</b> / ' + result.points + '</div>' : '') +
    '</div>' +
    taskList(m, result) +
    (answerMode() ? answerOffice(s, m) : '');
}

function answerOffice(s, m) {
  if (m.kind === 'web') {
    return '<div class="card"><div class="sec-title" style="margin-top:0">参考答案(网页效果)</div>' +
      '<div class="paper-acts" style="margin-bottom:10px"><a class="btn ghost sm" target="_blank" href="/media/' + m.answer_web + '">新窗口打开</a>' +
      '<button class="btn ghost sm" onclick="skOpen(\'' + s.key + '\',\'web\',\'answer\')">打开参考答案文件夹(看源代码)</button></div>' +
      '<iframe class="ans-frame" src="/media/' + m.answer_web + '"></iframe>' +
      (m.sample ? '<div class="muted" style="margin:10px 0 4px">样张:</div><img class="qimg" src="/media/' + m.sample + '" onclick="zoomImg(this.src)">' : '') +
      '</div>';
  }
  const ext = EXT_OF[m.id];
  return '<div class="card"><div class="sec-title" style="margin-top:0">参考答案(' + esc(m.title) + ')</div>' +
    '<div class="paper-acts" style="margin-bottom:10px"><a class="btn ghost sm" target="_blank" href="/media/' + m.answer_pdf + '">新窗口打开 PDF</a>' +
    ((sk.caps.can_open || {})[ext] ? '<button class="btn ghost sm" onclick="skOpen(\'' + s.key + '\',\'' + m.id + '\',\'answer\')">用 Office 打开参考答案文件</button>' : '') +
    '</div>' +
    ((m.answer_images || []).length
      ? '<div class="ans-pages">' + m.answer_images.map(p => '<img src="/media/' + p + '" onclick="zoomImg(this.src)">').join('') + '</div>'
      : '<iframe class="ans-frame" src="/media/' + m.answer_pdf + '"></iframe>') +
    '<div class="muted">PDF 由参考答案文档导出,没装 Office 也能看。动画、切换效果、条件格式规则等看不出来的设置,以上面各小题的检查项为准。</div></div>';
}

async function skStart(key, mid, reset) {
  try {
    const d = await api('/api/skills/' + key + '/' + mid + '/start', { method: 'POST', body: { reset: reset, open: true } });
    toast(d.opened ? '已复制素材并打开:' + d.opened : '已复制素材', 'good');
    delete sk.results[key + '/' + mid];
    route();
  } catch (e) { toast(e.message, 'bad'); }
}

async function skOpen(key, mid, what) {
  try {
    const d = await api('/api/skills/' + key + '/' + mid + '/open', { method: 'POST', body: { what: what } });
    toast('已打开 ' + (d.opened || ''));
  } catch (e) { toast(e.message, 'bad'); }
}

async function skCheck(key, mid) {
  try {
    const d = await api('/api/skills/' + key + '/' + mid + '/check', { method: 'POST', body: {} });
    sk.results[key + '/' + mid] = d.result;
    toast('得分 ' + fmtScore(d.result.score) + ' / ' + d.result.points, d.result.score >= d.result.points - 0.001 ? 'good' : '');
    viewSkillModule(key, mid);
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------------------------------------------------------- 信息录入 */

function stopTyping() {
  if (sk.typing && sk.typing.timer) clearInterval(sk.typing.timer);
  sk.typing = null;
}

// 金山打字通式：原文按行显示，每行下面一行输入，逐字标出对错
const TY_LINE = 26;

function typingLines(text) {
  const src = String(text || '').replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i < src.length; i += TY_LINE) out.push(src.slice(i, i + TY_LINE));
  return out;
}

function renderTyping(body, s, m) {
  const result = sk.results[s.key + '/typing'];
  const lines = typingLines(m.text);
  body.innerHTML =
    '<div class="card"><div class="muted" style="white-space:pre-wrap">' + esc(m.intro) + '</div></div>' +
    '<div class="card">' +
      '<div class="ty-bar">' +
        '<label class="muted">限时 <select class="inp" id="ty-min"><option value="5">5 分钟</option><option value="10" selected>10 分钟</option><option value="0">不限时</option></select></label>' +
        '<button class="btn" id="ty-start" onclick="typingStart(\'' + s.key + '\')">开始</button>' +
        '<button class="btn green" id="ty-stop" onclick="typingSubmit(\'' + s.key + '\')" disabled>交卷</button>' +
        '<span class="timer" id="ty-timer">00:00</span>' +
        '<span class="ty-stat">进度 <b id="ty-prog">0</b>/' + lines.join('').length + '</span>' +
        '<span class="ty-stat">速度 <b id="ty-speed">0</b> 字/分</span>' +
        '<span class="ty-stat">正确率 <b id="ty-acc">100</b>%</span>' +
        '<span class="ty-stat bad">错 <b id="ty-err">0</b></span>' +
      '</div>' +
      '<div class="ty-board" id="ty-board">' + lines.map((l, i) =>
        '<div class="ty-row" id="ty-row' + i + '">' +
          '<div class="ty-src">' + Array.from(l).map(ch => '<span>' + esc(ch) + '</span>').join('') + '</div>' +
          '<input class="ty-line" id="ty-in' + i + '" data-i="' + i + '" autocomplete="off" spellcheck="false" disabled>' +
        '</div>').join('') + '</div>' +
      (result ? '<div class="score-line">速度 <b>' + result.speed + '</b> 字/分钟 · 共 ' + result.chars + ' 字 · 错 ' + result.errors + ' 字 · 用时 ' + fmtDur(result.seconds) +
        '<br>速度分 ' + result.base + ' − 错字 ' + result.errors + '×0.2 = <b>' + fmtScore(result.score) + '</b> / 15</div>' : '') +
      '<div class="muted tip">点“开始”后在每行下面的框里照着打,打满一行自动换行(回车也可以),空行按退格回到上一行。绿字=打对,红底=打错。' +
        '评分规则(评分表):10 字/分钟起计分,30 字/分钟及以上满分 15 分;错字、多字、缺字及多余空格每个扣 0.2 分。</div>' +
    '</div>';
  sk.tyLines = lines;
  lines.forEach((l, i) => bindTypingLine(i));
}

function bindTypingLine(i) {
  const el = $('#ty-in' + i);
  let composing = false;
  const block = e => { e.preventDefault(); toast('考试不能粘贴', 'bad'); };
  el.addEventListener('paste', block);
  el.addEventListener('drop', block);
  el.addEventListener('compositionstart', () => { composing = true; });
  el.addEventListener('compositionend', () => { composing = false; onLine(); });
  el.addEventListener('input', () => { if (!composing) onLine(); else paintLine(i); });
  el.addEventListener('focus', () => {
    document.querySelectorAll('.ty-row.cur').forEach(r => r.classList.remove('cur'));
    $('#ty-row' + i).classList.add('cur');
    paintLine(i);
  });
  el.addEventListener('blur', () => paintLine(i));
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); gotoLine(i + 1); }
    else if (e.key === 'Backspace' && !el.value && i > 0) { e.preventDefault(); gotoLine(i - 1, true); }
  });
  function onLine() {
    paintLine(i);
    typingStats();
    if (el.value.length >= sk.tyLines[i].length) gotoLine(i + 1);
  }
}

function gotoLine(i, atEnd) {
  const el = $('#ty-in' + i);
  if (!el || el.disabled) return;
  el.focus();
  if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  const row = $('#ty-row' + i);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function paintLine(i) {
  const el = $('#ty-in' + i);
  const typed = Array.from((el || {}).value || '');
  const active = el === document.activeElement;           // 只有正在打的那一行标出下一个字
  const spans = $('#ty-row' + i).querySelectorAll('.ty-src span');
  spans.forEach((sp, k) => {
    sp.className = k < typed.length ? (typed[k] === sp.textContent ? 'ok' : 'bad') : (k === typed.length && active ? 'next' : '');
  });
}

function typingStats() {
  if (!sk.typing) return;
  let n = 0, right = 0;
  sk.tyLines.forEach((l, i) => {
    const t = Array.from(($('#ty-in' + i) || {}).value || '');
    n += t.length;
    t.forEach((ch, k) => { if (ch === l[k]) right++; });
  });
  const sec = Math.max(1, (Date.now() - sk.typing.start) / 1000);
  $('#ty-prog').textContent = n;
  $('#ty-speed').textContent = Math.round(n / sec * 60);
  $('#ty-acc').textContent = n ? Math.round(100 * right / n) : 100;
  $('#ty-err').textContent = n - right;
}

function typingStart(key) {
  sk.tyLines.forEach((l, i) => { const el = $('#ty-in' + i); el.disabled = false; el.value = ''; paintLine(i); });
  gotoLine(0);
  const limit = +$('#ty-min').value * 60;
  $('#ty-start').disabled = true; $('#ty-stop').disabled = false;
  stopTyping();
  sk.typing = { start: Date.now(), limit: limit };
  sk.typing.timer = setInterval(() => {
    if (!$('#ty-timer')) { stopTyping(); return; }
    const sec = Math.floor((Date.now() - sk.typing.start) / 1000);
    const show = limit ? Math.max(0, limit - sec) : sec;
    $('#ty-timer').textContent = String(Math.floor(show / 60)).padStart(2, '0') + ':' + String(show % 60).padStart(2, '0');
    typingStats();
    if (limit && sec >= limit) { toast('时间到'); typingSubmit(key); }
  }, 500);
}

async function typingSubmit(key) {
  if (!sk.typing) return;
  const sec = Math.min((Date.now() - sk.typing.start) / 1000, sk.typing.limit || 1e9);
  const typed = sk.tyLines.map((l, i) => ($('#ty-in' + i) || {}).value || '').join('');
  stopTyping();
  try {
    const d = await api('/api/skills/' + key + '/typing/check', { method: 'POST', body: { typed: typed, seconds: sec } });
    sk.results[key + '/typing'] = d.result;
    viewSkillModule(key, 'typing');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------------------------------------------------------- 程序填空 */

function renderProgram(body, s, m) {
  const result = sk.results[s.key + '/program'];
  const saved = (m.saved && m.saved.answers) || [];
  const ans = answerMode();
  // 代码里的【1】【2】换成输入框(答案模式直接显示答案)
  let code = esc(m.code);
  m.blanks.forEach((alts, i) => {
    const n = i + 1;
    const r = result && result.blanks[i];
    const field = ans
      ? '<span class="blank-ans">' + esc(alts[0]) + '</span>'
      : '<input class="blank-in' + (r ? (r.ok ? ' ok' : ' bad') : '') + '" id="blank' + i + '" spellcheck="false" placeholder="【' + n + '】" value="' + esc(r ? r.given : (saved[i] || '')) + '" style="width:' + Math.max(8, (alts[0] || '').length + 4) + 'ch">';
    code = code.replace('【' + n + '】', field);
  });
  body.innerHTML =
    '<div class="card"><div class="material-body">' + esc(m.intro) + '</div></div>' +
    '<div class="card"><pre class="code">' + code + '</pre>' +
      (ans ? '<div class="muted">评分表认可的写法:' + m.blanks.map((a, i) => '【' + (i + 1) + '】' + a.map(esc).join(' 或 ')).join(';') + '</div>'
        : '<div class="paper-acts"><button class="btn green" onclick="programCheck(\'' + s.key + '\',' + m.blanks.length + ')">检查评分</button></div>') +
      (result && !ans ? '<div class="score-line">得分 <b>' + fmtScore(result.score) + '</b> / ' + result.points + '<br>' +
        result.blanks.map(b => '【' + b.no + '】' + (b.ok ? '✓ 正确' : '✗ 参考答案:' + b.answers.map(esc).join(' 或 '))).join(';') + '</div>' : '') +
    '</div>';
}

async function programCheck(key, n) {
  const answers = [];
  for (let i = 0; i < n; i++) answers.push(($('#blank' + i) || {}).value || '');
  try {
    const d = await api('/api/skills/' + key + '/program/check', { method: 'POST', body: { answers: answers } });
    sk.results[key + '/program'] = d.result;
    viewSkillModule(key, 'program');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------------------------------------------------------- 网络组建 */

function renderNet(body, s, m) {
  const result = sk.results[s.key + '/netcfg'];
  const saved = m.saved || {};
  const ans = answerMode();
  const devs = m.devices || [];
  const manual = m.checklist.map((c, i) => c.manual ? i : -1).filter(i => i >= 0);
  body.innerHTML =
    '<div class="card"><div class="material-body">' + richBlock(m.intro) + '</div></div>' +
    (ans
      ? '<div class="card"><div class="sec-title" style="margin-top:0">参考配置命令</div>' +
        '<div class="muted" style="margin-bottom:8px">' + esc(m.answer.note || '') + ' 在设备 CLI 里 enable configure terminal 后依次输入;做完用 write 保存。</div>' +
        devs.map(d => '<div class="dev-ans"><b>' + d + '</b><pre class="code">' + esc((m.answer.configs || {})[d] || '(无)') + '</pre></div>').join('') + '</div>'
      : '<div class="card"><div class="sec-title" style="margin-top:0">粘贴配置</div>' +
        '<div class="muted" style="margin-bottom:8px">在 Packet Tracer 里对每台设备执行 <code>show running-config</code>(交换机再加 <code>show vlan brief</code>),把输出分别粘贴到下面对应的框里,然后点“检查评分”。</div>' +
        '<div class="dev-grid">' + devs.map(d =>
          '<div><b>' + d + '</b><textarea class="selfarea code-area" id="cfg-' + d + '" spellcheck="false" placeholder="' + d + ' 的 show running-config 输出">' +
            esc(((saved.configs || {})[d]) || '') + '</textarea></div>').join('') + '</div>' +
        (manual.length ? '<div class="muted" style="margin:10px 0 4px">以下项目看不出来,请自己确认:</div>' + manual.map(i =>
          '<label class="manual"><input type="checkbox" id="man-' + i + '"' + ((saved.manual || {})[i] ? ' checked' : '') + '> ' + esc(m.checklist[i].desc) + '(' + m.checklist[i].points + '分)</label>').join('') : '') +
        '<div class="paper-acts" style="margin-top:12px"><button class="btn green" onclick="netCheck(\'' + s.key + '\')">检查评分</button></div></div>') +
    '<div class="card"><div class="sec-title" style="margin-top:0">评分项(' + m.points + ' 分)' +
      (result ? ' · 得分 <b>' + fmtScore(result.score) + '</b>' : '') + '</div><ul class="checks">' +
      (result ? result.checks : m.checklist).map(c =>
        '<li class="' + (result ? (c.ok ? 'ok' : 'bad') : '') + '"><span class="ck">' + (result ? (c.ok ? '✓' : '✗') : '•') + '</span><b>' + esc(c.desc) + '</b> <span class="pts">' +
          (result ? fmtScore(c.score) + '/' : '') + c.points + '</span>' + (result ? '<div class="ck-detail">' + esc(c.detail) + '</div>' : '') + '</li>').join('') +
    '</ul></div>';
}

async function netCheck(key) {
  const m = sk.detail.modules.find(x => x.id === 'netcfg');
  const configs = {}, manual = {};
  (m.devices || []).forEach(d => { configs[d] = ($('#cfg-' + d) || {}).value || ''; });
  m.checklist.forEach((c, i) => { const el = $('#man-' + i); if (el && el.checked) manual[i] = true; });
  try {
    const d = await api('/api/skills/' + key + '/netcfg/check', { method: 'POST', body: { configs: configs, manual: manual } });
    sk.results[key + '/netcfg'] = d.result;
    sk.fresh = false;
    viewSkillModule(key, 'netcfg');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------------------------------------------------------- 自查卡(组装 / 布线 / 服务器) */

function cardItems(m) {
  if (m.tasks && m.tasks.length) return m.tasks.map(t => ({ text: t.text, points: t.points, rubric: t.rubric || '' }));
  return (m.rubric_items || []).filter(r => r.item.indexOf('合计') < 0)
    .map(r => ({ text: (r.group ? r.group.replace(/\n/g, '') + ':' : '') + r.item, points: r.points, rubric: '' }));
}

function renderCard(body, s, m) {
  const items = cardItems(m);
  const checked = (m.saved && m.saved.checked) || {};
  body.innerHTML =
    (m.intro ? '<div class="card"><div class="material-body">' + richBlock(m.intro) + '</div></div>' : '') +
    '<div class="card"><div class="sec-title" style="margin-top:0">对照评分标准自查(' + m.points + ' 分)</div>' +
      '<div class="muted" style="margin-bottom:8px">实物/虚拟机操作没法自动检查:做完后逐项对照,做到的打勾,保存后记入成绩。</div>' +
      items.map((it, i) =>
        '<label class="card-item"><input type="checkbox" id="ci-' + i + '"' + (checked[i] ? ' checked' : '') + '>' +
          '<div><div>' + esc(it.text) + ' <span class="pts">' + it.points + '分</span></div>' +
          (it.rubric ? '<div class="rubric">' + esc(it.rubric) + '</div>' : '') + '</div></label>').join('') +
      '<div class="paper-acts" style="margin-top:10px"><button class="btn green" onclick="cardSave(\'' + s.key + '\',\'' + m.id + '\',' + items.length + ')">保存自查结果</button></div>' +
    '</div>';
}

async function cardSave(key, mid, n) {
  const checked = {};
  for (let i = 0; i < n; i++) { const el = $('#ci-' + i); if (el && el.checked) checked[i] = true; }
  try {
    const d = await api('/api/skills/' + key + '/' + mid + '/check', { method: 'POST', body: { checked: checked } });
    toast('自查得分 ' + fmtScore(d.result.score) + ' / ' + d.result.points, 'good');
    viewSkillModule(key, mid);
  } catch (e) { toast(e.message, 'bad'); }
}
