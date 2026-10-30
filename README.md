# Palimpsest — a historical atlas of world borders

An interactive atlas over the [historical-basemaps](https://github.com/aourednik/historical-basemaps) dataset: world borders from 123,000 BC to 2010, one GeoJSON snapshot per period, on a flat atlas, a slippy map or a globe.

![Historical borders in 1880](img/historicalmaps-leaflet.png)

## Pages

| Page | What |
|---|---|
| `site/index.html` | Home: the palimpsest stack (nine real snapshots laid one on another in 3D) and turning points to jump into |
| `site/map.html` | The atlas: timeline, era jumps, Atlas / Map / Globe views, search, region details; deep links `?year=1492&view=globe` |
| `site/eras.html` | Every snapshot as a small map, filterable by era |
| `site/about.html` | Where the data comes from, how precise it is, how to correct it, how new snapshots arrive |

## How this fork stays mergeable with upstream

This repository is a fork of `aourednik/historical-basemaps`, and it **never edits upstream's files**:

| Owned by upstream (never edited here) | Owned by the viewer |
|---|---|
| `geojson/`, `svg/`, `img/`, `examples/`, `lib/`, `scripts/`, `index.json`, `LICENSE`, `CONTRIBUTING.md` | `site/`, `tools/`, `.github/`, `index.html` (redirect), `vercel.json`, `.vercelignore`, `.gitattributes`, `.gitignore`, `DESIGN-LOG.md`, this `README.md` |

`README.md` keeps our version on merge (`.gitattributes`: `README.md merge=ours`). Upstream's own CI keeps `index.json` in step with `geojson/`, and the viewer reads it as-is.

To bring in new datasets:

```bash
python tools/sync_upstream.py --dry-run   # what upstream would bring
python tools/sync_upstream.py             # merge it and rebuild the viewer's data
git push
```

The script adds the `upstream` remote if it's missing, refuses to run on a dirty tree, stops before merging if upstream ever touches a viewer path, merges, warns about any snapshot missing from `index.json`, and rebuilds `site/data/` (the home stack, the era thumbnails and the counts) with `tools/build_slices.py`. The workflow `.github/workflows/sync-upstream.yml` does the same weekly (or on demand) on an `upstream-sync` branch and opens a pull request; it never pushes to `master`.

Tested on 2026-10-30 by merging a simulated upstream commit that added a 2020 snapshot, regenerated `index.json` and edited upstream's README: no conflicts, our README kept, and the rebuilt data showed 55 snapshots ending at 2020 AD.

## Data loading

The pages live in `site/`; the data stays at the repository root where upstream keeps it. The atlas loads `../index.json` and `../geojson/…` first, and falls back to the same files on upstream through jsDelivr if they aren't there (for example if the site is deployed with `site/` as its root).

## Run locally

```bash
python -m http.server 8000      # from the repository root, then open http://localhost:8000/
```

## Deploy

Static, no install or build step. `vercel.json` serves the repository root (so `site/` and the data are both public); `.vercelignore` leaves out the SVGs, images and examples the site doesn't use. The root `index.html` redirects to `site/`. If the Vercel or Shadw root is set to `site/` instead, `site/vercel.json` applies and the atlas reads the data from upstream's CDN.

## Data, licence and credits

Borders: André Ourednik and contributors, [historical-basemaps](https://github.com/aourednik/historical-basemaps), GPL-3.0 (see `LICENSE`). Borders are approximate and sometimes disputed; check other sources before academic use, and send corrections upstream (see `CONTRIBUTING.md`). Viewer and design: SolutionsAsService. The design record is in `DESIGN-LOG.md`.
