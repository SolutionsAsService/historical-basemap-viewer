# DESIGN-LOG — Palimpsest (historical-basemap-viewer redesign, dada-lite)

## Plan
- **Brief:** a graphic homepage, the map on its own page, "something really nice", and new datasets merged cleanly from the upstream data repo (aourednik/historical-basemaps).
- **Mode:** Adaptive (MAYA). **Pages:** home, atlas, eras, about, 404.
- **Seed:** stance `The Art of Looking Sideways (Alan Fletcher)` (the name as the picture); rules `Envisioning Information (Edward Tufte)`, `WCAG 2.2 Contrast and Perceivability (W3C)`; breaker `Irma Boom: Biography in Books (Irma Boom)` (the object as stacked pages); counterpoint `Interaction of Color (Josef Albers)` via `wcag -.->|contrast floor constrains| albers`.
- **Premortem:** the fork was 10 upstream commits behind (no 1930, no name fixes, old folder layout) and had edited upstream's README and CONTRIBUTING, so every merge would conflict; its own CI rewrote `index.json`, the file upstream's CI also writes. The viewer sat at the repo root in one page with a 5,168-line stylesheet; the atlas view drew every region one flat colour.

## Moves
- **M1** KEEP. Upstream first: merged upstream/master (one conflict, README → ours); reset CONTRIBUTING.md and index.json to upstream byte for byte. After it, the fork differs from upstream only in viewer-owned paths.
- **M2** KEEP. Ownership split: upstream owns its folders and files; the viewer owns `site/`, `tools/`, `.github/`, the root redirect, deploy config and README (`merge=ours`). `tools/sync_upstream.py` (dry run, viewer-path guard, merge, unindexed-snapshot warning, data rebuild) and a weekly PR-only workflow.
- **M3** BREAK. The palimpsest stack: nine real snapshots rendered from upstream GeoJSON by `tools/build_slices.py` (Douglas-Peucker, the engine's colour hash ported to Python and checked equal: "Castile" → hue 19 in both), stacked in CSS 3D with translucent seas so the eras show through.
- **M4** KEEP. Atlas: the existing engine kept (3,200 lines, three views), restyled in a new 200-line stylesheet; regions coloured by authority in the Atlas view too; data loads `../` first, upstream jsDelivr second.
- **M5** ADAPT (bug). Closed rings simplified to two points (start = end, so every distance to the chord was 0): split rings at the farthest point first. 1 KB → 321 KB.
- **M6** ADAPT (measured). Antarctica painted a salmon slab across the only visible edge of each lower sheet; left out of the generated sheets, and said so under the stack.
- **M7** ADAPT (measured). Atlas regions rendered black: the old CSS gave `.historical-border` `fill:none`; restored, with the place and tooltip classes.
- **M8** ADAPT. Precision legend was inverted (data: 1 = approximate, 3 = precise); fixed in CSS, legend and copy.
- **M9** BREAK (ambition push, Shklovsky R1). **Scrape the stack:** one button collapses all nine sheets onto one page and overprints every era's borders as ghosts, newest brightest. Rendered and checked.

## Measurements
| Check | Result |
|---|---|
| Clean merge (simulated) | throwaway worktree: fake upstream commit adds `world_2020.geojson`, regenerates `index.json` with upstream's own script, edits upstream's README → merge with 0 conflicts, our README kept, rebuilt data: 55 snapshots, latest "2020 AD" |
| Real sync | `python tools/sync_upstream.py --dry-run` → "Already up to date with upstream" after M1 |
| Data weight | slices 321 KB (105 KB gzip), thumbs 554 KB (69 KB gzip) |
| Overflow at 375 | index, map, eras, about, 404: scrollWidth = clientWidth |
| Views | Atlas 1492 coloured, Castille info panel; Globe 1914; deep links `?year=` and `?view=` work |
| Snapshot spacing | 21 of 54 snapshots are 1500 AD or later (Eras copy now says so) |

## Panel R1 (one sub-agent, five seats; filed in dada-lessons)
| Seat | Verdict | Resolution |
|---|---|---|
| Provocateur (Shklovsky) | PASS + escalation | M9, Scrape the stack. |
| Evidence (Tufte) | OBJECT | ADAPT: note under the stack (projection, Antarctica omitted, colour meaningful only within a sheet); "Faint where it's guessed" copy says precision is rated mostly per era (measured: 1000 AD all 1, 1815 all 3); legend swatches now drawn with the real region classes. |
| Evidence (Cairo) | OBJECT | Quote attribution: **OVERRULE by measurement**, upstream's README does carry the Graeber & Wengrow quote. "About 20 km shift": removed (in no upstream file). Lede now "54 snapshots in all, nine of them stacked here"; Alexander caption tightened. |
| Inclusion (Mace) | OBJECT (minor) | ADAPT: slider `aria-valuetext` is the year; one live region (timeline year); core-sample links out of the tab order (they duplicate the stack links); Tab trapped in the help dialog. |
| Craft (Bringhurst) | PASS (note) | Sidebar "Showing" year removed (the year was printed four times); smallest mono raised to .76–.78rem. |
Andon: none.

## Stop check (bounded)
- 1 panel round + measured re-render. S2/S3 not met (bounded run).
- Open: the stack's entrance and breathing are CSS transitions, which this app's background browser pane doesn't advance (screenshots need a second capture); the deploy serves the repo root, so the second `site/vercel.json` relies on the CDN fallback for data.
- Left on disk for the owner: `H:\UBM\_wt-merge-test` (the throwaway worktree; git has unregistered it, the folder couldn't be deleted while locked).
