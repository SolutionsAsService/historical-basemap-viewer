"""Build the viewer's derived data from upstream's GeoJSON.

Writes (viewer-owned, safe to regenerate at any time):
  site/data/slices.json   the stacked world maps on the home page
  site/data/thumbs.json   one small map per snapshot, for the Eras page
  site/data/meta.json     counts and the year range, read by the pages

Reads only upstream-owned files (index.json, geojson/world_*.geojson) and never edits them,
so `git merge upstream/master` stays clean. Run it after every upstream sync:

    python tools/build_slices.py

Pure Python 3, no packages: equirectangular projection, Douglas-Peucker simplification,
and the same colour hash as the atlas engine (site/js/atlas.js, getFeatureColor).
"""
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"
SLICE_YEARS = [-2000, -500, 1, 600, 1000, 1492, 1815, 1914, 2010]


def label(y):
    return f"{-y:,} BC" if y < 0 else f"{y} AD"


def js_hash(s):
    """Same as ((hash << 5) - hash) + charCodeAt(i), |0, over UTF-16 code units."""
    h = 0
    data = s.encode("utf-16-le")
    for i in range(0, len(data), 2):
        c = data[i] | (data[i + 1] << 8)
        h = ((h << 5) - h + c) & 0xFFFFFFFF
    return h - 0x100000000 if h & 0x80000000 else h


def hue(props):
    key = str(props.get("SUBJECTO") or props.get("PARTOF") or props.get("NAME") or props.get("name") or "")
    return ((js_hash(key) % 360) + 360) % 360


def dp(points, tol):
    """Douglas-Peucker on a list of (x, y). A closed ring is split at its farthest point first,
    because its start and end coincide and every distance to that zero-length chord is 0."""
    if len(points) < 3:
        return points
    if points[0] == points[-1]:
        x0, y0 = points[0]
        far = max(range(len(points)), key=lambda i: (points[i][0] - x0) ** 2 + (points[i][1] - y0) ** 2)
        if far in (0, len(points) - 1):
            return points[:1]
        return dp(points[: far + 1], tol)[:-1] + dp(points[far:], tol)
    stack, keep = [(0, len(points) - 1)], {0, len(points) - 1}
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, None
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep.add(idx)
            stack += [(a, idx), (idx, b)]
    return [points[i] for i in sorted(keep)]


def ring_area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2


def to_path(geom, scale, tol, min_area):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]] if geom["type"] == "Polygon" else []
    out = []
    for poly in polys:
        for ring in poly[:1]:  # outer ring only: holes are invisible at these sizes
            if max(c[1] for c in ring) < -58:
                continue  # Antarctica: a slab along the bottom edge that hides the rest at this size
            pts = [((c[0] + 180) * scale, (90 - c[1]) * scale) for c in ring]
            pts = dp(pts, tol)
            if len(pts) < 4 or ring_area(pts) < min_area:
                continue
            out.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts[:-1]) + "Z")
    return "".join(out)


def build(file, scale, tol, min_area):
    data = json.loads((ROOT / "geojson" / file).read_text(encoding="utf-8"))
    by_hue = {}
    names = set()
    for f in data.get("features", []):
        g = f.get("geometry")
        if not g:
            continue
        p = to_path(g, scale, tol, min_area)
        if not p:
            continue
        props = f.get("properties") or {}
        if props.get("NAME"):
            names.add(props["NAME"])
        by_hue.setdefault(hue(props), []).append(p)
    return [{"h": h, "d": "".join(ps)} for h, ps in sorted(by_hue.items())], len(names)


def main():
    index = json.loads((ROOT / "index.json").read_text(encoding="utf-8"))["years"]
    by_year = {y["year"]: y for y in index}
    OUT.mkdir(parents=True, exist_ok=True)

    slices = []
    for y in SLICE_YEARS:
        rec = by_year.get(y) or min(index, key=lambda r: abs(r["year"] - y))
        layers, n = build(rec["filename"], 2, 0.9, 6)
        slices.append({"year": rec["year"], "label": label(rec["year"]), "regions": n, "layers": layers})
    (OUT / "slices.json").write_text(json.dumps({"w": 720, "h": 360, "slices": slices}, separators=(",", ":")), encoding="utf-8")

    thumbs = []
    for rec in index:
        layers, n = build(rec["filename"], 1, 1.6, 4)
        thumbs.append({"year": rec["year"], "label": label(rec["year"]), "regions": n, "layers": layers})
    (OUT / "thumbs.json").write_text(json.dumps({"w": 360, "h": 180, "thumbs": thumbs}, separators=(",", ":")), encoding="utf-8")

    meta = {"snapshots": len(index), "earliest": index[0]["year"], "latest": index[-1]["year"],
            "earliestLabel": label(index[0]["year"]), "latestLabel": label(index[-1]["year"]),
            "regionsMax": max(len(r.get("countries", [])) for r in index)}
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    for f in ("slices.json", "thumbs.json", "meta.json"):
        print(f, f"{(OUT / f).stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
