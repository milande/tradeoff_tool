# DecisionLab

A single-file structured decision tool. Compare options across multiple weighted criteria — no gut feel, just weighted evidence.

**No server, no install.** Open `dist/index.html` in any browser.

---

## How it works

DecisionLab uses a three-step process:

1. **Define criteria** — list what matters (e.g. Cost, Speed, Quality)
2. **Compare pairs** — for each pair of criteria, pick which matters more; the tool converts your answers into percentage weights automatically
3. **Rate solutions** — score each option from 0 (worst) to 4 (best) per criterion; the weighted ranking updates instantly

---

## Features

### Standard mode

| Feature | Description |
|---|---|
| Pairwise comparison | Rank criteria against each other to derive weights objectively |
| Consistency check | Circular answers (A › B › C › A) are flagged with a warning |
| Solution rating matrix | Rate every option 0–4 per criterion |
| Live ranking | Weighted scores update as you type or click |
| Robustness verdict | One line under the ranking says how close the runner-up is to taking the lead |
| Solution notes | Optional short description beneath each solution name |
| Auto-save | Session persists automatically in `localStorage` |
| Undo / Redo | ↶ ↷ toolbar buttons or Ctrl/Cmd+Z / Ctrl+Shift+Z — up to 100 steps |
| Save / Load | Export and re-import state as JSON |
| CSV export | Decision matrix (weights, ratings, scores, ranks) for spreadsheets |
| HTML export | Self-contained, shareable HTML with all data baked in — opens in read-only mode; Pro features are included when Pro mode was active at export |
| Print view | Printable summary including ranking, weights, and all notes |
| EN / DE | Full English and German UI, including dialogs and exports |
| Light / dark theme | ◐ cycles Auto (follows your system, or a Confluence page's theme), Light, Dark. Exports follow the reader's environment automatically |
| Update check | The version badge links to the newer release when one exists. Once a day, silent on failure, never from an export |
| Confluence embed | Paste the live tool into a Confluence Server/DC page ([setup](#embedding-in-confluence)) |

### Pro mode ⚡

Activate the **⚡ Pro** toggle in the tab bar to unlock:

| Feature | Description |
|---|---|
| Fine-tune Weights | Drag a weight bar or type a percentage. Manually set values stay pinned (shown bright); not-yet-edited criteria (dimmed) absorb the change. A *Custom* badge marks overrides; reset restores pairwise values |
| Score Definitions | Define what each score (0–4) means per criterion — appears as a tooltip on rating buttons |
| Rating Rationale | Add a written reason for each rating score — shown in the print view |
| Must-have Criteria | Mark criteria as must-have; solutions scoring 0 on any are eliminated from the ranking and flagged at the bottom |
| Sensitivity Analysis | Drag markers to explore *"what if this criterion mattered more or less?"* — live breakeven points show exactly where the winner switches. Solutions failing a must-have stay visible but hatched, with ⊗ in the legend |
| Scenario Comparison | Save named snapshots (weights + exploration ratings) and compare them side by side against the baseline, with changed values highlighted. Click a column header to load that scenario back into the sensitivity bars |
| VDI 2225 Value Analysis | Tag criteria as technical (T) or economic (€) to get separate Wertigkeiten Wt / We, strength s = √(Wt·We), and the s-diagram with the ideal at 1/1 |
| Team Ratings | Load teammates' JSON files to compare everyone's ratings side by side — disagreements of 2+ points highlighted, team-average ranking, and one click to explore the average in the sensitivity analysis |

---

## Files

```
src/
  index.html              ← full HTML (open directly in browser for dev)
  styles.css              ← all CSS
  js/
    lang/
      en.js               ← English strings
      de.js               ← German strings
    dom.js                ← app root, byId/qs/qsa, onGlobal (instance-scoped lookups)
    version.js            ← APP_VERSION, release check, version badge
    i18n.js               ← STRINGS object, t(), applyLang()
    state.js              ← saveState(), applyState()
    criteria.js           ← pairwise comparison, weights
    solutions.js          ← solution matrix, ranking, knockout
    sensitivity.js        ← breakeven analysis, drag handlers
    scenarios.js          ← scenario comparison (save/compare weight configs)
    team.js               ← team ratings (merge rater files, disagreement view)
    export.js             ← print, HTML export, JSON save/load, help
    main.js               ← applyProMode(), tab switching, auto-load
build.js                  ← assembles and minifies src/ → dist/index.html
dist/
  index.html              ← built output (the portable single file)
tests/
  run.js                  ← headless test suite (npm test)
CHANGELOG.md
README.md
```

## Development

Open `src/index.html` directly in any browser — no server needed. All features work except HTML export (which requires the inlined script text only available in the built file).

```bash
node build.js && npm test   # several checks run against the built file
```

The suite has no dependencies. Some assertions inspect `dist/index.html`, so build before testing after changing anything under `src/`.

## Build

```bash
node build.js
# or
npm run build
```

Produces `dist/index.html` — the single portable file for sharing.

---

## Export formats

| Format | Use case |
|---|---|
| `↓ HTML` | Self-contained read-only file — open it anywhere, mail it, attach it |
| `⧉ Copy for Confluence` | Macro body for a Confluence **Server/DC** page: the live tool, read-only, data baked in ([setup](#embedding-in-confluence)) |
| `↓ JSON` | Re-importable data file for ongoing editing |
| `↓ CSV` | Decision matrix for Excel & Co. (locale-aware separator) |
| `⎙ Print` | Formatted print view with all data, notes, and sensitivity bars |

Exported HTML and JSON filenames include the decision name and author (e.g. `Serverauswahl – DecisionLab.html`).

---

## Embedding in Confluence

Puts the **live tool** — read-only, with the decision baked in — inside a Confluence page. Verified on Confluence **Server/DC 9.2.22**.

### Prerequisites

Both are silent when missing: you get an empty box, not an error.

1. **The Appfire / Bob Swift *HTML for Confluence* app.** The macro is `html-bobswift` (renamed from `HTML` in app release 5.7.0 — instances using *Macro Security for Confluence* need entries for **both** names).
2. **JavaScript must be allowed.** This is a global toggle, not a macro parameter: Confluence admin → *HTML for Confluence*, or Bob Swift Configuration → HTML → **Allow Javascript**.
3. **The instance's CSP must permit `unsafe-eval`.** Check in the browser console on that page:
   ```js
   try { new Function('return 1')(); console.log('eval OK'); } catch (e) { console.log('CSP blocks eval:', e.message); }
   ```

Confluence **Cloud** has no HTML macro at all, so this route does not exist there.

### Steps

1. Open `dist/index.html`, load or build your decision, and fill in the decision name and author — both appear in the embed's banner.
2. **Turn on ⚡ Pro before exporting** if the embed should include Sensitivity, VDI, scenarios or team ratings. The export carries whatever Pro state was active; it does not force it on.
3. **File ▾ → ⧉ Copy for Confluence**. The toolbar button flashes *✓ Copied*. If the clipboard is blocked the block downloads instead and says so.
4. Paste into an `{html-bobswift}` macro body on a **scratch page first**, and publish.

### What to expect

- The tool renders read-only: no editing controls, no file menu.
- Tabs, the language toggle and Pro sensitivity dragging all work; nothing a viewer does is saved or visible to anyone else.
- The rest of the page is untouched — its tables, headings and form fields keep their own styling.
- Two embeds on one page render independently.
- The embed is a **snapshot**, not a live link: changing the decision means re-exporting and re-pasting.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Empty box, nothing renders | *Allow Javascript* is off, or the CSP blocks `unsafe-eval` |
| Styling and blank tabs, but no content | A content filter stripped the script — you are on a pre-v0.7 build |
| The whole page turns dark, or its tables restyle | CSS scoping failed; please open an issue |
| Page content truncated after the macro | A `]]>` reached the payload — the export should refuse first |
| Export refuses, mentioning `]]` and `>` | Your decision text contains the CDATA terminator; remove it |

---

## Why the embed is built the way it is

Three decisions look like over-engineering unless you have watched them fail. They are load-bearing.

**The script ships as base64.** A Confluence content filter parses the macro body as HTML and deletes markup-shaped text from inside `<script>`. This bundle is full of markup — every `<div>`, `<td>` and `style="…"` the app writes — so a plain script lost ~13,700 characters from its middle and rendered styling with no content. Base64 gives the filter nothing to react to. Cost: the payload grows to ~170 KB.

**Embeds never touch `localStorage`.** Every embed on an instance shares one origin and one storage key, so any read or write would make embedded pages show — or overwrite — each other's decisions. All storage goes through one facade gated on a single flag; a test fails if a direct call reappears.

**The stylesheet is scoped to a wrapper.** The macro injects CSS into the wiki page itself. Unscoped, `input[type=text]` restyles Confluence's own editor fields and `table`/`th`/`td` every table on the page.

Related: colour is themed through tokens rather than literals, because the same alpha reads about 30% weaker on light than on dark — see `--fg-a*` and `--dim-*` in `src/styles.css`.


---

## Versions

- **v0.7.1** — Fix: the Confluence embed now follows the page's light/dark theme, and switches with it
- **v0.7** — Confluence embed (`⧉ Copy for Confluence`); light/dark theme with automatic switching in exports; results shown first in exports; release-update check on the version badge
- **v0.6** — VDI 2225 value analysis (Pro): technical/economic criteria, Wt/We/s, s-diagram in app, print, and CSV; Team Ratings (Pro): merge teammates' JSON exports, disagreement view, team-average ranking
- **v0.5** — consistency check, robustness verdict, undo/redo, CSV export, draggable fine-tune bars with pinned values, must-have marking in sensitivity bars; stable IDs (renames keep all data; save format v2, old files incompatible); HTML-escaped user input everywhere; in-repo test suite (`npm test`)
- **v0.4** — Scenario Comparison (Pro) with full snapshots and click-to-load; sensitivity fixes + persistence; criteria ordered by importance everywhere; print/export polish; multi-file source with `build.js` assembling minified `dist/index.html`
- **v0.3** — Solution notes, rating rationale, score definitions, must-have criteria (all Pro features toggleable)
- **v0.2** — Pro mode, fine-tune weights, sensitivity analysis, EN/DE language support, HTML export, decision name & author
- **v0.1** — Pairwise comparison, rating matrix, weighted ranking, auto-save, JSON save/load

---

## Roadmap

- Multiple decisions in parallel (decision list with open/duplicate/delete)
- Static Confluence fallback — a JavaScript-free report fragment, for instances that disallow scripts in the HTML macro or forbid `unsafe-eval`

---

Built by Claude & Milan
