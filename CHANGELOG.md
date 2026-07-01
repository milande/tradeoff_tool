# DecisionLab — Changelog

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
