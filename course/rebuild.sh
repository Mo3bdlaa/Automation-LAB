#!/usr/bin/env bash
# Rebuild one deck from the source session deck plus its spec in decks/.
#
#   ./rebuild.sh            # every deck
#   ./rebuild.sh invoice    # just decks/invoice.py
set -euo pipefail
cd "$(dirname "$0")"
SRC="assets/source-session-deck.pptx"
SK=/root/.claude/skills/synced/6a6486ea-b0d9-42a7-97df-fb521a7fb6f8_42403b98-4f84-44ea-92c3-b6ea374d5199/pptx

decks=("$@")
if [ ${#decks[@]} -eq 0 ]; then
  decks=()
  for f in decks/*.py; do
    base="$(basename "$f" .py)"
    [ "$base" = "__init__" ] || decks+=("$base")
  done
fi

for deck in "${decks[@]}"; do
  out=$(python3 -c "import sys; sys.path.insert(0,'.'); import importlib; print(importlib.import_module('decks.$deck').OUTPUT)")
  rm -rf build/unpacked
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall('build/unpacked')" "$SRC"

  # A deck that wants two slides of one archetype gets a copy of it first.
  # add_slide.py names the copies in package order, which is why the spec's
  # ORDER can refer to slide19.xml and friends that the source has never heard
  # of: they exist only after this loop.
  python3 -c "import sys; sys.path.insert(0,'.'); import importlib
for src, after in getattr(importlib.import_module('decks.$deck'), 'CLONES', []):
    print(src, after)" | while read -r src after; do
    [ -n "$src" ] && python3 "$SK/scripts/add_slide.py" build/unpacked/ "$src" --after "$after" >/dev/null
  done

  DECK="$deck" python3 - <<'PY'
import importlib, os, re, sys
sys.path.insert(0, ".")
order = importlib.import_module(f"decks.{os.environ['DECK']}").ORDER
rels = open("build/unpacked/ppt/_rels/presentation.xml.rels").read()
m = {t.split("/")[-1]: r for r, t in re.findall(r'Id="([^"]+)"[^>]*Target="(slides/slide\d+\.xml)"', rels)}
p = open("build/unpacked/ppt/presentation.xml").read()
new = "".join(f'<p:sldId id="{256+i}" r:id="{m[s]}"/>' for i, s in enumerate(order))
open("build/unpacked/ppt/presentation.xml", "w").write(
    re.sub(r'<p:sldIdLst>.*?</p:sldIdLst>', f'<p:sldIdLst>{new}</p:sldIdLst>', p, flags=re.S))
PY

  python3 "$SK/scripts/clean.py" build/unpacked/ >/dev/null
  python3 fill.py "$deck" build/unpacked
  rm -f "$out"
  (cd build/unpacked && zip -Xqr "../../$out" .)
  python3 "$SK/scripts/office/validate.py" "$out" --original "$SRC"
  echo "wrote $out"
done
