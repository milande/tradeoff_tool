function applyProMode() {
  proToggle.classList.toggle('active', proMode);
  appRootEl.classList.toggle('pro-on', proMode);
  sensitivityTab.style.display = proMode ? '' : 'none';
  if (comparisonStarted) {
    fineTuneSection.classList.toggle('active', proMode);
  }
  if (!proMode && sensitivityTab.classList.contains('active')) {
    qsa('.tab-btn').forEach(b => b.classList.remove('active'));
    qsa('.tab-content').forEach(t => t.classList.remove('active'));
    qs('.tab-btn[data-tab="criteria"]').classList.add('active');
    byId('tab-criteria').classList.add('active');
  }
  if (comparisonStarted) renderSolutionMatrix();
}

byId('decisionNameInput').oninput = e => { decisionName = e.target.value; saveState(); };
byId('bearbeiterInput').oninput = e => { bearbeiter = e.target.value; saveState(); };

proToggle.onclick = () => {
  proMode = !proMode;
  applyProMode();
  saveState();
};

// ── Tab switching ─────────────────────────────────────────────
qsa('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    if (btn.classList.contains('disabled')) return;
    qsa('.tab-btn').forEach(b => b.classList.remove('active'));
    qsa('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    byId(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'solutions') renderSolutionMatrix();
    if (btn.dataset.tab === 'sensitivity') { updateSensRanking(); updateSensImpact(); updateRatingImpact(); }
    // Always show the freshly opened page from the top
    // An embed must not scroll the wiki page it sits in.
    if (!embedded && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
  };
});

updateTabState();

// File menu
(function setupFileMenu() {
  const menu = byId('fileMenu');
  byId('fileMenuBtn').onclick = e => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  };
  // any chosen action closes the menu; clicks outside or Escape close it too
  menu.addEventListener('click', e => {
    if (e.target.closest('button, label')) menu.classList.add('hidden');
  });
  onGlobal('click', e => {
    if (!e.target.closest('#fileMenuWrap')) menu.classList.add('hidden');
  });
  onGlobal('keydown', e => {
    if (e.key === 'Escape') menu.classList.add('hidden');
  });
}());

// Undo / Redo
byId('undoBtn').onclick = () => undoState();
byId('redoBtn').onclick = () => redoState();
onGlobal('keydown', e => {
  const tag = ((e.target && e.target.tagName) || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return; // keep native text-field undo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undoState(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redoState(); }
});

// Auto-load saved session
historyLock = true;
try {
  const saved = lsGet(STORAGE_KEY);
  if (!saved || !applyState(JSON.parse(saved))) {
    // Fresh session (or incompatible old save) — clear fields the browser
    // may have restored on reload, but keep the language preference
    decisionName = ''; bearbeiter = '';
    byId('decisionNameInput').value = '';
    byId('bearbeiterInput').value = '';
    lang = lsGet('dl_lang') || lang;
    applyProMode();
    applyLang();
  }
} catch (e) { applyProMode(); applyLang(); }
historyLock = false;
saveState(); // baseline snapshot for undo
// END Auto-load
