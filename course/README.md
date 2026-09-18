# Course material

`automation-lab-deck.pptx` — a two-hour bonus session that introduces the lab,
walks a run live, and sets the task. Eighteen slides.
`automation-lab-deck.pdf` is the same deck printed, for sending or reading.

## Why it is built rather than drawn

The mentoring course already has a look: a near-black canvas with a faint grid,
Geist over Geist Mono, one gold accent, a rule along the top edge that grows
with the slide number, and a rhythm of eyebrow → headline → numbered rows. It is
a good deck design and it is already decided.

So this deck is not a reconstruction of that style. It **is** one of those decks,
with different words in it: `rebuild.sh` unpacks `assets/source-session-deck.pptx`,
picks the slide archetypes the session needs, and replaces the runs inside chosen
text boxes. Every size, face, letter-spacing and position is the original's.

A reconstruction would have been close, and "close" is what reads as a different
deck two slides in.

## Rebuilding

```bash
./rebuild.sh                    # writes automation-lab-deck.pptx
pnpm deck:preview               # writes the PDF and a PNG of every slide
```

Edit the words in `content.py` and run both again. Shapes are addressed by the
order they appear on the source slide, so changing copy never touches geometry.

| File | What it is |
|---|---|
| `content.py` | every word the deck says |
| `fill.py` | the mechanics — run replacement, the progress rule, slide numbering |
| `slide-order.json` | which source slide backs each of the 18 positions |
| `preview.py` | the package's geometry as HTML, so a browser can print it |
| `assets/source-session-deck.pptx` | the session deck the house style comes from |

## What was checked

The package validates against the template (`validate.py --original`); the gold
rule measures `n/18` of the slide width on every slide; and no text from the
source session survives anywhere.

Every slide has also been rendered and looked at. `pnpm deck:preview` reads the
geometry straight out of the package, lays it out in HTML at exactly
13.333 × 7.5in, prints it with the same headless Chromium the app uses for its
own documents, and reports any text box whose content is taller than the box.
All eighteen render clean.

One caveat, and it is the useful kind. Geist is neither installed here nor
embedded in the file, so the render substitutes a wider grotesque: anything that
fits in the PNGs fits in PowerPoint, but a line that looks comfortable here is
not proof of anything narrower. Position, size, colour, letter-spacing and the
gold rule are read from the package and are exact.

Open it once before you present it anyway — the PDF is a print of a
reconstruction, not of PowerPoint.

## What is not here

Exercise briefs, starter projects and a grade mapping. Those are teaching
decisions — how much to give away, what counts as a pass in *your* course, which
scenario a given cohort starts on — and they should be written by whoever is
standing in front of the room.
