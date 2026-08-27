// ── DOM refs & state ──────────────────────────────────────────
// All maps key by stable ids: ratings/ratingNotes 'solId|critId',
// criteriaAnchors 'critId|value', knockoutCriteria/solutionNotes by id.
const solutionList = byId('solutionList');
const addSolutionBtn = byId('addSolutionBtn');
let ratings = {};
let ratingNotes = {};
let criteriaAnchors = {};
let knockoutCriteria = {};
let economicCriteria = {};   // {critId: true} — VDI 2225: economic (€) vs technical
let solutionNotes = {};
let solutionDebounce = null;

// ── Solution inputs ───────────────────────────────────────────
function addSolutionInput(value = '', note = '', id = null) {
  const item = document.createElement('div');
  item.className = 'criteria-item';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = t('solutionPlaceholder');
  input.value = value;
  input.dataset.id = id || newId('s');
  input.addEventListener('input', () => {
    clearTimeout(solutionDebounce);
    solutionDebounce = setTimeout(() => { renderSolutionMatrix(); updateSensRanking(); updateSensImpact(); updateRatingImpact(); }, 350);
  });
  const btn = document.createElement('button');
  btn.className = 'btn-remove';
  btn.textContent = '−';
  btn.onclick = () => { item.remove(); renderSolutionMatrix(); updateSensRanking(); updateSensImpact(); updateRatingImpact(); };
  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.className = 'sol-note';
  noteInput.placeholder = t('solutionNotePlaceholder');
  noteInput.value = note;
  noteInput.addEventListener('input', () => {
    solutionNotes[input.dataset.id] = noteInput.value;
    saveState();
  });
  item.appendChild(input);
  item.appendChild(btn);
  item.appendChild(noteInput);
  solutionList.appendChild(item);
}

function getSolutions() {
  return [...solutionList.querySelectorAll('input:not(.sol-note)')]
    .map(i => ({ id: i.dataset.id, name: i.value.trim() }))
    .filter(s => s.name);
}

// ── Matrix rendering ──────────────────────────────────────────
function renderSolutionMatrix() {
  const container = byId('solutionMatrix');
  const sols = getSolutions();
  container.innerHTML = '';

  if (!comparisonStarted || criteria.length === 0) {
    container.innerHTML = `<p class="hint">${t('hintAddCriteria')}</p>`;
    updateSolutionRanking();
    return;
  }
  if (sols.length === 0) {
    container.innerHTML = `<p class="hint">${t('hintAddSolutions')}</p>`;
    updateSolutionRanking();
    return;
  }

  const weights = computeWeights();
  criteriaByWeight().forEach(c => {
    const card = document.createElement('div');
    card.className = 'solution-card';
    const header = document.createElement('div');
    header.className = 'criterion-header';
    const isKO = !!knockoutCriteria[c.id];
    if (isKO) card.classList.add('knockout-active');
    const nameSpanH = document.createElement('span');
    nameSpanH.className = 'solution-name';
    nameSpanH.textContent = c.name;
    const weightSpan = document.createElement('span');
    weightSpan.className = 'criterion-weight';
    weightSpan.textContent = `${(weights[c.id] * 100).toFixed(1)}%`;
    const koBtn = document.createElement('button');
    koBtn.className = 'knockout-toggle' + (isKO ? ' active' : '');
    koBtn.textContent = t('mustHave');
    koBtn.onclick = () => {
      knockoutCriteria[c.id] = !knockoutCriteria[c.id];
      koBtn.classList.toggle('active', !!knockoutCriteria[c.id]);
      card.classList.toggle('knockout-active', !!knockoutCriteria[c.id]);
      updateSolutionRanking(); updateSensRanking();
      saveState();
    };
    // VDI 2225: technical (T) vs economic (€) classification
    const ecoBtn = document.createElement('button');
    const syncEcoBtn = () => {
      const isEco = !!economicCriteria[c.id];
      ecoBtn.className = 'eco-toggle' + (isEco ? ' active' : '');
      ecoBtn.textContent = isEco ? '€' : 'T';
      ecoBtn.title = isEco ? t('vdiEconomic') : t('vdiTechnical');
    };
    syncEcoBtn();
    ecoBtn.onclick = () => {
      if (economicCriteria[c.id]) delete economicCriteria[c.id];
      else economicCriteria[c.id] = true;
      syncEcoBtn();
      updateSolutionRanking();
    };
    header.appendChild(nameSpanH);
    header.appendChild(weightSpan);
    header.appendChild(ecoBtn);
    header.appendChild(koBtn);
    card.appendChild(header);

    // Anchor strip (Pro only via CSS)
    const anchorDefaults = t('anchorDefaults');
    const anchorStrip = document.createElement('div');
    anchorStrip.className = 'anchor-strip';
    for (let v = 0; v <= 4; v++) {
      const aKey = `${c.id}|${v}`;
      const item = document.createElement('div');
      item.className = 'anchor-item';
      const lbl = document.createElement('span');
      lbl.className = 'anchor-label';
      lbl.textContent = v;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'anchor-input';
      inp.placeholder = anchorDefaults[v];
      inp.value = criteriaAnchors[aKey] || '';
      inp.dataset.akey = aKey;
      inp.addEventListener('input', () => {
        criteriaAnchors[aKey] = inp.value;
        card.querySelectorAll(`.rating-btn-${v}`).forEach(b => {
          b.title = inp.value || anchorDefaults[v];
        });
        saveState();
      });
      item.appendChild(lbl);
      item.appendChild(inp);
      anchorStrip.appendChild(item);
    }
    card.appendChild(anchorStrip);

    sols.forEach(sol => {
      const key = `${sol.id}|${c.id}`;
      const cur = ratings[key] ?? 0;
      const row = document.createElement('div');
      row.className = 'criterion-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'criterion-name';
      nameSpan.textContent = sol.name;
      const btnsEl = document.createElement('div');
      btnsEl.className = 'rating-buttons';
      for (let v = 0; v <= 4; v++) {
        const btn = document.createElement('button');
        btn.className = 'rating-btn' + (cur === v ? ' active' : '');
        btn.classList.add(`rating-btn-${v}`);
        btn.title = criteriaAnchors[`${c.id}|${v}`] || anchorDefaults[v];
        btn.textContent = v;
        btn.onclick = () => {
          ratings[key] = v;
          explorationRatings[key] = v;
          [...btnsEl.children].forEach((el, i) => el.classList.toggle('active', i === v));
          updateSolutionRanking();
          updateSensRanking();
          updateSensImpact(); updateRatingImpact();
        };
        btnsEl.appendChild(btn);
      }
      const noteEl = document.createElement('input');
      noteEl.type = 'text';
      noteEl.className = 'rating-note' + (ratingNotes[key] ? ' has-note' : '');
      noteEl.placeholder = t('ratingNotePlaceholder');
      noteEl.value = ratingNotes[key] || '';
      noteEl.addEventListener('input', () => {
        ratingNotes[key] = noteEl.value;
        noteEl.classList.toggle('has-note', !!noteEl.value);
        saveState();
      });
      row.appendChild(nameSpan);
      row.appendChild(btnsEl);
      row.appendChild(noteEl);
      card.appendChild(row);
    });
    container.appendChild(card);
  });
  updateSolutionRanking();
}

// ── Knockout & ranking ────────────────────────────────────────
// Returns {solId: [critId, ...]} for solutions failing a must-have criterion.
function getKnockedOut(ratingsObj = ratings) {
  const koIds = criteria.filter(c => knockoutCriteria[c.id]).map(c => c.id);
  if (!koIds.length) return {};
  const result = {};
  getSolutions().forEach(sol => {
    const failed = koIds.filter(cid => (ratingsObj[`${sol.id}|${cid}`] ?? 0) === 0);
    if (failed.length) result[sol.id] = failed;
  });
  return result;
}

// Returns [{sol: {id, name}, score}] sorted by score descending.
function scoreSolutions(weights, ratingsObj = ratings) {
  return getSolutions().map(sol => {
    const score = criteria.reduce((sum, c) => sum + (ratingsObj[`${sol.id}|${c.id}`] ?? 0) * (weights[c.id] ?? 0), 0);
    return { sol, score };
  }).sort((a, b) => b.score - a.score);
}

function updateSolutionRanking() {
  const sols = getSolutions();
  const tbody = byId('solutionRankingBody');
  if (!comparisonStarted || criteria.length === 0 || sols.length === 0) { tbody.innerHTML = ''; return; }
  const ko = getKnockedOut();
  const ranked = scoreSolutions(computeWeights()).filter(({ sol }) => !ko[sol.id]);
  const entries = [
    ...ranked.map(({ sol, score }) => {
      const pct = (score / 4) * 100;
      const note = solutionNotes[sol.id] ? `<div class="rank-note">${esc(solutionNotes[sol.id])}</div>` : '';
      return { key: sol.id, html: `<td><div>${esc(sol.name)}</div>${note}</td><td>${score.toFixed(2)}</td><td><div class="weight-cell"><span>${pct.toFixed(1)}%</span><div class="weight-bar-wrap"><div class="weight-bar" style="width:${pct}%"></div></div></div></td>` };
    }),
    ...Object.entries(ko).map(([solId, failedIds]) => {
      const sol = sols.find(s => s.id === solId);
      const note = solutionNotes[solId] ? `<div class="rank-note">${esc(solutionNotes[solId])}</div>` : '';
      const failedNames = failedIds.map(critName).join(', ');
      return { key: solId, html: `<td class="rank-ko"><div class="rank-ko-name">${esc(sol ? sol.name : '')}</div>${note}<span class="rank-ko-reason">${t('knockedOut')}: ${esc(failedNames)}</span></td><td class="rank-ko">—</td><td class="rank-ko">—</td>` };
    }),
  ];
  animateRows(tbody, entries);
  renderRobustness();
  renderVdi();
  renderTeam();
  renderScenarios();
  saveState();
}

// ── VDI 2225 value analysis ───────────────────────────────────
// Wt (technical value) and We (economic value): weighted mean rating
// relative to the ideal (4), computed per criterion group; strength
// s = √(Wt·We). Active once at least one criterion of each group exists.
function computeVdi(ratingsObj = ratings, weightsObj = null) {
  const tech = criteria.filter(c => !economicCriteria[c.id]);
  const eco = criteria.filter(c => economicCriteria[c.id]);
  if (!tech.length || !eco.length) return null;
  const w = weightsObj || computeWeights();
  const groupValue = (sol, group) => {
    const wSum = group.reduce((s, c) => s + (w[c.id] ?? 0), 0);
    if (wSum <= 0) return 0;
    return group.reduce((s, c) => s + (ratingsObj[`${sol.id}|${c.id}`] ?? 0) * (w[c.id] ?? 0), 0) / (4 * wSum);
  };
  return getSolutions().map(sol => {
    const wt = groupValue(sol, tech), we = groupValue(sol, eco);
    return { sol, wt, we, s: Math.sqrt(wt * we) };
  });
}

// s-diagram: x = We, y = Wt, ideal at (1,1), balanced solutions on the diagonal.
function vdiDiagramSvg(data, ko, sols) {
  const padL = 40, padR = 72, padT = 30, padB = 40;
  const plot = 240;
  const W = padL + plot + padR, H = padT + plot + padB;
  // Themed through the foreground channel rather than a light/dark flag. The
  // diagram is inline SVG in the page, so it follows whatever surrounds it —
  // including a live theme switch — and the print document, which defines the
  // same tokens with light values. A presentation attribute cannot hold var(),
  // so these are applied through style=.
  const axis = 'stroke:rgba(var(--fg-rgb),.3)';
  const grid = 'stroke:rgba(var(--fg-rgb),.08)';
  const text = 'fill:rgba(var(--fg-rgb),.45)';
  const X = v => padL + v * plot;
  const Y = v => padT + (1 - v) * plot;
  let svg = `<svg class="vdi-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i <= 4; i++) {
    const v = i / 4;
    svg += `<line x1="${X(0)}" y1="${Y(v)}" x2="${X(1)}" y2="${Y(v)}" style="${grid}" stroke-width="1"/>`;
    svg += `<line x1="${X(v)}" y1="${Y(0)}" x2="${X(v)}" y2="${Y(1)}" style="${grid}" stroke-width="1"/>`;
    if (i % 2 === 0) {
      svg += `<text x="${X(v)}" y="${Y(0) + 16}" style="${text}" font-size="10" text-anchor="middle">${v.toFixed(1)}</text>`;
      svg += `<text x="${X(0) - 8}" y="${Y(v) + 3}" style="${text}" font-size="10" text-anchor="end">${v.toFixed(1)}</text>`;
    }
  }
  svg += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" style="${axis}" stroke-width="1" stroke-dasharray="4 3"/>`;
  svg += `<circle cx="${X(1)}" cy="${Y(1)}" r="3" style="fill:none;${axis}"/>`;
  svg += `<text x="${X(1) + 8}" y="${Y(1) + 3}" style="${text}" font-size="10">1/1</text>`;
  // axis titles: Wt in the upper-left corner (left-anchored, clear of the tick
  // numbers which sit to the left of the axis); We at the end of the x-axis (right).
  svg += `<text x="-6" y="30" style="${text}" font-size="11" text-anchor="start">Wt ↑</text>`;
  svg += `<text x="${X(1)}" y="${Y(0) + 34}" style="${text}" font-size="11" text-anchor="end">We →</text>`;
  data.forEach(({ sol, wt, we }) => {
    const c = solText(sols.findIndex(x => x.id === sol.id));
    const isKO = !!ko[sol.id];
    svg += `<circle cx="${X(we)}" cy="${Y(wt)}" r="5" style="fill:${isKO ? 'none' : c};stroke:${c}" stroke-width="2"${isKO ? ' stroke-dasharray="2 2"' : ''}/>`;
    const label = `${esc(sol.name)}${isKO ? ' ⊗' : ''}`;
    // labels flip to the left of the point near the right edge so they never clip
    if (we > 0.78) svg += `<text x="${X(we) - 9}" y="${Y(wt) + 3}" style="fill:${c}" font-size="10" text-anchor="end">${label}</text>`;
    else svg += `<text x="${X(we) + 9}" y="${Y(wt) + 3}" style="fill:${c}" font-size="10">${label}</text>`;
  });
  svg += '</svg>';
  return `<div class="vdi-diagram">${svg}</div>`;
}

function renderVdi() {
  const section = byId('vdiSection');
  const container = byId('vdiContainer');
  if (!section || !container) return;
  const sols = getSolutions();
  const data = comparisonStarted && proMode && sols.length ? computeVdi() : null;
  if (!data) { section.style.display = 'none'; container.innerHTML = ''; return; }
  section.style.display = '';
  const ko = getKnockedOut();
  let html = `<table class="vdi-table"><thead><tr><th>${t('thSolution')}</th>` +
    `<th title="${t('vdiWt')}">Wt</th><th title="${t('vdiWe')}">We</th><th title="${t('vdiS')}">s</th></tr></thead><tbody>`;
  [...data].sort((a, b) => b.s - a.s).forEach(({ sol, wt, we, s }) => {
    const ci = sols.findIndex(x => x.id === sol.id);
    const isKO = !!ko[sol.id];
    html += `<tr${isKO ? ' class="vdi-ko"' : ''}><td style="color:${solText(ci)};font-weight:600">${esc(sol.name)}${isKO ? ' ⊗' : ''}</td>` +
      `<td>${wt.toFixed(2)}</td><td>${we.toFixed(2)}</td><td><strong>${s.toFixed(2)}</strong></td></tr>`;
  });
  html += '</tbody></table>';
  html += vdiDiagramSvg(data, ko, sols);
  container.innerHTML = html;
}

// ── Robustness verdict ────────────────────────────────────────
// How stable is the current winner? For every criterion, find the nearest
// weight breakeven (committed weights + ratings) at which someone else takes
// the lead. Returns null (n/a), {stable: true, winner} or the closest flip.
function computeRobustness() {
  if (!comparisonStarted || criteria.length === 0) return null;
  const ko = getKnockedOut();
  const alive = getSolutions().filter(s => !ko[s.id]);
  if (alive.length < 2) return null;
  const weights = computeWeights();
  const winner = scoreSolutions(weights).filter(({ sol }) => !ko[sol.id])[0].sol;

  let best = null; // { crit, cur, bp, challenger, delta }
  criteria.forEach(c => {
    const segs = computeBreakevens(c.id, alive, weights, ratings);
    const cur = weights[c.id] ?? 0;
    for (let i = 1; i < segs.length; i++) {
      const bp = segs[i].from;
      // the side of the boundary away from the current weight
      const farSeg = cur < bp ? segs[i] : segs[i - 1];
      const farWinners = Array.isArray(farSeg.sol) ? farSeg.sol : [farSeg.sol];
      if (farWinners.length === 1 && farWinners[0].id === winner.id) continue;
      const challenger = farWinners.filter(s => s.id !== winner.id).map(s => s.name).join(' & ');
      if (!challenger) continue;
      const delta = Math.abs(cur - bp);
      if (!best || delta < best.delta) best = { crit: c, cur, bp, challenger, delta };
    }
  });
  return best ? { stable: false, winner, ...best } : { stable: true, winner };
}

function renderRobustness() {
  const el = byId('robustnessHint');
  if (!el) return;
  el.title = t('robustnessBasis');
  const r = computeRobustness();
  if (!r) { el.innerHTML = ''; el.className = 'robustness'; return; }
  if (r.stable) {
    el.innerHTML = t('robustnessStable')(esc(r.winner.name));
    el.className = 'robustness robust';
  } else {
    const cur = Math.round(r.cur * 100), bp = Math.round(r.bp * 100);
    el.innerHTML = t('robustnessFlip')(esc(r.challenger), esc(r.crit.name), cur, bp);
    el.className = 'robustness' + (r.delta < 0.05 ? ' fragile' : '');
  }
}

// ── Event handlers ────────────────────────────────────────────
addSolutionBtn.onclick = () => addSolutionInput();
for (let i = 0; i < 3; i++) addSolutionInput();
