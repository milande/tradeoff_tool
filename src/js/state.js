const STORAGE_KEY = 'tradeoff_v1';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      decisionName, bearbeiter,
      criteria: getCriteria(),
      pairStates,
      customWeights,
      customWeightReasons,
      proMode,
      lang,
      solutions: getSolutions(),
      ratings,
      ratingNotes,
      criteriaAnchors,
      knockoutCriteria,
      solutionNotes,
      scenarios,
      sensWeights,
      explorationRatings,
    }));
  } catch (e) {}
}

function applyState(state) {
  if (!state || state.version !== 1) return;

  list.innerHTML = '';
  (state.criteria || []).forEach(c => addCriterionInput(c));
  clearTimeout(inputDebounce);

  decisionName = state.decisionName || '';
  bearbeiter = state.bearbeiter || '';
  ratingNotes = state.ratingNotes || {};
  criteriaAnchors = state.criteriaAnchors || {};
  knockoutCriteria = state.knockoutCriteria || {};
  solutionNotes = state.solutionNotes || {};
  document.getElementById('decisionNameInput').value = decisionName;
  document.getElementById('bearbeiterInput').value = bearbeiter;
  pairStates = state.pairStates || {};
  customWeights = state.customWeights || null;
  customWeightReasons = state.customWeightReasons || {};
  scenarios = state.scenarios || [];
  proMode = state.proMode || false;
  lang = state.lang || 'en';
  if ((state.criteria || []).length >= 2) startComparison(true, true);
  applyProMode();

  solutionList.innerHTML = '';
  (state.solutions || []).forEach(s => addSolutionInput(s, (state.solutionNotes || {})[s] || ''));
  clearTimeout(solutionDebounce);

  ratings = state.ratings || {};
  renderSolutionMatrix();
  updateSolutionRanking();
  initSensWeights();
  if (state.sensWeights) {
    criteria.forEach(c => { if (state.sensWeights[c] !== undefined) sensWeights[c] = state.sensWeights[c]; });
    const t = Object.values(sensWeights).reduce((s, v) => s + v, 0);
    if (t > 0) criteria.forEach(c => sensWeights[c] /= t);
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
}
