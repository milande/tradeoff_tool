// ── State ─────────────────────────────────────────────────────
let scenarios = [];

// ── Helpers ───────────────────────────────────────────────────
function saveCurrentScenario() {
  const input = document.getElementById('scenarioNameInput');
  const name = (input.value || '').trim() || `${t('scenarios')} ${scenarios.length + 1}`;
  scenarios.push({ id: Date.now().toString(), name, weights: { ...sensWeights }, ratings: { ...explorationRatings } });
  input.value = '';
  renderScenarios();
  saveState();
}

function deleteScenario(id) {
  scenarios = scenarios.filter(s => s.id !== id);
  renderScenarios();
  saveState();
}

// ── Rendering ─────────────────────────────────────────────────
function renderScenarios() {
  const container = document.getElementById('scenariosContainer');
  if (!container) return;

  if (!comparisonStarted || criteria.length === 0) {
    container.innerHTML = `<p class="hint">${t('hintAddCriteria')}</p>`;
    return;
  }
  if (scenarios.length === 0) {
    container.innerHTML = `<p class="hint">${t('scenarioNoData')}</p>`;
    return;
  }

  const sols = getSolutions();
  const baseWeights = computeWeights();
  const cols = [
    { id: '__base__', name: t('scenarioBaseline'), weights: baseWeights, isBaseline: true },
    ...scenarios
  ];
  const colRatings = col => col.isBaseline ? ratings : (col.ratings || explorationRatings);

  const colData = cols.map(col => {
    const rObj = colRatings(col);
    const ko = getKnockedOut(rObj);
    const ranked = scoreSolutions(col.weights, rObj).filter(({ sol }) => !ko[sol]);
    const map = {};
    ranked.forEach(({ sol, score }, i) => { map[sol] = { rank: i + 1, score }; });
    return { rankings: map, ko };
  });

  const sortedSols = [...sols].sort((a, b) => {
    if (colData[0].ko[a] && !colData[0].ko[b]) return 1;
    if (!colData[0].ko[a] && colData[0].ko[b]) return -1;
    return (colData[0].rankings[a]?.rank ?? 99) - (colData[0].rankings[b]?.rank ?? 99);
  });

  // ── Header ──────────────────────────────────────────────────
  let html = '<div class="sc-wrap"><table class="sc-table"><thead><tr><th></th>';
  cols.forEach(col => {
    if (col.isBaseline) {
      html += `<th>${col.name} <button class="sc-load-btn" onclick="loadScenario('__base__')" title="${t('scenarioLoadHint')}">↙</button></th>`;
    } else {
      html += `<th>${col.name} <button class="sc-load-btn" onclick="loadScenario('${col.id}')" title="${t('scenarioLoadHint')}">↙</button><button class="sc-del" onclick="deleteScenario('${col.id}')" title="Remove">✕</button></th>`;
    }
  });
  html += '</tr></thead><tbody>';

  // ── Weight rows ──────────────────────────────────────────────
  const orderedCriteria = criteriaByWeight();
  orderedCriteria.forEach(c => {
    const baseW = baseWeights[c] ?? 0;
    html += '<tr class="sc-w-row">';
    html += `<td class="sc-label">${c}</td>`;
    cols.forEach(col => {
      const w = col.weights[c] ?? 0;
      const pct = (w * 100).toFixed(1) + '%';
      const changed = !col.isBaseline && Math.abs(w - baseW) > 1e-4;
      html += `<td class="sc-w${changed ? ' sc-w-hi' : ''}">${pct}</td>`;
    });
    html += '</tr>';
  });

  html += `<tr class="sc-sep"><td colspan="${cols.length + 1}"></td></tr>`;

  // ── Solution rows ────────────────────────────────────────────
  sortedSols.forEach(sol => {
    const color = SOL_COLORS[sols.indexOf(sol) % SOL_COLORS.length];
    const isKO = !!colData[0].ko[sol];

    html += `<tr class="sc-s-row${isKO ? ' sc-ko' : ''}">`;
    html += `<td class="sc-label sc-sol-name" style="color:${color}">${sol}</td>`;
    cols.forEach((col, ci) => {
      const d = colData[ci];
      const r = d.rankings[sol];
      if (!!d.ko[sol] || !r) {
        html += '<td class="sc-ko-cell">—</td>';
      } else {
        const isWinner = r.rank === 1;
        const style = isWinner ? ` style="background:${color}18;border-left:2px solid ${color}"` : '';
        html += `<td class="sc-cell${isWinner ? ' sc-winner' : ''}"${style}>`;
        html += `<span class="sc-rank">#${r.rank}</span><span class="sc-score">${r.score.toFixed(2)}</span>`;
        html += '</td>';
      }
    });
    html += '</tr>';

    // Per-criterion sub-rows — every column shows rating badge + contribution
    orderedCriteria.forEach(c => {
      const baseR = ratings[`${sol}|${c}`] ?? 0;
      const baseW = baseWeights[c] ?? 0;
      html += '<tr class="sc-cr-row">';
      html += `<td class="sc-cr-label">${c}</td>`;
      cols.forEach(col => {
        if (isKO) { html += '<td class="sc-cr-cell">—</td>'; return; }
        const r = colRatings(col)[`${sol}|${c}`] ?? 0;
        const w = col.weights[c] ?? 0;
        const contrib = (r * w).toFixed(2);
        const rChanged = !col.isBaseline && r !== baseR;
        const wChanged = !col.isBaseline && Math.abs(w - baseW) > 1e-4;
        html += `<td class="sc-cr-cell${wChanged ? ' sc-cell-hi' : ''}">`;
        html += `<span class="sc-cr-badge${rChanged ? ' sc-badge-hi' : ''}">${r}</span>`;
        html += `<span class="sc-contrib">${contrib}</span>`;
        html += '</td>';
      });
      html += '</tr>';
    });
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ── Event handlers ────────────────────────────────────────────
document.getElementById('saveScenarioBtn').onclick = saveCurrentScenario;
document.getElementById('scenarioNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveCurrentScenario();
});

function loadScenario(id) {
  const isBase = id === '__base__';
  const scenario = isBase ? null : scenarios.find(s => s.id === id);
  const weights = isBase ? computeWeights() : (scenario || {}).weights;
  if (!weights) return;
  criteria.forEach(c => { if (weights[c] !== undefined) sensWeights[c] = weights[c]; });
  const total = Object.values(sensWeights).reduce((s, v) => s + v, 0);
  if (total > 0) criteria.forEach(c => sensWeights[c] /= total);
  // Restore the ratings snapshot too, so the sensitivity state fully reproduces
  // the clicked column. Baseline uses committed ratings; each scenario carries its own.
  if (isBase) explorationRatings = { ...ratings };
  else if (scenario && scenario.ratings) explorationRatings = { ...scenario.ratings };
  updateSensImpact();
  updateSensRanking();
  updateRatingImpact();
}
