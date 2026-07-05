function applyProMode() {
  proToggle.classList.toggle('active', proMode);
  document.body.classList.toggle('pro-on', proMode);
  sensitivityTab.style.display = proMode ? '' : 'none';
  if (comparisonStarted) {
    fineTuneSection.classList.toggle('active', proMode);
  }
  if (!proMode && sensitivityTab.classList.contains('active')) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="criteria"]').classList.add('active');
    document.getElementById('tab-criteria').classList.add('active');
  }
  if (comparisonStarted) renderSolutionMatrix();
}

document.getElementById('decisionNameInput').oninput = e => { decisionName = e.target.value; saveState(); };
document.getElementById('bearbeiterInput').oninput = e => { bearbeiter = e.target.value; saveState(); };

proToggle.onclick = () => {
  proMode = !proMode;
  applyProMode();
  saveState();
};

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    if (btn.classList.contains('disabled')) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'solutions') renderSolutionMatrix();
    if (btn.dataset.tab === 'sensitivity') { updateSensRanking(); updateSensImpact(); updateRatingImpact(); }
  };
});

updateTabState();

// Undo / Redo
document.getElementById('undoBtn').onclick = () => undoState();
document.getElementById('redoBtn').onclick = () => redoState();
document.addEventListener('keydown', e => {
  const tag = ((e.target && e.target.tagName) || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return; // keep native text-field undo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undoState(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redoState(); }
});

// Auto-load saved session
historyLock = true;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved || !applyState(JSON.parse(saved))) {
    // Fresh session (or incompatible old save) — clear fields the browser
    // may have restored on reload
    decisionName = ''; bearbeiter = '';
    document.getElementById('decisionNameInput').value = '';
    document.getElementById('bearbeiterInput').value = '';
    applyProMode();
    applyLang();
  }
} catch (e) { applyProMode(); applyLang(); }
historyLock = false;
saveState(); // baseline snapshot for undo
// END Auto-load
