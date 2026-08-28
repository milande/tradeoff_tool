// ── App version & update check ────────────────────────────────
// The one authoritative version string. Everything that shows a version reads
// this; package.json, the CHANGELOG and the test suite's expectation are the
// only other places it appears.
const APP_VERSION = 'v0.7.2';

const RELEASES_API = 'https://api.github.com/repos/milande/tradeoff_tool/releases/latest';
const RELEASES_PAGE = 'https://github.com/milande/tradeoff_tool/releases';
const UPDATE_KEY = 'dl_update';
const UPDATE_PREF = 'dl_update_check';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 4000;

// Numeric compare, so v0.10 beats v0.9. Anything unparseable answers "no",
// which is what a rate-limit body or a proxy's HTML error page looks like.
function parseVersion(v) {
  const m = String(v == null ? '' : v).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  return m ? [+m[1], +(m[2] || 0), +(m[3] || 0)] : null;
}

function isNewerVersion(remote, local) {
  const a = parseVersion(remote), b = parseVersion(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;                 // equal, or a build ahead of the latest release
}

function applyVersionBadge(tag) {
  const badge = qs('.app-version');
  if (!badge) return;
  if (tag && isNewerVersion(tag, APP_VERSION)) {
    badge.classList.add('update-available');
    badge.title = t('updateAvailable')(tag);
    badge.innerHTML = `<a href="${RELEASES_PAGE}" target="_blank" rel="noopener">`
      + `${esc(APP_VERSION)} → ${esc(tag)}</a>`;
  } else {
    badge.classList.remove('update-available');
    badge.textContent = APP_VERSION;
  }
}

// Every failure here is silent by design: this runs from file:// on a laptop
// behind a corporate proxy as often as not, and a decision tool that works
// offline must not report that it could not reach GitHub. Exports never run it
// at all — a read-only record should not nag its readers, and an embed calling
// out from a wiki page would make that page phone a third party on every view.
function checkForUpdate() {
  applyVersionBadge(null);
  if (readOnly || embedded) return;
  if (lsGet(UPDATE_PREF) === 'off') return;

  let cached = null;
  try { cached = JSON.parse(lsGet(UPDATE_KEY) || 'null'); } catch (e) {}
  if (cached && cached.tag) applyVersionBadge(cached.tag);
  if (cached && Date.now() - (cached.at || 0) < UPDATE_INTERVAL_MS) return;
  if (typeof fetch !== 'function') return;

  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), UPDATE_TIMEOUT_MS) : null;
  fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: ctl ? ctl.signal : undefined,
  })
    .then(r => (r && r.ok ? r.json() : null))
    .then(data => {
      const tag = data && typeof data.tag_name === 'string' ? data.tag_name : null;
      if (!parseVersion(tag)) return;            // rate-limit JSON, proxy HTML, anything odd
      lsSet(UPDATE_KEY, JSON.stringify({ tag, at: Date.now() }));
      applyVersionBadge(tag);
    })
    .catch(() => {})                             // offline, blocked, timed out — say nothing
    .then(() => { if (timer) clearTimeout(timer); });
}
