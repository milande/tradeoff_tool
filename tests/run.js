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
const VERSION = 'v0.6';

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
    focus(){}, remove(){}, animate(){ return { cancel(){} }; }, scrollIntoView(){},
  };
}
const elCache = {};
global.document = {
  getElementById(id){ return elCache[id] || (elCache[id] = mkEl()); },
  querySelector(){ return mkEl(); }, querySelectorAll(){ return []; },
  createElement(){ return mkEl(); },
  addEventListener(){}, removeEventListener(){},
  body: mkEl(), get currentScript(){ return mkEl(); },
};
global.window = global;
const store = {};
global.__lsStore = store;   // embedded-mode tests assert this stays untouched
global.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; },
};
global.location = { reload(){ this.reloaded = true; } };
global.requestAnimationFrame = f => f();
global.alert = () => {}; global.confirm = () => true; global.prompt = () => '';
global.Blob = class { constructor(parts){ this.parts = parts; } };
global.lastBlob = null;
global.URL = { createObjectURL(b){ global.lastBlob = b; return 'blob:x'; }, revokeObjectURL(){} };

const files = ['lang/en.js','lang/de.js','dom.js','i18n.js','state.js','criteria.js','solutions.js','sensitivity.js','scenarios.js','team.js','export.js','main.js'];
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
  check('print: team section with rater + disagreement highlight', pv.includes(t('teamTitle')) && pv.includes('Anna') && pv.includes('#fef3c7'));
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

  const es = embedScript(fakeScript, '{"version":2}', 'dl-test1');
  check('embed script: wrapped in an IIFE, nothing reaches page scope',
    es.indexOf('(function(){') === 0 && es.slice(-5) === '})();');
  check('embed script: binds to its own wrapper (currentScript, id fallback)',
    es.includes('_embedRoot') && es.includes('.dl-embed') && es.includes('dl-test1'));
  check('embed script: capture-preamble artefacts gone',
    !es.includes('_scriptText') && !es.includes('_styleText') && !es.includes('_bodyHtml'));
  check('embed script: baked state, no storage access (with #25)',
    es.includes('embedded = true') && !es.includes('localStorage') && !es.includes('OLD'));
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
  const es = embedScript(script, '{"version":2}', 'dl-real');
  let ok = false, err = '';
  try { new Function(es); ok = true; } catch (e) { err = e.message; }
  check('dist: embed script parses against the minified bundle', ok, err);
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
  const leaks = [];
  for (const [label, source] of [['src/styles.css', rawCss], ['dist minified', distCss]]) {
    const scoped = scopeCss(source, '.dl-embed', ['.pro-on', '[data-readonly]']);
    scoped.replace(/(?:^|[{}])([^{}@]+)\{/g, (m, sel) => {
      sel.split(',').forEach(one => {
        if (one.trim() && one.trim().indexOf('.dl-embed') !== 0) leaks.push(label + ': ' + one.trim());
      });
      return m;
    });
  }
  check('embed scoping: no rule from the real stylesheet escapes the wrapper',
    leaks.length === 0, leaks.slice(0, 5).join(' | '));
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
