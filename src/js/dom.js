// ── DOM root ──────────────────────────────────────────────────
// A standalone build owns the whole document. An embed (Confluence macro) is
// one subtree of a wiki page that may carry other embeds and the host's own
// markup, so every lookup resolves inside that instance's wrapper instead of
// searching the page. `_embedRoot` is declared by the embed prologue ahead of
// this file; nothing else defines it, so standalone builds fall back to the
// document and behave exactly as before.
let appRoot = (typeof _embedRoot !== 'undefined' && _embedRoot) ? _embedRoot : document;
// The element carrying root-level hooks — the `pro-on` class and, in an embed,
// the `data-readonly` attribute. The scoped stylesheet expects them here.
let appRootEl = (typeof _embedRoot !== 'undefined' && _embedRoot) ? _embedRoot : document.body;

// True in a generated export. The standalone export marks <html>, an embed
// marks its wrapper — check both, since appRootEl is the body in one case and
// the wrapper in the other.
let readOnly = !!(document.documentElement && document.documentElement.hasAttribute
  && document.documentElement.hasAttribute('data-readonly'))
  || !!(appRootEl && appRootEl.hasAttribute && appRootEl.hasAttribute('data-readonly'));

// Where the theme attribute lives: the document element when we own the page,
// the wrapper when we are one embed among a wiki page's own content. The light
// rules are written `:root[…]`, which scopeCss() rewrites onto the wrapper, so
// they land on whichever of the two this is.
let themeRoot = (appRoot === document) ? document.documentElement : appRootEl;

// 'auto' | 'light' | 'dark'. Auto means: follow the host page where we can read
// it, otherwise the browser's prefers-color-scheme — which the stylesheet
// handles by itself, so auto simply leaves the attribute off.
let theme = 'auto';

// Only meaningful in an embed. Skipped when we own the document, where we would
// read back the attribute we set ourselves. Confluence's actual hook is
// unverified, so this is best-effort: anything unrecognised falls through to
// the media query rather than guessing wrong.
function hostTheme() {
  const el = document.documentElement;
  if (themeRoot === el || !el || !el.getAttribute) return null;
  // `data-color-mode` is the documented signal in Confluence DC 9+, and the only
  // one worth reading. Its sibling `data-theme` names both schemes at once
  // ("light:light dark:dark"), so folding the attributes together and matching
  // substrings found "dark" on every page and pinned every embed to dark.
  // Match exactly: anything else, "auto" included, falls through to the
  // browser's prefers-color-scheme.
  const mode = String(el.getAttribute('data-color-mode') || '').trim().toLowerCase();
  return mode === 'dark' || mode === 'light' ? mode : null;
}

function applyTheme() {
  if (!themeRoot || !themeRoot.setAttribute) return;
  const forced = theme === 'auto' ? hostTheme() : theme;
  if (forced) themeRoot.setAttribute('data-theme', forced);
  else themeRoot.removeAttribute('data-theme');
  updateThemeLabel();
}

function updateThemeLabel() {
  const btn = byId('themeToggle');
  if (!btn) return;
  btn.textContent = t('theme_' + theme);
  btn.title = t('themeTitle');
}

// Both signals can change while the page is open, so follow them live rather
// than only at load.
function watchTheme() {
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
  }
  if (typeof MutationObserver === 'function' && themeRoot !== document.documentElement && document.documentElement) {
    new MutationObserver(applyTheme).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-color-mode'] });
  }
}

function byId(id) {
  return appRoot.getElementById ? appRoot.getElementById(id) : appRoot.querySelector('#' + id);
}

function qs(sel) { return appRoot.querySelector(sel); }

function qsa(sel) { return appRoot.querySelectorAll(sel); }

// Where app-wide UI listeners attach: close-on-outside-click and the keyboard
// shortcuts. In an embed these must not reach the host page — a document-level
// Ctrl+Z that preventDefault()s would break undo in the Confluence editor.
// Bound to the wrapper they only fire when focus is inside the embed.
// Pointer tracking during a drag deliberately stays on `document`: a drag that
// leaves the element must keep receiving events.
function globalTarget() { return appRoot === document ? document : appRootEl; }

function onGlobal(type, handler, opts) { globalTarget().addEventListener(type, handler, opts); }
