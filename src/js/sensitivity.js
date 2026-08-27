// ── Constants & state ─────────────────────────────────────────
const SOL_COLORS = ['#18c8ff', '#f472b6', '#c084fc', '#fb923c', '#34d399', '#fbbf24'];

// Solution identity as TEXT. The literals above stay for fills — bars, dots,
// segments — where contrast does not apply. Against a light surface they score
// 1.7–2.7, well under AA, so anything readable uses the CSS token instead: the
// light theme redefines it, and it therefore follows a theme switch live
// without re-rendering. The print view defines its own light values.
function solText(i) { return `var(--sol-${(i % SOL_COLORS.length) + 1})`; }
let sensWeights = {};          // {critId: weight}
let explorationRatings = {};   // {'solId|critId': 0..4}

// ── Criterion Impact ──────────────────────────────────────────
function initSensWeights() {
  const w = computeWeights();
  sensWeights = {};
  criteria.forEach(c => sensWeights[c.id] = w[c.id]);
}

// Self-heal: if sensWeights doesn't hold a valid weight for every current
// criterion (empty after load, stale after criteria changes, …), re-derive it.
// Likewise fill exploration ratings that are missing for current sol|criterion.
function ensureSensState() {
  if (criteria.length === 0) return;
  const total = criteria.reduce((s, c) => s + (typeof sensWeights[c.id] === 'number' ? sensWeights[c.id] : NaN), 0);
  if (!isFinite(total) || Math.abs(total - 1) > 0.01) initSensWeights();
  getSolutions().forEach(sol => criteria.forEach(c => {
    const k = `${sol.id}|${c.id}`;
    if (explorationRatings[k] === undefined && ratings[k] !== undefined) explorationRatings[k] = ratings[k];
  }));
}

function adjustSensWeight(changedId, newVal) {
  ensureSensState();
  const others = criteria.filter(c => c.id !== changedId);
  const otherTotal = others.reduce((s, c) => s + (sensWeights[c.id] ?? 0), 0);
  const remaining = 1 - newVal;

  if (otherTotal < 0.0001) {
    others.forEach(c => sensWeights[c.id] = remaining / others.length);
  } else {
    others.forEach(c => sensWeights[c.id] = (sensWeights[c.id] ?? 0) * remaining / otherTotal);
  }
  sensWeights[changedId] = newVal;

  const total = criteria.reduce((s, c) => s + sensWeights[c.id], 0);
  if (total > 0) criteria.forEach(c => sensWeights[c.id] /= total);

  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
}

// winner: a solution object or an array of them (tie). Winners that fail a
// must-have (ko map) render as a hatch of their color instead of solid —
// "would win here, but is currently disqualified".
function koHatch(color) {
  return `repeating-linear-gradient(-45deg,${color} 0px,${color} 3px,${color}22 3px,${color}22 7px)`;
}

function segmentBg(winner, sols, ko = null) {
  const ws = Array.isArray(winner) ? winner : [winner];
  const colors = ws.map(s => SOL_COLORS[sols.findIndex(x => x.id === s.id) % SOL_COLORS.length]);
  if (ws.length === 1) {
    if (ko && ko[ws[0].id]) return `background:${koHatch(colors[0])};opacity:.85`;
    return `background:${colors[0]};opacity:.85`;
  }
  const sz = 5;
  const stops = colors.flatMap((c, i) => {
    const cc = ko && ko[ws[i].id] ? c + '44' : c; // dim KO members of a tie
    return [`${cc} ${i * sz}px`, `${cc} ${(i + 1) * sz}px`];
  }).join(',');
  return `background:repeating-linear-gradient(-45deg,${stops});opacity:.9`;
}

function winnerLabel(winner) {
  return (Array.isArray(winner) ? winner : [winner]).map(s => s.name).join(' & ');
}

// Reset buttons are only active while the exploration differs from the
// committed state — otherwise there is nothing to reset.
function updateResetButtons() {
  const w = computeWeights();
  const weightsDiffer = criteria.some(c => Math.abs((sensWeights[c.id] ?? 0) - (w[c.id] ?? 0)) > 0.005);
  const ratingsDiffer = getSolutions().some(sol => criteria.some(c => {
    const k = `${sol.id}|${c.id}`;
    return (explorationRatings[k] ?? 0) !== (ratings[k] ?? 0);
  }));
  const wBtn = byId('resetWeightsBtn');
  const rBtn = byId('resetRatingsBtn');
  if (wBtn) wBtn.disabled = !weightsDiffer;
  if (rBtn) rBtn.disabled = !ratingsDiffer;
}

// Legend for the breakeven panels. Solutions failing a must-have (based on
// the current exploration ratings) are struck through with a ⊗ marker —
// the bars still show them, since they depict the theoretical possibility.
function sensLegendHtml(sols) {
  const ko = getKnockedOut(explorationRatings);
  let html = '<div class="be-legend">';
  sols.forEach((sol, i) => {
    const failed = ko[sol.id];
    const color = SOL_COLORS[i % SOL_COLORS.length];
    const dotBg = failed ? koHatch(color) : color;
    const mark = failed ? `<span class="be-ko-mark" title="${esc(t('knockedOut'))}: ${esc(failed.map(critName).join(', '))}">⊗</span>` : '';
    html += `<span class="be-legend-item${failed ? ' be-legend-ko' : ''}"><span class="be-dot" style="background:${dotBg}"></span><span class="${failed ? 'be-ko-name' : ''}">${esc(sol.name)}</span>${mark}</span>`;
  });
  return html + '</div>';
}

function computeBreakevens(cId, sols, w = sensWeights, r = explorationRatings) {
  const wC = w[cId] ?? 0;
  const otherSum = 1 - wC;
  const others = criteria.filter(x => x.id !== cId);

  function beta(sol) {
    if (otherSum < 1e-10) {
      return others.length > 0
        ? others.reduce((s, x) => s + (r[`${sol.id}|${x.id}`] ?? 0), 0) / others.length
        : 0;
    }
    return others.reduce((s, x) => s + (r[`${sol.id}|${x.id}`] ?? 0) * (w[x.id] ?? 0) / otherSum, 0);
  }

  function scoreAt(sol, tVal) {
    const b = beta(sol);
    return b + tVal * ((r[`${sol.id}|${cId}`] ?? 0) - b);
  }

  const bps = new Set([0, 1]);
  for (let i = 0; i < sols.length; i++) {
    for (let j = i + 1; j < sols.length; j++) {
      const A = sols[i], B = sols[j];
      const aA = r[`${A.id}|${cId}`] ?? 0, aB = r[`${B.id}|${cId}`] ?? 0;
      const bA = beta(A), bB = beta(B);
      const denom = (aA - bA) - (aB - bB);
      if (Math.abs(denom) > 1e-10) {
        const tVal = (bB - bA) / denom;
        if (tVal > 1e-6 && tVal < 1 - 1e-6) bps.add(tVal);
      }
    }
  }

  const sorted = [...bps].sort((a, b) => a - b);
  const solKey = w => (Array.isArray(w) ? w : [w]).map(x => x.id).sort().join('\0');
  const segments = sorted.slice(0, -1).map((from, i) => {
    const to = sorted[i + 1];
    const mid = (from + to) / 2;
    let topScore = -Infinity, topSols = [];
    sols.forEach(sol => {
      const s = scoreAt(sol, mid);
      if (Math.abs(s - topScore) < 1e-9) topSols.push(sol);
      else if (s > topScore) { topScore = s; topSols = [sol]; }
    });
    return { from, to, sol: topSols.length === 1 ? topSols[0] : topSols };
  });

  const merged = [];
  segments.forEach(seg => {
    if (merged.length > 0 && solKey(merged[merged.length - 1].sol) === solKey(seg.sol)) {
      merged[merged.length - 1].to = seg.to;
    } else {
      merged.push({ ...seg });
    }
  });
  return merged;
}

function updateSensRanking() {
  const sols = getSolutions();
  const tbody = byId('sensRankingBody');
  if (!comparisonStarted || criteria.length === 0 || sols.length === 0) { tbody.innerHTML = ''; return; }
  ensureSensState();
  const ko = getKnockedOut(explorationRatings);
  const ranked = scoreSolutions(sensWeights, explorationRatings).filter(({ sol }) => !ko[sol.id]);
  const entries = [
    ...ranked.map(({ sol, score }) => {
      const pct = (score / 4) * 100;
      const ci = sols.findIndex(s => s.id === sol.id);
      const color = SOL_COLORS[ci % SOL_COLORS.length];
      const note = solutionNotes[sol.id] ? `<div class="rank-note">${esc(solutionNotes[sol.id])}</div>` : '';
      return { key: sol.id, html: `<td style="color:${solText(ci)};font-weight:600"><div>${esc(sol.name)}</div>${note}</td><td>${score.toFixed(2)}</td><td><div class="weight-cell"><span>${pct.toFixed(1)}%</span><div class="weight-bar-wrap"><div class="weight-bar" style="width:${pct}%;background:${color}"></div></div></div></td>` };
    }),
    ...Object.entries(ko).map(([solId, failedIds]) => {
      const sol = sols.find(s => s.id === solId);
      const note = solutionNotes[solId] ? `<div class="rank-note">${esc(solutionNotes[solId])}</div>` : '';
      const failedNames = failedIds.map(critName).join(', ');
      return { key: solId, html: `<td class="rank-ko"><div class="rank-ko-name">${esc(sol ? sol.name : '')}</div>${note}<span class="rank-ko-reason">${t('knockedOut')}: ${esc(failedNames)}</span></td><td class="rank-ko">—</td><td class="rank-ko">—</td>` };
    }),
  ];
  animateRows(tbody, entries);
}

function updateSensImpact() {
  const sols = getSolutions();
  const container = byId('sensImpact');

  if (!comparisonStarted || criteria.length === 0 || sols.length < 2) {
    container.innerHTML = `<p class="hint">${t('hintNeedSolutions')}</p>`;
    return;
  }
  ensureSensState();

  const koNow = getKnockedOut(explorationRatings);
  const committedW = computeWeights();
  let html = sensLegendHtml(sols);

  criteriaByWeight().forEach(c => {
    const segments = computeBreakevens(c.id, sols);
    const currentPct = (sensWeights[c.id] ?? 0) * 100;
    const committedPct = (committedW[c.id] ?? 0) * 100;

    html += `<div class="be-row"><span class="be-label" title="${esc(c.name)}">${esc(c.name)}</span><div class="be-track-wrap" data-criterion="${c.id}"><div class="be-track">`;
    segments.forEach(seg => {
      const w = (seg.to - seg.from) * 100;
      html += `<div class="be-segment" style="width:${w}%;${segmentBg(seg.sol, sols, koNow)}" title="${esc(winnerLabel(seg.sol))}: ${Math.round(seg.from * 100)}%–${Math.round(seg.to * 100)}%"></div>`;
    });
    html += `</div>`;
    // Ghost marker: committed weight, shown when the exploration has drifted
    if (Math.abs(committedPct - currentPct) > 0.5) {
      html += `<div class="be-committed" style="left:${committedPct.toFixed(2)}%" title="${t('committedMarker')}: ${committedPct.toFixed(1)}%"></div>`;
    }
    html += `<div class="be-current" style="left:${currentPct.toFixed(2)}%"></div>`;

    const innerBps = segments.slice(1).map(s => s.from * 100);
    if (innerBps.length > 0) {
      html += `<div class="be-bp-row">`;
      innerBps.forEach(pct => {
        html += `<span class="be-bp-label" style="left:${pct.toFixed(2)}%">${Math.round(pct)}%</span>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="be-bp-row"></div>`;
    }
    html += `</div></div>`;
  });

  container.innerHTML = html;
  updateResetButtons();
}

byId('resetWeightsBtn').onclick = () => {
  initSensWeights();
  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
  saveState();
};

// ── Criterion Impact drag ─────────────────────────────────────
let sensImpactDrag = null;

(function setupSensImpactDrag() {
  const container = byId('sensImpact');

  function getT(e, rect) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function onMove(e) {
    if (!sensImpactDrag) return;
    e.preventDefault();
    adjustSensWeight(sensImpactDrag.cId, getT(e, sensImpactDrag.rect));
  }

  function onUp() {
    if (sensImpactDrag) saveState(); // one history entry per drag
    sensImpactDrag = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }

  container.addEventListener('mousedown', e => {
    const wrap = e.target.closest('.be-track-wrap');
    if (!wrap) return;
    e.preventDefault();
    sensImpactDrag = { cId: wrap.dataset.criterion, rect: wrap.getBoundingClientRect() };
    adjustSensWeight(sensImpactDrag.cId, getT(e, sensImpactDrag.rect));
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  container.addEventListener('touchstart', e => {
    const wrap = e.target.closest('.be-track-wrap');
    if (!wrap) return;
    sensImpactDrag = { cId: wrap.dataset.criterion, rect: wrap.getBoundingClientRect() };
    adjustSensWeight(sensImpactDrag.cId, getT(e, sensImpactDrag.rect));
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }, { passive: true });
}());

// ── Rating Impact ─────────────────────────────────────────────
function initExplorationRatings() {
  explorationRatings = { ...ratings };
}

function computeRatingBreakevens(sol, cId, sols, weights, rObj) {
  const r = rObj || explorationRatings;
  const wC = weights[cId] ?? 0;
  const baseScore = criteria.reduce((s, c) => c.id === cId ? s : s + (r[`${sol.id}|${c.id}`] ?? 0) * (weights[c.id] ?? 0), 0);
  const others = sols.filter(s => s.id !== sol.id).map(s => ({
    sol: s,
    score: criteria.reduce((sum, c) => sum + (r[`${s.id}|${c.id}`] ?? 0) * (weights[c.id] ?? 0), 0),
  }));
  const bps = wC > 0
    ? others.map(o => (o.score - baseScore) / wC).filter(v => v > 0 && v < 4)
    : [];
  const points = [0, ...bps.sort((a, b) => a - b), 4];
  const winKey = w => (Array.isArray(w) ? w : [w]).map(x => x.id).sort().join('\0');
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const mid = (points[i] + points[i + 1]) / 2;
    const solMid = baseScore + mid * wC;
    let topScore = solMid, topSols = [sol];
    others.forEach(o => {
      if (Math.abs(o.score - topScore) < 1e-9) topSols.push(o.sol);
      else if (o.score > topScore) { topScore = o.score; topSols = [o.sol]; }
    });
    const winner = topSols.length === 1 ? topSols[0] : topSols;
    segments.push({ from: points[i] / 4, to: points[i + 1] / 4, winner });
  }
  return segments.reduce((acc, seg) => {
    if (acc.length && winKey(acc[acc.length - 1].winner) === winKey(seg.winner)) acc[acc.length - 1].to = seg.to;
    else acc.push({ ...seg });
    return acc;
  }, []);
}

function updateRatingImpact() {
  const container = byId('ratingImpactContainer');
  if (!container) return;
  const sols = getSolutions();
  if (!comparisonStarted || criteria.length === 0 || sols.length < 2) {
    container.innerHTML = `<p class="hint">${t('hintNeedSolutions')}</p>`;
    return;
  }
  ensureSensState();
  const weights = sensWeights;
  const koNow = getKnockedOut(explorationRatings);
  let html = sensLegendHtml(sols);
  sols.forEach((sol, si) => {
    const solColor = SOL_COLORS[si % SOL_COLORS.length];
    const koMark = koNow[sol.id] ? ` <span class="be-ko-mark" title="${esc(t('knockedOut'))}: ${esc(koNow[sol.id].map(critName).join(', '))}">⊗</span>` : '';
    html += `<div class="ri-sol-header" style="color:${solText(si)}">${esc(sol.name)}${koMark}</div>`;
    criteriaByWeight().forEach(c => {
      const key = `${sol.id}|${c.id}`;
      const segs = computeRatingBreakevens(sol, c.id, sols, weights);
      const curVal = explorationRatings[key] ?? 0;
      const commVal = ratings[key] ?? 0;
      const cur = (curVal / 4 * 100).toFixed(2);
      html += `<div class="be-row"><span class="be-label" title="${esc(c.name)}">${esc(c.name)}</span>`;
      html += `<div class="be-track-wrap" data-sol="${sol.id}" data-crit="${c.id}">`;
      html += `<div class="be-track">`;
      segs.forEach(seg => {
        html += `<div class="be-segment" style="width:${((seg.to - seg.from) * 100).toFixed(3)}%;${segmentBg(seg.winner, sols, koNow)}" title="${esc(winnerLabel(seg.winner))}"></div>`;
      });
      html += `</div>`;
      // Ghost marker: committed rating, shown when the exploration has drifted
      if (commVal !== curVal) {
        html += `<div class="be-committed" style="left:${(commVal / 4 * 100).toFixed(2)}%" title="${t('committedMarker')}: ${commVal}"></div>`;
      }
      html += `<div class="be-current" style="left:${cur}%"></div>`;
      html += `<div class="rs-ticks">`;
      for (let i = 0; i <= 4; i++) html += `<span class="rs-tick" style="left:${i * 25}%">${i}</span>`;
      html += `</div></div></div>`;
    });
  });
  container.innerHTML = html;
  updateResetButtons();
}

byId('resetRatingsBtn').onclick = () => {
  initExplorationRatings();
  updateRatingImpact();
  updateSensImpact();
  updateSensRanking();
  saveState();
};

// ── Rating Impact drag ────────────────────────────────────────
(function setupRatingImpactDrag() {
  const container = byId('ratingImpactContainer');
  let active = null;
  function getVal(e, rect) {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.round(Math.max(0, Math.min(4, ((x - rect.left) / rect.width) * 4)));
  }
  function onDown(e) {
    const wrap = e.target.closest('[data-sol][data-crit]');
    if (!wrap || !container.contains(wrap)) return;
    active = { solId: wrap.dataset.sol, critId: wrap.dataset.crit, rect: wrap.getBoundingClientRect() };
    onMove(e);
  }
  function onMove(e) {
    if (!active) return;
    e.preventDefault();
    explorationRatings[`${active.solId}|${active.critId}`] = getVal(e, active.rect);
    updateRatingImpact();
    updateSensImpact();
    updateSensRanking();
  }
  function onUp() {
    if (active) saveState(); // one history entry per drag
    active = null;
  }
  container.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  container.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
}());
