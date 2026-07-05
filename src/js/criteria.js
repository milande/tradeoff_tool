// ── DOM refs ──────────────────────────────────────────────────
const list = document.getElementById('criteriaList');
const addBtn = document.getElementById('addBtn');
const compareSection = document.getElementById('compareSection');
const resultsSection = document.getElementById('resultsSection');
const fineTuneSection = document.getElementById('fineTuneSection');
const customBadge = document.getElementById('customBadge');
const sensitivityTab = document.getElementById('sensitivityTab');
const proToggle = document.getElementById('proToggle');

// ── State ─────────────────────────────────────────────────────
// Criteria and solutions are {id, name} — all data structures key by the
// stable id, so renaming never orphans ratings, weights, or notes.
let decisionName = '', bearbeiter = '';
let criteria = [];            // [{id, name}]
let pairs = [];               // [[idA, idB], ...]
let pairStates = {};          // 'idA|idB' -> -1 | 0 | 1
let comparisonStarted = false;
let inputDebounce = null;
let customWeights = null;     // {critId: weight}
let customWeightReasons = {}; // {critId: reason}
let customWeightPinned = {};  // {critId: true} — manually set (drag/typed) values
let proMode = false;

function newId(prefix) {
  return prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
}

// ── Criteria input ────────────────────────────────────────────
function addCriterionInput(value = '', id = null) {
  const item = document.createElement('div');
  item.className = 'criteria-item';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = `${t('criterionDefault')} ${list.querySelectorAll('input').length + 1}`;
  input.value = value;
  input.dataset.id = id || newId('c');
  input.addEventListener('input', () => {
    clearTimeout(inputDebounce);
    inputDebounce = setTimeout(checkAndStartComparison, 350);
  });
  const btn = document.createElement('button');
  btn.className = 'btn-remove';
  btn.textContent = '−';
  btn.onclick = () => { item.remove(); checkAndStartComparison(); };
  item.appendChild(input);
  item.appendChild(btn);
  list.appendChild(item);
}

function getCriteria() {
  return [...list.querySelectorAll('input')]
    .map(i => ({ id: i.dataset.id, name: i.value.trim() }))
    .filter(c => c.name);
}

function critName(id) {
  const c = criteria.find(x => x.id === id);
  return c ? c.name : '';
}

function criteriaKey(c) {
  return c.map(x => x.id).sort().join('|');
}

// ── Weight calculation ────────────────────────────────────────
function computeScores() {
  const scores = {};
  criteria.forEach(c => scores[c.id] = 0);
  pairs.forEach(([a, b]) => {
    const state = pairStates[`${a}|${b}`] ?? 0;
    if (state === -1) scores[a] += 1;
    else if (state === 1) scores[b] += 1;
    else { scores[a] += 0.5; scores[b] += 0.5; }
  });
  return scores;
}

function computeWeights() {
  if (customWeights) {
    const total = criteria.reduce((s, c) => s + (customWeights[c.id] ?? 0), 0);
    const w = {};
    criteria.forEach(c => w[c.id] = total > 0 ? (customWeights[c.id] ?? 0) / total : 1 / criteria.length);
    return w;
  }
  const scores = computeScores();
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  const weights = {};
  criteria.forEach(c => weights[c.id] = total > 0 ? scores[c.id] / total : 1 / criteria.length);
  return weights;
}

// Criteria ordered by committed weight (most important first) — used by all
// list-style renders so ordering is consistent across tabs and stable while
// dragging sensitivity bars (sensWeights changes don't reshuffle rows).
function criteriaByWeight() {
  const w = computeWeights();
  return [...criteria].sort((a, b) => (w[b.id] ?? 0) - (w[a.id] ?? 0));
}

// ── Consistency check ─────────────────────────────────────────
// Detect preference cycles (A > B > C > A) among strict answers, regardless
// of strength. Returns an array of cycles as [idA, idB, idC] (a beats b,
// b beats c, c beats a).
function findInconsistencies() {
  // beats(x, y): x strictly preferred over y in the pairwise answers
  const beats = (x, y) => {
    if (pairStates[`${x}|${y}`] !== undefined) return pairStates[`${x}|${y}`] < 0;
    if (pairStates[`${y}|${x}`] !== undefined) return pairStates[`${y}|${x}`] > 0;
    return false;
  };
  const cycles = [];
  const ids = criteria.map(c => c.id);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (let k = j + 1; k < ids.length; k++) {
        const [a, b, c] = [ids[i], ids[j], ids[k]];
        if (beats(a, b) && beats(b, c) && beats(c, a)) cycles.push([a, b, c]);
        else if (beats(b, a) && beats(a, c) && beats(c, b)) cycles.push([b, a, c]);
      }
  return cycles;
}

function renderConsistency() {
  const el = document.getElementById('consistencyHint');
  if (!el) return;
  const cycles = comparisonStarted ? findInconsistencies() : [];
  if (!cycles.length) { el.innerHTML = ''; el.classList.remove('visible'); return; }
  const shown = cycles.slice(0, 3).map(cycle =>
    `<span class="consistency-cycle">${cycle.map(id => esc(critName(id))).join(' › ')} › ${esc(critName(cycle[0]))}</span>`
  ).join('');
  el.innerHTML = `<strong>${t('inconsistentTitle')}</strong> ${t('inconsistentText')} ${shown}`;
  el.classList.add('visible');
}

// ── Helpers ───────────────────────────────────────────────────
function pairLabel(a, b, state) {
  a = esc(a); b = esc(b);
  if (state === -1) return t('moreImportantThan')(a, b);
  if (state === 1) return t('moreImportantThan')(b, a);
  return t('equallyImportant')(a, b);
}

function animateRows(tbody, entries) {
  const oldTops = {};
  [...tbody.querySelectorAll('tr[data-key]')].forEach(tr => {
    oldTops[tr.dataset.key] = tr.getBoundingClientRect().top;
  });
  const pool = {};
  [...tbody.querySelectorAll('tr[data-key]')].forEach(tr => { pool[tr.dataset.key] = tr; });
  tbody.innerHTML = '';
  entries.forEach(({ key, html }) => {
    let tr = pool[key];
    if (!tr) { tr = document.createElement('tr'); tr.dataset.key = key; }
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
  [...tbody.querySelectorAll('tr[data-key]')].forEach(tr => {
    if (tr._anim) { tr._anim.cancel(); tr._anim = null; }
    const oldTop = oldTops[tr.dataset.key];
    if (oldTop === undefined) {
      tr._anim = tr.animate([
        { opacity: '0', transform: 'translateY(-6px)' },
        { opacity: '1', transform: 'translateY(0)' }
      ], { duration: 250, easing: 'ease' });
      return;
    }
    const d = oldTop - tr.getBoundingClientRect().top;
    if (Math.abs(d) < 0.5) return;
    tr._anim = tr.animate([
      { transform: `translateY(${d}px)` },
      { transform: 'translateY(0)' }
    ], { duration: 300, easing: 'ease' });
  });
}

// ── Rendering ─────────────────────────────────────────────────
function updateResults() {
  const scores = computeScores();
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  const entries = [...criteria]
    .sort((a, b) => scores[b.id] - scores[a.id])
    .map(c => {
      const p = scores[c.id];
      const pct = total > 0 ? 100 * p / total : 0;
      const label = total > 0 ? `${pct.toFixed(1)}%` : '—';
      return { key: c.id, html: `<td>${esc(c.name)}</td><td>${p.toFixed(1)}</td><td><div class="weight-cell"><span>${label}</span><div class="weight-bar-wrap"><div class="weight-bar" style="width:${pct}%"></div></div></div></td>` };
    });
  animateRows(document.getElementById('tbody'), entries);
  renderConsistency();
  renderFineTune();
  updateSolutionRanking();
  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
}

function updateTabState() {
  document.querySelector('[data-tab="solutions"]').classList.toggle('disabled', !comparisonStarted);
  document.querySelector('[data-tab="sensitivity"]').classList.toggle('disabled', !comparisonStarted);
}

function checkAndStartComparison() {
  const current = getCriteria();
  if (current.length >= 2) {
    if (criteriaKey(current) !== criteriaKey(criteria) || !comparisonStarted) {
      startComparison();
    } else {
      // Same criteria set — only names changed. Refresh labels everywhere;
      // all data is id-keyed, so nothing is lost.
      criteria = current;
      renderPairs();
      updateResults();
      renderSolutionMatrix();
    }
  } else if (comparisonStarted) {
    compareSection.classList.remove('active');
    resultsSection.classList.remove('active');
    fineTuneSection.classList.remove('active');
    comparisonStarted = false;
    criteria = []; pairs = []; pairStates = {}; customWeights = null; customWeightReasons = {}; customWeightPinned = {}; scenarios = [];
    sensWeights = {}; explorationRatings = {};
    applyProMode();
    updateTabState();
    updateSolutionRanking();
    updateSensRanking();
    updateSensImpact(); updateRatingImpact();
  }
}

function startComparison(preserveWeights = false, suppressScroll = false) {
  const incoming = getCriteria();
  const wasStarted = comparisonStarted;
  if (!preserveWeights && criteriaKey(incoming) !== criteriaKey(criteria)) { customWeights = null; customWeightReasons = {}; customWeightPinned = {}; scenarios = []; }
  criteria = incoming;
  pairs = [];
  for (let i = 0; i < criteria.length; i++)
    for (let j = i + 1; j < criteria.length; j++)
      pairs.push([criteria[i].id, criteria[j].id]);

  const newStates = {};
  pairs.forEach(([a, b]) => {
    const key = `${a}|${b}`;
    newStates[key] = pairStates[key] ?? 0;
  });
  pairStates = newStates;

  comparisonStarted = true;
  compareSection.classList.add('active');
  resultsSection.classList.add('active');
  if (proMode) fineTuneSection.classList.add('active');
  // Re-derives sensitivity state only when invalid
  ensureSensState();
  renderPairs();
  updateResults();
  updateTabState();
  renderSolutionMatrix();
  // Scroll only when the comparison first appears — not on every criteria edit
  if (!suppressScroll && !wasStarted) compareSection.scrollIntoView({ behavior: 'smooth' });
}

function renderPairs() {
  const container = document.getElementById('pairsContainer');
  container.innerHTML = '';
  pairs.forEach(([a, b]) => {
    const key = `${a}|${b}`;
    const state = pairStates[key] ?? 0;
    const nameA = critName(a), nameB = critName(b);
    const row = document.createElement('div');
    row.className = 'pair-row';
    const label = document.createElement('div');
    label.className = 'pair-label';
    label.innerHTML = pairLabel(nameA, nameB, state);
    const btns = document.createElement('div');
    btns.className = 'pair-buttons';
    [[-1, nameA], [0, t('equalBtn')], [1, nameB]].forEach(([v, text]) => {
      const btn = document.createElement('button');
      btn.className = 'pair-btn' + (state === v ? ' active' : '');
      btn.textContent = text;
      btn.title = text;
      btn.onclick = () => {
        pairStates[key] = v;
        label.innerHTML = pairLabel(nameA, nameB, v);
        [...btns.children].forEach((el, i) => el.classList.toggle('active', [-1, 0, 1][i] === v));
        updateResults();
      };
      btns.appendChild(btn);
    });
    row.appendChild(label);
    row.appendChild(btns);
    container.appendChild(row);
  });
}

// Set one criterion's custom weight (in %). The changed criterion becomes
// "pinned" (manually set). Redistribution primarily adjusts the UNPINNED
// criteria; other pinned values keep their weight. Only when there is no
// free capacity left (everything pinned, or pins exceed the remainder) do
// the other pinned values scale as a second-order fallback.
function setCustomWeight(cid, newPct) {
  newPct = Math.max(0, Math.min(100, newPct));
  const w = computeWeights();
  customWeightPinned[cid] = true;
  const others = criteria.filter(c => c.id !== cid);
  const free = others.filter(c => !customWeightPinned[c.id]);
  const pinned = others.filter(c => customWeightPinned[c.id]);
  const pinnedSum = pinned.reduce((s, c) => s + w[c.id] * 100, 0);
  const remaining = 100 - newPct - pinnedSum;

  const next = { [cid]: newPct };
  if (free.length && remaining >= 0) {
    const freeSum = free.reduce((s, c) => s + w[c.id] * 100, 0);
    free.forEach(c => next[c.id] = freeSum > 0 ? (w[c.id] * 100 / freeSum) * remaining : remaining / free.length);
    pinned.forEach(c => next[c.id] = w[c.id] * 100);
  } else {
    // Second order: no unpinned capacity — scale the other pinned values
    free.forEach(c => next[c.id] = 0);
    const target = 100 - newPct;
    pinned.forEach(c => next[c.id] = pinnedSum > 0 ? (w[c.id] * 100 / pinnedSum) * target : target / (pinned.length || 1));
  }
  customWeights = {};
  criteria.forEach(c => customWeights[c.id] = (next[c.id] ?? 0) / 100);
}

// Update the fine-tune numbers and bars in place — no rebuild, no re-sort.
// Used while dragging so rows don't jump around under the cursor.
function refreshFineTuneRows() {
  const w = computeWeights();
  document.querySelectorAll('#fineTuneList .fine-tune-row').forEach(row => {
    const cid = row.dataset.criterion;
    const pct = (w[cid] ?? 0) * 100;
    const input = row.querySelector('.fine-tune-input');
    if (input) {
      input.value = pct.toFixed(1);
      input.classList.toggle('pinned', !!customWeightPinned[cid]);
    }
    const fill = row.querySelector('.fine-tune-bar-fill');
    if (fill) fill.style.width = pct + '%';
  });
  customBadge.classList.toggle('visible', customWeights !== null);
}

function renderFineTune() {
  const container = document.getElementById('fineTuneList');
  const w = computeWeights();
  container.innerHTML = '';
  criteriaByWeight().forEach(c => {
    const pct = w[c.id] * 100;
    const row = document.createElement('div');
    row.className = 'fine-tune-row';
    row.dataset.criterion = c.id;
    row.innerHTML = `
      <span class="fine-tune-name">${esc(c.name)}</span>
      <input type="number" class="fine-tune-input${customWeightPinned[c.id] ? ' pinned' : ''}" value="${pct.toFixed(1)}" min="0" max="100" step="0.1" data-criterion="${c.id}">
      <span class="fine-tune-pct">%</span>
      <div class="fine-tune-bar"><div class="fine-tune-bar-fill" style="width:${pct}%"></div></div>
      <input type="text" class="fine-tune-reason" placeholder="${t('reasonPlaceholder')}" value="${esc(customWeightReasons[c.id] || '')}" data-criterion="${c.id}">`;
    container.appendChild(row);
  });
  container.querySelectorAll('.fine-tune-input').forEach(input => {
    input.addEventListener('change', () => {
      setCustomWeight(input.dataset.criterion, parseFloat(input.value) || 0);
      updateResults();
    });
  });
  container.querySelectorAll('.fine-tune-reason').forEach(input => {
    input.addEventListener('input', () => {
      customWeightReasons[input.dataset.criterion] = input.value;
      saveState();
    });
  });
  customBadge.classList.toggle('visible', customWeights !== null);
}

// ── Fine-tune bar drag ────────────────────────────────────────
(function setupFineTuneDrag() {
  const container = document.getElementById('fineTuneList');
  let drag = null;
  function pctFrom(e, rect) {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
  }
  function onDown(e) {
    const bar = e.target.closest('.fine-tune-bar');
    const row = e.target.closest('.fine-tune-row');
    if (!bar || !row) return;
    e.preventDefault();
    drag = { cid: row.dataset.criterion, rect: bar.getBoundingClientRect() };
    setCustomWeight(drag.cid, pctFrom(e, drag.rect));
    refreshFineTuneRows();
  }
  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    setCustomWeight(drag.cid, pctFrom(e, drag.rect));
    refreshFineTuneRows();
  }
  function onUp() {
    if (!drag) return;
    drag = null;
    updateResults(); // commit: re-sort, cascade to all views, save
  }
  container.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  container.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
}());

// ── Event handlers ────────────────────────────────────────────
document.getElementById('resetFineBtn').onclick = () => {
  customWeights = null;
  customWeightReasons = {};
  customWeightPinned = {};
  updateResults();
  updateSolutionRanking();
  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
};

addBtn.onclick = () => { addCriterionInput(); checkAndStartComparison(); };
for (let i = 0; i < 3; i++) addCriterionInput();
