// ── Constants & state ─────────────────────────────────────────
const SOL_COLORS = ['#18c8ff', '#f472b6', '#c084fc', '#fb923c', '#34d399', '#fbbf24'];
let sensWeights = {};
let explorationRatings = {};

// ── Criterion Impact ──────────────────────────────────────────
function initSensWeights() {
  const w = computeWeights();
  sensWeights = {};
  criteria.forEach(c => sensWeights[c] = w[c]);
}

// Self-heal: if sensWeights doesn't hold a valid weight for every current
// criterion (stale keys after rename, empty after load, …), re-derive it.
// Likewise fill exploration ratings that are missing for current sol|criterion.
function ensureSensState() {
  if (criteria.length === 0) return;
  const total = criteria.reduce((s, c) => s + (typeof sensWeights[c] === 'number' ? sensWeights[c] : NaN), 0);
  if (!isFinite(total) || Math.abs(total - 1) > 0.01) initSensWeights();
  getSolutions().forEach(sol => criteria.forEach(c => {
    const k = `${sol}|${c}`;
    if (explorationRatings[k] === undefined && ratings[k] !== undefined) explorationRatings[k] = ratings[k];
  }));
}

function adjustSensWeight(changedC, newVal) {
  ensureSensState();
  const others = criteria.filter(c => c !== changedC);
  const otherTotal = others.reduce((s, c) => s + (sensWeights[c] ?? 0), 0);
  const remaining = 1 - newVal;

  if (otherTotal < 0.0001) {
    others.forEach(c => sensWeights[c] = remaining / others.length);
  } else {
    others.forEach(c => sensWeights[c] = (sensWeights[c] ?? 0) * remaining / otherTotal);
  }
  sensWeights[changedC] = newVal;

  const total = criteria.reduce((s, c) => s + sensWeights[c], 0);
  if (total > 0) criteria.forEach(c => sensWeights[c] /= total);

  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
}

function segmentBg(winner, sols) {
  const ws = Array.isArray(winner) ? winner : [winner];
  const colors = ws.map(s => SOL_COLORS[sols.indexOf(s) % SOL_COLORS.length]);
  if (colors.length === 1) return `background:${colors[0]};opacity:.85`;
  const sz = 5;
  const stops = colors.flatMap((c, i) => [`${c} ${i * sz}px`, `${c} ${(i + 1) * sz}px`]).join(',');
  return `background:repeating-linear-gradient(-45deg,${stops});opacity:.9`;
}

function computeBreakevens(C, sols) {
  const wC = sensWeights[C] ?? 0;
  const otherSum = 1 - wC;
  const others = criteria.filter(x => x !== C);

  function beta(sol) {
    if (otherSum < 1e-10) {
      return others.length > 0
        ? others.reduce((s, x) => s + (explorationRatings[`${sol}|${x}`] ?? 0), 0) / others.length
        : 0;
    }
    return others.reduce((s, x) => s + (explorationRatings[`${sol}|${x}`] ?? 0) * (sensWeights[x] ?? 0) / otherSum, 0);
  }

  function scoreAt(sol, t) {
    const b = beta(sol);
    return b + t * ((explorationRatings[`${sol}|${C}`] ?? 0) - b);
  }

  const bps = new Set([0, 1]);
  for (let i = 0; i < sols.length; i++) {
    for (let j = i + 1; j < sols.length; j++) {
      const A = sols[i], B = sols[j];
      const aA = explorationRatings[`${A}|${C}`] ?? 0, aB = explorationRatings[`${B}|${C}`] ?? 0;
      const bA = beta(A), bB = beta(B);
      const denom = (aA - bA) - (aB - bB);
      if (Math.abs(denom) > 1e-10) {
        const t = (bB - bA) / denom;
        if (t > 1e-6 && t < 1 - 1e-6) bps.add(t);
      }
    }
  }

  const sorted = [...bps].sort((a, b) => a - b);
  const solKey = w => Array.isArray(w) ? [...w].sort().join('\0') : w;
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
  const tbody = document.getElementById('sensRankingBody');
  if (!comparisonStarted || criteria.length === 0 || sols.length === 0) { tbody.innerHTML = ''; return; }
  ensureSensState();
  const ko = getKnockedOut(explorationRatings);
  const ranked = scoreSolutions(sensWeights, explorationRatings).filter(({ sol }) => !ko[sol]);
  const entries = [
    ...ranked.map(({ sol, score }) => {
      const pct = (score / 4) * 100;
      const color = SOL_COLORS[sols.indexOf(sol) % SOL_COLORS.length];
      const note = solutionNotes[sol] ? `<div class="rank-note">${solutionNotes[sol]}</div>` : '';
      return { key: sol, html: `<td style="color:${color};font-weight:600"><div>${sol}</div>${note}</td><td>${score.toFixed(2)}</td><td><div class="weight-cell"><span>${pct.toFixed(1)}%</span><div class="weight-bar-wrap"><div class="weight-bar" style="width:${pct}%;background:${color}"></div></div></div></td>` };
    }),
    ...Object.entries(ko).map(([sol, failed]) => {
      const note = solutionNotes[sol] ? `<div class="rank-note">${solutionNotes[sol]}</div>` : '';
      return { key: sol, html: `<td class="rank-ko"><div class="rank-ko-name">${sol}</div>${note}<span class="rank-ko-reason">${t('knockedOut')}: ${failed.join(', ')}</span></td><td class="rank-ko">—</td><td class="rank-ko">—</td>` };
    }),
  ];
  animateRows(tbody, entries);
}

function updateSensImpact() {
  const sols = getSolutions();
  const container = document.getElementById('sensImpact');

  if (!comparisonStarted || criteria.length === 0 || sols.length < 2) {
    container.innerHTML = `<p class="hint">${t('hintNeedSolutions')}</p>`;
    return;
  }
  ensureSensState();

  let html = '<div class="be-legend">';
  sols.forEach((sol, i) => {
    html += `<span class="be-legend-item"><span class="be-dot" style="background:${SOL_COLORS[i % SOL_COLORS.length]}"></span>${sol}</span>`;
  });
  html += '</div>';

  criteriaByWeight().forEach(C => {
    const segments = computeBreakevens(C, sols);
    const currentPct = (sensWeights[C] ?? 0) * 100;

    html += `<div class="be-row"><span class="be-label" title="${C}">${C}</span><div class="be-track-wrap" data-criterion="${C}"><div class="be-track">`;
    segments.forEach(seg => {
      const w = (seg.to - seg.from) * 100;
      const label = Array.isArray(seg.sol) ? seg.sol.join(' & ') : seg.sol;
      html += `<div class="be-segment" style="width:${w}%;${segmentBg(seg.sol, sols)}" title="${label}: ${Math.round(seg.from * 100)}%–${Math.round(seg.to * 100)}%"></div>`;
    });
    html += `</div><div class="be-current" style="left:${currentPct.toFixed(2)}%"></div>`;

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
}

document.getElementById('resetWeightsBtn').onclick = () => {
  initSensWeights();
  updateSensRanking();
  updateSensImpact(); updateRatingImpact();
};

// ── Criterion Impact drag ─────────────────────────────────────
let sensImpactDrag = null;

(function setupSensImpactDrag() {
  const container = document.getElementById('sensImpact');

  function getT(e, rect) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function onMove(e) {
    if (!sensImpactDrag) return;
    e.preventDefault();
    adjustSensWeight(sensImpactDrag.C, getT(e, sensImpactDrag.rect));
  }

  function onUp() {
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
    sensImpactDrag = { C: wrap.dataset.criterion, rect: wrap.getBoundingClientRect() };
    adjustSensWeight(sensImpactDrag.C, getT(e, sensImpactDrag.rect));
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  container.addEventListener('touchstart', e => {
    const wrap = e.target.closest('.be-track-wrap');
    if (!wrap) return;
    sensImpactDrag = { C: wrap.dataset.criterion, rect: wrap.getBoundingClientRect() };
    adjustSensWeight(sensImpactDrag.C, getT(e, sensImpactDrag.rect));
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }, { passive: true });
}());

// ── Rating Impact ─────────────────────────────────────────────
function initExplorationRatings() {
  explorationRatings = { ...ratings };
}

function computeRatingBreakevens(sol, C, sols, weights, rObj) {
  const r = rObj || explorationRatings;
  const wC = weights[C] ?? 0;
  const baseScore = criteria.reduce((s, c) => c === C ? s : s + (r[`${sol}|${c}`] ?? 0) * (weights[c] ?? 0), 0);
  const otherScores = {};
  sols.filter(s => s !== sol).forEach(s => {
    otherScores[s] = criteria.reduce((sum, c) => sum + (r[`${s}|${c}`] ?? 0) * (weights[c] ?? 0), 0);
  });
  const bps = wC > 0
    ? Object.values(otherScores).map(os => (os - baseScore) / wC).filter(v => v > 0 && v < 4)
    : [];
  const points = [0, ...bps.sort((a, b) => a - b), 4];
  const winKey = w => Array.isArray(w) ? [...w].sort().join('\0') : w;
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const mid = (points[i] + points[i + 1]) / 2;
    const solMid = baseScore + mid * wC;
    let topScore = solMid, topSols = [sol];
    Object.entries(otherScores).forEach(([s, sc]) => {
      if (Math.abs(sc - topScore) < 1e-9) topSols.push(s);
      else if (sc > topScore) { topScore = sc; topSols = [s]; }
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
  const container = document.getElementById('ratingImpactContainer');
  if (!container) return;
  const sols = getSolutions();
  if (!comparisonStarted || criteria.length === 0 || sols.length < 2) {
    container.innerHTML = `<p class="hint">${t('hintNeedSolutions')}</p>`;
    return;
  }
  ensureSensState();
  const weights = sensWeights;
  let html = '<div class="be-legend">';
  sols.forEach((s, i) => { html += `<span class="be-legend-item"><span class="be-dot" style="background:${SOL_COLORS[i % SOL_COLORS.length]}"></span>${s}</span>`; });
  html += '</div>';
  sols.forEach((sol, si) => {
    const solColor = SOL_COLORS[si % SOL_COLORS.length];
    html += `<div class="ri-sol-header" style="color:${solColor}">${sol}</div>`;
    criteriaByWeight().forEach(C => {
      const segs = computeRatingBreakevens(sol, C, sols, weights);
      const cur = ((explorationRatings[`${sol}|${C}`] ?? 0) / 4 * 100).toFixed(2);
      html += `<div class="be-row"><span class="be-label" title="${C}">${C}</span>`;
      html += `<div class="be-track-wrap" data-sol="${sol}" data-crit="${C}">`;
      html += `<div class="be-track">`;
      segs.forEach(seg => {
        const label = Array.isArray(seg.winner) ? seg.winner.join(' & ') : seg.winner;
        html += `<div class="be-segment" style="width:${((seg.to - seg.from) * 100).toFixed(3)}%;${segmentBg(seg.winner, sols)}" title="${label}"></div>`;
      });
      html += `</div><div class="be-current" style="left:${cur}%"></div>`;
      html += `<div class="rs-ticks">`;
      for (let i = 0; i <= 4; i++) html += `<span class="rs-tick" style="left:${i * 25}%">${i}</span>`;
      html += `</div></div></div>`;
    });
  });
  container.innerHTML = html;
}

document.getElementById('resetRatingsBtn').onclick = () => {
  initExplorationRatings();
  updateRatingImpact();
  updateSensImpact();
  updateSensRanking();
};

// ── Rating Impact drag ────────────────────────────────────────
(function setupRatingImpactDrag() {
  const container = document.getElementById('ratingImpactContainer');
  let active = null;
  function getVal(e, rect) {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.round(Math.max(0, Math.min(4, ((x - rect.left) / rect.width) * 4)));
  }
  function onDown(e) {
    const wrap = e.target.closest('[data-sol][data-crit]');
    if (!wrap || !container.contains(wrap)) return;
    active = { sol: wrap.dataset.sol, crit: wrap.dataset.crit, rect: wrap.getBoundingClientRect() };
    onMove(e);
  }
  function onMove(e) {
    if (!active) return;
    e.preventDefault();
    explorationRatings[`${active.sol}|${active.crit}`] = getVal(e, active.rect);
    updateRatingImpact();
    updateSensImpact();
    updateSensRanking();
  }
  function onUp() { active = null; }
  container.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  container.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
}());
