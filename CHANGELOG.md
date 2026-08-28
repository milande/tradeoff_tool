# DecisionLab — Changelog

## v0.7.1 (2026-08-27)

### Help
- The Help overlay gains a dedicated **⧉ Confluence** section: what the action does, that it needs Confluence Server/DC with the Appfire (Bob Swift) *HTML for Confluence* app and its **html-bobswift** macro, that *Allow Javascript* must be enabled globally or the block renders empty, that Cloud has no HTML macro, and what readers of an embed can and cannot do

### Fixed
- **The Confluence embed ignored the page's theme** and stayed dark whatever the wiki was set to. The host theme was detected by substring-matching several attributes together; Confluence DC 9 publishes `data-color-mode` (the mode) beside `data-theme`, which names both schemes at once (`light:light dark:dark`), so "dark" matched on every page. The mode attribute is now read exactly, and anything else — including `auto` — falls back to the reader's browser preference. The embed also follows a live theme switch on the host page

## v0.7 (2026-08-27)

### Confluence embed
- New **⧉ Copy for Confluence** action (File ▾) copies a macro body that renders the **live tool** — read-only, data baked in — inside a Confluence Server/DC page
- Requires the Appfire / Bob Swift *HTML for Confluence* app with **Allow Javascript** enabled (a global setting, not a macro parameter) and a CSP permitting `unsafe-eval`; see the README for setup and troubleshooting
- Two embeds on one page render independently, and nothing a viewer does is stored or shared
- The README's previous claim that the HTML export was "embeddable in Confluence" was wrong and has been corrected

### Light / dark theme
- New **◐** toggle cycles Auto / Light / Dark. Auto follows the system preference, and inside a Confluence page the surrounding page's theme, switching live
- Exports have no theme control by design: they follow the reader's browser or wiki page, not the author's choice
- The whole stylesheet moved to tokens (~330 colour literals). Every value is contrast-checked; the light theme meets WCAG AA against its surfaces
- Solution colours gained light-theme values. The dark palette scored 1.7–2.7 against white — this also fixes the **print view**, which had been rendering those colours on paper all along

### Results first in exports
- In an export, each tab leads with its result: the ranking in Solutions, the criteria weights in Criteria, with the working detail below. The live tool is unchanged
- When weights have been fine-tuned, the **adjusted** weights lead — they are what produced the ranking, while the Criteria Weights table shows the pairwise derivation
- The print view is reordered to match: ranking, robustness verdict, weights, then the derivation

### Update check
- The version badge becomes a link when a newer release exists. Checked at most once a day, silent on every failure, and **never from an export**
- `APP_VERSION` is now the single source for the version string

### Fixes
- Read-only exports hid no editing controls at all in the embed: one comment inside a selector invalidated the whole rule (regression in the scoping work)
- Input text stayed white in the light theme — `color:white`, a keyword the colour codemod did not look for
- The VDI s-diagram was drawn with fixed light-on-dark colours in every theme; it now follows the surrounding theme, and its labels match the table beside them
- The export banner stayed white on a light page
- Faded text (hints, notes, secondary labels) read ~30% weaker on light than dark; each tier now carries its own per-theme value

### Internals
- `src/js/dom.js` — instance-scoped element lookups, so an embed resolves its own DOM
- `src/js/version.js` — `APP_VERSION`, release check, version badge
- Test suite: 109 → 221 checks

## v0.6 (2026-07-07)

### Header & Navigation Redesign
- Toolbar and tab bar stay pinned to the top while scrolling (disabled on narrow screens)
- The toolbar reads as a breadcrumb: **DecisionLab ▸ decision title · author** — both editable in place with a quiet hover underline
- The data actions (Save JSON, Load, Export HTML, Export CSV, New decision) moved into a single **File ▾** menu; the toolbar keeps DE, undo/redo, Help, and Print as direct buttons
- Tabs are folder-shaped and fuse with the page: each tab page is now one bordered panel that the active tab connects to seamlessly, with a colored accent edge
- Switching tabs always opens the page scrolled to the top

### Team Ratings *(Pro)*
- New collaboration workflow: share the saved JSON with teammates, everyone rates independently and saves with their own name, then load their files in the **Team Ratings** section (Solutions tab)
- Files are matched to the decision by the stable criterion/solution IDs — files from a different decision are rejected with a clear message; re-importing a file from the same person replaces their previous ratings
- Comparison table: one column per team member (you first) plus the team average (Ø); each member's implied ranking and score is shown per solution using the shared weights
- **Disagreements of 2+ points are highlighted** (amber rows) and counted in a summary line
- Team-average ranking column shows where the group lands collectively
- **↧ Explore team average** loads the mean ratings into the sensitivity exploration and jumps to the Sensitivity tab
- Multiple files can be loaded at once; raters persist in save/load/HTML export and are covered by undo
- Included in the print view with disagreement highlighting; fully translated (EN / DE)

### Committed-State Ghost Markers
- When the sensitivity exploration drifts from the committed decision, a dim grey ghost marker (hollow dot) appears on each affected bar showing the committed weight / rating — hover it for the exact value
- Ghost markers appear in both Criterion Impact and Rating Impact, and in the print view; they vanish when exploration and committed state match (e.g. after the reset buttons)
- The robustness verdict now carries a tooltip clarifying it is based on the committed weights and ratings, not the exploration
- All reset buttons (sensitivity weights, exploration ratings, fine-tune) are disabled while there is nothing to reset, and activate only once the state has been modified

### VDI 2225 Value Analysis *(Pro)*
- Each criterion can be classified as technical (T) or economic (€) via a toggle in the rating matrix — next to the Must-have toggle
- As soon as both groups exist, a **VDI 2225** section appears below the Solutions ranking:
  - **Technical value Wt** and **economic value We** per solution — weighted mean rating relative to the ideal (4), computed within each group
  - **Strength s = √(Wt·We)**, table sorted by s
  - **s-diagram**: We vs. Wt scatter with the diagonal and the ideal point 1/1 — balanced solutions lie near the diagonal
- Knocked-out solutions appear struck through in the table and as dashed hollow points in the diagram
- Included in the print view (light theme) and as Wt/We/s rows in the CSV export
- Classification persists in save/load/HTML export (additive — v0.5 save files load fine)
- Fully translated (EN / DE), documented in the help overlay

---

## v0.5 (2026-07-04)

### Fine-tune Weights UX
- The weight bars are now draggable sliders — grab a bar to set the weight directly; the number field stays for precise values
- Manually set values are **pinned**: they keep their weight when you adjust other criteria. Changes are absorbed by the not-yet-edited criteria first; only when everything is pinned do the other pinned values scale (second order)
- Pinned numbers show bright with an accent border; auto-adjusted numbers stay dimmed
- While dragging, all rows update in place without re-sorting; the list re-orders by importance only when you release
- One undo step per drag; ↺ Reset to pairwise clears all pins

### Undo / Redo
- ↶ / ↷ toolbar buttons plus Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y)
- Full-state snapshots on every change, up to 100 steps
- Rapid changes collapse into one step only when they touch the same field/cell (typing a name, re-clicking the same rating) — distinct actions always get their own step
- Sensitivity exploration is covered too: weight/rating drags (one step per drag), reset buttons, and scenario loads
- Native text-field undo is preserved while typing in an input
- Undo returns you to the tab you were on

### CSV Export
- New ↓ CSV toolbar button downloads the decision matrix for spreadsheets: criteria with weights and per-solution ratings, plus score and rank rows
- Knocked-out solutions are marked with the failing criteria instead of a rank
- German UI exports with semicolon separator and decimal commas (Excel-DE friendly); UTF-8 BOM included

### Sensitivity & Must-have
- Solutions currently failing a must-have criterion (per exploration ratings) are marked in the sensitivity legends: struck-through name + ⊗ with the failing criteria as tooltip
- Their bar segments render as a diagonal hatch of their colour instead of solid — "would win here, but is currently disqualified"; legend dots hatch to match, and KO members of a tie stripe are dimmed
- The breakeven bars still include them — they show the theoretical possibility; the same marking appears in the Rating Impact section headers and the print legends

### Consistency Check
- Circular preferences (A › B › C › A) are detected automatically across all answered pairs
- An amber warning below the pairwise section lists the circle(s), so unreliable weights are visible at a glance

### Robustness Verdict
- A verdict line below the Solutions ranking states how stable the result is, computed from the committed weights and ratings
- Robust: "no single criterion weight change would take the lead from X" (green)
- Otherwise it names the closest flip: which challenger takes the lead if which criterion weight moves from X% to Y% (amber when within 5 points)
- Also included in the print view under the Solution Ranking

### Stable IDs (breaking change for saved files)
- Criteria and solutions now carry internal stable IDs; all data (ratings, pairwise answers, weights, notes, anchors, must-have flags, sensitivity exploration, scenarios) is keyed by ID instead of by name
- **Renaming a criterion or solution keeps everything attached** — it is now purely a label change; all views update live
- Names may contain any character (previously `|` would have corrupted internal keys)
- Save format bumped to version 2 — **JSON files and browser sessions from v0.4 and earlier cannot be loaded**; loading an old file shows the invalid-file message

### Hardened Input Handling
- All user-entered text (criteria, solutions, notes, reasons, anchors, scenario names, decision name, author) is HTML-escaped wherever it is rendered — in the app, the print view, and the HTML export
- Names containing markup or quotes can no longer break the layout or inject content into shared exports

### UX / Fixes
- The solution description field has its own placeholder ("Description of solution…") — switching the language no longer overwrote it with "Solution"

### Test Suite
- The headless test suite now lives in the repo (`tests/run.js`, run with `npm test`)
- ~80 checks cover the full lifecycle: pairwise weights, fine-tune pinning, ratings, knockout, sensitivity math and self-healing, scenarios, undo/redo, persistence round-trip, JSON/HTML/CSV export, print view, escaping, stable-ID renames, and EN/DE parity
- Plus static sanity checks on the built `dist/index.html`

---

## v0.4 (2026-07-02)

### Multi-file Source + Build Step
- Source restructured from a single `index.html` into `src/` with one full HTML file, separate CSS, JS modules, and language files
- `src/index.html` opens directly in the browser for development — no build step needed
- `build.js` assembles and minifies all sources into a single portable `dist/index.html` (no npm dependencies)
- Minification: CSS comments and whitespace stripped; JS `//` comments removed (export sentinels preserved globally); HTML blank lines collapsed
- GitHub source link added to the credit footer

### Scenario Comparison *(Pro)*
- New section in the Sensitivity tab (Pro only) for comparing named configurations side by side
- Each scenario is a full snapshot: the current sensitivity **weights and exploration ratings**
- Comparison table shows the Baseline (pairwise/fine-tuned weights + committed ratings) plus all saved scenarios as columns
- Every column lists all values: weight per criterion, rank + score per solution, and per-criterion rating + weighted contribution
- Values that differ from the Baseline are highlighted (amber weight cells, amber rating badges)
- **Click a column header** (Baseline or scenario) to load its weights and ratings back into the sensitivity bars
- Winner cells per column are highlighted with the solution's colour; knocked-out solutions show a dash
- Criteria rows ordered by importance; delete scenarios with the ✕ button
- Scenarios persist in localStorage, JSON save/load, and HTML export; cleared automatically when criteria change
- Fully translated (EN / DE)

### Sensitivity Fixes & Persistence
- Fixed: dragging a Criterion Impact bar could zero out all other weights when the internal state was stale (e.g. after renaming criteria or loading a session)
- Weight-drag math now derives from the actual current weights instead of assuming they sum to 100%
- Self-healing: sensitivity state is validated before every render and re-derived from pairwise weights if corrupt; missing exploration ratings are back-filled from committed ratings
- Fixed: tweaking ratings in Rating Impact now updates the Criterion Impact bars live
- Fixed: opening the Sensitivity tab no longer resets your exploration weights/ratings
- Fixed: committing a rating in the Solutions tab now propagates to the sensitivity exploration state
- Sensitivity weights and exploration ratings are saved to localStorage, JSON, and HTML export
- Stale keys from renamed criteria are cleaned up; stopping the comparison clears sensitivity state

### Consistent Criteria Ordering
- Criteria are listed by importance (highest weight first) everywhere: fine-tune list, solution rating matrix, sensitivity bars, scenario table, and all print sections
- Ordering follows committed weights (pairwise + fine-tune), so bars don't reshuffle while dragging

### Print View
- Knocked-out solutions are struck through, dimmed, sorted to the bottom, and show the failing must-have criteria in red
- Score Definitions section now always included: per-criterion 0–4 meanings when any custom anchors exist (custom values dark, standard defaults greyed), otherwise a compact generic 0–4 legend

### HTML Export (read-only)
- Fixed: exported HTML was broken by the minifier stripping the auto-load sentinels (string-literal collision)
- All non-navigation controls are now disabled/hidden in the export: add/remove buttons, pairwise buttons, Must-have toggles, scenario save row; inputs are read-only
- Sensitivity reset buttons stay active so viewers can return to the original values after exploring
- The export respects the Pro mode status at export time (previously Pro was always forced on)
- The criteria input section is removed entirely (criteria remain visible in the weights table)

### UX / Cleanup
- Criteria tab simplified: page title removed, "Step 1/2/3" prefixes dropped (tab order conveys the sequence)
- New criterion inputs show numbered placeholders (Criteria 1, 2, … / Kriterium 1, 2, …) that survive language switching
- ✕ New now also clears the decision name and author fields
- Fixed: solution description notes were being treated as solutions in the ratings
- All hardcoded fallback text removed from the HTML — the language files are the single source of truth for UI strings

---

## v0.3 (2026-06-30)

### Solution Notes
- Added a short description / note field below each solution name in the Solutions tab
- Notes appear as italic subtitles in all ranking tables (Criteria, Solutions, and Sensitivity tabs)
- Notes are included in the print view's Solution Ranking table
- Notes are persisted in localStorage, JSON save/load, and HTML export
- Note placeholders are translated (EN / DE)

### Must-have / Knockout Criteria *(Pro)*
- Each criterion card in the Solutions tab has a "Must-have" toggle (Pro only)
- Solutions scoring 0 on any must-have criterion are eliminated from the ranking
- Eliminated solutions appear at the bottom of all ranking tables, grayed out with strikethrough and the failed criterion named
- Active knockout criteria cards get an amber left border for visibility
- Print view includes a Knockout Criteria table listing which criteria are knockout and which solutions are eliminated
- Fully persisted in localStorage, JSON save/load, and HTML export
- Labels translated (EN / DE)

### Criteria Anchors *(Pro)*
- Added score definition fields (0–4) per criterion in the solution matrix, visible only in Pro mode
- Anchor inputs appear as a compact strip below each criterion card header
- Defined anchors appear as tooltips on the rating buttons (hover to see what each score means)
- Anchor definitions shown as a Score Definitions table in the print view (only when at least one anchor is filled)
- Fully persisted in localStorage, JSON save/load, and HTML export
- Placeholders translated (EN / DE)

### Rating Rationale
- Added a reason field below each rating button row in the solution matrix
- Field is subtle when empty, visible when filled; styled consistently with weight reasons
- Rating notes appear in the print view below each rating value in the Solution Ranking table
- Notes are persisted in localStorage, JSON save/load, and HTML export
- Placeholders are translated (EN / DE)

---

## v0.2 (2026-06-29)

### Pro Mode
- New ⚡ Pro toggle in the tab bar, unlocking two advanced features
- Fine-tune Weights and Sensitivity tab are hidden in standard mode

### Fine-tune Weights *(Pro)*
- Manual adjustment of criterion weights after pairwise comparison
- Weights auto-normalise so they always sum to 100%
- Optional reason field per adjustment
- Custom badge when weights are overridden; reset button restores pairwise values
- Custom weights and reasons are persisted in save/load/export

### Sensitivity Analysis *(Pro)*
- Criterion Impact — draggable bars showing which solution wins at each criterion weight; breakeven percentages marked where the winner switches
- Rating Impact — per-solution, per-criterion bars showing how changing a rating affects the outcome; markers snap to integer values (0–4)
- Both panels share live state: adjusting weights updates rating bars and vice versa
- Tie detection: when solutions are exactly tied, bars show a diagonal stripe of both colours
- Ranking section between the two panels updates live

### Language Support (EN / DE)
- Full German translation of all UI text, hints, and dialogs
- Language toggle button (persisted in state, included in export/save)
- Exported HTML opens in the correct language by default

### Decision Name & Author
- Two persistent fields at the top of the UI
- Included in all outputs: export banner, print header, and JSON/HTML filenames

### HTML Export (self-contained)
- Exports a fully standalone HTML file with all data baked in
- Read-only: editing controls and Pro toggle hidden; language toggle remains
- Pro mode forced on so the Sensitivity tab is always visible
- Export banner shows decision name, tool name + version, author, and date

### Print View
- Includes Criterion Impact and Rating Impact breakeven bars
- Header shows decision name, author, date, and tool version
- Prints current exploration state (what you see is what you print)

### Ranking
- Solution rows animate (FLIP) when the ranking order changes
- Each solution gets a consistent colour across all views

### UX / Polish
- Help overlay explaining all features (EN + DE)
- App name DecisionLab, version badge, Built by Claude & Milan credit
- Toolbar reorganised: actions right-aligned
- All dialogs and alerts fully translated (no hardcoded English strings)

---

## v0.1 (initial release)

- Pairwise criteria comparison with automatic weight calculation
- Solution rating matrix (0–4 per criterion per solution)
- Weighted ranking with score bars
- Auto-save to localStorage
- JSON save / load
