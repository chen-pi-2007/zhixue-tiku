/*!
 * 智学题库 · 江苏中职学测刷题系统
 * 作者：十三（xiabanghao13）、chen_pi（chen-pi-2007）
 * 项目：https://github.com/chen-pi-2007/zhixue-tiku
 * © 2026 十三、chen_pi，保留所有权利。转载、修改后发布请注明原作者和项目地址。
 */
'use strict';
/* 手机 App 的本地后端：把电脑版 server.py + db.py + srs.py + exam.py 的逻辑搬到 JS 里，
   app.js 的 api() 发现 window.LocalAPI 就不走网络，直接调这里。
   题库 bank.json 和图片打包在 App 里；做题记录 progress 存在手机上
   （App 里通过 ZXStore 写到应用私有目录，浏览器里调试时退回 localStorage）。
   改了 db.py / srs.py / exam.py 的逻辑，这里要同步改。 */
(function () {
  const APP_VERSION = (window.ZXStore && ZXStore.appVersion && ZXStore.appVersion()) || 'dev';   // App 的版本号
  const REPO = 'chen-pi-2007/zhixue-tiku';
  const SUBJECTS = ['chinese', 'math', 'english', 'politics', 'media', 'general'];
  const SELF = ['qa', 'dictation', 'essay', 'blank', 'solution'];
  const STUDY_FIELDS = ['stem_cn', 'options_cn', 'material_cn', 'point', 'option_notes', 'phrases'];

  /* ---------------------------------------------------------------- 存储 */
  const PROG_KEY = 'zx.progress';
  const disk = {
    read() {
      try { if (window.ZXStore) return window.ZXStore.read() || ''; } catch (e) { /* ignore */ }
      try { return localStorage.getItem(PROG_KEY) || ''; } catch (e) { return ''; }
    },
    write(text) {
      if (window.ZXStore) { window.ZXStore.write(text); return; }
      localStorage.setItem(PROG_KEY, text);
    },
  };
  let bank = null, prog = null, loading = null;

  function load() {
    if (bank) return Promise.resolve();
    if (!loading) {
      loading = fetch('bank.json').then(r => r.json()).then(b => {
        bank = b;
        bank.papers = bank.papers || [];
        bank.questions = bank.questions || [];
        let p = null;
        try { p = JSON.parse(disk.read() || 'null'); } catch (e) { p = null; }
        prog = p && typeof p === 'object' ? p : {};
        prog.cards = prog.cards || {};
        prog.attempts = prog.attempts || [];
        prog.exams = prog.exams || [];
        prog.settings = prog.settings || { new_per_day: 20 };
        if (!prog.settings.exam_date) prog.settings.exam_date = '2026-11-07';
      });
    }
    return loading;
  }
  function save() { disk.write(JSON.stringify(prog)); }

  /* ---------------------------------------------------------------- 日期 */
  const pad = n => String(n).padStart(2, '0');
  const dayOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => dayOf(new Date());
  const nowStr = () => { const d = new Date(); return dayOf(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  function addDays(day, n) {
    const p = day.split('-').map(Number);
    return dayOf(new Date(p[0], p[1] - 1, p[2] + n));
  }

  /* ---------------------------------------------------------------- 间隔复习（srs.py） */
  const INTERVALS = [1, 1, 2, 4, 7, 15, 30];
  const MAX_BOX = INTERVALS.length - 1, FIRST_RIGHT_BOX = 3, MASTER_STREAK = 3;
  const newCard = () => ({ box: 0, due: '', right: 0, wrong: 0, streak: 0, last: '', last_ok: null, credit_day: '', in_wrong: false });

  function srsApply(card, ok, now) {
    const c = Object.assign(newCard(), card || {});
    const today = now.slice(0, 10);
    const fresh = c.right + c.wrong === 0;
    let event = null;
    if (ok) {
      c.right++;
      if (c.credit_day !== today) {
        c.credit_day = today;
        c.streak++;
        c.box = fresh ? FIRST_RIGHT_BOX : Math.min(c.box + 1, MAX_BOX);
      }
      c.due = addDays(today, INTERVALS[c.box]);
      if (c.in_wrong && c.streak >= MASTER_STREAK) { c.in_wrong = false; event = 'released'; }
    } else {
      c.wrong++;
      c.streak = 0;
      c.box = 0;
      c.credit_day = '';
      c.due = addDays(today, INTERVALS[0]);
      if (!c.in_wrong) event = 'entered';
      c.in_wrong = true;
    }
    c.last = now;
    c.last_ok = !!ok;
    return [c, event];
  }
  function srsMark(card, mastered, today) {
    const c = Object.assign(newCard(), card || {});
    if (mastered) { c.in_wrong = false; c.box = Math.max(c.box, 4); c.due = addDays(today, INTERVALS[c.box]); }
    else { c.in_wrong = true; c.streak = 0; c.box = 0; c.due = today; }
    return c;
  }
  const isDue = (c, today) => !!c && !!c.due && c.due <= today;
  const mastery = c => c ? c.box / MAX_BOX : 0;

  /* ---------------------------------------------------------------- 题目查询（db.py） */
  const papersById = () => { const m = {}; bank.papers.forEach(p => { m[p.id] = p; }); return m; };
  const hiddenSubjects = () => new Set(prog.settings.hidden_subjects || []);
  const subjIndex = s => { const i = SUBJECTS.indexOf(s); return i < 0 ? 99 : i; };

  function view(q, papers, hideAnswer) {
    const c = prog.cards[q.key] || {};
    const p = papers[q.paper_id] || {};
    const d = Object.assign({}, q);
    d.paper_name = p.name || '';
    d.subject = p.subject || 'general';
    d.wrong_count = c.wrong || 0;
    d.right_count = c.right || 0;
    d.in_wrong = !!c.in_wrong;
    d.mastered = (c.wrong && !c.in_wrong) ? 1 : 0;
    d.box = prog.cards[q.key] ? (c.box || 0) : null;
    d.streak = c.streak || 0;
    d.due = c.due || '';
    if (hideAnswer) {
      d.answer = '';
      d.analysis = '';
      STUDY_FIELDS.forEach(f => { delete d[f]; });
    }
    return d;
  }

  // 数学题里的公式标记 \(\frac{1}{2}\) 换回平常的写法 1/2，搜题时用（同 db.py 的 plain_text）
  const MATH_PLAIN = [
    [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => mathWrap(a) + '/' + mathWrap(b)],
    [/\\sqrt\{([^{}]*)\}/g, (m, a) => '√' + mathWrap(a)],
    [/\^\{([^{}]*)\}/g, (m, a) => '^' + mathWrap(a)],
    [/_\{([^{}]*)\}/g, (m, a) => '_' + a],
  ];
  function mathWrap(x) { return /[+−\-×·,\s/]/.test(x) ? '(' + x + ')' : x; }
  function plainText(t) {
    if (!t || t.indexOf('\\(') < 0) return t || '';
    t = t.split('\\(').join('').split('\\)').join('');
    for (;;) {
      const old = t;
      MATH_PLAIN.forEach(r => { t = t.replace(r[0], r[1]); });
      if (t === old) return t;
    }
  }

  function filter(paperId, subject, qtype, search) {
    const papers = papersById();
    const hidden = (paperId || subject) ? new Set() : hiddenSubjects();
    return bank.questions.filter(q => {
      if (paperId && q.paper_id !== paperId) return false;
      const s = (papers[q.paper_id] || {}).subject;
      if (subject && s !== subject) return false;
      if (hidden.has(s)) return false;
      if (qtype && q.type !== qtype) return false;
      if (search && plainText(q.stem).indexOf(search) < 0 && plainText(q.material).indexOf(search) < 0) return false;
      return true;
    });
  }

  function listPapers() {
    const qmap = {};
    bank.questions.forEach(q => { (qmap[q.paper_id] = qmap[q.paper_id] || []).push(q); });
    return bank.papers.slice().sort((a, b) => subjIndex(a.subject || 'general') - subjIndex(b.subject || 'general') ||
                                              (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(p => {
      const qs = qmap[p.id] || [];
      const cs = qs.filter(q => prog.cards[q.key]).map(q => prog.cards[q.key]);
      const counts = {};
      qs.forEach(q => { counts[q.type] = (counts[q.type] || 0) + 1; });
      return {
        id: p.id, key: p.key, name: p.name, created_at: p.created_at || '', total: qs.length,
        subject: p.subject || 'general', gradable: qs.filter(q => q.answer).length, counts: counts,
        seen: cs.length, answered: cs.reduce((a, c) => a + c.right + c.wrong, 0),
        correct: cs.reduce((a, c) => a + c.right, 0), wrong_open: cs.filter(c => c.in_wrong).length,
        mastery: qs.length ? Math.round(100 * cs.reduce((a, c) => a + mastery(c), 0) / qs.length) : 0,
      };
    });
  }

  function getQuestions(paperId, qtype, search, limit, offset, subject) {
    const papers = papersById();
    const qs = filter(paperId, subject, qtype, search).sort((a, b) => a.paper_id - b.paper_id || a.qno - b.qno || a.id - b.id);
    return { items: qs.slice(offset, offset + limit).map(q => view(q, papers)), total: qs.length };
  }

  function groupMaterial(items) {
    const order = [], groups = {};
    items.forEach(q => {
      const k = q.material ? q.paper_id + '\u0001' + q.material : 'q\u0001' + q.id;
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(q);
    });
    const out = [];
    order.forEach(k => { out.push.apply(out, groups[k].sort((a, b) => a.qno - b.qno)); });
    return out;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // 错题混进题海里练（同 db.py 的 _wrong_mix）：每道错题配 2 道陪练题，
  // 优先「以前错过、后来做对了」的，其次做过的里记得最不牢的，再不够用新题补；错题均匀分散
  const WRONG_MIX_MAX = 15, WRONG_MIX_FILL = 2;
  function wrongMix(pool) {
    let wrong = [];
    const back = [], seen = [], fresh = [];
    pool.forEach(q => {
      const c = prog.cards[q.key];
      if (c && c.in_wrong) wrong.push(q);
      else if (!q.material && SELF.indexOf(q.type) < 0) {
        if (!c) fresh.push([0, Math.random(), q]);
        else (c.wrong ? back : seen).push([c.box, Math.random(), q]);
      }
    });
    shuffle(wrong);
    wrong = wrong.slice(0, WRONG_MIX_MAX);
    const byBox = (x, y) => x[0] - y[0] || x[1] - y[1];
    const fill = back.sort(byBox).concat(seen.sort(byBox), fresh).map(t => t[2]).slice(0, WRONG_MIX_FILL * wrong.length);
    shuffle(fill);
    const out = [], n = wrong.length + fill.length;
    let wi = 0, fi = 0;
    for (let k = 0; k < n; k++) {
      if (wi < wrong.length && Math.floor((k + 1) * wrong.length / n) > wi) out.push(wrong[wi++]);
      else out.push(fill[fi++]);
    }
    return out;
  }

  function practiceSet(paperId, scope, doShuffle, subject, qtype) {
    const papers = papersById();
    if (scope === 'wrongmix')
      return groupMaterial(wrongMix(filter(paperId, subject, qtype).filter(q => q.answer)).map(q => view(q, papers)));
    let items = [];
    filter(paperId, subject, qtype).forEach(q => {
      if (!q.answer) return;
      const c = prog.cards[q.key];
      if (scope === 'wrong' && !(c && c.in_wrong)) return;
      if (scope === 'new' && c) return;
      items.push(view(q, papers));
    });
    if (doShuffle) shuffle(items);
    else items.sort((a, b) => a.paper_id - b.paper_id || a.qno - b.qno);
    return groupMaterial(items);
  }

  /* ---------------------------------------------------------------- 作答 / 错题本 / 今日复习 */
  const byId = id => bank.questions.find(x => x.id === id);

  function recordAnswer(qid, correct, mode) {
    const q = byId(qid);
    if (!q) throw new Error('题目不存在');
    const t = nowStr();
    const r = srsApply(prog.cards[q.key], !!correct, t);
    prog.cards[q.key] = r[0];
    prog.attempts.push({ k: q.key, ok: !!correct, t: t, m: mode });
    save();
    return { record: Object.assign({}, r[0]), event: r[1] };
  }

  function markMastered(qid, mastered) {
    const q = byId(qid);
    if (!q) return;
    prog.cards[q.key] = srsMark(prog.cards[q.key], mastered, todayStr());
    save();
  }

  function wrongList(mastered, subject) {
    const papers = papersById();
    const items = [];
    filter(null, subject).forEach(q => {
      const c = prog.cards[q.key];
      if (!c || !c.wrong) return;
      if (!!mastered === !!c.in_wrong) return;
      const d = view(q, papers);
      d.last_time = c.last;
      items.push(d);
    });
    return items.sort((a, b) => (b.last_time || '').localeCompare(a.last_time || ''));
  }

  function typeAccuracy(subject) {
    const papers = papersById();
    const qinfo = {};
    bank.questions.forEach(q => { qinfo[q.key] = [(papers[q.paper_id] || {}).subject, q.type]; });
    const hist = {};
    for (let i = prog.attempts.length - 1; i >= 0; i--) {
      const a = prog.attempts[i];
      const k = qinfo[a.k];
      if (!k || (subject && k[0] !== subject)) continue;
      const kk = k.join('|');
      const h = hist[kk] = hist[kk] || [];
      if (h.length < 60) h.push(a.ok);
    }
    const out = {};
    Object.keys(hist).forEach(k => { out[k] = hist[k].filter(Boolean).length / hist[k].length; });
    return out;
  }

  function newLeft(today) {
    const first = {};
    prog.attempts.forEach(a => { if (!(a.k in first)) first[a.k] = a.t.slice(0, 10); });
    const done = Object.keys(first).filter(k => first[k] === today).length;
    return Math.max(0, (prog.settings.new_per_day == null ? 20 : prog.settings.new_per_day) - done);
  }

  function cmpTuple(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  const EXTRA_SIZE = 20;     // 加练一轮的题数（同 db.py）

  function reviewQueue(subject, limit, extra) {
    const today = todayStr();
    const papers = papersById();
    if (limit == null) limit = newLeft(today);
    const acc = typeAccuracy(subject);
    const due = [], fresh = {}, ahead = [];
    filter(null, subject).forEach(q => {
      if (!q.answer) return;
      const c = prog.cards[q.key];
      if (c) {
        if (isDue(c, today)) due.push([c.in_wrong ? 0 : 1, c.due, c.box, q]);
        else if (SELF.indexOf(q.type) < 0) ahead.push([c.in_wrong ? 0 : 1, c.box, c.due, q]);
      } else if (SELF.indexOf(q.type) < 0 && !(extra && q.material)) {   // 加练不带整组的材料题
        const s = (papers[q.paper_id] || {}).subject;
        const a = acc[s + '|' + q.type];
        const weak = (a == null ? 1 : a) < 0.7;
        (fresh[s] = fresh[s] || []).push([weak ? 0 : 1, q.paper_id, q.qno, q]);
      }
    });
    due.sort((x, y) => cmpTuple(x.slice(0, 3), y.slice(0, 3)));
    if (extra) limit = EXTRA_SIZE - Math.min(ahead.length, EXTRA_SIZE / 2);   // 薄弱旧题最多占一半，新题补满
    const queues = Object.keys(fresh).sort().map(s => fresh[s].sort((x, y) => cmpTuple(x.slice(0, 3), y.slice(0, 3))).map(t => t[3]));
    const newQs = [];
    while (newQs.length < limit && queues.some(qq => qq.length)) {
      queues.forEach(qq => { if (qq.length && newQs.length < limit) newQs.push(qq.shift()); });
    }
    // 阅读等材料题整组带出
    const keys = new Set(newQs.filter(q => q.material).map(q => q.paper_id + '\u0001' + q.material));
    const ids = new Set(newQs.map(q => q.id));
    Object.keys(fresh).forEach(s => fresh[s].forEach(t => {
      const q = t[3];
      if (q.material && keys.has(q.paper_id + '\u0001' + q.material) && !ids.has(q.id)) { newQs.push(q); ids.add(q.id); }
    }));
    if (extra) {
      ahead.sort((x, y) => cmpTuple(x.slice(0, 3), y.slice(0, 3)));
      const oldQs = ahead.slice(0, Math.max(EXTRA_SIZE - newQs.length, 0)).map(t => t[3]);
      const mixed = [];
      for (let i = 0; i < Math.max(oldQs.length, newQs.length); i++) {
        if (oldQs[i]) mixed.push(oldQs[i]);
        if (newQs[i]) mixed.push(newQs[i]);
      }
      return { due: 0, ahead: oldQs.length, new: newQs.length, items: groupMaterial(mixed.map(q => view(q, papers))) };
    }
    const items = due.map(t => view(t[3], papers)).concat(newQs.map(q => view(q, papers)));
    return { due: due.length, new: newQs.length, items: groupMaterial(items) };
  }

  function clearProgress() {
    try { localStorage.setItem('zx.progress.backup', JSON.stringify(prog)); } catch (e) { /* 太大就算了 */ }
    if (window.ZXStore && window.ZXStore.backup) window.ZXStore.backup(JSON.stringify(prog));
    const settings = prog.settings;
    prog = { cards: {}, attempts: [], exams: [], settings: settings, skills: {} };
    save();
    return '手机本地备份';
  }

  function dayStreak(days) {
    let d = todayStr();
    if (!days.has(d)) d = addDays(d, -1);
    let n = 0;
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  function dashboard() {
    const today = todayStr();
    const papers = papersById();
    const acc = typeAccuracy();
    const subj = {};
    bank.questions.forEach(q => {
      const s = (papers[q.paper_id] || {}).subject || 'general';
      const d = subj[s] = subj[s] || { subject: s, total: 0, gradable: 0, seen: 0, right: 0, wrong: 0, wrong_open: 0, due: 0, mastery_sum: 0, types: {} };
      d.total++;
      const t = d.types[q.type] = d.types[q.type] || { type: q.type, total: 0, seen: 0, mastery_sum: 0 };
      t.total++;
      if (q.answer) d.gradable++;
      const c = prog.cards[q.key];
      if (c) {
        d.seen++; t.seen++;
        d.right += c.right; d.wrong += c.wrong;
        d.wrong_open += c.in_wrong ? 1 : 0;
        d.due += (isDue(c, today) && q.answer) ? 1 : 0;
        d.mastery_sum += mastery(c); t.mastery_sum += mastery(c);
      }
    });
    const hidden = hiddenSubjects();
    const out = Object.keys(subj).sort((a, b) => subjIndex(a) - subjIndex(b)).map(s => {
      const d = subj[s];
      d.hidden = hidden.has(s);
      d.mastery = d.total ? Math.round(100 * d.mastery_sum / d.total) : 0;
      delete d.mastery_sum;
      d.types = Object.values(d.types).map(t => {
        t.mastery = t.total ? Math.round(100 * t.mastery_sum / t.total) : 0;
        delete t.mastery_sum;
        const a = acc[s + '|' + t.type];
        t.accuracy = a != null ? Math.round(100 * a) : null;
        return t;
      }).sort((x, y) => y.total - x.total);
      const n = d.right + d.wrong;
      d.accuracy = n ? Math.round(1000 * d.right / n) / 10 : null;
      return d;
    });
    const days = new Set(prog.attempts.map(a => a.t.slice(0, 10)));
    const todayAtt = prog.attempts.filter(a => a.t.slice(0, 10) === today);
    const perDay = {};
    prog.attempts.forEach(a => { const k = a.t.slice(0, 10); perDay[k] = (perDay[k] || 0) + 1; });
    const hist = [];
    for (let i = 41; i >= 0; i--) { const day = addDays(today, -i); hist.push({ day: day, n: perDay[day] || 0 }); }
    const rq = reviewQueue();
    const visible = out.filter(d => !d.hidden);
    return {
      subjects: out,
      today: { done: todayAtt.length, right: todayAtt.filter(a => a.ok).length,
               due: visible.reduce((a, d) => a + d.due, 0), new_left: newLeft(today),
               new: rq.items.length - rq.due, todo: rq.items.length },
      streak: dayStreak(days),
      history: hist,
      wrong_open: visible.reduce((a, d) => a + d.wrong_open, 0),
      questions: out.reduce((a, d) => a + d.total, 0),
      papers: bank.papers.length,
      settings: prog.settings,
      exams: prog.exams.slice().reverse().filter(e => e.finished).slice(0, 5).map(examSummary),
    };
  }

  /* ---------------------------------------------------------------- 模拟考试（exam.py） */
  const OBJECTIVE = ['single', 'multi', 'judge', 'reading', 'poem'];
  // 和 exam.py 一致：[小节名, 卷子key前缀, 题型, 题数, 每题分值(默认 1), 筛选('match' 配对题 / 'comp' 其余阅读题)]
  const BLUEPRINTS = {
    politics: { standard: { title: '思想政治 模拟卷', minutes: 45, sections: [
      ['单项选择题', '', ['single'], 20, 2.825], ['多项选择题', '', ['multi'], 5, 2.9], ['判断题', '', ['judge'], 10, 2.9]] } },
    chinese: { standard: { title: '语文 模拟卷（客观题）', minutes: 40, sections: [
      ['基础知识', '', ['single'], 6], ['现代文阅读', '', ['reading'], 10], ['古诗文阅读', '', ['poem'], 4]] } },
    math: { standard: { title: '数学 模拟卷（选择题）', minutes: 30, sections: [['单项选择题', '', ['single'], 13]] } },
    english: { standard: { title: '英语 模拟卷', minutes: 60, sections: [
      ['语音辨析', 'english-phonetics', ['single'], 5, 1], ['词汇与语法', 'english-vocab', ['single'], 20, 1],
      ['图文理解', 'english-picture', ['single'], 10, 1], ['交际对话', 'english-dialogue', ['single'], 10, 1],
      ['书面表达', 'english-writing', ['single'], 5, 1], ['阅读匹配', 'english-reading', ['single'], 5, 1, 'match'],
      ['完形填空', 'english-cloze', ['single'], 10, 1], ['阅读理解', 'english-reading', ['single', 'judge'], 20, 1.75, 'comp']] } },
    media: { standard: { title: '数字媒体理论 模拟卷', minutes: 60, sections: [
      ['单项选择题', '', ['single'], 30], ['多项选择题', '', ['multi'], 10], ['判断题', '', ['judge'], 20]] } },
  };

  function blueprint(subject, preset) {
    if (preset === 'quick') return { title: '快速小测', minutes: 15, sections: [['小测', '', OBJECTIVE, 20, 1]] };
    const bp = (BLUEPRINTS[subject] || {})[preset];
    if (!bp) throw new Error('该科目没有这个组卷方案');
    return bp;
  }
  function units(pool) {
    const groups = {}, order = [];
    pool.forEach(q => {
      const k = q.material ? q.paper_id + '\u0001' + q.material : 'q\u0001' + q.id;
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(q);
    });
    return order.map(k => groups[k].sort((a, b) => a.qno - b.qno));
  }
  function pick(pool, count) {
    const us = shuffle(units(pool));
    const out = [];
    for (const u of us) {
      if (out.length >= count) break;
      if (out.length + u.length <= count) out.push.apply(out, u);
    }
    if (out.length < count) {
      for (const u of us) for (const q of u) { if (out.length >= count) break; if (out.indexOf(q) < 0) out.push(q); }
    }
    return out;
  }
  function compose(questions, papers, subject, preset) {
    const bp = blueprint(subject, preset);
    const pkey = {};
    papers.forEach(p => { pkey[p.id] = p.key || ''; });
    const used = new Set();
    const sections = [];
    const isMatch = q => (q.options || []).length >= 5;
    bp.sections.forEach(([name, prefix, types, count, points, filt]) => {
      const pool = questions.filter(q => types.indexOf(q.type) >= 0 && q.answer && !used.has(q.id) && (pkey[q.paper_id] || '').indexOf(prefix) === 0 &&
                                          (!filt || (filt === 'match') === isMatch(q)));
      const got = pick(pool, count);
      got.forEach(q => used.add(q.id));
      if (got.length) sections.push([name, got, points || 1]);
    });
    if (!sections.length) throw new Error('题库里没有可用于组卷的客观题');
    return [bp.title, bp.minutes, sections];
  }
  const NO_SHUFFLE = /以上|上述|都(?:对|错|正确|不正确)|(?<![A-Za-z])[A-G]\s*[和与及、,，]\s*[A-G](?![A-Za-z])|^[A-G]{1,4}$|见材料|(?<!可)见图|\b(?:[Aa]ll|[Nn]one|[Bb]oth|[Nn]either) of the above\b|\b[A-G] and [A-G]\b/;
  function shufflePerm(q) {
    const opts = q.options || [];
    if (q.type === 'judge' || opts.length < 2) return null;
    if (opts.some(o => NO_SHUFFLE.test((o[1] || '').trim()))) return null;
    return shuffle(opts.map((_, i) => i));
  }
  const shuffledOptions = (q, perm) => perm.map((j, i) => [String.fromCharCode(65 + i), q.options[j][1]]);
  function toOriginal(given, perm) {
    if (!perm || !given) return given || '';
    return given.split('').map(c => { const i = c.charCodeAt(0) - 65; return i >= 0 && i < perm.length ? String.fromCharCode(65 + perm[i]) : c; }).sort().join('');
  }
  function isRight(q, given) {
    given = (given || '').trim();
    if (!given) return false;
    if (q.type === 'multi') return given.split('').sort().join('') === q.answer.split('').sort().join('');
    return given === q.answer;
  }
  const examSummary = e => {
    const d = {};
    ['id', 'subject', 'title', 'minutes', 'started', 'finished', 'total', 'correct', 'score', 'used_seconds'].forEach(k => { d[k] = e[k] == null ? null : e[k]; });
    return d;
  };
  const nextId = items => items.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;

  function examStart(subject, preset) {
    const papers = bank.papers.filter(p => p.subject === subject);
    const pids = new Set(papers.map(p => p.id));
    const qs = bank.questions.filter(q => pids.has(q.paper_id) && OBJECTIVE.indexOf(q.type) >= 0);
    const [title, minutes, sections] = compose(qs, papers, subject, preset);
    const perms = {};
    sections.forEach(([, g]) => g.forEach(q => { const pm = shufflePerm(q); if (pm) perms[q.key] = pm; }));
    const e = { id: nextId(prog.exams), subject: subject, preset: preset, title: title, minutes: minutes,
                started: nowStr(), finished: '', perms: perms,
                sections: sections.map(([n, g, pts]) => ({ name: n, keys: g.map(q => q.key), points: pts })) };
    prog.exams.push(e);
    save();
    return examView(e, true);
  }
  function examView(e, hide) {
    const pb = papersById();
    const byKey = {};
    bank.questions.forEach(q => { byKey[q.key] = q; });
    const secs = e.sections.map(s => ({ name: s.name, items: s.keys.filter(k => byKey[k]).map(k => {
      const q = byKey[k];
      const v = view(q, pb, hide);
      const pm = (e.perms || {})[k];
      if (hide && pm) v.options = shuffledOptions(q, pm);
      if (!hide && e.answers) { v.given = e.answers[k] || ''; v.correct = isRight(q, v.given); }
      return v;
    }), points: s.points || 1 }));
    const d = examSummary(e);
    d.sections = secs;
    if (!hide) { d.by_section = e.by_section; d.by_type = e.by_type; }
    return d;
  }
  function examSubmit(eid, answers, used) {
    const e = prog.exams.find(x => x.id === eid);
    if (!e) throw new Error('考试不存在');
    if (e.finished) return examView(e, false);
    const byKey = {}, id2key = {};
    bank.questions.forEach(q => { byKey[q.key] = q; id2key[String(q.id)] = q.key; });
    const perms = e.perms || {};
    const given = {};
    Object.keys(answers || {}).forEach(i => { if (id2key[i]) { const k = id2key[i]; given[k] = toOriginal(answers[i] || '', perms[k]); } });
    const t = nowStr();
    let total = 0, correct = 0, gotPts = 0, fullPts = 0;     // 按分值算成绩（老的考试记录没有分值，每题 1 分）
    const bySection = [], byType = {};
    e.sections.forEach(s => {
      let sc = 0, st = 0;
      const pts = s.points || 1;
      s.keys.forEach(k => {
        const q = byKey[k];
        if (!q) return;
        const ok = isRight(q, given[k]);
        st++; sc += ok ? 1 : 0;
        const bt = byType[q.type] = byType[q.type] || { correct: 0, total: 0 };
        bt.correct += ok ? 1 : 0; bt.total++;
        prog.cards[k] = srsApply(prog.cards[k], ok, t)[0];
        prog.attempts.push({ k: k, ok: ok, t: t, m: 'exam' });
      });
      bySection.push({ name: s.name, correct: sc, total: st, points: pts });
      total += st; correct += sc; gotPts += sc * pts; fullPts += st * pts;
    });
    Object.assign(e, { answers: given, finished: t, total: total, correct: correct,
                       score: fullPts ? Math.round(1000 * gotPts / fullPts) / 10 : 0,
                       used_seconds: parseInt(used || 0, 10), by_section: bySection, by_type: byType });
    save();
    return examView(e, false);
  }

  /* ---------------------------------------------------------------- 路由（对应 server.py） */
  async function handle(method, path, qs, body) {
    await load();
    const arg = (n, d) => qs.get(n) || d || '';
    const iarg = (n, d) => { const v = parseInt(arg(n, String(d || 0)), 10); if (isNaN(v)) throw new Error('参数不对'); return v; };
    if (method === 'GET' && path === '/api/papers') return { papers: listPapers() };
    if (method === 'GET' && path === '/api/questions') {
      const r = getQuestions(iarg('paper_id') || null, arg('type') || null, arg('q') || null,
                             Math.min(Math.max(iarg('limit', 50), 0), 200), Math.max(iarg('offset'), 0), arg('subject') || null);
      return r;
    }
    if (method === 'GET' && path === '/api/practice')
      return { items: practiceSet(iarg('paper_id') || null, arg('scope', 'all'), arg('order', 'random') === 'random', arg('subject') || null, arg('type') || null),
               mix: arg('scope') === 'wrongmix' };
    if (method === 'GET' && path === '/api/review') {
      const n = arg('new');
      return reviewQueue(arg('subject') || null, n ? parseInt(n, 10) : null, arg('extra') === '1');
    }
    if (method === 'GET' && path === '/api/dashboard') return { data: dashboard() };
    if (method === 'POST' && path === '/api/settings') {
      if ('new_per_day' in body) {
        const n = parseInt(body.new_per_day, 10);
        if (isNaN(n)) throw new Error('参数不对');
        prog.settings.new_per_day = Math.max(0, Math.min(200, n));
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.exam_date || ''))) prog.settings.exam_date = body.exam_date;
      if (Array.isArray(body.hidden_subjects))
        prog.settings.hidden_subjects = Array.from(new Set(body.hidden_subjects.map(String).filter(s => /^[\w:-]{1,40}$/.test(s)))).sort();
      save();
      return {};
    }
    if (method === 'GET' && path === '/api/wrong') return { items: wrongList(iarg('mastered'), arg('subject') || null) };
    if (method === 'POST' && path === '/api/record') {
      const qid = parseInt(body.question_id || 0, 10);
      if (!qid) throw new Error('缺少 question_id');
      return recordAnswer(qid, !!body.correct, body.mode || 'practice');
    }
    if (method === 'POST' && path === '/api/wrong/mark') {
      const qid = parseInt(body.question_id || 0, 10);
      if (!qid) throw new Error('缺少 question_id');
      markMastered(qid, body.mastered == null ? true : !!body.mastered);
      return {};
    }
    if (method === 'POST' && path === '/api/exam/start') return { exam: examStart(body.subject || '', body.preset || 'standard') };
    if (method === 'POST' && path === '/api/exam/submit') return { exam: examSubmit(parseInt(body.id || 0, 10), body.answers || {}, body.used_seconds || 0) };
    if (method === 'GET' && path === '/api/exams') return { items: prog.exams.slice().reverse().map(examSummary) };
    let m = path.match(/^\/api\/exams\/(\d+)$/);
    if (m && method === 'GET') {
      const e = prog.exams.find(x => x.id === parseInt(m[1], 10));
      if (!e) throw new Error('考试不存在');
      return { exam: examView(e, !e.finished) };
    }
    if (method === 'GET' && path === '/api/app')
      return { version: APP_VERSION, content_version: ((await currentManifest()) || {}).content_version || 0,
               frozen: false, mobile: true, data_dir: '本机，卸载 App 会一起删除', data_note: window.ZXStore && ZXStore.shareProgress ? '换手机或重装前，先分享一份到微信或文件里备份' : '', repo: 'https://github.com/' + REPO };
    if (method === 'GET' && path === '/api/content/check') return contentCheck();
    if (method === 'POST' && path === '/api/content/update') return contentStart();
    if (method === 'GET' && path === '/api/content/progress') return Object.assign({}, job);
    if (method === 'POST' && path === '/api/data/clear') {
      if (body.confirm !== '清除') throw new Error('需要确认');
      return { backup: clearProgress() };
    }
    if (method === 'GET' && path === '/api/skills') return { items: [], can_open: {}, dreamweaver: false };
    if (method === 'GET' && path === '/api/update/check') return checkUpdate();
    throw new Error('手机版没有这个功能');
  }

  /* 检查更新：看 GitHub Release 里有没有更新版本的 apk，下载交给系统浏览器 */
  function ver(s) { return (s || '').replace(/^[vV]/, '').split('.').map(x => parseInt(x, 10) || 0).concat([0, 0, 0]).slice(0, 3); }
  async function checkUpdate() {
    // 网络偶尔握手超时，最多试 3 次，每次最多等 15 秒
    let rel = null;
    for (let i = 0; i < 3 && !rel; i++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest',
                              { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal });
        if (r.ok) rel = await r.json();
      } catch (e) { /* 再试 */ }
      clearTimeout(timer);
      if (!rel && i < 2) await new Promise(res => setTimeout(res, 1500));
    }
    if (!rel) {
      // GitHub 连不上（国内常见）：从 jsDelivr 读 release.json，安装包经国内的 GitHub 下载加速站下载。
      // 加速站是第三方的，但 apk 有签名，被改过的包系统根本不让覆盖安装
      let info = null;
      try { info = JSON.parse(new TextDecoder().decode(await fetchRepo('main', 'release.json', 15000))); } catch (e) { /* 读不到 */ }
      if (!info) throw new Error('连不上 GitHub，也读不到国内镜像上的版本信息，检查一下网络');
      const apk = (info.assets || {}).apk || {};
      const latest = (info.version || '').replace(/^[vV]/, '');
      return { current: APP_VERSION, latest: latest, has_update: !!apk.url && cmpTuple(ver(latest), ver(APP_VERSION)) > 0,
               notes: info.notes || '', url: apk.url ? 'https://ghproxy.net/' + apk.url : null, size: apk.size || null, page: info.page };
    }
    const asset = (rel.assets || []).find(a => /\.apk$/i.test(a.name || ''));
    const latest = (rel.tag_name || '').replace(/^[vV]/, '');
    return { current: APP_VERSION, latest: latest, has_update: !!asset && cmpTuple(ver(latest), ver(APP_VERSION)) > 0,
             notes: rel.body || '', url: asset ? asset.browser_download_url : null, size: asset ? asset.size : null, page: rel.html_url };
  }

  /* ---------------------------------------------------------------- 热更新（对应 hotupdate.py）
     内容清单 content.json 和电脑版是同一份。手机只用其中的界面、local.js、题库和图片，
     路径换算见 wwwPath()；技能实操的文件手机上没有，跳过。
     下载的文件交给 ZXStore 写到 App 私有目录 content/next，全部齐了 contentCommit 换上，刷新页面生效。 */
  const MIRRORS = [
    (ref, p) => 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + p,
    (ref, p) => 'https://cdn.jsdelivr.net/gh/' + REPO + '@' + ref + '/' + p,     // 国内一般能连（发布时会刷新 main 的缓存）
    (ref, p) => 'https://fastly.jsdelivr.net/gh/' + REPO + '@' + ref + '/' + p,  // jsDelivr 的其他节点
    (ref, p) => 'https://gcore.jsdelivr.net/gh/' + REPO + '@' + ref + '/' + p,
  ];
  const job = { state: 'idle', done: 0, total: 0, files_done: 0, files_total: 0, speed: 0, error: '', version: 0 };

  function wwwPath(rel) {
    if (rel.indexOf('static/') === 0) return rel.slice(7);
    if (rel === 'mobile/local.js') return 'local.js';
    if (rel === 'data/bank.json') return 'bank.json';
    if (rel.indexOf('data/media/') === 0) return 'media/' + rel.slice(11);
    return null;
  }
  function mobileFiles(m) {
    const out = {};
    Object.keys((m && m.files) || {}).forEach(rel => { const w = wwwPath(rel); if (w) out[w] = m.files[rel].concat([rel]); });
    return out;                                     // {www路径: [sha, 大小, 仓库路径]}
  }
  async function currentManifest() {
    try { const r = await fetch('content.json', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }
  async function getTimeout(url, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    } finally { clearTimeout(timer); }
  }
  async function fetchRepo(ref, rel, ms) {
    const p = rel.split('/').map(encodeURIComponent).join('/');
    let last;
    for (const mk of MIRRORS) {
      for (let i = 0; i < 2; i++) {
        try { return await getTimeout(mk(ref, p), ms || 20000); } catch (e) { last = e; }
      }
    }
    throw last;
  }
  async function latestManifest() {
    try { return JSON.parse(new TextDecoder().decode(await fetchRepo('main', 'content.json', 15000))); }
    catch (e) { throw new Error('连不上 GitHub 和镜像，检查一下网络'); }
  }
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function changedFiles(latest, cur) {
    const nf = mobileFiles(latest), of = mobileFiles(cur);
    const changed = [], keep = [];
    Object.keys(nf).sort().forEach(w => { (of[w] && of[w][0] === nf[w][0] ? keep : changed).push(w); });
    return { nf: nf, changed: changed, keep: keep };
  }

  async function contentCheck() {
    const latest = await latestManifest();
    const cur = await currentManifest();
    const c = changedFiles(latest, cur);
    const curVer = (cur || {}).content_version || 0;
    const ok = cmpTuple(ver(APP_VERSION), ver(latest.min_android_version || '0')) >= 0;
    return { current: curVer, latest: latest.content_version || 0, has_update: ok && (latest.content_version || 0) > curVer,
             compatible: ok, min_app_version: latest.min_android_version, files: c.changed.length,
             bytes: c.changed.reduce((a, w) => a + c.nf[w][1], 0), notes: latest.notes || '' };
  }

  function contentStart() {
    if (!window.ZXStore || !ZXStore.contentBegin) throw new Error('这个版本的 App 不支持热更新，请先更新 App');
    if (job.state !== 'downloading') {
      Object.assign(job, { state: 'downloading', done: 0, total: 0, files_done: 0, files_total: 0, speed: 0, error: '' });
      contentRun().catch(e => Object.assign(job, { state: 'error', error: e.message || String(e), speed: 0 }));
    }
    return Object.assign({}, job);
  }

  async function contentRun() {
    const latest = await latestManifest();
    if (cmpTuple(ver(APP_VERSION), ver(latest.min_android_version || '0')) < 0)
      throw new Error('新内容需要 App v' + latest.min_android_version + ' 以上，请先更新 App');
    const cur = await currentManifest();
    if ((latest.content_version || 0) <= ((cur || {}).content_version || 0)) throw new Error('界面和题库已经是最新的');
    const c = changedFiles(latest, cur);
    // 没变的文件由 App 从正在用的内容里复制；复制不了的（比如丢了）返回来，改成下载
    // 1.4.2 起 App 复制时会核对指纹，要 [路径, sha]；更早的 App 只认路径（它的 contentBegin 出错时也返回 "[]"）
    const withSha = cmpTuple(ver(APP_VERSION), ver('1.4.2')) >= 0;
    const began = ZXStore.contentBegin(JSON.stringify(withSha ? c.keep.map(w => [w, c.nf[w][0]]) : c.keep));
    if (began == null) throw new Error('准备更新时手机存储出错，检查一下剩余空间后重试');
    const missing = JSON.parse(began);
    const todo = c.changed.concat(missing).sort();
    Object.assign(job, { total: todo.reduce((a, w) => a + c.nf[w][1], 0), files_total: todo.length, version: latest.content_version });
    let tLast = Date.now(), dLast = 0;
    for (const w of todo) {
      const [sha, size, rel] = c.nf[w];
      let data = null;
      for (let i = 0; i < 3 && !data; i++) {
        try {
          const got = await fetchRepo(latest.tag, rel);
          if (hex(await crypto.subtle.digest('SHA-256', got)) === sha) data = got;
          else job.error = '文件校验不通过，正在重下…';
        } catch (e) {
          job.error = '网络断了一下，正在重试…';
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!data) throw new Error('下载 ' + rel + ' 失败，请稍后再试');
      if (!ZXStore.contentWrite(w, b64(data))) throw new Error('手机存储写不进去，检查一下剩余空间');
      job.done += size;
      job.files_done++;
      job.error = '';
      const now = Date.now();
      if (now - tLast >= 500) { job.speed = Math.round((job.done - dLast) * 1000 / (now - tLast)); tLast = now; dLast = job.done; }
    }
    if (!ZXStore.contentCommit(JSON.stringify(latest))) throw new Error('换上新内容失败，请重试');
    Object.assign(job, { state: 'done', speed: 0 });
  }

  window.LocalAPI = {
    async call(path, opts) {
      opts = opts || {};
      const u = new URL(path, location.href);
      let body = {};
      if (opts.body) { try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body; } catch (e) { body = {}; } }
      const data = await handle((opts.method || 'GET').toUpperCase(), u.pathname, u.searchParams, body);
      return Object.assign({ ok: true }, data);
    },
    exportProgress() { return JSON.stringify(prog); },
    async importProgress(text) {
      await load();
      const p = JSON.parse(text);
      if (!p || typeof p !== 'object' || !p.cards || !p.attempts) throw new Error('不是做题记录文件');
      prog = p;
      prog.exams = prog.exams || [];
      prog.settings = prog.settings || { new_per_day: 20 };
      save();
    },
  };
})();
