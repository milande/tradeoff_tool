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
let decisionName = '', bearbeiter = '';
let criteria = [], pairs = [], pairStates = {};
let comparisonStarted = false;
let inputDebounce = null;
let customWeights = null;
let customWeightReasons = {};
let proMode = false;

// ── Criteria input ────────────────────────────────────────────
function addCriterionInput(value = '') {
  const item = document.createElement('div');
  item.className = 'criteria-item';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = `${t('criterionDefault')} ${list.querySelectorAll('input').length + 1}`;
  input.value = value;
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
  return [...list.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
}

function criteriaKey(c) {
  return [...c].sort().join('|');
}

// ── Weight calculation ────────────────────────────────────────
function computeScores() {
  const scores = {};
  criteria.forEach(c => scores[c] = 0);
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
    const total = Object.values(customWeights).reduce((s, v) => s + v, 0);
    const w = {};
    criteria.forEach(c => w[c] = total > 0 ? (customWeights[c] ?? 0) / total : 1 / criteria.length);
    return w;
  }
  const scores = computeScores();
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  const weights = {};
  criteria.forEach(c => weights[c] = total > 0 ? scores[c] / total : 1 / criteria.length);
  return weights;
}

// Criteria ordered by committed weight (most important first) — used by all
// list-style renders so ordering is consistent across tabs and stable while
// dragging sensitivity bars (sensWeights changes don't reshuffle rows).
function criteriaByWeight() {
  const w = computeWeights();
  return [...criteria].sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0));
}

// ── Helpers ───────────────────────────────────────────────────
function pairLabel(a, b, state) {
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
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([c, p]) => {
    const pct = total > 0 ? 100 * p / total : 0;
    const label = total > 0 ? `${pct.toFixed(1)}%` : '—';
    return { key: c, html: `<td>${c}</td><td>${p.toFixed(1)}</td><td><div class="weight-cell"><span>${label}</span><div class="weight-bar-wrap"><div class="weight-bar" style="width:${pct}%"></div></div></div></td>` };
  });
  animateRows(document.getElementById('tbody'), entries);
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
    }
  } else if (comparisonStarted) {
    compareSection.classList.remove('active');
    resultsSection.classList.remove('active');
    fineTuneSection.classList.remove('active');
    comparisonStarted = false;
    criteria = []; pairs = []; pairStates = {}; customWeights = null; customWeightReasons = {}; scenarios = [];
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
  if (!preserveWeights && criteriaKey(incoming) !== criteriaKey(criteria)) { customWeights = null; customWeightReasons = {}; scenarios = []; }
  criteria = incoming;
  pairs = [];
  for (let i = 0; i < criteria.length; i++)
    for (let j = i + 1; j < criteria.length; j++)
      pairs.push([criteria[i], criteria[j]]);

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
  initSensWeights(); initExplorationRatings();
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
    const row = document.createElement('div');
    row.className = 'pair-row';
    const label = document.createElement('div');
    label.className = 'pair-label';
    label.innerHTML = pairLabel(a, b, state);
    const btns = document.createElement('div');
    btns.className = 'pair-buttons';
    [[-1, a], [0, t('equalBtn')], [1, b]].forEach(([v, text]) => {
      const btn = document.createElement('button');
      btn.className = 'pair-btn' + (state === v ? ' active' : '');
      btn.textContent = text;
      btn.title = text;
      btn.onclick = () => {
        pairStates[key] = v;
        label.innerHTML = pairLabel(a, b, v);
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

function renderFineTune() {
  const container = document.getElementById('fineTuneList');
  const w = computeWeights();
  container.innerHTML = '';
  criteriaByWeight().forEach(c => {
    const pct = w[c] * 100;
    const row = document.createElement('div');
    row.className = 'fine-tune-row';
    row.innerHTML = `
      <span class="fine-tune-name">${c}</span>
      <input type="number" class="fine-tune-input" value="${pct.toFixed(1)}" min="0" max="100" step="0.1" data-criterion="${c}">
      <span class="fine-tune-pct">%</span>
      <div class="fine-tune-bar"><div class="fine-tune-bar-fill" style="width:${pct}%"></div></div>
      <input type="text" class="fine-tune-reason" placeholder="${t('reasonPlaceholder')}" value="${customWeightReasons[c] || ''}" data-criterion="${c}">`;
    container.appendChild(row);
  });
  container.querySelectorAll('.fine-tune-input').forEach(input => {
    input.addEventListener('change', () => {
      const newPct = Math.max(0, Math.min(100, parseFloat(input.value) || 0));
      const c = input.dataset.criterion;
      const w = computeWeights();
      const oldPct = w[c] * 100;
      const remaining = 100 - newPct;
      const otherTotal = 100 - oldPct;
      customWeights = {};
      criteria.forEach(cc => {
        if (cc === c) {
          customWeights[cc] = newPct / 100;
        } else {
          const share = w[cc] * 100;
          customWeights[cc] = otherTotal > 0 ? (share / otherTotal) * remaining / 100 : remaining / (criteria.length - 1) / 100;
        }
      });
      updateResults();
      updateSolutionRanking();
      updateSensRanking();
      updateSensImpact(); updateRatingImpact();
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

// ── Event handlers ────────────────────────────────────────────
document.getElementById('resetFineBtn').onclick = () => {
  customWeights = null;
  customWeightReasons = {};
  updateResults();
  updateSolutionRanking();
  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
};

addBtn.onclick = () => { addCriterionInput(); checkAndStartComparison(); };
for (let i = 0; i < 3; i++) addCriterionInput();
