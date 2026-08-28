#!/usr/bin/env node
// DecisionLab headless test suite.
//
// Runs the real source files from src/ against a minimal DOM shim and
// exercises every functional area end-to-end, then sanity-checks the
// built dist/index.html. No dependencies — run with `npm test`.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'js');
const DIST = path.join(__dirname, '..', 'dist', 'index.html');
const VERSION = 'v0.7.2';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}
global.check = check;  // the app sources are evaluated in global scope

// ── DOM shim ──────────────────────────────────────────────────
function mkEl() {
  return {
    _html: '', style: {}, dataset: {}, value: '', textContent: '', placeholder: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
    get innerHTML(){ return this._html; }, set innerHTML(v){ this._html = v; },
    addEventListener(){}, removeEventListener(){},
    querySelectorAll(){ return []; }, querySelector(){ return mkEl(); },
    appendChild(){}, getBoundingClientRect(){ return {left:0,width:100}; },
    set onclick(f){ this._onclick = f; }, get onclick(){ return this._onclick; },
    set oninput(f){ this._oninput = f; }, get oninput(){ return this._oninput; },
    click(){ if (this._onclick) this._onclick({}); },
    focus(){}, select(){}, remove(){}, animate(){ return { cancel(){} }; }, scrollIntoView(){},
    _attrs: {},
    setAttribute(k, v){ this._attrs[k] = String(v); },
    getAttribute(k){ return k in this._attrs ? this._attrs[k] : null; },
    removeAttribute(k){ delete this._attrs[k]; },
    hasAttribute(k){ return k in this._attrs; },
  };
}
const elCache = {};
global.document = {
  getElementById(id){ return elCache[id] || (elCache[id] = mkEl()); },
  querySelector(){ return mkEl(); }, querySelectorAll(){ return []; },
  createElement(){ return mkEl(); },
  addEventListener(){}, removeEventListener(){},
  body: mkEl(), documentElement: mkEl(), get currentScript(){ return mkEl(); },
};
global.window = global;
const store = {};
global.__lsStore = store;   // embedded-mode tests assert this stays untouched
global.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; },
};
global.fetchCalls = [];
global.fetchImpl = null;   // per-test: set to a function returning a Response-ish
global.fetch = (url, opts) => { global.fetchCalls.push(url);
  return global.fetchImpl ? global.fetchImpl(url, opts) : Promise.reject(new Error('offline')); };
global.lastCopied = null;
// Node ships a read-only `navigator` global; a plain assignment is dropped.
Object.defineProperty(global, 'navigator', {
  value: { clipboard: { writeText(t){ global.lastCopied = t; return Promise.resolve(); } } },
  configurable: true, writable: true,
});
global.location = { reload(){ this.reloaded = true; } };
global.requestAnimationFrame = f => f();
global.alertMsg = null;
global.alert = m => { global.alertMsg = m; }; global.confirm = () => true; global.prompt = () => '';
global.Blob = class { constructor(parts){ this.parts = parts; } };
global.lastBlob = null;
global.URL = { createObjectURL(b){ global.lastBlob = b; return 'blob:x'; }, revokeObjectURL(){} };

const files = ['lang/en.js','lang/de.js','dom.js','i18n.js','state.js','version.js','criteria.js','solutions.js','sensitivity.js','scenarios.js','team.js','export.js','main.js'];
let all = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');

all += `
;(function(){
  const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;

  // Replace DOM-backed accessors with array-backed mocks so the full
  // lifecycle (incl. applyState round-trip) runs headlessly.
  // Mock entities default their id to the name, so key-based assertions
  // stay readable ('Alpha|Cost'); stable-id behavior is tested separately.
  let mockCriteria = [], mockSolutions = [];
  const ents = names => names.map(n => ({ id: n, name: n }));
  addCriterionInput = (name = '', id = null) => { if (name) mockCriteria.push({ id: id || name, name }); };
  getCriteria = () => mockCriteria.map(c => ({ ...c }));
  addSolutionInput = (name = '', note = '', id = null) => { if (name) mockSolutions.push({ id: id || name, name }); };
  getSolutions = () => mockSolutions.map(s => ({ ...s }));
  // applyState clears the lists via innerHTML = '' before re-adding — mirror that
  Object.defineProperty(document.getElementById('criteriaList'), 'innerHTML',
    { set(v){ if (v === '') mockCriteria = []; }, get(){ return ''; }, configurable: true });
  Object.defineProperty(document.getElementById('solutionList'), 'innerHTML',
    { set(v){ if (v === '') mockSolutions = []; }, get(){ return ''; }, configurable: true });

  // ══ 1. Criteria & pairwise ════════════════════════════════════
  console.log('— Criteria & pairwise —');
  mockCriteria = ents(['Cost', 'Quality', 'Speed', 'Support']);
  checkAndStartComparison();
  check('comparison starts with 4 criteria', comparisonStarted === true);
  check('6 pairs generated (n*(n-1)/2)', pairs.length === 6);

  pairStates = { 'Cost|Quality':-1, 'Cost|Speed':-1, 'Cost|Support':-1, 'Quality|Speed':-1, 'Quality|Support':-1, 'Speed|Support':-1 };
  const w1 = computeWeights();
  check('weights sum to 1', approx(Object.values(w1).reduce((s,v)=>s+v,0), 1));
  check('weights ranked Cost>Quality>Speed>Support', w1.Cost > w1.Quality && w1.Quality > w1.Speed && w1.Speed > w1.Support);
  check('criteriaByWeight orders by importance', JSON.stringify(criteriaByWeight().map(c => c.id)) === JSON.stringify(['Cost','Quality','Speed','Support']));

  // ══ 2. Fine-tune weights ══════════════════════════════════════
  console.log('— Fine-tune —');
  customWeights = { Cost: 30, Quality: 18, Speed: 40, Support: 12 };
  customWeightReasons = { Cost: 'strategic' };
  const w2 = computeWeights();
  check('custom weights respected + normalized', approx(w2.Speed, 0.4) && approx(Object.values(w2).reduce((s,v)=>s+v,0), 1));
  check('criteriaByWeight follows custom order', criteriaByWeight()[0].id === 'Speed');
  customWeights = null; customWeightReasons = {};

  const before = computeWeights();
  setCustomWeight('Speed', 40);
  const after = computeWeights();
  check('setCustomWeight: target hits 40%, sum stays 1, others keep proportions',
    approx(after.Speed, 0.4) && approx(Object.values(after).reduce((s,v)=>s+v,0), 1) &&
    approx(after.Cost / after.Quality, before.Cost / before.Quality));
  setCustomWeight('Speed', 200);
  check('setCustomWeight clamps to 0..100', approx(computeWeights().Speed, 1));
  customWeights = null; customWeightReasons = {}; customWeightPinned = {};

  // Pinning: manually set values stay put, unpinned ones absorb changes
  setCustomWeight('Speed', 40);
  setCustomWeight('Cost', 30);
  const wp = computeWeights();
  check('pinned values stay put; unpinned absorb the change',
    approx(wp.Speed, 0.4) && approx(wp.Cost, 0.3) && approx(Object.values(wp).reduce((s,v)=>s+v,0), 1));
  check('pin flags set for edited criteria only',
    customWeightPinned.Speed === true && customWeightPinned.Cost === true && !customWeightPinned.Quality);
  setCustomWeight('Quality', 20);   // last free: Support absorbs -> 10
  setCustomWeight('Support', 15);   // everything pinned -> second-order scaling
  const w4 = computeWeights();
  check('second order: all pinned -> other pins scale proportionally',
    approx(w4.Support, 0.15) && approx(Object.values(w4).reduce((s,v)=>s+v,0), 1) && approx(w4.Speed / w4.Cost, 40 / 30));
  customWeights = null; customWeightReasons = {}; customWeightPinned = {};

  // ══ 3. Solutions, ratings, ranking, knockout ══════════════════
  console.log('— Solutions & ranking —');
  mockSolutions = ents(['Alpha', 'Beta', 'Gamma']);
  ratings = {
    'Alpha|Cost':4, 'Alpha|Quality':3, 'Alpha|Speed':2, 'Alpha|Support':1,
    'Beta|Cost':2,  'Beta|Quality':4,  'Beta|Speed':4,  'Beta|Support':4,
    'Gamma|Cost':0, 'Gamma|Quality':4, 'Gamma|Speed':4, 'Gamma|Support':4,
  };
  explorationRatings = { ...ratings };
  const ranked = scoreSolutions(computeWeights());
  check('scoreSolutions returns all, sorted desc', ranked.length === 3 && ranked[0].score >= ranked[1].score && ranked[1].score >= ranked[2].score);
  const manual = 4*w1.Cost + 3*w1.Quality + 2*w1.Speed + 1*w1.Support;
  check('score math matches manual calc', approx(ranked.find(r=>r.sol.id==='Alpha').score, manual));

  knockoutCriteria = { Cost: true };
  const ko = getKnockedOut();
  check('knockout eliminates Gamma (0 on Cost)', !!ko.Gamma && !ko.Alpha && !ko.Beta);
  knockoutCriteria = {};

  // ══ 3b. Methodology: consistency, robustness ══════════════════
  console.log('— Methodology —');
  pairStates = { 'Cost|Quality':-1, 'Quality|Speed':-1, 'Cost|Speed':1, 'Cost|Support':-1, 'Quality|Support':-1, 'Speed|Support':-1 };
  const cycles = findInconsistencies();
  check('cycle detected: Cost > Quality > Speed > Cost', cycles.length === 1 && JSON.stringify(cycles[0].slice().sort()) === JSON.stringify(['Cost','Quality','Speed']));

  pairStates = { 'Cost|Quality':-1, 'Cost|Speed':-1, 'Cost|Support':-1, 'Quality|Speed':-1, 'Quality|Support':-1, 'Speed|Support':-1 };
  check('transitive answers: no cycle', findInconsistencies().length === 0);

  const rb = computeRobustness();
  check('robustness: flip detected with winner + challenger', !!rb && rb.stable === false && rb.winner && rb.challenger && rb.bp > 0 && rb.bp < 1);
  const savedRatings = ratings;
  ratings = {};
  getSolutions().forEach(s => criteria.forEach(c => { ratings[s.id + '|' + c.id] = s.id === 'Alpha' ? 4 : 1; }));
  const rbStable = computeRobustness();
  check('robustness: dominant winner is stable', !!rbStable && rbStable.stable === true && rbStable.winner.id === 'Alpha');
  ratings = savedRatings;
  explorationRatings = { ...ratings };

  // ══ 4. Escaping ═══════════════════════════════════════════════
  console.log('— Escaping —');
  check('esc() neutralizes markup + quotes', esc('<b a="x">&\\'') === '&lt;b a=&quot;x&quot;&gt;&amp;&#39;');
  mockSolutions = [{ id: 'sEvil', name: '<img src=x onerror=alert(1)>' }, { id: 'Beta', name: 'Beta' }];
  ratings['sEvil|Cost'] = 3;
  updateSensImpact();
  const impactHtml = document.getElementById('sensImpact')._html;
  check('user markup escaped in rendered panels', !impactHtml.includes('<img src=x') && impactHtml.includes('&lt;img'));
  delete ratings['sEvil|Cost'];
  mockSolutions = ents(['Alpha', 'Beta', 'Gamma']);

  // ══ 4a. VDI 2225 ══════════════════════════════════════════════
  console.log('— VDI 2225 —');
  check('VDI inactive without economic criteria', computeVdi() === null);
  economicCriteria = { Speed: true };
  proMode = true;
  const vdi = computeVdi();
  const wAll = computeWeights();
  const wtSum = wAll.Cost + wAll.Quality + wAll.Support;
  const alphaWt = (4 * wAll.Cost + 3 * wAll.Quality + 1 * wAll.Support) / (4 * wtSum);
  const alphaRow = vdi.find(v => v.sol.id === 'Alpha');
  check('Wt: weighted mean over technical criteria vs ideal', approx(alphaRow.wt, alphaWt));
  check('We: economic-only value (Alpha rated 2 on Speed)', approx(alphaRow.we, 0.5));
  check('s = sqrt(Wt * We)', approx(alphaRow.s, Math.sqrt(alphaRow.wt * alphaRow.we)));
  check('values bounded 0..1', vdi.every(v => v.wt >= 0 && v.wt <= 1 && v.we >= 0 && v.we <= 1));
  comparisonStarted = true;
  renderVdi();
  const vdiHtml2 = document.getElementById('vdiContainer')._html;
  check('VDI section renders table + s-diagram', vdiHtml2.includes('vdi-table') && vdiHtml2.includes('<svg') && vdiHtml2.includes('Alpha'));
  economicCriteria = {};
  renderVdi();
  check('VDI section hides without economic criteria', document.getElementById('vdiSection').style.display === 'none');
  proMode = false;

  // ══ 4b. Stable ids ════════════════════════════════════════════
  console.log('— Stable ids —');
  // Rename criterion 'Cost' -> 'Price' (same id): nothing resets, labels update
  mockCriteria = mockCriteria.map(c => c.id === 'Cost' ? { id: 'Cost', name: 'Price' } : c);
  checkAndStartComparison();
  check('rename keeps data (stable id)', comparisonStarted && ratings['Alpha|Cost'] === 4 && pairStates['Cost|Quality'] === -1 && critName('Cost') === 'Price');
  updateSensImpact();
  check('renamed label shown in panels', document.getElementById('sensImpact')._html.includes('Price'));
  // Rename solution 'Alpha' -> 'Omega' (same id): ratings stay attached
  mockSolutions = mockSolutions.map(s => s.id === 'Alpha' ? { id: 'Alpha', name: 'Omega' } : s);
  const rankedRenamed = scoreSolutions(computeWeights());
  check('solution rename keeps score (stable id)', rankedRenamed.find(r => r.sol.id === 'Alpha').sol.name === 'Omega' && ratings['Alpha|Cost'] === 4);
  mockSolutions = ents(['Alpha', 'Beta', 'Gamma']);
  mockCriteria = mockCriteria.map(c => c.id === 'Cost' ? { id: 'Cost', name: 'Cost' } : c);
  checkAndStartComparison();

  // ══ 5. Sensitivity ════════════════════════════════════════════
  console.log('— Sensitivity —');
  initSensWeights(); initExplorationRatings();
  const segsW = computeBreakevens('Cost', getSolutions());
  const coversW = approx(segsW[0].from, 0) && approx(segsW[segsW.length-1].to, 1) &&
    segsW.every((s, i) => i === 0 || approx(s.from, segsW[i-1].to));
  check('criterion breakeven segments tile [0,1]', coversW);

  const segsR = computeRatingBreakevens(getSolutions().find(s => s.id === 'Alpha'), 'Cost', getSolutions(), sensWeights);
  const coversR = approx(segsR[0].from, 0) && approx(segsR[segsR.length-1].to, 1) &&
    segsR.every((s, i) => i === 0 || approx(s.from, segsR[i-1].to));
  check('rating breakeven segments tile [0,1]', coversR);

  adjustSensWeight('Quality', 0.5);
  check('drag: target=0.5, sum stays 1', approx(sensWeights.Quality, 0.5) && approx(Object.values(sensWeights).reduce((s,v)=>s+v,0), 1));
  sensWeights = {};
  adjustSensWeight('Cost', 0.4);
  check('drag from corrupt state self-heals', Object.values(sensWeights).every(v => isFinite(v)) && approx(Object.values(sensWeights).reduce((s,v)=>s+v,0), 1) && sensWeights.Quality > 0.01);

  updateSensImpact();
  const sensHtml = document.getElementById('sensImpact')._html;
  check('impact panel renders all criteria + markers', ['Cost','Quality','Speed','Support'].every(c => sensHtml.includes(c)) && sensHtml.includes('be-current'));
  updateRatingImpact();
  check('rating panel renders per-solution sections', ['Alpha','Beta','Gamma'].every(s => document.getElementById('ratingImpactContainer')._html.includes(s)));

  // KO solutions are marked in the legend but stay in the bars
  knockoutCriteria = { Cost: true };               // Gamma: 0 on Cost
  updateSensImpact();
  const legendHtml = document.getElementById('sensImpact')._html;
  check('sensitivity legend marks KO solution, bars keep it',
    legendHtml.includes('be-legend-ko') && legendHtml.includes('⊗') && legendHtml.includes('Gamma'));
  check('KO segments render hatched, not solid',
    legendHtml.includes('repeating-linear-gradient(-45deg,#c084fc 0px'));
  knockoutCriteria = {};
  updateSensImpact();
  check('legend KO mark disappears without knockout', !document.getElementById('sensImpact')._html.includes('be-legend-ko'));

  // Ghost markers show the committed state when exploration drifts
  adjustSensWeight('Cost', 0.9);
  updateSensImpact();
  check('drifted weights show committed ghost marker', document.getElementById('sensImpact')._html.includes('be-committed'));
  explorationRatings['Alpha|Cost'] = 0;             // committed is 4
  updateRatingImpact();
  check('drifted rating shows committed ghost marker', document.getElementById('ratingImpactContainer')._html.includes('be-committed'));
  explorationRatings['Alpha|Cost'] = 4;

  document.getElementById('resetWeightsBtn')._onclick();
  const pw = computeWeights();
  check('reset weights restores pairwise', approx(sensWeights.Cost, pw.Cost) && approx(sensWeights.Support, pw.Support));
  updateSensImpact();
  check('no ghost markers when exploration matches committed', !document.getElementById('sensImpact')._html.includes('be-committed'));

  // Reset buttons only active while something differs
  document.getElementById('resetRatingsBtn')._onclick();   // sync ratings too
  updateSensImpact();
  check('reset buttons disabled when unmodified',
    document.getElementById('resetWeightsBtn').disabled === true && document.getElementById('resetRatingsBtn').disabled === true);
  adjustSensWeight('Cost', 0.7);
  check('weight reset button enables on drift', document.getElementById('resetWeightsBtn').disabled === false);
  explorationRatings['Alpha|Cost'] = 1;
  updateRatingImpact();
  check('rating reset button enables on drift', document.getElementById('resetRatingsBtn').disabled === false);
  document.getElementById('resetWeightsBtn')._onclick();
  document.getElementById('resetRatingsBtn')._onclick();
  check('reset buttons disable again after reset',
    document.getElementById('resetWeightsBtn').disabled === true && document.getElementById('resetRatingsBtn').disabled === true);

  explorationRatings['Alpha|Cost'] = 0;
  document.getElementById('resetRatingsBtn')._onclick();
  check('reset ratings restores committed', explorationRatings['Alpha|Cost'] === 4);

  // ══ 7. Scenarios ══════════════════════════════════════════════
  console.log('— Scenarios —');
  adjustSensWeight('Speed', 0.6);
  explorationRatings['Beta|Cost'] = 0;
  document.getElementById('scenarioNameInput').value = 'Speed focus';
  saveCurrentScenario();
  check('scenario saved with weights+ratings', scenarios.length === 1 && approx(scenarios[0].weights.Speed, 0.6) && scenarios[0].ratings['Beta|Cost'] === 0);
  const scHtml = document.getElementById('scenariosContainer')._html;
  check('scenario table renders name, baseline, highlight', scHtml.includes('Speed focus') && scHtml.includes(t('scenarioBaseline')) && scHtml.includes('sc-w-hi'));
  check('scenario table orders criteria by weight', scHtml.indexOf('>Cost<') < scHtml.indexOf('>Support<'));

  const savedId = scenarios[0].id;
  initSensWeights(); initExplorationRatings();   // wander off...
  loadScenario(savedId);                          // ...and load back
  check('loadScenario restores weights + ratings', approx(sensWeights.Speed, 0.6, 1e-6) && explorationRatings['Beta|Cost'] === 0);
  loadScenario('__base__');
  check('baseline load restores pairwise + committed', approx(sensWeights.Cost, pw.Cost, 1e-6) && explorationRatings['Beta|Cost'] === ratings['Beta|Cost']);
  deleteScenario(savedId);
  check('deleteScenario removes it', scenarios.length === 0);

  // ══ 7b. Team ratings ══════════════════════════════════════════
  console.log('— Team ratings —');
  proMode = true;
  raters = [];
  const raterState = (name, r) => ({ version: 2, bearbeiter: name, criteria: getCriteria(), solutions: getSolutions(), ratings: r });
  check('mismatched rater file rejected',
    addRaterData({ version: 2, bearbeiter: 'X', criteria: [{ id: 'Other', name: 'Other' }], solutions: getSolutions(), ratings: {} }) === false && raters.length === 0);
  check('old-version rater file rejected', addRaterData({ version: 1, criteria: getCriteria(), solutions: getSolutions() }) === false);
  const annaRatings = { ...ratings, 'Alpha|Cost': 1 };   // host has 4 -> spread 3
  check('valid rater file accepted', addRaterData(raterState('Anna', annaRatings)) === true && raters.length === 1);
  check('re-import same name replaces, no duplicate',
    addRaterData(raterState('Anna', { ...annaRatings, 'Beta|Cost': 3 })) === true && raters.length === 1 && raters[0].ratings['Beta|Cost'] === 3);
  const mean = teamMeanRatings();
  check('team mean averages host + raters', approx(mean['Alpha|Cost'], (4 + 1) / 2));
  renderTeam();
  const teamOut = document.getElementById('teamContainer')._html;
  check('team table: rater column, mean, disagreement highlight',
    teamOut.includes('Anna') && teamOut.includes('tm-diff') && teamOut.includes('tm-mean'));
  document.getElementById('teamExploreBtn')._onclick();
  check('explore button loads team average into exploration', approx(explorationRatings['Alpha|Cost'], 2.5));
  explorationRatings = { ...ratings };
  const anna = raters[0];
  removeRater(anna.id);
  check('removeRater deletes the rater', raters.length === 0);
  addRaterData(raterState('Anna', annaRatings));   // keep one rater for the round-trip below

  // ══ 8. Persistence round-trip ═════════════════════════════════
  console.log('— Persistence —');
  decisionName = 'Server choice'; bearbeiter = 'Milan';
  adjustSensWeight('Quality', 0.45);
  document.getElementById('scenarioNameInput').value = 'Q first';
  saveCurrentScenario();
  ratingNotes['Alpha|Cost'] = 'cheap!';
  solutionNotes['Beta'] = 'the safe bet';
  criteriaAnchors['Cost|4'] = 'free';
  knockoutCriteria = { Quality: true };
  economicCriteria = { Cost: true };
  lang = 'de';
  saveState();
  const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY));

  mockCriteria = []; mockSolutions = [];
  ratings = {}; sensWeights = {}; explorationRatings = {}; scenarios = []; raters = [];
  decisionName = ''; ratingNotes = {}; solutionNotes = {}; criteriaAnchors = {}; knockoutCriteria = {}; economicCriteria = {}; lang = 'en';
  applyState(snapshot);
  check('round-trip: criteria restored', JSON.stringify(getCriteria().map(c => c.name)) === JSON.stringify(['Cost','Quality','Speed','Support']));
  check('round-trip: solutions + ratings', getSolutions().length === 3 && ratings['Alpha|Cost'] === 4);
  check('round-trip: meta (name, author, lang)', decisionName === 'Server choice' && bearbeiter === 'Milan' && lang === 'de');
  check('round-trip: sensWeights survive', approx(sensWeights.Quality, 0.45, 1e-6));
  check('round-trip: scenario survives', scenarios.length === 1 && scenarios[0].name === 'Q first');
  check('round-trip: notes/anchors/knockout', ratingNotes['Alpha|Cost'] === 'cheap!' && solutionNotes['Beta'] === 'the safe bet' && criteriaAnchors['Cost|4'] === 'free' && knockoutCriteria.Quality === true);
  check('round-trip: economic tags survive', economicCriteria.Cost === true);
  check('round-trip: raters survive', raters.length === 1 && raters[0].name === 'Anna' && raters[0].ratings['Alpha|Cost'] === 1);

  // ══ 8b. Undo / Redo ═══════════════════════════════════════════
  console.log('— Undo/Redo —');
  undoStack = []; redoStack = []; lastHistoryTime = 0; lastHistorySig = null;
  const topState = () => JSON.parse(undoStack[undoStack.length - 1]);

  saveState();                                    // [baseline] Alpha|Cost = 4
  ratings['Alpha|Cost'] = 0; explorationRatings['Alpha|Cost'] = 0; saveState();
  check('history: two entries recorded', undoStack.length === 2);
  undoState();
  check('undo restores previous rating', ratings['Alpha|Cost'] === 4 && redoStack.length === 1 && undoStack.length === 1);
  redoState();
  check('redo re-applies the change', ratings['Alpha|Cost'] === 0 && undoStack.length === 2 && redoStack.length === 0);

  // Same cell changed twice in a burst -> ONE undo step
  ratings['Alpha|Quality'] = 1; saveState();
  ratings['Alpha|Quality'] = 2; saveState();
  check('same-cell burst collapses into one entry',
    undoStack.length === 3 && topState().ratings['Alpha|Quality'] === 2);

  // Different cells changed rapidly -> SEPARATE undo steps
  ratings['Beta|Cost'] = 3; saveState();
  ratings['Gamma|Quality'] = 0; saveState();
  check('rapid changes to different cells stay separate steps', undoStack.length === 5);

  // A quick change right after an undo must not clobber the restored checkpoint
  undoState();                                    // back to Beta|Cost = 3 state
  const keptCheckpoint = undoStack[undoStack.length - 1];
  ratings['Beta|Cost'] = 1; saveState();          // immediately after undo
  check('post-undo change keeps the restored checkpoint',
    undoStack.length === 5 && undoStack[undoStack.length - 2] === keptCheckpoint);
  undoState();
  check('undoing that change returns to the checkpoint', ratings['Beta|Cost'] === 3);

  // Walk the whole chain down and back up
  while (undoStack.length > 1) undoState();
  check('full undo chain reaches the baseline',
    ratings['Alpha|Cost'] === 4 && ratings['Alpha|Quality'] === 3 && undoStack.length === 1);
  // (the Gamma|Quality=0 step was on the redo branch discarded by the
  //  post-undo change — so the final state has Gamma|Quality=4 again)
  while (redoStack.length) redoState();
  check('full redo chain restores the final state',
    ratings['Beta|Cost'] === 1 && ratings['Alpha|Quality'] === 2 && ratings['Alpha|Cost'] === 0 && ratings['Gamma|Quality'] === 4);

  // Sensitivity-tab actions record history too
  const lenReset = undoStack.length;
  document.getElementById('resetRatingsBtn')._onclick();
  check('reset ratings records an undo step', undoStack.length === lenReset + 1);
  adjustSensWeight('Cost', 0.9);                  // exploration change (drag saves on release)
  const lenLoad = undoStack.length;
  loadScenario('__base__');
  check('baseline load records an undo step', undoStack.length === lenLoad + 1);

  // Restore the fixture values for the following sections
  ratings['Alpha|Cost'] = 4; ratings['Alpha|Quality'] = 3; ratings['Beta|Cost'] = 2; ratings['Gamma|Quality'] = 4;
  explorationRatings = { ...ratings };
  lastHistoryTime = 0; saveState();

  // ══ 9. Exports ════════════════════════════════════════════════
  console.log('— Exports —');
  document.getElementById('exportBtn')._onclick();
  const json = JSON.parse(lastBlob.parts[0]);
  check('JSON export parses + has all sections', json.version === 2 && json.criteria.length === 4 && json.criteria[0].id && json.scenarios.length === 1 && json.sensWeights && json.explorationRatings && json.decisionName === 'Server choice');

  document.getElementById('exportCsvBtn')._onclick();
  const csv = lastBlob.parts[0];
  check('CSV export: BOM, matrix, score + rank rows', csv.charCodeAt(0) === 0xFEFF && csv.includes('Cost') && csv.includes('#1') && csv.split('\\n').length >= 7);
  check('CSV export includes VDI rows when tagged', csv.includes('Wt;') && csv.includes('We;') && csv.includes('s;'));

  proMode = true;
  knockoutCriteria = { Cost: true };   // Gamma scores 0 on Cost -> knocked out
  const pv = generatePrintView('Server choice', 'Milan');
  check('print: header, name, author, version', pv.includes('Server choice') && pv.includes('Milan') && pv.includes('${VERSION}'));
  check('print: KO solution struck through + reason readable', pv.includes('line-through') && pv.includes(t('knockedOut')) && !pv.match(new RegExp('line-through[^"]*"[^>]*>[^<]*' + t('knockedOut'))));
  check('print: score definitions/scale present', pv.includes(t('printScoreDefinitions')));
  check('print: criteria ordered by weight in ranking header', pv.indexOf('<th title="Cost">') < pv.indexOf('<th title="Support">'));
  check('print: sensitivity + rating impact sections', pv.includes(t('criterionImpact')) && pv.includes(t('ratingImpact')));
  check('print: VDI section with s-diagram when tagged', pv.includes(t('vdiTitle')) && pv.includes('<svg'));
  // The s-diagram is inline SVG, so it must follow the surrounding theme. A
  // presentation attribute cannot hold var(), which is why these go via style=.
  {
    const svg = pv.slice(pv.indexOf('<svg'), pv.indexOf('</svg>'));
    check('print: s-diagram is themed by token, not by hardcoded colours',
      svg.includes('var(--fg-rgb)') && svg.includes('var(--sol-')
        && svg.indexOf('#') === -1 && svg.indexOf('rgba(255,255,255') === -1);
  }
  check('print: team section with rater + disagreement highlight', pv.includes(t('teamTitle')) && pv.includes('Anna') && pv.includes('#fef3c7'));

  // ── Flat rendering ──────────────────────────────────────────
  // A Confluence page export (Scroll Documents into HTML or Word) converts the
  // stored markup with a server-side renderer that drops background colour,
  // collapses empty nested divs and reduces inline SVG to loose labels. Flat
  // mode carries the same report through it: every value that a bar, a track or
  // a diagram encodes is also written as text.
  const pvFlat = generatePrintView('Server choice', 'Milan', true);
  // The two modes share one stylesheet — what differs is the markup that uses
  // it, so these read the body rather than the whole document.
  const bodyOf = doc => doc.slice(doc.indexOf('<body>'), doc.indexOf('</body>'));
  const flatBody = bodyOf(pvFlat), stdBody = bodyOf(pv);
  check('flat print: same sections as the standard report',
    [t('printSolutionRanking'), t('printCriteriaWeights'), t('printScoreDefinitions'),
     t('criterionImpact'), t('ratingImpact'), t('vdiTitle')].every(h => pvFlat.includes(h)));
  check('flat print: nothing a converter drops — no CSS bars, tracks or SVG',
    !flatBody.includes('bar-wrap') && !flatBody.includes('be-track') && !flatBody.includes('<svg')
      && flatBody.indexOf('position:absolute') === -1 && flatBody.indexOf('style="left:') === -1);
  check('flat print: bars are drawn with text glyphs instead',
    flatBody.includes('glyph-bar') && flatBody.includes('\u2588'));
  check('flat print: breakeven spans are tabulated, marker included',
    pvFlat.includes(t('printThLeads')) && pvFlat.includes('\u25c0'));
  check('flat print: says it is a snapshot of something interactive',
    pvFlat.includes(t('printStaticNote')));
  check('standard print keeps the bars, tracks and diagram it can draw',
    stdBody.includes('bar-wrap') && stdBody.includes('be-track') && stdBody.includes('<svg')
      && !stdBody.includes('glyph-bar') && !stdBody.includes(t('printStaticNote')));
  // Glyph bars are the only carrier of a magnitude a converter keeps, so the
  // ends must be exact rather than approximately full or empty.
  check('glyph bar: full, empty and clamped',
    glyphBar(100) === '\u2588'.repeat(12) && glyphBar(0) === '\u2591'.repeat(12)
      && glyphBar(50) === '\u2588'.repeat(6) + '\u2591'.repeat(6)
      && glyphBar(-5) === glyphBar(0) && glyphBar(140) === glyphBar(100)
      && glyphBar('80.0') === '\u2588'.repeat(10) + '\u2591'.repeat(2));
  check('JSON export carries raters', Array.isArray(json.raters) && json.raters.length === 1 && json.raters[0].name === 'Anna');
  proMode = false;
  const pvStd = generatePrintView('Server choice', 'Milan');
  check('print: no sensitivity sections in standard mode', !pvStd.includes(t('criterionImpact')) && !pvStd.includes(t('ratingImpact')));
  proMode = true;

  // HTML export: fake the capture globals that exist only in the built file
  globalThis._scriptText = 'const S = \\'// Auto-load saved session\\';\\nAPP\\n// Auto-load saved session\\nOLD\\n// END Auto-load\\nTAIL';
  globalThis._styleText = 'CSS{}';
  globalThis._bodyHtml = '<div class="container"><div class="app-header">HDR</div>BODY</div>';
  document.getElementById('exportHtmlBtn')._onclick();
  const out = lastBlob.parts[0];
  check('HTML export: read-only + baked state + body', out.includes('data-readonly') && out.includes('applyState') && out.includes('Server choice') && out.includes('BODY'));
  check('HTML export: banner injected inside sticky header', /class="app-header">\\s*<div class="export-info"/.test(out));
  check('HTML export: replaces auto-load, keeps string literal', out.includes("const S = '// Auto-load saved session'") && !out.includes('OLD'));
  check('HTML export: carries current proMode', out.includes('"proMode":true'));
  check('HTML export: stylesheet stays unscoped (regression guard)', out.includes('CSS{}') && !out.includes('.dl-embed'));

  // ══ 9b. Embedded (Confluence) builds never touch storage ══════
  // An embed shares the host page's origin with every other embed and with the
  // live tool, so a single read or write would make embedded pages render or
  // clobber each other's decisions.
  console.log('— Embedded storage isolation —');
  const embedBlock = bakedAutoLoad('{"version":2}', true);
  const soloBlock = bakedAutoLoad('{"version":2}', false);
  check('embed auto-load: no storage access at all',
    !embedBlock.includes('localStorage') && !embedBlock.includes('lsGet') && !embedBlock.includes('STORAGE_KEY'));
  check('embed auto-load: sets embedded before applying baked state',
    embedBlock.indexOf('embedded = true') >= 0 && embedBlock.indexOf('embedded = true') < embedBlock.indexOf('applyState'));
  check('standalone auto-load still prefers the viewer session (regression guard)',
    soloBlock.includes('lsGet(STORAGE_KEY)') && !soloBlock.includes('embedded = true'));
  check('bakeScript swaps only the real block, keeps the string literal',
    bakeScript(globalThis._scriptText, '{"version":2}', true).includes("const S = '// Auto-load saved session'")
      && !bakeScript(globalThis._scriptText, '{"version":2}', true).includes('OLD'));

  // Drive the real app through the writes a read-only embed still exposes:
  // the language toggle and a sensitivity drag both call saveState().
  __lsStore['tradeoff_v1'] = JSON.stringify({ version: 2, decisionName: 'SOMEONE ELSE' });
  __lsStore['dl_lang'] = 'de';
  const storeBefore = JSON.stringify(__lsStore);
  embedded = true;
  check('embed: reads are blindfolded even with a session present',
    lsGet(STORAGE_KEY) === null && lsGet('dl_lang') === null);
  document.getElementById('langToggle')._onclick();   // applyLang() + saveState()
  saveState();
  updateSensImpact();
  restoreFromHistory(JSON.stringify(buildState()));
  lsRemove(STORAGE_KEY);
  check('embed: language toggle, saveState, history and reset write nothing',
    JSON.stringify(__lsStore) === storeBefore, 'store mutated: ' + JSON.stringify(__lsStore));
  check('embed: undo history still records (kept in memory)', undoStack.length > 0);
  embedded = false;
  saveState();
  check('non-embedded persistence still works', __lsStore['tradeoff_v1'] !== undefined
    && JSON.parse(__lsStore['tradeoff_v1']).decisionName !== 'SOMEONE ELSE');
  delete __lsStore['dl_lang'];

  // ══ 9c. Embed CSS scoping ═════════════════════════════════════
  // The macro injects our stylesheet into the wiki page, so an unscoped rule
  // restyles Confluence itself.
  console.log('— Embed CSS scoping —');
  const sc = css => scopeCss(css, '.dl-embed', ['.pro-on', '[data-readonly]']);
  check('scope: body becomes the wrapper',
    sc('body{margin:0;background:#0d1117}') === '.dl-embed{margin:0;background:#0d1117}');
  check('scope: :root custom properties move onto the wrapper',
    sc(':root{--bg:#0d1117}') === '.dl-embed{--bg:#0d1117}');
  check('scope: bare element selectors nest (no host-page tables restyled)',
    sc('table{width:100%}') === '.dl-embed table{width:100%}');
  check('scope: every selector in a list is scoped individually',
    sc('th,td{padding:10px}') === '.dl-embed th,.dl-embed td{padding:10px}');
  check('scope: attribute selectors nest (host editor inputs untouched)',
    sc('input[type=text]{border:0}') === '.dl-embed input[type=text]{border:0}');
  check('scope: root hooks merge with the wrapper, not nest under it',
    sc('.pro-on .knockout-toggle{display:inline-flex}') === '.dl-embed.pro-on .knockout-toggle{display:inline-flex}'
      && sc('[data-readonly] #printBtn{display:none}') === '.dl-embed[data-readonly] #printBtn{display:none}');
  check('scope: a hook prefix is not matched inside a longer class name',
    sc('.pro-online{color:red}') === '.dl-embed .pro-online{color:red}');
  check('scope: @media preserved, rules inside it scoped',
    sc('@media(max-width:700px){.tabs{flex-wrap:wrap}}') === '@media(max-width:700px){.dl-embed .tabs{flex-wrap:wrap}}');
  check('scope: @keyframes steps left alone',
    sc('@keyframes spin{from{opacity:0}to{opacity:1}}') === '@keyframes spin{from{opacity:0}to{opacity:1}}');
  check('scope: comments dropped, declarations untouched',
    sc('/* note */ .x{content:""}') === '.dl-embed .x{content:""}');
  check('scope: top-level commas only (:not lists survive)',
    sc('.a:not(.b,.c),.d{color:red}') === '.dl-embed .a:not(.b,.c),.dl-embed .d{color:red}');
  // A comment that follows whitespace used to be absorbed into the next
  // selector. One invalid selector invalidates its whole comma-separated rule,
  // so the entire read-only block was dropped and every editing control it
  // hides went live in the embed.
  check('scope: comment after leading whitespace does not reach the selector',
    sc(' /* note */ .x{color:red}') === '.dl-embed .x{color:red}');
  check('scope: comments stripped before, between and after rules',
    sc('/* a */.x{color:red}/* b */.y{color:blue}/* c */')
      === '.dl-embed .x{color:red}.dl-embed .y{color:blue}');
  check('scope: an unterminated comment ends the sheet, as in a browser',
    sc('.x{color:red}/* oops .y{color:blue}') === '.dl-embed .x{color:red}');
  check('scope: no emitted selector ever carries a comment',
    !sc('/* a */ .x, /* b */ .y{color:red}').includes('/*'));
  // const declarations do not escape a direct eval — hand it to the static checks.
  globalThis.READONLY_CSS = READONLY_CSS;
  globalThis.SOL_COLORS = SOL_COLORS;

  check('embedCss: read-only rules scoped and extras appended',
    embedCss('body{color:#fff}').includes('.dl-embed[data-readonly] #printBtn')
      && embedCss('body{color:#fff}').includes('.dl-embed .help-overlay{display:none}')
      && embedCss('body{color:#fff}').includes('.dl-embed .app-header{position:relative}'));

  // ══ 9d. Embed scope isolation ═════════════════════════════════
  // The macro injects our script into the wiki page's own scope, so bindings
  // and element lookups must stay inside the instance.
  console.log('— Embed scope isolation —');
  const fakeScript = '// Capture preamble\\nconst _scriptText=1;const _styleText=2;let _bodyHtml=3;\\n// END Capture preamble\\nAPP\\n// Auto-load saved session\\nOLD\\n// END Auto-load\\nTAIL';
  check('strip: capture preamble cut out by its sentinels',
    stripCapturePreamble('HEAD;// Capture preamble\\nJUNK\\n// END Capture preamble\\nTAIL;') === 'HEAD;\\nTAIL;');
  check('strip: a script without a preamble is returned untouched',
    stripCapturePreamble('PLAIN') === 'PLAIN');

  // Recovers the source from the shipped base64 envelope. Accepts a whole
  // payload too: anchor on the call, since the wrapper and stylesheet around it
  // have quoted runs of their own (lang="en" and friends).
  const decodeEmbed = text => {
    const at = text.indexOf('new Function(');
    const b64 = (at < 0 ? text : text.slice(at)).match(/"([A-Za-z0-9+/=]+)"/)[1];
    return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  };

  const es = embedScriptSource(fakeScript, '{"version":2}', 'dl-test1');
  check('embed script: wrapped in an IIFE, nothing reaches page scope',
    es.indexOf('(function(){') === 0 && es.slice(-5) === '})();');
  check('embed script: binds to its own wrapper (currentScript, id fallback)',
    es.includes('_embedRoot') && es.includes('.dl-embed') && es.includes('dl-test1'));
  check('embed script: capture-preamble artefacts gone',
    !es.includes('_scriptText') && !es.includes('_styleText') && !es.includes('_bodyHtml'));
  check('embed script: baked state, no storage access (with #25)',
    es.includes('embedded = true') && !es.includes('localStorage') && !es.includes('OLD'));

  // Confluence content filters parse the macro body as HTML and delete markup
  // out of the script text. The shipped script must therefore contain none.
  const wrapped = embedScript(fakeScript, '{"version":2}', 'dl-test1');
  check('embed script: shipped form contains no markup for a filter to eat',
    !wrapped.includes('<') && !wrapped.includes('&') && !wrapped.includes(']]' + '>'));
  check('embed script: shipped form is a self-scoping new Function call',
    wrapped.indexOf('new Function(') === 0 && wrapped.slice(-4) === ')();');
  check('embed script: reveals the app template and drops the static report',
    es.includes('.dl-static') && es.includes('.dl-live')
      && es.includes('removeAttribute("hidden")') && es.includes('_dlStatic.remove()')
      && es.indexOf('_dlStatic.remove()') > es.indexOf('APP'));
  // An app that fails to start would otherwise leave an empty box on the page.
  check('embed script: a failed start puts the static report back',
    es.includes('catch(_e)') && es.indexOf('_dlStatic.style.display=""') > es.indexOf('catch(_e)')
      && es.includes('throw _e'));
  check('embed script: base64 round-trips to exactly the source',
    decodeEmbed(wrapped) === es);
  // btoa is Latin-1 only; the app carries umlauts and symbols.
  check('embed script: non-ASCII survives the encoding',
    decodeEmbed(embedScript(fakeScript.replace('APP', 'const s="⚡ ✓ ⊗ Prüfung";'), '{}', 'dl-u'))
      .includes('"⚡ ✓ ⊗ Prüfung"'));
  check('embed ids are unique per export', newEmbedId() !== newEmbedId());

  // Element lookups must resolve inside the instance root rather than the page.
  const savedRoot = appRoot, savedRootEl = appRootEl;
  const fakeRoot = { asked: [], querySelector(sel) { this.asked.push(sel); return 'FOUND'; },
                     querySelectorAll(sel) { this.asked.push(sel); return ['ALL']; } };
  appRoot = fakeRoot; appRootEl = fakeRoot;
  check('lookups resolve inside the instance root, not the whole page',
    byId('criteriaList') === 'FOUND' && fakeRoot.asked[0] === '#criteriaList'
      && qs('.tab-btn') === 'FOUND' && qsa('.tab-btn')[0] === 'ALL');
  check('app-wide listeners bind to the wrapper when embedded, not document',
    globalTarget() === fakeRoot);
  appRoot = savedRoot;
  check('standalone still binds app-wide listeners to document', globalTarget() === document);

  // pro-on must land on the app root; on a wiki page document.body is Confluence's.
  const proSpy = { classList: { last: null, toggle(c, v) { this.last = c + ':' + v; }, contains() { return false; } } };
  appRootEl = proSpy;
  const savedPro = proMode;
  proMode = true; applyProMode();
  check('pro-on toggles on the app root, not the host page body', proSpy.classList.last === 'pro-on:true');
  proMode = savedPro; appRootEl = savedRootEl; applyProMode();

  // ══ 9e. Confluence embed payload ══════════════════════════════
  console.log('— Confluence embed payload —');
  decisionName = 'Server choice'; bearbeiter = 'Milan';
  const pay = buildEmbedPayload();
  check('embed payload: a fragment, not a document',
    !pay.includes('<!DOCTYPE') && !pay.includes('<html') && !pay.includes('<head') && !pay.includes('<body'));
  check('embed payload: one wrapper carrying id, read-only marker and language',
    pay.split('class="dl-embed"').length - 1 === 1
      && pay.indexOf('<div class="dl-embed" id="dl-') === 0
      && pay.includes('data-readonly lang="en">')
      && pay.slice(-6) === '</div>');
  check('embed payload: scoped stylesheet inlined',
    pay.includes('<style>.dl-embed CSS{}') && pay.includes('.dl-embed .help-overlay{display:none}'));
  check('embed payload: app markup with the provenance banner',
    pay.includes('BODY') && pay.includes('export-info-title') && pay.includes('Server choice') && pay.includes('Milan'));

  // ── Both halves ─────────────────────────────────────────────
  // A Confluence page export renders the stored page server-side, where no
  // script runs and the app template — filled in at load — is 61 characters of
  // visible text. The payload therefore carries a static report as well, and
  // the script, which by definition only runs in a browser, swaps one for the
  // other.
  const iStatic = pay.indexOf('<div class="dl-static">');
  const iLive = pay.indexOf('<div class="dl-live"');
  check('embed payload: the static report comes first, the app template after',
    iStatic > 0 && iLive > iStatic);
  check('embed payload: the app template is hidden until a script reveals it',
    pay.slice(iLive, iLive + 60).includes('hidden') && pay.slice(iLive, iLive + 60).includes('display:none'));
  const staticHalf = pay.slice(iStatic, iLive);
  check('embed payload: the static report is a real report, not a placeholder',
    staticHalf.includes(t('printSolutionRanking')) && staticHalf.includes(t('printCriteriaWeights'))
      && staticHalf.includes('Server choice') && staticHalf.includes('glyph-bar'));
  check('embed payload: the static report is flat — nothing a converter drops',
    !staticHalf.includes('bar-wrap') && !staticHalf.includes('<svg') && !staticHalf.includes('be-track'));
  // Both sheets describe table, h2 and th; the report's own rules must win
  // wherever they overlap, whichever <style> the browser reads first.
  check('embed payload: the report sheet outranks the app sheet',
    pay.includes('<style>.dl-embed .dl-static') && pay.includes('.dl-embed .dl-static table{'));
  // Hiding the report at the end of a ~200 KB payload is too late: the browser
  // may paint it and then snap to the app.
  check('embed payload: the report is hidden the moment the parser passes it',
    pay.indexOf(hideStaticScript(), iStatic) > iStatic
      && pay.indexOf(hideStaticScript()) < iLive
      && hideStaticScript().indexOf('<') === -1);
  check('embed payload: isolated script carrying the baked decision',
    pay.includes('<script>new Function(')
      && decodeEmbed(pay).includes('embedded = true')
      && decodeEmbed(pay).includes('"decisionName":"Server choice"'));
  check('embed payload: CDATA-safe', !pay.includes(']]' + '>'));
  // The only markup left in the payload is the wrapper, the stylesheet and the
  // app template — all of which a filter is expected to leave alone.
  check('embed payload: no markup inside either script element',
    pay.split('<script>').slice(1)
      .every(part => part.slice(0, part.indexOf('</scr' + 'ipt>')).indexOf('<') === -1));

  // A decision containing the CDATA terminator is escaped, not rejected: inside
  // the baked JS string literals > is the same character.
  decisionName = 'Odd ]]' + '> name';
  const payEsc = buildEmbedPayload();
  check('embed payload: CDATA terminator in user text is escaped, not rejected',
    !payEsc.includes(']]' + '>') && decodeEmbed(payEsc).includes('u003e')
      && decodeEmbed(payEsc).includes('Odd ]]'));
  decisionName = 'Server choice';

  globalThis.lastCopied = null;
  byId('exportConfluenceBtn')._onclick();
  check('menu action copies the whole payload as plain text',
    lastCopied !== null && lastCopied.indexOf('<div class="dl-embed"') === 0 && lastCopied.slice(-6) === '</div>');

  const fakeBtn = { textContent: 'File' };
  flashLabel(fakeBtn, t('embedCopied'));
  check('confirmation lands on the toolbar button (the menu closes on click)',
    fakeBtn.textContent === t('embedCopied'));

  // Dev mode has no captured script/style/markup to assemble from.
  const savedCapture = globalThis._scriptText;
  delete globalThis._scriptText;
  globalThis.lastCopied = null; globalThis.alertMsg = null;
  byId('exportConfluenceBtn')._onclick();
  check('dev mode refuses with a clear message instead of throwing',
    lastCopied === null && alertMsg === t('alertEmbedDevMode'));
  globalThis._scriptText = savedCapture;
  globalThis.alertMsg = null;

  // ══ 9f. Results first in exports ══════════════════════════════
  // An export is read by people who were not in the room, and on a wiki page it
  // is often scrolled past without a click. It must lead with the outcome.
  console.log('— Results first —');
  check('live tool layout is untouched', readOnly === false);
  // Each result is hoisted to the top of the tab it already belongs to. The
  // sections do not change tab and the tab bar is not touched — a reader
  // navigates the record by tab, and a section under the wrong tab lies.
  const hoisted = [];
  const solPane = byId('tab-solutions'), critPane = byId('tab-criteria');
  solPane.firstChild = {}; critPane.firstChild = {};
  solPane.insertBefore = el => hoisted.push(['tab-solutions', el]);
  critPane.insertBefore = el => hoisted.push(['tab-criteria', el]);
  applyResultsFirst();
  check('results first: each tab leads with its own result, in its own tab',
    hoisted.length === 2
      && hoisted[0][0] === 'tab-solutions' && hoisted[0][1] === byId('rankingSection')
      && hoisted[1][0] === 'tab-criteria' && hoisted[1][1] === byId('resultsSection'));

  // With weights adjusted, computeWeights() returns the adjusted ones, so those
  // are what produced the ranking. The pairwise table must not sit above them.
  const savedCustom = customWeights;
  customWeights = { Cost: 0.4, Quality: 0.6 };
  hoisted.length = 0;
  applyResultsFirst();
  check('results first: adjusted weights lead, pairwise derivation below',
    hoisted.length === 3 && hoisted[2][0] === 'tab-criteria'
      && hoisted[2][1] === byId('fineTuneSection'));
  customWeights = savedCustom;
  hoisted.length = 0;
  applyResultsFirst();
  check('results first: without adjustment the pairwise table stays on top',
    hoisted.length === 2);

  const pvOrder = generatePrintView('Server choice', 'Milan');
  const iRank = pvOrder.indexOf(t('printSolutionRanking'));
  const iWeights = pvOrder.indexOf(t('printCriteriaWeights'));
  const iPairs = pvOrder.indexOf(t('printCriteriaComparisons'));
  const iRobust = pvOrder.indexOf('font-size:0.78rem;color:#777');
  check('print: ranking, then weights, then the derivation',
    iRank > 0 && iRank < iWeights && iWeights < iPairs, iRank + '/' + iWeights + '/' + iPairs);
  check('print: robustness verdict sits with the winner it qualifies',
    iRobust > iRank && iRobust < iWeights, 'at ' + iRobust);
  // ══ 9h. Update check ══════════════════════════════════════════
  // Runs from file:// behind a corporate proxy as often as not, so every
  // failure path has to leave the tool exactly as it was.
  console.log('— Update check —');
  check('version: compares numerically, so v0.10 beats v0.9',
    isNewerVersion('v0.10', 'v0.9') === true && isNewerVersion('v0.9', 'v0.10') === false);
  check('version: equal or older is not an update',
    isNewerVersion('v0.6', 'v0.6') === false && isNewerVersion('v0.5', 'v0.6') === false);
  check('version: a build ahead of the latest release stays quiet',
    isNewerVersion('v0.6', 'v0.7') === false);
  check('version: unparseable answers no — rate-limit bodies and proxy HTML',
    isNewerVersion('API rate limit exceeded', 'v0.6') === false
      && isNewerVersion(null, 'v0.6') === false && isNewerVersion('<!DOCTYPE html>', 'v0.6') === false);
  check('version: tolerates the v prefix either way and a patch part',
    isNewerVersion('0.7', 'v0.6') === true && isNewerVersion('v0.6.1', 'v0.6') === true);

  const savedRO = readOnly, savedEmb = embedded;
  globalThis.fetchCalls = [];
  delete __lsStore[UPDATE_KEY];
  readOnly = true; checkForUpdate();
  check('update: an export never phones home', fetchCalls.length === 0);
  readOnly = false; embedded = true; checkForUpdate();
  check('update: an embed never phones home', fetchCalls.length === 0);
  embedded = savedEmb; readOnly = savedRO;

  __lsStore[UPDATE_PREF] = 'off';
  checkForUpdate();
  check('update: the off preference is respected', fetchCalls.length === 0);
  delete __lsStore[UPDATE_PREF];

  __lsStore[UPDATE_KEY] = JSON.stringify({ tag: 'v0.6', at: Date.now() });
  checkForUpdate();
  check('update: a fresh cached answer skips the network', fetchCalls.length === 0);

  __lsStore[UPDATE_KEY] = JSON.stringify({ tag: 'v0.6', at: Date.now() - 25 * 3600 * 1000 });
  checkForUpdate();
  check('update: a stale cache checks again', fetchCalls.length === 1
    && String(fetchCalls[0]).indexOf('api.github.com') > 0);

  const badge = { classList: { c: {}, add(k){ this.c[k] = 1; }, remove(k){ delete this.c[k]; } }, textContent: '', innerHTML: '', title: '' };
  const savedQs = qs;
  qs = sel => (sel === '.app-version' ? badge : savedQs(sel));
  applyVersionBadge('v0.9');
  check('update: a newer release turns the badge into a link',
    !!badge.classList.c['update-available'] && badge.innerHTML.indexOf('v0.9') > 0
      && badge.innerHTML.indexOf(RELEASES_PAGE) > 0);
  applyVersionBadge('v0.6');
  check('update: the same version leaves a plain badge',
    !badge.classList.c['update-available'] && badge.textContent === APP_VERSION);
  // The tag comes off the network and lands in innerHTML.
  applyVersionBadge('v9.9<img src=x onerror=alert(1)>');
  check('update: a hostile tag is rejected before it reaches the badge',
    badge.innerHTML.indexOf('<img') === -1);
  qs = savedQs;

  // ══ 9g. Theme ═════════════════════════════════════════════════
  console.log('— Theme —');
  const savedRoot2 = themeRoot, savedPref = theme;
  const fakeThemeRoot = document.createElement('div');
  themeRoot = fakeThemeRoot;          // pretend we are an embed
  theme = 'auto';
  document.documentElement.removeAttribute('data-color-mode');
  applyTheme();
  check('theme: auto with no host signal leaves the attribute off, so CSS decides',
    !fakeThemeRoot.hasAttribute('data-theme'));
  document.documentElement.setAttribute('data-color-mode', 'dark');
  applyTheme();
  check('theme: an embed follows the host page', fakeThemeRoot.getAttribute('data-theme') === 'dark');
  document.documentElement.setAttribute('data-color-mode', 'light');
  applyTheme();
  check('theme: host light is followed too', fakeThemeRoot.getAttribute('data-theme') === 'light');
  theme = 'dark'; applyTheme();
  check('theme: an explicit choice overrides the host', fakeThemeRoot.getAttribute('data-theme') === 'dark');
  // Confluence DC publishes both attributes: data-color-mode carries the mode,
  // while data-theme names both schemes ("light:light dark:dark"). Folding them
  // together and matching substrings found "dark" on every page.
  theme = 'auto';
  document.documentElement.setAttribute('data-theme', 'light:light dark:dark');
  document.documentElement.setAttribute('data-color-mode', 'light');
  check('theme: the host colour mode wins over the theme-name attribute',
    hostTheme() === 'light');
  document.documentElement.setAttribute('data-color-mode', 'dark');
  check('theme: host dark is read exactly', hostTheme() === 'dark');
  document.documentElement.setAttribute('data-color-mode', 'auto');
  check('theme: an auto host falls through to the browser preference', hostTheme() === null);
  document.documentElement.removeAttribute('data-theme');
  theme = 'dark';
  document.documentElement.removeAttribute('data-color-mode');
  // Owning the document, we would otherwise read back the attribute we set.
  themeRoot = document.documentElement;
  document.documentElement.setAttribute('data-theme', 'light');
  check('theme: host detection is skipped when we own the document', hostTheme() === null);
  document.documentElement.removeAttribute('data-theme');
  themeRoot = savedRoot2;

  theme = 'auto';
  byId('themeToggle')._onclick();
  const th1 = theme; byId('themeToggle')._onclick();
  const th2 = theme; byId('themeToggle')._onclick();
  check('theme: toggle cycles auto → light → dark → auto',
    th1 === 'light' && th2 === 'dark' && theme === 'auto');
  check('theme: the choice is persisted as a preference', __lsStore['dl_theme'] === 'auto');
  check('theme: solution text uses the themed token and wraps at the palette length',
    solText(0) === 'var(--sol-1)' && solText(5) === 'var(--sol-6)' && solText(6) === 'var(--sol-1)');
  check('theme: absent from the decision state, so an export follows its reader',
    !('theme' in buildState()));
  theme = savedPref; applyTheme();

  check('print: the reorder drops nothing',
    [t('printCriteriaComparisons'), t('printCriteriaWeights'), t('printSolutionRanking'),
     t('printScoreDefinitions'), t('vdiTitle'), t('teamTitle')].every(s => pvOrder.includes(s)));

  // ══ 10. New session ═══════════════════════════════════════════
  console.log('— New session —');
  document.getElementById('newBtn')._onclick();
  check('new: clears storage + reloads', localStorage.getItem(STORAGE_KEY) === null && location.reloaded === true);

  // ══ 11. i18n ══════════════════════════════════════════════════
  console.log('— i18n —');
  const enKeys = Object.keys(EN).sort(), deKeys = Object.keys(DE).sort();
  const missingDe = enKeys.filter(k => !(k in DE)), missingEn = deKeys.filter(k => !(k in EN));
  check('EN/DE key parity', missingDe.length === 0 && missingEn.length === 0, 'missing in DE: ' + missingDe + ' | missing in EN: ' + missingEn);
  lang = 'de';
  check('t() serves DE + falls back to key', t('scenarios') === 'Szenarien' && t('nonexistent_key') === 'nonexistent_key');
  lang = 'en';

  // ══ 12. Criteria change resets stale exploration ══════════════
  console.log('— Criteria change —');
  mockCriteria = ents(['Cost', 'Quality', 'Speed', 'Support']);
  checkAndStartComparison();
  scenarios = [{ id:'z', name:'stale', weights:{} }];
  mockCriteria = ents(['Cost', 'Quality', 'NEW']);
  checkAndStartComparison();
  check('criteria change clears scenarios + reinits weights', scenarios.length === 0 && 'NEW' in sensWeights && !('Speed' in sensWeights));
  mockCriteria = ents(['OnlyOne']);
  checkAndStartComparison();
  check('dropping below 2 criteria stops + clears state', comparisonStarted === false && Object.keys(sensWeights).length === 0);
})();
`;

try { eval.call(global, all); } catch(e){ console.log('EVAL ERROR:', e.message, '\n', (e.stack||'').split('\n').slice(0,8).join('\n')); fail++; }

// ── Static checks on the built file ───────────────────────────
console.log('— dist/index.html —');
const dist = fs.readFileSync(DIST, 'utf8');
// The minified inline script must be syntactically valid — a truncated string
// (e.g. a naive comment-stripper eating "http://…") blanks the whole app.
try {
  new Function(dist.match(/<script>([\s\S]*)<\/script>/)[1]);
  check('dist: minified script parses without syntax errors', true);
} catch (e) {
  check('dist: minified script parses without syntax errors', false, e.message);
}
check('dist: both sentinels survive minification', dist.split('// Auto-load saved session').length >= 3 && dist.split('// END Auto-load').length >= 3);
check('dist: capture preamble present', dist.includes('_scriptText') && dist.includes('_bodyHtml'));
check(`dist: ${VERSION} everywhere, no stale versions`, dist.includes(VERSION) && !dist.includes('v0.4') && !dist.includes('v0.3'));
check('dist: no stale i18n fallback text', (dist.match(/data-i18n="[^"]*">[^<]/g) || []).length === 0);
check('dist: scenario functions inlined', dist.includes('function loadScenario') && dist.includes('function renderScenarios'));

// The embed bake runs against the MINIFIED bundle, where the sentinels and the
// surrounding code have already been rewritten — a bake that produces invalid
// JS renders a blank box in a Confluence page, with no error the author sees.
{
  const script = dist.match(/<script>([\s\S]*)<\/script>/)[1];
  const S = '// Auto-load saved session', E = '// END Auto-load';
  const si = script.lastIndexOf(S), ei = script.indexOf(E, si) + E.length;
  const block = S + '\nembedded = true;\ntry { applyState({"version":2}); } catch (e) {}\n' + E;
  let ok = false, err = '';
  try { new Function(script.slice(0, si) + block + script.slice(ei)); ok = true; } catch (e) { err = e.message; }
  check('dist: embed bake parses against the minified bundle', ok, err);
}
// Tripwire: every storage access must go through lsGet/lsSet/lsRemove, which are
// the only three raw references left. A new direct call would let an embed write
// to the shared origin and clobber every other embedded decision.
// ── Embed scope isolation over the REAL bundle ────────────────
{
  const script = dist.match(/<script>([\s\S]*)<\/script>/)[1];
  const shipped = embedScript(script, '{"version":2}', 'dl-real');
  const es = new TextDecoder().decode(
    Uint8Array.from(atob(shipped.match(/"([A-Za-z0-9+/=]+)"/)[1]), c => c.charCodeAt(0)));
  let ok = false, err = '';
  try { new Function(es); ok = true; } catch (e) { err = e.message; }
  check('dist: embed script parses against the minified bundle', ok, err);
  // What actually ships must give a Confluence content filter nothing to strip.
  check('dist: shipped script is markup-free base64',
    !shipped.includes('<') && !shipped.includes('&') && shipped.indexOf('new Function(') === 0);
  // The preamble BLOCK is gone. References to its globals survive inside the
  // HTML-export handler, which an embed guards and hides rather than removes.
  // The sentinel itself still appears once, as export.js's own string literal.
  check('dist: embed script carries no capture-preamble block',
    !es.includes('_scriptEl=document.currentScript')
      && es.split('// Capture preamble').length - 1 === 1);
  // Storage stays reachable only through the facade, which the baked
  // `embedded = true` short-circuits before anything can call it.
  check('dist: embed script reaches storage only through the guarded facade',
    es.includes('embedded = true') && (es.match(/localStorage/g) || []).length === 3);
}
// Regression: while the pane sat directly under the tab bar, scrolling to 0 on
// a tab switch was right. A read-only export puts the results block above it, so
// scrolling to 0 lands back on the results and the tab looks dead. The handler
// must scroll relative to the pane instead.
{
  const mainSrc = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
  // The tab bar stays in the sticky header in every build: it is how a reader
  // navigates the record, so it must not be moved out of view.
  check('the tab bar is never moved out of the header',
    !/insertBefore\(tabs/.test(mainSrc) && !mainSrc.includes("qs('.tabs')"));
}
check('dist: result sections carry the ids the read-only hoist targets',
  dist.includes('id="rankingSection"') && dist.includes('id="resultsSection"')
    && !dist.includes('resultsFirst'));
// One authoritative version. These are the only places it may appear, and they
// must agree — a badge claiming a version the release check does not share
// would report an update that is already installed, or miss one that is not.
{
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const src = fs.readFileSync(path.join(SRC, 'version.js'), 'utf8');
  const declared = (src.match(/APP_VERSION = '([^']+)'/) || [])[1];
  check('version: APP_VERSION agrees with package.json and the suite',
    declared === VERSION && 'v' + pkg.version.replace(/\.0$/, '') === VERSION,
    declared + ' / ' + pkg.version + ' / ' + VERSION);
  const markup = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  check('version: the badge is filled from APP_VERSION, not hardcoded',
    markup.includes('<span class="app-version"></span>'));
  const exportSrc = fs.readFileSync(path.join(SRC, 'export.js'), 'utf8');
  check('version: no version literal left in the export code',
    !/v\d+\.\d+/.test(exportSrc));
}
check('dist: Confluence menu entry and handler present',
  dist.includes('exportConfluenceBtn') && dist.includes('function buildEmbedPayload'));
check('dist: capture-preamble sentinels survive minification',
  dist.includes('// Capture preamble') && dist.includes('// END Capture preamble'));
// Keyboard shortcuts and close-on-outside-click must be reroutable; pointer
// tracking during a drag must stay on document or a drag leaving the element
// would stall mid-gesture.
{
  const mainSrc = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
  const exportSrc = fs.readFileSync(path.join(SRC, 'export.js'), 'utf8');
  const uiListeners = (mainSrc + exportSrc).match(/document\.addEventListener\((['"])(keydown|click)\1/g) || [];
  check('UI listeners go through onGlobal, not document', uiListeners.length === 0,
    'still direct: ' + uiListeners.join(', '));
  const dragSrc = fs.readFileSync(path.join(SRC, 'sensitivity.js'), 'utf8');
  check('drag pointer tracking deliberately stays on document',
    /document\.addEventListener\(['"]mousemove/.test(dragSrc) && /document\.addEventListener\(['"]touchmove/.test(dragSrc));
}
// No source file may reach past the instance root for an element.
{
  const strays = [];
  for (const f of files) {
    if (f === 'dom.js') continue;
    // Blank out string literals first: export.js legitimately EMITS a
    // document.getElementById call inside the embed prologue it generates.
    // Blank comments then string/template literals: export.js legitimately
    // EMITS a document.getElementById call inside the embed prologue it builds,
    // and apostrophes in prose comments would otherwise desync the scan.
    const src = fs.readFileSync(path.join(SRC, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
      .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
    (src.match(/document\.(getElementById|querySelectorAll|querySelector)\(/g) || [])
      .forEach(m => strays.push(f + ': ' + m));
  }
  check('no source file looks elements up on the document directly',
    strays.length === 0, strays.slice(0, 5).join(' | '));
}

// ── Embed scoping over the REAL stylesheet ────────────────────
// Enumerates every selector the transform emits and proves none can match
// outside the wrapper — the whole point of the embed CSS work.
{
  const rawCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  const distCss = dist.match(/<style>([\s\S]*?)<\/style>/)[1];
  const leaks = [], malformed = [];
  // READONLY_CSS is included deliberately: it is the only sheet that opens with
  // a comment, which is what broke the whole read-only block once.
  for (const [label, source] of [['src/styles.css', rawCss], ['dist minified', distCss], ['READONLY_CSS', READONLY_CSS]]) {
    const scoped = scopeCss(source, '.dl-embed', ['.pro-on', '[data-readonly]']);
    scoped.replace(/(?:^|[{}])([^{}@]+)\{/g, (m, sel) => {
      sel.split(',').forEach(one => {
        const s = one.trim();
        if (!s) return;
        if (s.indexOf('.dl-embed') !== 0) leaks.push(label + ': ' + s);
        // Starting with .dl-embed is not enough — a selector carrying a comment
        // or a newline is invalid, and one invalid selector kills its whole rule.
        if (s.includes('/*') || s.includes('*/') || s.includes('\n')) malformed.push(label + ': ' + s.slice(0, 60));
      });
      return m;
    });
  }
  check('embed scoping: no rule from the real stylesheet escapes the wrapper',
    leaks.length === 0, leaks.slice(0, 5).join(' | '));
  check('embed scoping: every emitted selector is well formed',
    malformed.length === 0, malformed.slice(0, 5).join(' | '));
}
// Every editing control the read-only block hides, asserted one by one against
// a generated payload. Asserting the rule merely exists is not enough: it did,
// with an invalid first selector that made the browser discard all of it.
{
  const scoped = scopeCss(READONLY_CSS, '.dl-embed', ['.pro-on', '[data-readonly]']);
  const controls = ['#criteriaInputSection', '.btn-remove', '.pair-buttons', '#solutionList',
    '#addSolutionBtn', '#proToggle', '.app-brand', '#helpBtn', '#printBtn', '#undoBtn', '#redoBtn',
    '#fileMenuWrap', '.scenario-save-row', '#resetFineBtn', '.knockout-toggle', '.team-load'];
  const live = controls.filter(c => !scoped.includes('.dl-embed[data-readonly] ' + c));
  check('read-only: every editing control is hidden in an embed',
    live.length === 0, 'still visible: ' + live.join(', '));
}
// stripCssComments does not track strings, which is safe only while the sheet
// has no url() and no non-empty content:. Guard the assumption.
{
  const sheet = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  check('stylesheet has no url() or non-empty content: to confuse comment stripping',
    !/url\(/.test(sheet) && !/content:\s*['"][^'"]/.test(sheet));
}

// Light theme: a token defined for dark but not for light silently keeps a dark
// value on a light page, which is the failure mode nobody notices in review.
{
  const sheet = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  const tokensIn = block => [...new Set(block.match(/--[a-z0-9-]+(?=\s*:)/g) || [])].sort();
  const darkAt = sheet.indexOf(':root{');
  const dark = tokensIn(sheet.slice(darkAt, sheet.indexOf('}', darkAt)));
  const lightAt = sheet.indexOf(':root[data-theme="light"]{');
  const light = tokensIn(sheet.slice(lightAt, sheet.indexOf('}', lightAt)));
  const missing = dark.filter(k => light.indexOf(k) < 0);
  check('theme: every dark token has a light counterpart',
    dark.length > 10 && missing.length === 0, 'missing: ' + missing.join(', '));
  // Alpha and opacity do not carry across themes: blending dark ink into white
  // loses luminance faster than white into dark, so the same value reads ~30%
  // weaker on light. Every tier must therefore be at least as strong in light.
  const valsIn = block => { const o = {};
    (block.match(/--[a-z0-9-]+:\s*[^;]+/g) || []).forEach(d => { const j = d.indexOf(':');
      o[d.slice(0, j).trim()] = d.slice(j + 1).trim(); }); return o; };
  const dv = valsIn(sheet.slice(darkAt, sheet.indexOf('}', darkAt)));
  const lv = valsIn(sheet.slice(lightAt, sheet.indexOf('}', lightAt)));
  const num = v => parseFloat((String(v).match(/[\d.]+(?=\)?;?\s*$)/) || [0])[0]);
  const weaker = Object.keys(dv)
    .filter(k => /^--(fg-a|dim-)/.test(k))
    .filter(k => !(k in lv) || num(lv[k]) < num(dv[k]));
  check('theme: every text tier is at least as strong in light as in dark',
    weaker.length > 0 === false && Object.keys(dv).filter(k => /^--(fg-a|dim-)/.test(k)).length >= 20,
    'weaker or missing: ' + weaker.join(', '));

  check('theme: light applies for an explicit choice and for the system preference',
    sheet.includes(':root[data-theme="light"]{')
      && sheet.includes('@media(prefers-color-scheme:light)')
      && sheet.includes(':root:not([data-theme="dark"])'));
  // :root maps onto the wrapper; a bare [data-theme] would be scoped as a
  // descendant and never match.
  const scoped = scopeCss(sheet, '.dl-embed', ['.pro-on', '[data-readonly]']);
  check('theme: light rules scope onto the wrapper itself, not a descendant',
    scoped.includes('.dl-embed[data-theme="light"]{') && !scoped.includes('.dl-embed [data-theme'));
  // Text reads --sol-N, fills read SOL_COLORS. If they drift, a solution is one
  // colour in the ranking and another in its own bar.
  const solTok = n => (sheet.slice(darkAt, sheet.indexOf('}', darkAt)).match(new RegExp('--sol-' + n + ':([^;]+)')) || [])[1];
  check('theme: dark solution tokens track SOL_COLORS',
    [1, 2, 3, 4, 5, 6].map(solTok).join(',') === SOL_COLORS.join(','));
  check('theme: light gives every solution its own value',
    [1, 2, 3, 4, 5, 6].every(n => light.indexOf('--sol-' + n) >= 0));
  // A bare colour keyword survives a hex/rgba codemod untouched — which is how
  // input[type=text] kept white text into the light theme. Ban the category.
  const named = (sheet.slice(sheet.indexOf('}', sheet.indexOf(':root{')))
    .match(/:\s*(white|black|red|blue|green|yellow|orange|gold|gray|grey|pink|purple|cyan|silver)\b/g) || []);
  check('theme: no bare colour keyword outside the token definitions',
    named.length === 0, 'found: ' + named.join(', '));
  // The print document is standalone: it must define every token its markup
  // and its SVG reference, or they fall back to nothing on paper.
  const printCss = fs.readFileSync(path.join(SRC, 'export.js'), 'utf8');
  check('theme: the print document defines the tokens its output reads',
    printCss.includes('--fg-rgb:15,23,42') && printCss.includes('--sol-1:#0e7490'));
  // The export banner is app chrome shown inside the themed page, not print
  // output — it must not carry a fixed white the way the print sheet does.
  const bannerWhite = (READONLY_CSS.match(/color:\s*(#fff\b|#ffffff\b|rgba\(255,255,255)/g) || []);
  check('theme: the export banner follows the theme rather than fixing white',
    bannerWhite.length === 0, 'found: ' + bannerWhite.join(', '));

  check('theme: exports get the automatic path only — the toggle is hidden',
    READONLY_CSS.includes('#themeToggle'));
}

// The specific leakers that made this necessary.
{
  const scoped = scopeCss(fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8'), '.dl-embed', ['.pro-on', '[data-readonly]']);
  const bare = /(?:^|[{}])\s*(body|table|th|td|input)\s*[,{]/.test(scoped);
  check('embed scoping: body/table/th/td/input no longer match the host page', !bare);
}

check('dist: localStorage reached only through the storage facade',
  (dist.match(/localStorage/g) || []).length === 3,
  'found ' + (dist.match(/localStorage/g) || []).length + ' refs, expected 3 (the facade)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
