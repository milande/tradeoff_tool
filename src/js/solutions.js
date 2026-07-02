// ── DOM refs & state ──────────────────────────────────────────
const solutionList = document.getElementById('solutionList');
const addSolutionBtn = document.getElementById('addSolutionBtn');
let ratings = {};
let ratingNotes = {};
let criteriaAnchors = {};
let knockoutCriteria = {};
let solutionNotes = {};
let solutionDebounce = null;

// ── Solution inputs ───────────────────────────────────────────
function addSolutionInput(value = '', note = '') {
  const item = document.createElement('div');
  item.className = 'criteria-item';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = t('solutionPlaceholder');
  input.value = value;
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
    const sol = input.value.trim();
    if (sol) { solutionNotes[sol] = noteInput.value; saveState(); }
  });
  item.appendChild(input);
  item.appendChild(btn);
  item.appendChild(noteInput);
  solutionList.appendChild(item);
}

function getSolutions() {
  return [...solutionList.querySelectorAll('input:not(.sol-note)')].map(i => i.value.trim()).filter(Boolean);
}

// ── Matrix rendering ──────────────────────────────────────────
function renderSolutionMatrix() {
  const container = document.getElementById('solutionMatrix');
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
    const isKO = !!knockoutCriteria[c];
    if (isKO) card.classList.add('knockout-active');
    const nameSpanH = document.createElement('span');
    nameSpanH.className = 'solution-name';
    nameSpanH.textContent = c;
    const weightSpan = document.createElement('span');
    weightSpan.className = 'criterion-weight';
    weightSpan.textContent = `${(weights[c] * 100).toFixed(1)}%`;
    const koBtn = document.createElement('button');
    koBtn.className = 'knockout-toggle' + (isKO ? ' active' : '');
    koBtn.textContent = t('mustHave');
    koBtn.onclick = () => {
      knockoutCriteria[c] = !knockoutCriteria[c];
      koBtn.classList.toggle('active', !!knockoutCriteria[c]);
      card.classList.toggle('knockout-active', !!knockoutCriteria[c]);
      updateSolutionRanking(); updateSensRanking();
      saveState();
    };
    header.appendChild(nameSpanH);
    header.appendChild(weightSpan);
    header.appendChild(koBtn);
    card.appendChild(header);

    // Anchor strip (Pro only via CSS)
    const anchorDefaults = t('anchorDefaults');
    const anchorStrip = document.createElement('div');
    anchorStrip.className = 'anchor-strip';
    for (let v = 0; v <= 4; v++) {
      const aKey = `${c}|${v}`;
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
      const key = `${sol}|${c}`;
      const cur = ratings[key] ?? 0;
      const row = document.createElement('div');
      row.className = 'criterion-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'criterion-name';
      nameSpan.textContent = sol;
      const btnsEl = document.createElement('div');
      btnsEl.className = 'rating-buttons';
      for (let v = 0; v <= 4; v++) {
        const btn = document.createElement('button');
        btn.className = 'rating-btn' + (cur === v ? ' active' : '');
        btn.classList.add(`rating-btn-${v}`);
        btn.title = criteriaAnchors[`${c}|${v}`] || anchorDefaults[v];
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
function getKnockedOut(ratingsObj = ratings) {
  const koList = Object.keys(knockoutCriteria).filter(c => knockoutCriteria[c]);
  if (!koList.length) return {};
  const result = {};
  getSolutions().forEach(sol => {
    const failed = koList.filter(c => (ratingsObj[`${sol}|${c}`] ?? 0) === 0);
    if (failed.length) result[sol] = failed;
  });
  return result;
}

function scoreSolutions(weights, ratingsObj = ratings) {
  const sols = getSolutions();
  return sols.map(sol => {
    const score = criteria.reduce((sum, c) => sum + (ratingsObj[`${sol}|${c}`] ?? 0) * (weights[c] ?? 0), 0);
    return { sol, score };
  }).sort((a, b) => b.score - a.score);
}

function updateSolutionRanking() {
  const sols = getSolutions();
  const tbody = document.getElementById('solutionRankingBody');
  if (!comparisonStarted || criteria.length === 0 || sols.length === 0) { tbody.innerHTML = ''; return; }
  const ko = getKnockedOut();
  const ranked = scoreSolutions(computeWeights()).filter(({ sol }) => !ko[sol]);
  const entries = [
    ...ranked.map(({ sol, score }) => {
      const pct = (score / 4) * 100;
      const note = solutionNotes[sol] ? `<div class="rank-note">${solutionNotes[sol]}</div>` : '';
      return { key: sol, html: `<td><div>${sol}</div>${note}</td><td>${score.toFixed(2)}</td><td><div class="weight-cell"><span>${pct.toFixed(1)}%</span><div class="weight-bar-wrap"><div class="weight-bar" style="width:${pct}%"></div></div></div></td>` };
    }),
    ...Object.entries(ko).map(([sol, failed]) => {
      const note = solutionNotes[sol] ? `<div class="rank-note">${solutionNotes[sol]}</div>` : '';
      return { key: sol, html: `<td class="rank-ko"><div class="rank-ko-name">${sol}</div>${note}<span class="rank-ko-reason">${t('knockedOut')}: ${failed.join(', ')}</span></td><td class="rank-ko">—</td><td class="rank-ko">—</td>` };
    }),
  ];
  animateRows(tbody, entries);
  renderScenarios();
  saveState();
}

// ── Event handlers ────────────────────────────────────────────
addSolutionBtn.onclick = () => addSolutionInput();
for (let i = 0; i < 3; i++) addSolutionInput();
