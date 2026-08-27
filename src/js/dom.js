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
