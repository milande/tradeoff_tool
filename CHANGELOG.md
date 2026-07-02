# DecisionLab — Changelog

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
