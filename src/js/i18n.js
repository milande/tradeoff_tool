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
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const v = t(el.dataset.i18nHtml);
    if (typeof v === 'string') el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const v = t(el.dataset.i18nPlaceholder);
    if (typeof v === 'string') el.placeholder = v;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const v = t(el.dataset.i18nTitle);
    if (typeof v === 'string') el.title = v;
  });
  document.getElementById('langToggle').textContent = lang === 'en' ? 'DE' : 'EN';
  document.querySelectorAll('#criteriaList input').forEach((i, idx) => i.placeholder = `${t('criterionDefault')} ${idx + 1}`);
  document.querySelectorAll('#solutionList input:not(.sol-note)').forEach(i => i.placeholder = t('solutionPlaceholder'));
  document.querySelectorAll('#solutionList input.sol-note').forEach(i => i.placeholder = t('solutionNotePlaceholder'));
  if (comparisonStarted) renderPairs();
  renderFineTune();
  renderSolutionMatrix();
  updateSensImpact(); updateRatingImpact();
}

document.getElementById('langToggle').onclick = () => {
  lang = lang === 'en' ? 'de' : 'en';
  applyLang();
  saveState();
};
