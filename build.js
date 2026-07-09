#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

// ── Minifiers ─────────────────────────────────────────────────

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')          // strip comments
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')      // remove spaces around punctuation
    .replace(/;\}/g, '}')                       // remove trailing semicolons
    .replace(/\s+/g, ' ')                       // collapse remaining whitespace
    .trim();
}

function minifyJS(js) {
  // Sentinels used by HTML export — must survive intact
  const SENTINEL_A = '// Auto-load saved session';
  const SENTINEL_B = '// END Auto-load';

  // Temporarily protect ALL occurrences of each sentinel (split/join = global replace)
  const SLOT_A = '\x00SENTINEL_A\x00';
  const SLOT_B = '\x00SENTINEL_B\x00';
  js = js.split(SENTINEL_A).join(SLOT_A);
  js = js.split(SENTINEL_B).join(SLOT_B);

  // Strip // comments only at line start or after whitespace — never mid-token,
  // so strings like "http://www.w3.org/2000/svg" survive intact.
  js = js
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')         // strip single-line comments
    .replace(/\n{2,}/g, '\n')                   // collapse blank lines
    .trim();

  // Restore sentinels
  return js.split(SLOT_A).join(SENTINEL_A).split(SLOT_B).join(SENTINEL_B);
}

function minifyHTML(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')   // strip HTML comments
    .replace(/\n\s*\n/g, '\n')                  // collapse blank lines
    .replace(/^\s+|\s+$/gm, l => l.trim() === '' ? '' : l) // trim blank lines
    .trim();
}

// ── Capture preamble (prepended to inlined JS) ────────────────
// Lets the HTML export capture the full script text and style at runtime.
// Only works in the built dist/index.html (not in dev mode with separate scripts).
const CAPTURE_PREAMBLE =
`const _scriptEl=document.currentScript;` +
`const _scriptText=_scriptEl.textContent;` +
`const _styleText=document.querySelector('style').textContent;` +
`let _bodyHtml='';` +
`for(const node of document.body.childNodes){if(node===_scriptEl)break;` +
`_bodyHtml+=node.nodeType===3?node.textContent:(node.outerHTML||'');}` +
`\n`;

// ── Read & assemble ───────────────────────────────────────────
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

// Inline CSS (minified)
const rawCSS = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
const css = minifyCSS(rawCSS);
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);

// Collect JS files from the build block
const buildBlockMatch = html.match(/<!-- build:js -->([\s\S]*?)<!-- endbuild -->/);
if (!buildBlockMatch) {
  console.error('Could not find <!-- build:js --> ... <!-- endbuild --> block');
  process.exit(1);
}
const scriptFiles = [...buildBlockMatch[1].matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map(m => m[1]);

// Concatenate and minify JS
const rawJS = scriptFiles
  .map(file => fs.readFileSync(path.join(SRC, file), 'utf8'))
  .join('\n');
const js = CAPTURE_PREAMBLE + minifyJS(rawJS);

// Replace build block with single inline script
html = html.replace(/<!-- build:js -->[\s\S]*?<!-- endbuild -->/, `<script>${js}</script>`);

// Minify HTML (after JS is inlined so we don't touch the script block)
html = minifyHTML(html);

// ── Write output ──────────────────────────────────────────────
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`Built dist/index.html  (${kb} KB)`);
console.log(`  CSS:  styles.css`);
console.log(`  JS:   ${scriptFiles.join(', ')}`);
