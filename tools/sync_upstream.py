"""Bring new datasets in from upstream (aourednik/historical-basemaps) with a clean merge.

    python tools/sync_upstream.py            # fetch, check, merge, rebuild the viewer's data, commit
    python tools/sync_upstream.py --dry-run  # only show what upstream would bring

Why it stays clean: this fork never edits upstream's files. Upstream owns geojson/, svg/, img/,
examples/, lib/, scripts/, index.json, LICENSE and CONTRIBUTING.md; the viewer owns only the
paths in VIEWER_PATHS below. README.md is ours and keeps our version on merge
(.gitattributes: README.md merge=ours). The script refuses to merge if upstream ever starts
touching a viewer path, so a conflict can't sneak in.
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
UPSTREAM = "https://github.com/aourednik/historical-basemaps.git"
BRANCH = "master"
VIEWER_PATHS = ("site/", "tools/", ".github/", "vercel.json", ".vercelignore", ".gitattributes", "index.html", "DESIGN-LOG.md", ".gitignore")


def git(*args, check=True, capture=True):
    r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=capture)
    if check and r.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed:\n{r.stderr or r.stdout}")
    return (r.stdout or "").strip()


def main():
    dry = "--dry-run" in sys.argv
    if not dry and git("status", "--porcelain"):
        sys.exit("The working tree has uncommitted changes. Commit or stash them first.")

    remotes = git("remote").split()
    if "upstream" not in remotes:
        git("remote", "add", "upstream", UPSTREAM)
    git("config", "merge.ours.driver", "true")  # lets README.md keep our version (see .gitattributes)
    print(f"Fetching {UPSTREAM} ...")
    git("fetch", "--quiet", "upstream", BRANCH)
    ref = f"upstream/{BRANCH}"

    incoming = git("log", "--oneline", f"HEAD..{ref}")
    if not incoming:
        print("Already up to date with upstream.")
        return
    changes = [line.split("\t") for line in git("diff", "--name-status", f"HEAD...{ref}").splitlines() if line]
    touched = [c[-1] for c in changes]
    data = [c for c in changes if c[-1].startswith("geojson/")]
    print(f"\n{len(incoming.splitlines())} upstream commit(s), {len(changes)} file(s) changed, {len(data)} in geojson/:")
    for status, *paths in data:
        print(f"  {status:2} {paths[-1]}")

    clash = [p for p in touched if p.startswith(VIEWER_PATHS) and p != "README.md"]
    if clash:
        sys.exit("\nUpstream now touches viewer-owned paths, so this merge would not be clean:\n  " + "\n  ".join(clash)
                 + "\nMerge by hand (git merge upstream/master) and move the viewer if needed.")
    if dry:
        print("\nDry run: nothing merged.")
        return

    print(f"\nMerging {ref} ...")
    r = subprocess.run(["git", "merge", "--no-edit", "-m", f"Merge upstream {ref}", ref], cwd=ROOT, text=True, capture_output=True)
    if r.returncode != 0:
        git("merge", "--abort", check=False)
        sys.exit(f"The merge stopped with conflicts and was aborted:\n{r.stdout}\n{r.stderr}")

    # upstream's CI keeps index.json in step with geojson/; warn if a snapshot is missing from it
    listed = {y["filename"] for y in json.loads((ROOT / "index.json").read_text(encoding="utf-8"))["years"]}
    unlisted = sorted(p.name for p in (ROOT / "geojson").glob("world_*.geojson") if p.name not in listed)
    if unlisted:
        print("Warning: these snapshots are not in upstream's index.json yet, so the viewer won't show them:")
        for name in unlisted:
            print(f"  {name}")

    print("Rebuilding the viewer's data (home stack, era thumbnails, counts) ...")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_slices.py")], cwd=ROOT, check=True)
    git("add", "site/data")
    if git("status", "--porcelain", "site/data"):
        git("commit", "-q", "-m", "Rebuild viewer data after the upstream sync")
    print("\nDone. Review with `git log -3` and push when ready.")


if __name__ == "__main__":
    main()
