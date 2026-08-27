// ── Team Ratings (collaboration) ──────────────────────────────
// Teammates rate independently in their own copy of the shared JSON and
// save with their name. Their files are loaded here and matched by the
// stable criterion/solution ids; ratings are compared side by side.
let raters = [];   // [{id, name, ratings: {'solId|critId': 0..4}}]

// Validate and add a rater's exported state. Returns false when the file
// belongs to a different decision (criterion/solution id sets differ).
function addRaterData(state) {
  if (!state || state.version !== STATE_VERSION) return false;
  const idsOf = list => (list || []).map(x => x.id).sort().join('|');
  if (idsOf(criteria) !== idsOf(state.criteria)) return false;
  if (idsOf(getSolutions()) !== idsOf(state.solutions)) return false;
  const name = (state.bearbeiter || '').trim() || `${t('teamRater')} ${raters.length + 1}`;
  const existing = raters.find(r => r.name === name);
  if (existing) existing.ratings = { ...(state.ratings || {}) };  // re-import replaces
  else raters.push({ id: newId('r'), name, ratings: { ...(state.ratings || {}) } });
  renderTeam();
  saveState();
  return true;
}

function removeRater(id) {
  raters = raters.filter(r => r.id !== id);
  renderTeam();
  saveState();
}

// All columns of the comparison: the current session first, then each rater.
function teamColumns() {
  return [{ id: '__you__', name: (bearbeiter || '').trim() || t('teamYou'), ratings }, ...raters];
}

// Cell-wise mean rating across the whole team (including this session).
function teamMeanRatings() {
  const cols = teamColumns();
  const mean = {};
  getSolutions().forEach(sol => criteria.forEach(c => {
    const k = `${sol.id}|${c.id}`;
    mean[k] = cols.reduce((s, col) => s + (col.ratings[k] ?? 0), 0) / cols.length;
  }));
  return mean;
}

// ── Rendering ─────────────────────────────────────────────────
function renderTeam() {
  const section = byId('teamSection');
  const container = byId('teamContainer');
  if (!section || !container) return;
  const sols = getSolutions();
  const active = comparisonStarted && proMode && criteria.length > 0 && sols.length > 0;
  section.style.display = active ? '' : 'none';
  const exploreBtn = byId('teamExploreBtn');
  if (exploreBtn) exploreBtn.style.display = raters.length ? '' : 'none';
  if (!active) { container.innerHTML = ''; return; }
  if (!raters.length) {
    container.innerHTML = `<p class="hint">${t('teamNoData')}</p>`;
    return;
  }

  const weights = computeWeights();
  const cols = teamColumns();
  const mean = teamMeanRatings();

  // Per-column ranking (host weights, each rater's own ratings)
  const colData = cols.map(col => {
    const ko = getKnockedOut(col.ratings);
    const ranked = scoreSolutions(weights, col.ratings).filter(({ sol }) => !ko[sol.id]);
    const map = {};
    ranked.forEach(({ sol, score }, i) => { map[sol.id] = { rank: i + 1, score }; });
    return { rankings: map, ko };
  });
  const meanKo = getKnockedOut(mean);
  const meanRanked = scoreSolutions(weights, mean).filter(({ sol }) => !meanKo[sol.id]);
  const meanMap = {};
  meanRanked.forEach(({ sol, score }, i) => { meanMap[sol.id] = { rank: i + 1, score }; });

  // Disagreement count: cells where the rater spread is >= 2 points
  let disagreements = 0;
  const spreadOf = key => {
    const vals = cols.map(col => col.ratings[key] ?? 0);
    return Math.max(...vals) - Math.min(...vals);
  };
  sols.forEach(sol => criteria.forEach(c => { if (spreadOf(`${sol.id}|${c.id}`) >= 2) disagreements++; }));

  let html = `<p class="hint tm-summary${disagreements ? ' tm-summary-warn' : ''}">${t('teamDisagree')(disagreements)}</p>`;
  html += '<div class="sc-wrap"><table class="sc-table"><thead><tr><th></th>';
  cols.forEach(col => {
    const del = col.id === '__you__' ? '' : `<button class="sc-del" onclick="removeRater('${col.id}')" title="Remove">✕</button>`;
    html += `<th>${esc(col.name)} ${del}</th>`;
  });
  html += `<th title="${t('teamMeanTitle')}">Ø</th></tr></thead><tbody>`;

  const orderedCriteria = criteriaByWeight();
  const sortedSols = [...sols].sort((a, b) => (meanMap[a.id]?.rank ?? 99) - (meanMap[b.id]?.rank ?? 99));

  sortedSols.forEach(sol => {
    const si = sols.findIndex(s => s.id === sol.id);   // cols.forEach below shadows ci
    html += `<tr class="sc-s-row"><td class="sc-label sc-sol-name" style="color:${solText(si)}">${esc(sol.name)}</td>`;
    cols.forEach((col, ci) => {
      const r = colData[ci].rankings[sol.id];
      if (colData[ci].ko[sol.id] || !r) { html += '<td class="sc-ko-cell">—</td>'; return; }
      html += `<td class="sc-cell"><span class="sc-rank">#${r.rank}</span><span class="sc-score">${r.score.toFixed(2)}</span></td>`;
    });
    const mr = meanMap[sol.id];
    html += mr
      ? `<td class="sc-cell sc-winner"><span class="sc-rank">#${mr.rank}</span><span class="sc-score">${mr.score.toFixed(2)}</span></td>`
      : '<td class="sc-ko-cell">—</td>';
    html += '</tr>';

    orderedCriteria.forEach(c => {
      const key = `${sol.id}|${c.id}`;
      const warn = spreadOf(key) >= 2;
      html += `<tr class="sc-cr-row${warn ? ' tm-diff' : ''}">`;
      html += `<td class="sc-cr-label">${esc(c.name)}</td>`;
      cols.forEach(col => { html += `<td class="sc-cr-cell">${col.ratings[key] ?? 0}</td>`; });
      html += `<td class="sc-cr-cell tm-mean">${(mean[key]).toFixed(1)}</td>`;
      html += '</tr>';
    });
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ── Event handlers ────────────────────────────────────────────
byId('raterInput').onchange = e => {
  [...e.target.files].forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        if (!addRaterData(JSON.parse(ev.target.result))) alert(t('teamMismatch'));
      } catch { alert(t('alertInvalidFile')); }
    };
    reader.readAsText(file);
  });
  e.target.value = '';
};

byId('teamExploreBtn').onclick = () => {
  if (!raters.length) return;
  explorationRatings = teamMeanRatings();
  updateSensImpact(); updateSensRanking(); updateRatingImpact();
  saveState();
  const btn = qs('.tab-btn[data-tab="sensitivity"]');
  if (btn && !btn.classList.contains('disabled') && btn.onclick) btn.onclick();
};
