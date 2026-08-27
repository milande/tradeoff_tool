function generatePrintView(tradeName = '', exporter = '') {
  const criteria = getCriteria();
  const weights = computeWeights();
  const scores = computeScores();
  const totalPts = Object.values(scores).reduce((s, v) => s + v, 0);
  const sols = getSolutions();
  const koSols = getKnockedOut();
  const ranked = scoreSolutions(weights);
  // Non-knocked-out first (by score), knocked-out solutions at the bottom
  const rankedOrdered = [...ranked.filter(r => !koSols[r.sol]), ...ranked.filter(r => koSols[r.sol])];
  const CYAN = '#18c8ff';

  const pairwiseWeights = {};
  criteria.forEach(c => pairwiseWeights[c.id] = totalPts > 0 ? scores[c.id] / totalPts : 1 / criteria.length);

  const criteriaRows = [...criteria]
    .sort((a, b) => scores[b.id] - scores[a.id])
    .map(c => {
      const pct = totalPts > 0 ? (100 * scores[c.id] / totalPts).toFixed(1) : '0.0';
      return `<tr><td>${esc(c.name)}</td><td>${pct}%</td><td><div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${CYAN}"></div></div></td></tr>`;
    }).join('');

  const orderedCriteria = criteriaByWeight();
  const fineTuneRows = customWeights ? orderedCriteria.map(c => {
    const custom = (weights[c.id] * 100).toFixed(1);
    const pairwise = (pairwiseWeights[c.id] * 100).toFixed(1);
    const reason = customWeightReasons[c.id] || '';
    const changed = Math.abs(parseFloat(custom) - parseFloat(pairwise)) > 0.05;
    return `<tr>
      <td>${esc(c.name)}</td>
      <td style="color:#888">${pairwise}%</td>
      <td style="font-weight:${changed ? '600' : '400'}">${custom}%</td>
      <td style="color:#666;font-style:italic">${esc(reason)}</td>
    </tr>`;
  }).join('') : '';

  const rankRatingColors = ['#f1f5f9', '#fde68a', '#86efac', '#4ade80', '#16a34a'];
  const solRankThds = orderedCriteria.map(c => `<th title="${esc(c.name)}">${esc(c.name)}</th>`).join('');
  const solRows = rankedOrdered.map(({ sol, score }) => {
    const isKO = !!koSols[sol.id];
    const pct = Math.min(100, (score / 4) * 100).toFixed(1);
    const color = SOL_COLORS[sols.findIndex(s => s.id === sol.id) % SOL_COLORS.length];
    const ratingCells = orderedCriteria.map(c => {
      const v = ratings[`${sol.id}|${c.id}`] ?? 0;
      const rn = ratingNotes[`${sol.id}|${c.id}`];
      const noteHtml = rn ? `<div style="font-size:0.65rem;color:#666;font-style:italic;margin-top:2px;line-height:1.2">${esc(rn)}</div>` : '';
      return `<td style="text-align:center;background:${rankRatingColors[v]};color:#1a1a2e;font-size:0.8rem;vertical-align:top"><div>${v}</div>${noteHtml}</td>`;
    }).join('');
    const note = solutionNotes[sol.id] ? `<div style="font-size:0.72rem;color:#888;font-style:italic;font-weight:400;margin-top:2px">${esc(solutionNotes[sol.id])}</div>` : '';
    const koReason = isKO ? `<div style="font-size:0.65rem;color:#c00;font-style:italic;margin-top:2px">${t('knockedOut')}: ${esc(koSols[sol.id].map(critName).join(', '))}</div>` : '';
    // Strike only name and score — the KO reason and notes must stay readable
    const strike = isKO ? 'text-decoration:line-through;' : '';
    const rowStyle = isKO ? ' style="opacity:.55"' : '';
    return `<tr${rowStyle}><td style="color:${color};font-weight:600"><div style="${strike}">${esc(sol.name)}</div>${note}${koReason}</td><td style="${strike}">${score.toFixed(2)}</td><td><div class="bar-inline"><div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${color}"></div></div><span class="bar-pct">${pct}%</span></div></td>${ratingCells}</tr>`;
  }).join('');

  const pairListRows = pairs.map(([idA, idB]) => {
    const state = pairStates[`${idA}|${idB}`] ?? 0;
    const a = esc(critName(idA)), b = esc(critName(idB));
    let left = a, mid = '=', right = b;
    if (state === -1)      { left = `<strong>${a}</strong>`; mid = '›'; }
    else if (state === 1)  { right = `<strong>${b}</strong>`; mid = '‹'; }
    return `<tr><td>${left}</td><td style="text-align:center;color:#aaa;font-weight:700;padding:7px 6px">${mid}</td><td>${right}</td></tr>`;
  }).join('');

  function printLegend(solList) {
    const koNow = getKnockedOut(explorationRatings);
    return '<div class="legend">' + solList.map((sol, i) => {
      const failed = koNow[sol.id];
      const name = failed ? `<span style="text-decoration:line-through;opacity:.6">${esc(sol.name)}</span> <span style="color:#c00;font-size:.75rem">⊗ ${esc(failed.map(critName).join(', '))}</span>` : esc(sol.name);
      return `<span class="legend-item"><span class="legend-dot" style="background:${SOL_COLORS[i % SOL_COLORS.length]}"></span>${name}</span>`;
    }).join('') + '</div>';
  }

  const koExp = getKnockedOut(explorationRatings);
  let sensHtml = '';
  if (proMode && sols.length >= 2) {
    sensHtml += printLegend(sols);
    orderedCriteria.forEach(c => {
      const segs = computeBreakevens(c.id, sols);
      const curPct = ((sensWeights[c.id] ?? 0) * 100).toFixed(2);
      const commPct = (weights[c.id] ?? 0) * 100;
      sensHtml += `<div class="be-row"><span class="be-label" title="${esc(c.name)}">${esc(c.name)}</span><div class="be-track-wrap"><div class="be-track">`;
      segs.forEach(seg => {
        const w = ((seg.to - seg.from) * 100).toFixed(3);
        sensHtml += `<div class="be-segment" style="width:${w}%;${segmentBg(seg.sol, sols, koExp)}"></div>`;
      });
      sensHtml += `</div>`;
      if (Math.abs(commPct - parseFloat(curPct)) > 0.5) sensHtml += `<div class="be-committed" style="left:${commPct.toFixed(2)}%"></div>`;
      sensHtml += `<div class="be-current" style="left:${curPct}%"></div>`;
      sensHtml += `<div class="be-cur-label" style="left:${curPct}%">${Math.round(parseFloat(curPct))}%</div>`;
      segs.slice(1).forEach(seg => {
        const pct = (seg.from * 100).toFixed(1);
        sensHtml += `<div class="be-tick" style="left:${pct}%">${Math.round(parseFloat(pct))}%</div>`;
      });
      sensHtml += `</div></div>`;
    });
  }

  let ratingHtml = '';
  if (proMode && sols.length >= 2) {
    ratingHtml += printLegend(sols);
    sols.forEach((sol, si) => {
      const solColor = SOL_COLORS[si % SOL_COLORS.length];
      ratingHtml += `<div class="ri-sol-header" style="color:${solColor}">${esc(sol.name)}</div>`;
      orderedCriteria.forEach(c => {
        const key = `${sol.id}|${c.id}`;
        const segs = computeRatingBreakevens(sol, c.id, sols, sensWeights);
        const curVal = explorationRatings[key] ?? 0;
        const commVal = ratings[key] ?? 0;
        const cur = (curVal / 4 * 100).toFixed(2);
        ratingHtml += `<div class="be-row"><span class="be-label" title="${esc(c.name)}">${esc(c.name)}</span><div class="be-track-wrap"><div class="be-track">`;
        segs.forEach(seg => {
          const w = ((seg.to - seg.from) * 100).toFixed(3);
          ratingHtml += `<div class="be-segment" style="width:${w}%;${segmentBg(seg.winner, sols, koExp)}"></div>`;
        });
        ratingHtml += `</div>`;
        if (commVal !== curVal) ratingHtml += `<div class="be-committed" style="left:${(commVal / 4 * 100).toFixed(2)}%"></div>`;
        ratingHtml += `<div class="be-current" style="left:${cur}%"></div>`;
        for (let i = 0; i <= 4; i++) ratingHtml += `<div class="be-tick" style="left:${i * 25}%">${i}</div>`;
        ratingHtml += `</div></div>`;
      });
    });
  }

  // VDI 2225 section (Pro): Wt/We table + s-diagram in print colors
  let vdiHtml = '';
  const vdiData = proMode ? computeVdi() : null;
  if (vdiData && vdiData.length) {
    vdiHtml = `<h2>${t('vdiTitle')}</h2><table style="width:auto"><thead><tr><th>${t('printThSolution')}</th><th style="text-align:right">Wt</th><th style="text-align:right">We</th><th style="text-align:right">s</th></tr></thead><tbody>`;
    [...vdiData].sort((a, b) => b.s - a.s).forEach(({ sol, wt, we, s }) => {
      const isKO = !!koSols[sol.id];
      const color = SOL_COLORS[sols.findIndex(x => x.id === sol.id) % SOL_COLORS.length];
      vdiHtml += `<tr${isKO ? ' style="opacity:.55"' : ''}><td style="color:${color};font-weight:600${isKO ? ';text-decoration:line-through' : ''}">${esc(sol.name)}${isKO ? ' ⊗' : ''}</td><td style="text-align:right">${wt.toFixed(2)}</td><td style="text-align:right">${we.toFixed(2)}</td><td style="text-align:right;font-weight:600">${s.toFixed(2)}</td></tr>`;
    });
    vdiHtml += '</tbody></table>' + vdiDiagramSvg(vdiData, koSols, sols, true);
  }

  // Team ratings section (Pro): per-rater ratings with disagreements highlighted
  let teamHtml = '';
  if (proMode && raters.length && sols.length) {
    const cols = teamColumns();
    const mean = teamMeanRatings();
    teamHtml = `<h2>${t('teamTitle')}</h2><table><thead><tr><th>${t('printThSolution')} / ${t('printThCriterion')}</th>` +
      cols.map(col => `<th style="text-align:center">${esc(col.name)}</th>`).join('') +
      `<th style="text-align:center">Ø</th></tr></thead><tbody>`;
    sols.forEach(sol => {
      const color = SOL_COLORS[sols.findIndex(x => x.id === sol.id) % SOL_COLORS.length];
      teamHtml += `<tr><td colspan="${cols.length + 2}" style="color:${color};font-weight:600;padding-top:10px">${esc(sol.name)}</td></tr>`;
      orderedCriteria.forEach(c => {
        const key = `${sol.id}|${c.id}`;
        const vals = cols.map(col => col.ratings[key] ?? 0);
        const warn = Math.max(...vals) - Math.min(...vals) >= 2;
        teamHtml += `<tr${warn ? ' style="background:#fef3c7"' : ''}><td style="padding-left:18px;color:#666">${esc(c.name)}</td>` +
          vals.map(v => `<td style="text-align:center${warn ? ';font-weight:600' : ''}">${v}</td>`).join('') +
          `<td style="text-align:center;font-weight:600">${mean[key].toFixed(1)}</td></tr>`;
      });
    });
    teamHtml += '</tbody></table>';
  }

  const koActive = orderedCriteria.filter(c => knockoutCriteria[c.id]);
  let knockoutHtml = '';
  if (koActive.length > 0) {
    knockoutHtml = `<h2>${t('printKnockoutCriteria')}</h2><table><thead><tr><th>${t('printThCriterion')}</th><th>${t('printThSolution')}</th></tr></thead><tbody>`;
    koActive.forEach(c => {
      const eliminated = Object.entries(koSols)
        .filter(([, failedIds]) => failedIds.includes(c.id))
        .map(([solId]) => (sols.find(s => s.id === solId) || {}).name || '');
      knockoutHtml += `<tr><td style="font-weight:600">${esc(c.name)}</td><td style="color:#c00">${eliminated.length ? esc(eliminated.join(', ')) : '—'}</td></tr>`;
    });
    knockoutHtml += '</tbody></table>';
  }

  const printAnchorDefaults = t('anchorDefaults');
  const scaleLegend = `<div class="rating-scale">${[0, 1, 2, 3, 4].map(v =>
    `<span class="rs-item"><strong style="background:${rankRatingColors[v]}">${v}</strong> ${printAnchorDefaults[v]}</span>`
  ).join('')}</div>`;
  const hasCustomAnchors = criteria.some(c => [0, 1, 2, 3, 4].some(v => criteriaAnchors[`${c.id}|${v}`]));
  let anchorsHtml = `<h2>${t('printScoreDefinitions')}</h2>`;
  if (hasCustomAnchors) {
    // Per-criterion definitions. Custom values are shown in dark; criteria still
    // on the standard scale show the greyed defaults so differences stand out.
    anchorsHtml += '<table><thead><tr><th style="width:20%">' + t('printThCriterion') + '</th>';
    for (let v = 0; v <= 4; v++) anchorsHtml += `<th style="text-align:center"><span class="rs-num" style="background:${rankRatingColors[v]}">${v}</span></th>`;
    anchorsHtml += '</tr></thead><tbody>';
    orderedCriteria.forEach(c => {
      anchorsHtml += `<tr><td style="font-weight:600">${esc(c.name)}</td>`;
      for (let v = 0; v <= 4; v++) {
        const custom = criteriaAnchors[`${c.id}|${v}`];
        const label = custom ? `<span style="color:#333;font-weight:500">${esc(custom)}</span>` : `<span style="color:#bbb">${printAnchorDefaults[v]}</span>`;
        anchorsHtml += `<td style="font-size:0.78rem;text-align:center">${label}</td>`;
      }
      anchorsHtml += '</tr>';
    });
    anchorsHtml += '</tbody></table>';
  } else {
    // All criteria use the standard scale — one generic legend is enough.
    anchorsHtml += scaleLegend;
  }

  const date = new Date().toLocaleDateString();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Trade-Off Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Arial,sans-serif;padding:40px;color:#1a1a2e;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:1.4rem;font-weight:700;margin-bottom:4px}
h2{font-size:0.78rem;font-weight:600;color:#777;text-transform:uppercase;letter-spacing:.06em;margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid #eee}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #f4f4f4;font-size:0.85rem}
th{font-weight:600;color:#aaa;font-size:0.73rem;text-transform:uppercase;letter-spacing:.04em}
.bar-inline{display:flex;align-items:center;gap:8px}
.bar-wrap{height:5px;background:#f0f0f0;border-radius:4px;overflow:hidden;width:120px}
.bar{height:100%;border-radius:4px}
.bar-pct{font-size:0.78rem;color:#666;white-space:nowrap}
.legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:0.82rem}
.legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.be-row{display:flex;align-items:center;gap:12px;margin-bottom:32px}
.be-label{width:120px;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;flex-shrink:0}
.be-track-wrap{flex:1;position:relative;margin-top:18px;margin-bottom:18px}
.be-track{height:20px;display:flex;border-radius:4px;overflow:hidden}
.be-segment{height:100%}
.be-current{position:absolute;top:0;height:20px;width:2px;background:#333;border-radius:1px;transform:translateX(-50%)}
.be-committed{position:absolute;top:2px;height:16px;width:2px;background:#bbb;border-radius:1px;transform:translateX(-50%)}
.be-cur-label{position:absolute;top:-18px;transform:translateX(-50%);font-size:0.7rem;font-weight:700;color:#333;white-space:nowrap;background:#fff;padding:0 2px}
.be-tick{position:absolute;top:24px;transform:translateX(-50%);font-size:0.68rem;color:#888;white-space:nowrap}
.ri-sol-header{font-size:0.85rem;font-weight:600;margin:16px 0 4px}
.rating-scale{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:0.75rem;color:#555}
.rs-item{display:flex;align-items:center;gap:5px}
.rs-item strong,.rs-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;color:#1a1a2e;font-size:0.72rem;flex-shrink:0}
.vdi-svg{overflow:visible}
@media print{body{padding:20px}@page{margin:15mm}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:6px">
  <div><h1>${tradeName ? `${esc(tradeName)} <span style="font-size:.8rem;font-weight:400;color:#888">· DecisionLab v0.6</span>` : 'DecisionLab <span style="font-size:.8rem;font-weight:400;color:#888">v0.6</span>'}</h1></div>
  <div style="text-align:right;font-size:0.75rem;color:#888">${exporter ? `<div><strong>${t('exportedBy')}:</strong> ${esc(exporter)}</div>` : ''}<div>${t('printGenerated')(date)}</div></div>
</div>
${pairs.length ? `<h2>${t('printCriteriaComparisons')}</h2><table><tbody>${pairListRows}</tbody></table>` : ''}
<h2>${t('printCriteriaWeights')}</h2>
<table><thead><tr><th>${t('printThCriterion')}</th><th>${t('printThWeight')}</th><th></th></tr></thead><tbody>${criteriaRows}</tbody></table>
${customWeights ? `<h2>${t('printWeightAdjustments')}</h2><table><thead><tr><th>${t('printThCriterion')}</th><th>${t('printThPairwise')}</th><th>${t('printThAdjusted')}</th><th>${t('printThReason')}</th></tr></thead><tbody>${fineTuneRows}</tbody></table>` : ''}
${knockoutHtml}${anchorsHtml}
<h2>${t('printSolutionRanking')}</h2>
<table><thead><tr><th>${t('printThSolution')}</th><th>${t('printThScore')}</th><th></th>${solRankThds}</tr></thead><tbody>${solRows}</tbody></table>
${vdiHtml}
${teamHtml}
${(() => { const r = computeRobustness(); if (!r) return ''; const txt = r.stable ? t('robustnessStable')(esc(r.winner.name)) : t('robustnessFlip')(esc(r.challenger), esc(r.crit.name), Math.round(r.cur * 100), Math.round(r.bp * 100)); return `<p style="font-size:0.78rem;color:#777;margin:6px 0 0">${txt}</p>`; })()}
${proMode && sols.length >= 2 ? `<h2>${t('criterionImpact')}</h2>${sensHtml}<h2>${t('ratingImpact')}</h2>${ratingHtml}` : ''}
</body>
</html>`;
}

// ── Print ─────────────────────────────────────────────────────
byId('printBtn').onclick = () => {
  const win = window.open('', '_blank', 'width=860,height=700');
  win.document.write(generatePrintView(decisionName, bearbeiter || t('promptAnonymous')));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
};

const READONLY_CSS = '\n/* Read-only export */\n' +
  '[data-readonly] #criteriaInputSection,[data-readonly] .btn-remove,' +
  '[data-readonly] .pair-buttons,[data-readonly] #solutionList,[data-readonly] #addSolutionBtn,' +
  '[data-readonly] #proToggle,[data-readonly] .app-brand,[data-readonly] #helpBtn,' +
  '[data-readonly] #printBtn,[data-readonly] #undoBtn,[data-readonly] #redoBtn{display:none}\n' +
  // banner lives inside the sticky header; the lang toggle (sole remaining
  // toolbar control) overlays the banner's top-right, merging both rows
  '[data-readonly] .toolbar{position:absolute;top:10px;right:0;margin:0;padding:0}\n' +
  '[data-readonly] .rating-btn{pointer-events:none}\n' +
  '[data-readonly] #fileMenuWrap{display:none}\n' +
  '[data-readonly] .scenario-save-row{display:none}\n' +
  '[data-readonly] #resetFineBtn,[data-readonly] .sc-del,[data-readonly] .knockout-toggle{display:none}\n' +
  '[data-readonly] .eco-toggle{pointer-events:none}\n' +
  '[data-readonly] .team-load{display:none}\n' +
  '[data-readonly] .fine-tune-input,[data-readonly] .fine-tune-reason,[data-readonly] .fine-tune-bar,[data-readonly] .anchor-input,[data-readonly] .rating-note{pointer-events:none;opacity:.5}\n' +
  '.export-info{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:2px 80px 12px 0;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:6px}\n' +
  '.export-info-title{font-size:1.05rem;font-weight:700;color:#fff;letter-spacing:-.01em}\n' +
  '.export-info-title span{font-size:0.72rem;font-weight:400;color:rgba(255,255,255,.4);background:rgba(255,255,255,.08);padding:2px 8px;border-radius:20px;margin-left:8px;vertical-align:middle}\n' +
  '.export-info-meta{font-size:0.72rem;color:rgba(255,255,255,.4);display:flex;gap:16px}\n' +
  '.export-info-meta strong{color:rgba(255,255,255,.6)}\n';

// ── Scoping CSS for an embed ──────────────────────────────────
// The Confluence macro injects our stylesheet into the wiki page itself, not
// into an iframe, so every rule applies to the whole page. Unscoped, `body`
// repaints Confluence dark and `table`/`th`/`td`/`input[type=text]` restyle the
// host page's own tables and form fields — the editor's included.
//
// scopeCss() rewrites the sheet so nothing matches outside the wrapper:
//   - rules describing the document root (:root, html, body) BECOME the wrapper
//   - root hooks that live ON the wrapper in an embed merge with it
//   - everything else nests inside it
const EMBED_CLASS = 'dl-embed';
const EMBED_SCOPE = '.' + EMBED_CLASS;
// `pro-on` is toggled onto the app root and `data-readonly` marks an export;
// in an embed both sit on the wrapper, so they merge rather than nest.
const EMBED_ROOT_HOOKS = ['.pro-on', '[data-readonly]'];

// Split a selector list on top-level commas only, so :not(a,b) stays intact.
function splitSelectorList(list) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { out.push(list.slice(start, i)); start = i + 1; }
  }
  out.push(list.slice(start));
  return out;
}

function scopeSelector(sel, scope, rootHooks) {
  sel = sel.trim();
  if (!sel) return sel;
  // The document root itself becomes the wrapper.
  if (/^(:root|html|body)$/.test(sel)) return scope;
  // `body.pro-on x` / `html[data-readonly] x` — swap the root token for the wrapper.
  const attached = sel.match(/^(?::root|html|body)(?=[.:#[])/);
  if (attached) return scope + sel.slice(attached[0].length);
  const descendant = sel.match(/^(?::root|html|body)\s+/);
  if (descendant) return scope + ' ' + sel.slice(descendant[0].length);
  // Hooks carried by the wrapper merge with it. The trailing-combinator check
  // keeps `.pro-on` from also matching `.pro-online`.
  for (const hook of rootHooks) {
    if (sel === hook) return scope + hook;
    if (sel.slice(0, hook.length) === hook && /^[\s>+~]/.test(sel.slice(hook.length))) {
      return scope + hook + sel.slice(hook.length);
    }
  }
  return scope + ' ' + sel;
}

function scopeCss(css, scope, rootHooks) {
  scope = scope || EMBED_SCOPE;
  rootHooks = rootHooks || EMBED_ROOT_HOOKS;
  let out = '', i = 0;
  while (i < css.length) {
    if (css.slice(i, i + 2) === '/*') {           // drop comments
      const e = css.indexOf('*/', i + 2);
      i = e < 0 ? css.length : e + 2;
      continue;
    }
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports|container|layer)\b/i.test(prelude)) {
      out += prelude + '{' + scopeCss(body, scope, rootHooks) + '}';   // scope the rules inside
    } else if (prelude.charAt(0) === '@') {
      out += prelude + '{' + body + '}';                               // @keyframes/@font-face: leave alone
    } else {
      out += splitSelectorList(prelude).map(sel => scopeSelector(sel, scope, rootHooks)).join(',') + '{' + body + '}';
    }
    i = j;
  }
  return out;
}

// Rules an embed needs on top of the scoped sheet. Already scoped — appended
// after the transform, not put through it.
const EMBED_EXTRA_CSS =
  // A viewport-fixed overlay would cover the Confluence chrome. Read-only
  // builds hide the help button so it cannot be opened; this is belt and braces.
  EMBED_SCOPE + ' .help-overlay{display:none}' +
  // A sticky header would detach and float over the wiki content as the reader
  // scrolls past the embed. `relative` rather than `static` keeps it as the
  // containing block for the read-only toolbar's absolute positioning.
  EMBED_SCOPE + ' .app-header{position:relative}' +
  // Our z-indexes (up to 100) must not compete with the host page's layers.
  EMBED_SCOPE + '{isolation:isolate}';

// The complete stylesheet for an embed: app sheet + read-only rules, scoped.
function embedCss(styleText) {
  return scopeCss(styleText + READONLY_CSS, EMBED_SCOPE, EMBED_ROOT_HOOKS) + EMBED_EXTRA_CSS;
}

// ── Baking state into an export ───────────────────────────────
// Replaces the auto-load block of a captured script with one that carries the
// exported decision. Standalone exports still prefer the viewer's own saved
// session, so re-opening a file they have explored shows their work. Embedded
// builds have no session of their own — see the storage note in state.js — so
// they set `embedded` before anything can touch storage and render the baked
// state only.
const AUTOLOAD_START = '// Auto-load saved session';
const AUTOLOAD_END = '// END Auto-load';

function bakedAutoLoad(stateJson, embed) {
  const body = embed
    ? 'embedded = true;\ntry { applyState(' + stateJson + '); } catch (e) {}\n'
    : 'try {\n  const _s = lsGet(STORAGE_KEY);\n  applyState(_s ? JSON.parse(_s) : ' + stateJson + ');\n} catch (e) { try { applyState(' + stateJson + '); } catch (_) {} }\n';
  return AUTOLOAD_START + '\n' + body + AUTOLOAD_END;
}

function bakeScript(scriptText, stateJson, embed) {
  // lastIndexOf: find the real auto-load block at the end of the bundle, not
  // the sentinel occurrences inside this module's own string literals.
  const si = scriptText.lastIndexOf(AUTOLOAD_START);
  const ei = scriptText.indexOf(AUTOLOAD_END, si) + AUTOLOAD_END.length;
  return scriptText.slice(0, si) + bakedAutoLoad(stateJson, embed) + scriptText.slice(ei);
}

// ── Assembling an embed script ────────────────────────────────
const CAPTURE_START = '// Capture preamble';
const CAPTURE_END = '// END Capture preamble';

// The capture preamble lets a built file re-export itself: it grabs the script
// text, the stylesheet and the body markup at load. Inside a Confluence page
// those reads would take the HOST page's first <style> and its body instead of
// ours, and an embed cannot re-export itself anyway — so it is cut out.
function stripCapturePreamble(scriptText) {
  const si = scriptText.indexOf(CAPTURE_START);
  if (si < 0) return scriptText;
  const ei = scriptText.indexOf(CAPTURE_END, si) + CAPTURE_END.length;
  return scriptText.slice(0, si) + scriptText.slice(ei);
}

// Each embed gets its own wrapper id so two on one page stay apart.
function newEmbedId() {
  return 'dl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A complete embed script, as plain source. The IIFE keeps every binding —
// `lang`, `ratings`, `t`, `esc`, … — out of the wiki page's scope, where they
// would collide with Confluence's own code and, fatally, with a second embed
// redeclaring them. `_embedRoot` is read by dom.js as it initialises, so every
// lookup from then on resolves inside this instance's wrapper. currentScript is
// preferred, so even two copies of the same export work; the id is the fallback
// for a macro rendered after parse, when currentScript is null.
function embedScriptSource(scriptText, stateJson, rootId) {
  return '(function(){\n'
    + 'var _embedRoot=(document.currentScript&&document.currentScript.closest('
    + JSON.stringify(EMBED_SCOPE) + '))||document.getElementById(' + JSON.stringify(rootId) + ');\n'
    + bakeScript(stripCapturePreamble(scriptText), stateJson, true)
    + '\n})();';
}

// UTF-8 safe base64: btoa is Latin-1 only and the app carries umlauts and
// symbols (⚡ ✓ ⊗ ›), so encode to bytes first. Chunked because
// String.fromCharCode.apply blows the argument limit on a 100 KB array.
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// Confluence content filters parse a macro body as HTML and strip markup out of
// the script text. Our bundle is full of markup — every <div>, <td> and
// style="…" the app writes — so a filter silently deletes thousands of
// characters from the middle of the script, leaving an intact-looking start and
// end around syntactically broken code. Base64 gives it nothing to react to: no
// <, no &, no CDATA terminator. new Function scopes the decoded source and runs
// synchronously, so document.currentScript is still valid inside it.
function embedScript(scriptText, stateJson, rootId) {
  const b64 = toBase64Utf8(embedScriptSource(scriptText, stateJson, rootId));
  return 'new Function(new TextDecoder().decode(Uint8Array.from(atob('
    + JSON.stringify(b64) + '),c=>c.charCodeAt(0))))();';
}

// Provenance line shown at the top of every export. On a wiki page this
// matters more than in a downloaded file, not less — a reader needs to know
// whose decision this is and how old it is.
function exportInfoBanner(tradeName, exporter) {
  const exportedAt = new Date().toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const tradeLabel = tradeName ? `<span style="color:#fff;font-size:.95rem;font-weight:600">${esc(tradeName)}</span> · ` : '';
  return `<div class="export-info"><div class="export-info-title">${tradeLabel}DecisionLab<span>v0.6</span></div><div class="export-info-meta"><span><strong>${t('exportedBy')}:</strong> ${esc(exporter)}</span><span><strong>${t('exportedDate')}:</strong> ${exportedAt}</span></div></div>\n`;
}

// ── Confluence embed ──────────────────────────────────────────
// One macro body: wrapper, scoped stylesheet, app markup, and an isolated
// script carrying the decision. Paste into an {html-bobswift} macro with
// sanitize=false — a sanitising macro strips the script, and because the markup
// is an empty template rendered at load, the page would show an empty box.
//
// Built by concatenation rather than as a second build artifact: the pieces are
// the same script/style/markup the HTML export already captures at load.

// Confluence stores a macro body inside <![CDATA[ … ]]>, so this sequence
// anywhere in the payload truncates the macro and corrupts the page. Split so
// this file never contains it either.
const CDATA_CLOSE = ']]' + '>';

function buildEmbedPayload() {
  const exporter = bearbeiter || t('promptAnonymous');
  const rootId = newEmbedId();
  // A decision whose text contains the CDATA terminator is escaped rather than
  // rejected: inside the JS string literals of the baked state, `\u003e` is the
  // same character. (In JSON that sequence can only occur inside a string.)
  const state = JSON.stringify(buildState()).split(CDATA_CLOSE).join(']]\\u003e');
  const markup = _bodyHtml.replace('<div class="app-header">',
    '<div class="app-header">\n' + exportInfoBanner(decisionName, exporter));

  const payload = '<div class="' + EMBED_CLASS + '" id="' + rootId + '" data-readonly lang="' + lang + '">\n'
    + '<style>' + embedCss(_styleText) + '</style>\n'
    + markup + '\n'
    + '<script>' + embedScript(_scriptText, state, rootId) + '<\/script>\n'
    + '</div>';

  // Last line of defence: the sequence can also arise from minified code or a
  // selector like `[a][b]>c`. Refusing beats silently truncating someone's page.
  if (payload.indexOf(CDATA_CLOSE) >= 0) throw new Error(t('alertEmbedCdata'));
  return payload;
}

// Plain text: the target is a macro body, so rich clipboard formats are
// irrelevant and writeText is the widest-supported path. execCommand covers
// contexts where the async API is unavailable (file://, older browsers).
function copyPlainText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) resolve(); else reject(new Error('copy unavailable'));
  });
}

function downloadText(text, name, type) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type })),
    download: name,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// The file menu closes on any click, so confirmation goes on the toolbar
// button that stays visible. A silent clipboard write looks like a no-op.
function flashLabel(el, msg) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = msg;
  setTimeout(() => { el.textContent = prev; }, 2200);
}

byId('exportConfluenceBtn').onclick = () => {
  // Assembled from the script, style and markup captured at load — which only
  // the built file has.
  if (typeof _scriptText === 'undefined') { alert(t('alertEmbedDevMode')); return; }
  let payload;
  try { payload = buildEmbedPayload(); }
  catch (e) { alert((e && e.message) || t('alertEmbedFailed')); return; }

  const fileName = (decisionName ? decisionName.replace(/[^a-z0-9äöüß\-_ ]/gi, '').trim() + ' – ' : '')
    + 'DecisionLab (Confluence).html';
  copyPlainText(payload)
    .then(() => flashLabel(byId('fileMenuBtn'), t('embedCopied')))
    .catch(() => { downloadText(payload, fileName, 'text/html'); alert(t('alertEmbedDownloaded')); });
};

// ── HTML Export ───────────────────────────────────────────────
byId('exportHtmlBtn').onclick = () => {
  // An embed has no capture preamble to re-export from, and its menu is hidden.
  if (embedded) return;
  const tradeName = decisionName;
  const exporter = bearbeiter || t('promptAnonymous');

  const state = JSON.stringify(buildState());

  const bakedScript = bakeScript(_scriptText, state, false);



  const infoBanner = exportInfoBanner(tradeName, exporter);
  const pageTitle = tradeName ? `${esc(tradeName)} – DecisionLab` : 'DecisionLab';

  const out = '<!DOCTYPE html>\n<html data-readonly lang="' + lang + '">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + pageTitle + '</title>\n' +
    '<style>\n' + _styleText + READONLY_CSS + '</style>\n</head>\n<body>\n' +
    _bodyHtml.replace('<div class="app-header">', '<div class="app-header">\n' + infoBanner) +
    '\n<script>\n' + bakedScript + '\n<\/script>\n</body>\n</html>';

  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([out], { type: 'text/html' })),
    download: (decisionName ? decisionName.replace(/[^a-z0-9äöüß\-_ ]/gi, '').trim() + ' – ' : '') + 'DecisionLab.html',
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

// ── JSON Save / Load ──────────────────────────────────────────
byId('exportBtn').onclick = () => {
  const data = JSON.stringify(buildState(), null, 2);
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
    download: (decisionName ? decisionName.replace(/[^a-z0-9äöüß\-_ ]/gi, '').trim() + ' – ' : '') + 'DecisionLab.json',
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

// ── CSV Export ────────────────────────────────────────────────
// Decision matrix for spreadsheets: criteria rows (weight + rating per
// solution), then score and rank. German locale gets ';' and decimal commas.
byId('exportCsvBtn').onclick = () => {
  const sols = getSolutions();
  const ordered = criteriaByWeight();
  const weights = computeWeights();
  const sep = lang === 'de' ? ';' : ',';
  const num = n => lang === 'de' ? n.toFixed(2).replace('.', ',') : n.toFixed(2);
  const q = v => {
    v = String(v);
    return (v.includes(sep) || v.includes('"') || v.includes('\n')) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };

  const rows = [];
  rows.push([t('thCriterion'), t('thWeight'), ...sols.map(s => s.name)]);
  ordered.forEach(c => {
    rows.push([c.name, num((weights[c.id] ?? 0) * 100) + '%', ...sols.map(s => ratings[`${s.id}|${c.id}`] ?? 0)]);
  });
  const ranked = scoreSolutions(weights);
  const ko = getKnockedOut();
  const alive = ranked.filter(r => !ko[r.sol.id]);
  rows.push([]);
  rows.push([t('thScore'), '', ...sols.map(s => num(ranked.find(r => r.sol.id === s.id).score))]);
  rows.push([t('csvRank'), '', ...sols.map(s => {
    const i = alive.findIndex(r => r.sol.id === s.id);
    return i >= 0 ? '#' + (i + 1) : `${t('knockedOut')}: ${ko[s.id].map(critName).join(' + ')}`;
  })]);
  const vdi = computeVdi();
  if (vdi) {
    rows.push(['Wt', '', ...sols.map(s => num(vdi.find(v => v.sol.id === s.id).wt))]);
    rows.push(['We', '', ...sols.map(s => num(vdi.find(v => v.sol.id === s.id).we))]);
    rows.push(['s', '', ...sols.map(s => num(vdi.find(v => v.sol.id === s.id).s))]);
  }

  const csv = '\ufeff' + rows.map(r => r.map(q).join(sep)).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
    download: (decisionName ? decisionName.replace(/[^a-z0-9äöüß\-_ ]/gi, '').trim() + ' – ' : '') + 'DecisionLab.csv',
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

byId('importInput').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      if (!applyState(JSON.parse(ev.target.result))) alert(t('alertInvalidFile'));
    }
    catch { alert(t('alertInvalidFile')); }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// ── Help overlay ──────────────────────────────────────────────
const helpOverlay = byId('helpOverlay');
byId('helpBtn').onclick = () => helpOverlay.classList.remove('hidden');
byId('helpClose').onclick = () => helpOverlay.classList.add('hidden');
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) helpOverlay.classList.add('hidden'); });
onGlobal('keydown', e => { if (e.key === 'Escape') helpOverlay.classList.add('hidden'); });

// ── New session ───────────────────────────────────────────────
byId('newBtn').onclick = () => {
  // An embed has no session to clear and must never reload the wiki page.
  if (embedded) return;
  if (!confirm(t('confirmNewSession'))) return;
  lsRemove(STORAGE_KEY);
  location.reload();
};
