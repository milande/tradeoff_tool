let lang = 'en';

const STRINGS = { en: EN, de: DE };

// Escape user-entered text for interpolation into HTML (element and attribute context)
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function t(key) {
  const s = STRINGS[lang];
  const v = (s && s[key] !== undefined) ? s[key] : STRINGS.en[key];
  return v !== undefined ? v : key;
}

function applyLang() {
  qsa('[data-i18n]').forEach(el => {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string') el.textContent = v;
  });
  qsa('[data-i18n-html]').forEach(el => {
    const v = t(el.dataset.i18nHtml);
    if (typeof v === 'string') el.innerHTML = v;
  });
  qsa('[data-i18n-placeholder]').forEach(el => {
    const v = t(el.dataset.i18nPlaceholder);
    if (typeof v === 'string') el.placeholder = v;
  });
  qsa('[data-i18n-title]').forEach(el => {
    const v = t(el.dataset.i18nTitle);
    if (typeof v === 'string') el.title = v;
  });
  // The toggle shows the ACTIVE language; the tooltip names the switch target
  const langBtn = byId('langToggle');
  langBtn.textContent = lang.toUpperCase();
  langBtn.title = lang === 'en' ? 'Auf Deutsch umschalten' : 'Switch to English';
  updateThemeLabel();
  // Language is a user preference that survives "New decision"
  lsSet('dl_lang', lang);
  qsa('#criteriaList input').forEach((i, idx) => i.placeholder = `${t('criterionDefault')} ${idx + 1}`);
  qsa('#solutionList input:not(.sol-note)').forEach(i => i.placeholder = t('solutionPlaceholder'));
  qsa('#solutionList input.sol-note').forEach(i => i.placeholder = t('solutionNotePlaceholder'));
  if (comparisonStarted) renderPairs();
  renderFineTune();
  renderSolutionMatrix();
  updateSensImpact(); updateRatingImpact();
}

byId('langToggle').onclick = () => {
  lang = lang === 'en' ? 'de' : 'en';
  applyLang();
  saveState();
};
