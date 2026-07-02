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
  criteria.forEach(c => pairwiseWeights[c] = totalPts > 0 ? scores[c] / totalPts : 1 / criteria.length);

  const criteriaRows = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([c, p]) => {
      const pct = totalPts > 0 ? (100 * p / totalPts).toFixed(1) : '0.0';
      return `<tr><td>${c}</td><td>${pct}%</td><td><div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${CYAN}"></div></div></td></tr>`;
    }).join('');

  const orderedCriteria = criteriaByWeight();
  const fineTuneRows = customWeights ? orderedCriteria.map(c => {
    const custom = (weights[c] * 100).toFixed(1);
    const pairwise = (pairwiseWeights[c] * 100).toFixed(1);
    const reason = customWeightReasons[c] || '';
    const changed = Math.abs(parseFloat(custom) - parseFloat(pairwise)) > 0.05;
    return `<tr>
      <td>${c}</td>
      <td style="color:#888">${pairwise}%</td>
      <td style="font-weight:${changed ? '600' : '400'}">${custom}%</td>
      <td style="color:#666;font-style:italic">${reason}</td>
    </tr>`;
  }).join('') : '';

  const rankRatingColors = ['#f1f5f9', '#fde68a', '#86efac', '#4ade80', '#16a34a'];
  const solRankThds = orderedCriteria.map(c => `<th title="${c}">${c}</th>`).join('');
  const solRows = rankedOrdered.map(({ sol, score }) => {
    const isKO = !!koSols[sol];
    const pct = Math.min(100, (score / 4) * 100).toFixed(1);
    const color = SOL_COLORS[sols.indexOf(sol) % SOL_COLORS.length];
    const ratingCells = orderedCriteria.map(c => {
      const v = ratings[`${sol}|${c}`] ?? 0;
      const rn = ratingNotes[`${sol}|${c}`];
      const noteHtml = rn ? `<div style="font-size:0.65rem;color:#666;font-style:italic;margin-top:2px;line-height:1.2">${rn}</div>` : '';
      return `<td style="text-align:center;background:${rankRatingColors[v]};color:#1a1a2e;font-size:0.8rem;vertical-align:top"><div>${v}</div>${noteHtml}</td>`;
    }).join('');
    const note = solutionNotes[sol] ? `<div style="font-size:0.72rem;color:#888;font-style:italic;font-weight:400;margin-top:2px">${solutionNotes[sol]}</div>` : '';
    const koReason = isKO ? `<div style="font-size:0.65rem;color:#c00;font-style:italic;margin-top:2px">${t('knockedOut')}: ${koSols[sol].join(', ')}</div>` : '';
    // Strike only name and score — the KO reason and notes must stay readable
    const strike = isKO ? 'text-decoration:line-through;' : '';
    const rowStyle = isKO ? ' style="opacity:.55"' : '';
    return `<tr${rowStyle}><td style="color:${color};font-weight:600"><div style="${strike}">${sol}</div>${note}${koReason}</td><td style="${strike}">${score.toFixed(2)}</td><td><div class="bar-inline"><div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${color}"></div></div><span class="bar-pct">${pct}%</span></div></td>${ratingCells}</tr>`;
  }).join('');

  const pairListRows = pairs.map(([a, b]) => {
    const state = pairStates[`${a}|${b}`] ?? 0;
    let left, mid, right;
    if (state === -1)     { left = `<strong>${a}</strong>`; mid = '›'; right = b; }
    else if (state === 1) { left = a; mid = '‹'; right = `<strong>${b}</strong>`; }
    else                  { left = a; mid = '='; right = b; }
    return `<tr><td>${left}</td><td style="text-align:center;color:#aaa;font-weight:700;padding:7px 6px">${mid}</td><td>${right}</td></tr>`;
  }).join('');

  function printLegend(solList) {
    return '<div class="legend">' + solList.map((sol, i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${SOL_COLORS[i % SOL_COLORS.length]}"></span>${sol}</span>`
    ).join('') + '</div>';
  }

  let sensHtml = '';
  if (proMode && sols.length >= 2) {
    sensHtml += printLegend(sols);
    orderedCriteria.forEach(C => {
      const segs = computeBreakevens(C, sols);
      const curPct = ((sensWeights[C] ?? 0) * 100).toFixed(2);
      sensHtml += `<div class="be-row"><span class="be-label" title="${C}">${C}</span><div class="be-track-wrap"><div class="be-track">`;
      segs.forEach(seg => {
        const w = ((seg.to - seg.from) * 100).toFixed(3);
        sensHtml += `<div class="be-segment" style="width:${w}%;${segmentBg(seg.sol, sols)}"></div>`;
      });
      sensHtml += `</div>`;
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
      ratingHtml += `<div class="ri-sol-header" style="color:${solColor}">${sol}</div>`;
      orderedCriteria.forEach(C => {
        const segs = computeRatingBreakevens(sol, C, sols, sensWeights);
        const cur = ((explorationRatings[`${sol}|${C}`] ?? 0) / 4 * 100).toFixed(2);
        ratingHtml += `<div class="be-row"><span class="be-label" title="${C}">${C}</span><div class="be-track-wrap"><div class="be-track">`;
        segs.forEach(seg => {
          const w = ((seg.to - seg.from) * 100).toFixed(3);
          ratingHtml += `<div class="be-segment" style="width:${w}%;${segmentBg(seg.winner, sols)}"></div>`;
        });
        ratingHtml += `</div><div class="be-current" style="left:${cur}%"></div>`;
        for (let i = 0; i <= 4; i++) ratingHtml += `<div class="be-tick" style="left:${i * 25}%">${i}</div>`;
        ratingHtml += `</div></div>`;
      });
    });
  }

  const koActive = orderedCriteria.filter(c => knockoutCriteria[c]);
  let knockoutHtml = '';
  if (koActive.length > 0) {
    knockoutHtml = `<h2>${t('printKnockoutCriteria')}</h2><table><thead><tr><th>${t('printThCriterion')}</th><th>${t('printThSolution')}</th></tr></thead><tbody>`;
    koActive.forEach(c => {
      const eliminated = Object.entries(koSols).filter(([, fc]) => fc.includes(c)).map(([s]) => s);
      knockoutHtml += `<tr><td style="font-weight:600">${c}</td><td style="color:#c00">${eliminated.length ? eliminated.join(', ') : '—'}</td></tr>`;
    });
    knockoutHtml += '</tbody></table>';
  }

  const printAnchorDefaults = t('anchorDefaults');
  const scaleLegend = `<div class="rating-scale">${[0, 1, 2, 3, 4].map(v =>
    `<span class="rs-item"><strong style="background:${rankRatingColors[v]}">${v}</strong> ${printAnchorDefaults[v]}</span>`
  ).join('')}</div>`;
  const hasCustomAnchors = criteria.some(c => [0, 1, 2, 3, 4].some(v => criteriaAnchors[`${c}|${v}`]));
  let anchorsHtml = `<h2>${t('printScoreDefinitions')}</h2>`;
  if (hasCustomAnchors) {
    // Per-criterion definitions. Custom values are shown in dark; criteria still
    // on the standard scale show the greyed defaults so differences stand out.
    anchorsHtml += '<table><thead><tr><th style="width:20%">' + t('printThCriterion') + '</th>';
    for (let v = 0; v <= 4; v++) anchorsHtml += `<th style="text-align:center"><span class="rs-num" style="background:${rankRatingColors[v]}">${v}</span></th>`;
    anchorsHtml += '</tr></thead><tbody>';
    orderedCriteria.forEach(c => {
      anchorsHtml += `<tr><td style="font-weight:600">${c}</td>`;
      for (let v = 0; v <= 4; v++) {
        const custom = criteriaAnchors[`${c}|${v}`];
        const label = custom ? `<span style="color:#333;font-weight:500">${custom}</span>` : `<span style="color:#bbb">${printAnchorDefaults[v]}</span>`;
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
.meta{color:#888;font-size:0.8rem;margin-bottom:32px}
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
.be-cur-label{position:absolute;top:-18px;transform:translateX(-50%);font-size:0.7rem;font-weight:700;color:#333;white-space:nowrap;background:#fff;padding:0 2px}
.be-tick{position:absolute;top:24px;transform:translateX(-50%);font-size:0.68rem;color:#888;white-space:nowrap}
.ri-sol-header{font-size:0.85rem;font-weight:600;margin:16px 0 4px}
.rating-scale{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:0.75rem;color:#555}
.rs-item{display:flex;align-items:center;gap:5px}
.rs-item strong,.rs-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;color:#1a1a2e;font-size:0.72rem;flex-shrink:0}
@media print{body{padding:20px}@page{margin:15mm}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:6px">
  <div><h1>${tradeName ? `${tradeName} <span style="font-size:.8rem;font-weight:400;color:#888">· DecisionLab v0.4</span>` : 'DecisionLab <span style="font-size:.8rem;font-weight:400;color:#888">v0.4</span>'}</h1></div>
  <div style="text-align:right;font-size:0.75rem;color:#888">${exporter ? `<div><strong>${t('exportedBy')}:</strong> ${exporter}</div>` : ''}<div>${t('printGenerated')(date)}</div></div>
</div>
${pairs.length ? `<h2>${t('printCriteriaComparisons')}</h2><table><tbody>${pairListRows}</tbody></table>` : ''}
<h2>${t('printCriteriaWeights')}</h2>
<table><thead><tr><th>${t('printThCriterion')}</th><th>${t('printThWeight')}</th><th></th></tr></thead><tbody>${criteriaRows}</tbody></table>
${customWeights ? `<h2>${t('printWeightAdjustments')}</h2><table><thead><tr><th>${t('printThCriterion')}</th><th>${t('printThPairwise')}</th><th>${t('printThAdjusted')}</th><th>${t('printThReason')}</th></tr></thead><tbody>${fineTuneRows}</tbody></table>` : ''}
${knockoutHtml}${anchorsHtml}
<h2>${t('printSolutionRanking')}</h2>
<table><thead><tr><th>${t('printThSolution')}</th><th>${t('printThScore')}</th><th></th>${solRankThds}</tr></thead><tbody>${solRows}</tbody></table>
${proMode && sols.length >= 2 ? `<h2>${t('criterionImpact')}</h2>${sensHtml}<h2>${t('ratingImpact')}</h2>${ratingHtml}` : ''}
</body>
</html>`;
}

// ── Print ─────────────────────────────────────────────────────
document.getElementById('printBtn').onclick = () => {
  const win = window.open('', '_blank', 'width=860,height=700');
  win.document.write(generatePrintView(decisionName, bearbeiter || t('promptAnonymous')));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
};

// ── HTML Export ───────────────────────────────────────────────
document.getElementById('exportHtmlBtn').onclick = () => {
  const tradeName = decisionName;
  const exporter = bearbeiter || t('promptAnonymous');
  const exportedAt = new Date().toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const state = JSON.stringify({
    version: 1, decisionName, bearbeiter, criteria: getCriteria(), pairStates, customWeights, customWeightReasons, proMode, lang, solutions: getSolutions(), ratings, ratingNotes, criteriaAnchors, knockoutCriteria, solutionNotes, scenarios, sensWeights, explorationRatings,
  });

  // Use lastIndexOf so we always find the actual auto-load block at the end of the file,
  // not an earlier occurrence of the sentinel inside the replacement template string.
  const S = '// Auto-load saved session';
  const E = '// END Auto-load';
  const si = _scriptText.lastIndexOf(S);
  const ei = _scriptText.indexOf(E, si) + E.length;
  const newBlock = S + '\ntry {\n  const _s = localStorage.getItem(STORAGE_KEY);\n  applyState(_s ? JSON.parse(_s) : ' + state + ');\n} catch (e) { try { applyState(' + state + '); } catch (_) {} }\n' + E;
  const bakedScript = _scriptText.slice(0, si) + newBlock + _scriptText.slice(ei);

  const readOnlyCss = '\n/* Read-only export */\n' +
    '[data-readonly] #criteriaInputSection,[data-readonly] .btn-remove,' +
    '[data-readonly] .pair-buttons,[data-readonly] #solutionList,[data-readonly] #addSolutionBtn,' +
    '[data-readonly] #proToggle,[data-readonly] .app-brand,[data-readonly] #helpBtn,' +
    '[data-readonly] #printBtn,[data-readonly] #newBtn,[data-readonly] #exportHtmlBtn,' +
    '[data-readonly] #exportBtn,[data-readonly] label.btn-toolbar{display:none}\n' +
    '[data-readonly] .toolbar{justify-content:flex-end;margin-bottom:0}\n' +
    '[data-readonly] .rating-btn{pointer-events:none}\n' +
    '[data-readonly] .project-header{display:none}\n' +
    '[data-readonly] .scenario-save-row{display:none}\n' +
    '[data-readonly] #resetFineBtn,[data-readonly] .sc-del,[data-readonly] .knockout-toggle{display:none}\n' +
    '[data-readonly] .fine-tune-input,[data-readonly] .fine-tune-reason,[data-readonly] .anchor-input,[data-readonly] .rating-note{pointer-events:none;opacity:.5}\n' +
    '.export-info{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:14px 0 18px;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:24px}\n' +
    '.export-info-title{font-size:1.05rem;font-weight:700;color:#fff;letter-spacing:-.01em}\n' +
    '.export-info-title span{font-size:0.72rem;font-weight:400;color:rgba(255,255,255,.4);background:rgba(255,255,255,.08);padding:2px 8px;border-radius:20px;margin-left:8px;vertical-align:middle}\n' +
    '.export-info-meta{font-size:0.72rem;color:rgba(255,255,255,.4);display:flex;gap:16px}\n' +
    '.export-info-meta strong{color:rgba(255,255,255,.6)}\n';

  const tradeLabel = tradeName ? `<span style="color:#fff;font-size:.95rem;font-weight:600">${tradeName}</span> · ` : '';
  const infoBanner = `<div class="export-info"><div class="export-info-title">${tradeLabel}DecisionLab<span>v0.4</span></div><div class="export-info-meta"><span><strong>${t('exportedBy')}:</strong> ${exporter}</span><span><strong>${t('exportedDate')}:</strong> ${exportedAt}</span></div></div>\n`;
  const pageTitle = tradeName ? `${tradeName} – DecisionLab` : 'DecisionLab';

  const out = '<!DOCTYPE html>\n<html data-readonly lang="' + lang + '">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + pageTitle + '</title>\n' +
    '<style>\n' + _styleText + readOnlyCss + '</style>\n</head>\n<body>\n' +
    _bodyHtml.replace('<div class="container">', '<div class="container">\n' + infoBanner) +
    '\n<script>\n' + bakedScript + '\n<\/script>\n</body>\n</html>';

  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([out], { type: 'text/html' })),
    download: (decisionName ? decisionName.replace(/[^a-z0-9äöüß\-_ ]/gi, '').trim() + ' – ' : '') + 'DecisionLab.html',
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

// ── JSON Save / Load ──────────────────────────────────────────
document.getElementById('exportBtn').onclick = () => {
  const data = JSON.stringify({ version: 1, decisionName, bearbeiter, criteria: getCriteria(), pairStates, customWeights, customWeightReasons, proMode, lang, solutions: getSolutions(), ratings, ratingNotes, criteriaAnchors, knockoutCriteria, solutionNotes, scenarios, sensWeights, explorationRatings }, null, 2);
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
    download: (decisionName ? decisionName.replace(/[^a-z0-9äöüß\-_ ]/gi, '').trim() + ' – ' : '') + 'DecisionLab.json',
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById('importInput').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { applyState(JSON.parse(ev.target.result)); }
    catch { alert(t('alertInvalidFile')); }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// ── Help overlay ──────────────────────────────────────────────
const helpOverlay = document.getElementById('helpOverlay');
document.getElementById('helpBtn').onclick = () => helpOverlay.classList.remove('hidden');
document.getElementById('helpClose').onclick = () => helpOverlay.classList.add('hidden');
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) helpOverlay.classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') helpOverlay.classList.add('hidden'); });

// ── New session ───────────────────────────────────────────────
document.getElementById('newBtn').onclick = () => {
  if (!confirm(t('confirmNewSession'))) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
};
