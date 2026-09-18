#!/usr/bin/env bash
# Rebuild the deck from the source session deck plus content.py.
set -euo pipefail
cd "$(dirname "$0")"
SRC="${1:-assets/source-session-deck.pptx}"
SK=/root/.claude/skills/synced/6a6486ea-b0d9-42a7-97df-fb521a7fb6f8_42403b98-4f84-44ea-92c3-b6ea374d5199/pptx
rm -rf build/unpacked
python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall('build/unpacked')" "$SRC"
python3 $SK/scripts/add_slide.py build/unpacked/ slide2.xml --after slide2.xml >/dev/null
python3 $SK/scripts/add_slide.py build/unpacked/ slide2.xml --after slide2.xml >/dev/null
python3 $SK/scripts/add_slide.py build/unpacked/ slide4.xml --after slide4.xml >/dev/null
python3 - <<'PY'
import re, json
rels = open("build/unpacked/ppt/_rels/presentation.xml.rels").read()
m = {t.split("/")[-1]: r for r, t in re.findall(r'Id="([^"]+)"[^>]*Target="(slides/slide\d+\.xml)"', rels)}
order = json.load(open("slide-order.json"))
p = open("build/unpacked/ppt/presentation.xml").read()
new = "".join(f'<p:sldId id="{256+i}" r:id="{m[s]}"/>' for i, s in enumerate(order))
open("build/unpacked/ppt/presentation.xml", "w").write(
    re.sub(r'<p:sldIdLst>.*?</p:sldIdLst>', f'<p:sldIdLst>{new}</p:sldIdLst>', p, flags=re.S))
PY
python3 $SK/scripts/clean.py build/unpacked/ >/dev/null
python3 fill.py slide-order.json build/unpacked
rm -f automation-lab-deck.pptx
(cd build/unpacked && zip -Xqr ../../automation-lab-deck.pptx .)
python3 $SK/scripts/office/validate.py automation-lab-deck.pptx --original "$SRC"
