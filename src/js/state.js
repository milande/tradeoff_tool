const STORAGE_KEY = 'tradeoff_v1';
// Format version 2: criteria/solutions are {id, name}; all maps key by id.
// Version-1 files (name-keyed) are not loadable.
const STATE_VERSION = 2;

function buildState() {
  return {
    version: STATE_VERSION,
    decisionName, bearbeiter,
    criteria: getCriteria(),
    pairStates,
    customWeights,
    customWeightReasons,
    customWeightPinned,
    proMode,
    lang,
    solutions: getSolutions(),
    ratings,
    ratingNotes,
    criteriaAnchors,
    knockoutCriteria,
    economicCriteria,
    solutionNotes,
    scenarios,
    raters,
    sensWeights,
    explorationRatings,
  };
}

function saveState() {
  const json = JSON.stringify(buildState());
  try { localStorage.setItem(STORAGE_KEY, json); } catch (e) {}
  recordHistory(json);
}

// ── Undo / Redo ───────────────────────────────────────────────
// Every saveState() records a full snapshot. Repeated changes to the SAME
// field/cell within a short burst window (e.g. typing a name, re-clicking a
// rating) collapse into one history entry; changes to different things always
// get their own entry.
let undoStack = [], redoStack = [];
let lastHistoryTime = 0;
let lastHistorySig = null;
let historyLock = false;
const HISTORY_LIMIT = 100;
const HISTORY_BURST_MS = 700;

// Which parts of the state differ between two snapshots — one level deep, so
// e.g. two different rating cells produce different signatures.
function historySig(aJson, bJson) {
  const a = JSON.parse(aJson), b = JSON.parse(bJson);
  const parts = [];
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => {
    const av = a[k], bv = b[k];
    if (JSON.stringify(av) === JSON.stringify(bv)) return;
    if (av && bv && typeof av === 'object' && !Array.isArray(av) && typeof bv === 'object' && !Array.isArray(bv)) {
      new Set([...Object.keys(av), ...Object.keys(bv)]).forEach(sk => {
        if (JSON.stringify(av[sk]) !== JSON.stringify(bv[sk])) parts.push(k + ':' + sk);
      });
    } else {
      parts.push(k);
    }
  });
  return parts.sort().join(',');
}

function recordHistory(json) {
  if (historyLock) return;
  const top = undoStack[undoStack.length - 1];
  if (top === json) return;
  const now = Date.now();
  const sig = top ? historySig(top, json) : '';
  if (undoStack.length > 1 && now - lastHistoryTime < HISTORY_BURST_MS && sig === lastHistorySig) {
    undoStack[undoStack.length - 1] = json;
  } else {
    undoStack.push(json);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  }
  lastHistoryTime = now;
  lastHistorySig = sig;
  redoStack = [];
  updateHistoryButtons();
}

function restoreFromHistory(json) {
  historyLock = true;
  const activeTab = (document.querySelector('.tab-btn.active') || {}).dataset?.tab;
  try { applyState(JSON.parse(json)); } finally { historyLock = false; }
  try { localStorage.setItem(STORAGE_KEY, json); } catch (e) {}
  // The next change must never collapse into (and destroy) the checkpoint
  // we just restored to.
  lastHistoryTime = 0;
  lastHistorySig = null;
  // applyState resets to the criteria tab — return to where the user was
  if (activeTab && activeTab !== 'criteria') {
    const btn = document.querySelector(`.tab-btn[data-tab="${activeTab}"]`);
    if (btn && !btn.classList.contains('disabled') && btn.onclick) btn.onclick();
  }
  updateHistoryButtons();
}

function undoState() {
  if (undoStack.length < 2) return;
  redoStack.push(undoStack.pop());
  restoreFromHistory(undoStack[undoStack.length - 1]);
}

function redoState() {
  if (!redoStack.length) return;
  const json = redoStack.pop();
  undoStack.push(json);
  restoreFromHistory(json);
}

function updateHistoryButtons() {
  const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
  if (u) u.disabled = undoStack.length < 2;
  if (r) r.disabled = redoStack.length === 0;
}

// Returns true if the state was applied, false for missing/incompatible data.
function applyState(state) {
  if (!state || state.version !== STATE_VERSION) return false;

  list.innerHTML = '';
  (state.criteria || []).forEach(c => addCriterionInput(c.name, c.id));
  // Pad with empty inputs so a fresh/small session still shows 3 rows
  for (let i = (state.criteria || []).length; i < 3; i++) addCriterionInput();
  clearTimeout(inputDebounce);

  decisionName = state.decisionName || '';
  bearbeiter = state.bearbeiter || '';
  ratingNotes = state.ratingNotes || {};
  criteriaAnchors = state.criteriaAnchors || {};
  knockoutCriteria = state.knockoutCriteria || {};
  economicCriteria = state.economicCriteria || {};
  solutionNotes = state.solutionNotes || {};
  document.getElementById('decisionNameInput').value = decisionName;
  document.getElementById('bearbeiterInput').value = bearbeiter;
  pairStates = state.pairStates || {};
  customWeights = state.customWeights || null;
  customWeightReasons = state.customWeightReasons || {};
  customWeightPinned = state.customWeightPinned || {};
  scenarios = state.scenarios || [];
  raters = state.raters || [];
  proMode = state.proMode || false;
  lang = state.lang || 'en';
  if ((state.criteria || []).length >= 2) startComparison(true, true);
  applyProMode();

  solutionList.innerHTML = '';
  (state.solutions || []).forEach(s => addSolutionInput(s.name, (state.solutionNotes || {})[s.id] || '', s.id));
  for (let i = (state.solutions || []).length; i < 3; i++) addSolutionInput();
  clearTimeout(solutionDebounce);

  ratings = state.ratings || {};
  renderSolutionMatrix();
  updateSolutionRanking();
  initSensWeights();
  if (state.sensWeights) {
    criteria.forEach(c => { if (state.sensWeights[c.id] !== undefined) sensWeights[c.id] = state.sensWeights[c.id]; });
    const total = criteria.reduce((s, c) => s + (sensWeights[c.id] ?? 0), 0);
    if (total > 0) criteria.forEach(c => sensWeights[c.id] /= total);
  }
  initExplorationRatings();
  if (state.explorationRatings) explorationRatings = { ...state.explorationRatings };
  updateSensRanking(); updateSensImpact(); updateRatingImpact();
  updateTabState();

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="criteria"]').classList.add('active');
  document.getElementById('tab-criteria').classList.add('active');
  applyLang();
  return true;
}
