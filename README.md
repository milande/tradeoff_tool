# DecisionLab

A single-file structured decision tool. Compare options across multiple weighted criteria — no gut feel, just weighted evidence.

**No server, no install.** Open `index.html` in any browser.

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
| Solution rating matrix | Rate every option 0–4 per criterion |
| Live ranking | Weighted scores update as you type or click |
| Solution notes | Optional short description beneath each solution name |
| Auto-save | Session persists automatically in `localStorage` |
| Save / Load | Export and re-import state as JSON |
| HTML export | Self-contained, shareable HTML with all data baked in — opens in read-only mode with Sensitivity tab enabled |
| Print view | Printable summary including ranking, weights, and all notes |
| EN / DE | Full English and German UI, including dialogs and exports |

### Pro mode ⚡

Activate the **⚡ Pro** toggle in the tab bar to unlock:

| Feature | Description |
|---|---|
| Fine-tune Weights | Manually adjust individual weight percentages; others scale proportionally to keep total at 100%. A *Custom* badge marks overrides; reset restores pairwise values |
| Score Definitions | Define what each score (0–4) means per criterion — appears as a tooltip on rating buttons |
| Rating Rationale | Add a written reason for each rating score — shown in the print view |
| Must-have Criteria | Mark criteria as must-have; solutions scoring 0 on any are eliminated from the ranking and flagged at the bottom |
| Sensitivity Analysis | Drag markers to explore *"what if this criterion mattered more or less?"* — live breakeven points show exactly where the winner switches |

---

## Files

```
index.html     — the entire app (HTML + CSS + JS, self-contained)
CHANGELOG.md   — version history
README.md      — this file
```

---

## Export formats

| Format | Use case |
|---|---|
| `↓ HTML` | Shareable read-only snapshot; embeddable in Confluence, wikis, email |
| `↓ JSON` | Re-importable data file for ongoing editing |
| `⎙ Print` | Formatted print view with all data, notes, and sensitivity bars |

Exported HTML and JSON filenames include the decision name and author (e.g. `Serverauswahl – DecisionLab.html`).

---

## Versions

- **v0.3** — Solution notes, rating rationale, score definitions, must-have criteria (all Pro features toggleable)
- **v0.2** — Pro mode, fine-tune weights, sensitivity analysis, EN/DE language support, HTML export, decision name & author
- **v0.1** — Pairwise comparison, rating matrix, weighted ranking, auto-save, JSON save/load

---

Built by Claude & Milan
