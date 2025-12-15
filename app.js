const state = { tab: 'cases', cases: [], progress: {}, theme: 'auto', current: null };
function $(s, r = document) { return r.querySelector(s); }
function $all(s, r = document) { return Array.from(r.querySelectorAll(s)); }
function loadLS(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function saveLS(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
async function fetchJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error('网络错误'); return r.json(); }
function applyTheme(auto = true) {
  if (auto) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const hour = new Date().getHours();
    const autoDark = hour >= 19 || hour < 7;
    const useDark = prefersDark || autoDark;
    document.body.classList.toggle('theme-light', !useDark);
    document.body.classList.toggle('theme-dark', useDark);
    state.theme = 'auto';
  } else {
    const useDark = document.body.classList.contains('theme-dark');
    document.body.classList.toggle('theme-dark', !useDark);
    document.body.classList.toggle('theme-light', useDark);
    state.theme = useDark ? 'dark' : 'light';
  }
}
function setTab(t) { state.tab = t; render(); }
function percent(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function scoreText(txt) {
  const clean = (txt || '').trim();
  if (!clean) return { total: 0, items: [] };
  const items = [];
  const hasKeyMsg = /^(结论|主旨|结论：|主旨：|建议|建议：)/m.test(clean) || clean.length > 120;
  items.push({ key: 'key', ok: hasKeyMsg, label: '开篇给出主旨/结论' });
  const hasBullets = /(^|\n)[\-•*]/.test(clean) || /\n\d+[\.\)]/.test(clean);
  items.push({ key: 'bul', ok: hasBullets, label: '采用并列分点（MECE）' });
  const hasEvidence = /(数据|指标|原因|案例|证据|结果)/.test(clean) || /\d+%|\b\d{2,}\b/.test(clean);
  items.push({ key: 'ev', ok: hasEvidence, label: '为论点提供证据或示例' });
  const hasSCQA = /(情境|问题|矛盾|假设|答案|方案)/.test(clean) || /(Situation|Complication|Question|Answer)/i.test(clean);
  items.push({ key: 'scqa', ok: hasSCQA, label: '能用SCQA串起故事线' });
  const hasStructure = /(时间|步骤|路径|结构|框架)/.test(clean);
  items.push({ key: 'str', ok: hasStructure, label: '有清晰结构/步骤' });
  const total = items.reduce((a, b) => a + (b.ok ? 20 : 0), 0);
  return { total, items };
}
function outlineFromText(txt) {
  const lines = (txt || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const head = lines[0] || '';
  const bullets = lines.filter(s => /^[\-\*•]|^\d+[\.\)]/.test(s)).slice(0, 5);
  const guess = bullets.length ? bullets : lines.slice(1, 6);
  return { title: head, points: guess };
}
function renderTabs() {
  $all('.tab').forEach(b => {
    const t = b.dataset.tab;
    if (!t) return;
    b.classList.toggle('active', state.tab === t);
  });
}
function renderCases() {
  const view = $('#view');
  const progEntries = Object.entries(state.progress);
  const done = progEntries.filter(([, v]) => v?.score?.total > 0).length;
  const bar = `<div class="score">完成度：${percent(done, state.cases.length)}%（${done}/${state.cases.length}）</div>`;
  const cards = state.cases.map(c => {
    const s = state.progress[c.id]?.score?.total || 0;
    return `
      <article class="card">
        <div class="card-body">
          <h3 class="name">${c.title}</h3>
          <p class="meta">难度：${c.level} · 场景：${c.scene}</p>
          <p class="desc">${c.brief}</p>
          <div class="actions">
            <button class="btn primary" data-open="${c.id}">开始训练</button>
            <span class="meta">上次得分：${s}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
  view.innerHTML = `<section class="grid">${cards}</section>${bar}`;
  $all('button[data-open]').forEach(b => b.addEventListener('click', () => openCase(b.dataset.open)));
}
function renderModules() {
  const view = $('#view');
  const mods = [
    { name: '核心原则', points: ['结论先行', '以上统下', '归类分组', '逻辑递进'] },
    { name: '结构技巧', points: ['MECE 并列不重不漏', '时间/结构/重要性排序', '3-5 个分点为宜'] },
    { name: '故事线 SCQA', points: ['情境：背景', '矛盾：触发', '问题：核心问句', '答案：结论方案'] },
    { name: '常见场景', points: ['邮件与汇报', '方案与复盘', '会议纪要', '学习笔记'] }
  ];
  const cards = mods.map(m => `
    <article class="card">
      <div class="card-body">
        <h3 class="name">${m.name}</h3>
        <ul class="desc">${m.points.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    </article>
  `).join('');
  view.innerHTML = `<section class="grid">${cards}</section>`;
}
function openCase(id) {
  const c = state.cases.find(x => x.id === id);
  if (!c) return;
  state.current = c.id;
  const saved = state.progress[c.id]?.text || '';
  const view = $('#view');
  view.innerHTML = `
    <article class="card">
      <div class="card-body">
        <h3 class="name">${c.title}</h3>
        <p class="meta">场景：${c.scene} · 目标：${c.goal}</p>
        <p class="desc">${c.context}</p>
        <div class="form">
          <div>
            <label>你的练习输出</label>
            <textarea id="inputText" rows="10" placeholder="结论先行 + 3-5 个分点（每点附证据）">${saved}</textarea>
            <div class="actions">
              <button id="btnScore" class="btn primary">评分与提纲</button>
              <button id="btnSave" class="btn">保存草稿</button>
            </div>
          </div>
          <div>
            <label>提纲与评分</label>
            <div id="outline"></div>
          </div>
        </div>
      </div>
    </article>
  `;
  $('#btnSave').addEventListener('click', () => {
    const t = $('#inputText').value;
    state.progress[c.id] = state.progress[c.id] || {};
    state.progress[c.id].text = t;
    saveLS('pyramid_progress', state.progress);
  });
  $('#btnScore').addEventListener('click', () => {
    const t = $('#inputText').value;
    const o = outlineFromText(t);
    const s = scoreText(t);
    state.progress[c.id] = { text: t, score: s, outline: o };
    saveLS('pyramid_progress', state.progress);
    const points = o.points.map(p => `<li>${p}</li>`).join('');
    const items = s.items.map(i => `<li>${i.ok ? '✅' : '❌'} ${i.label}</li>`).join('');
    $('#outline').innerHTML = `
      <div class="score">
        <div>标题预估：${o.title || '（未检测到标题）'}</div>
        <ul>${points}</ul>
        <hr />
        <div>评分：${s.total} / 100</div>
        <ul>${items}</ul>
      </div>
    `;
  });
}
function render() {
  renderTabs();
  if (state.tab === 'modules') renderModules();
  else renderCases();
}
async function main() {
  state.progress = loadLS('pyramid_progress', {});
  state.cases = await fetchJSON('./data/cases.json');
  applyTheme(true);
  setInterval(() => applyTheme(true), 30 * 60 * 1000);
  $('#toggleTheme').addEventListener('click', () => applyTheme(false));
  $all('.tab').forEach(b => b.addEventListener('click', () => { const t = b.dataset.tab; if (t) setTab(t); }));
  render();
}
main().catch(e => { $('#view').innerHTML = `<p style="color:#f88">加载失败：${e.message}</p>`; });
