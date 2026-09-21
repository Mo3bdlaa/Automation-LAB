# Course material

Two decks, eighteen slides each, in the mentoring course's house style. Each one
ships as `.pptx` to present from and `.pdf` to send or read.

| Deck | What it is |
|---|---|
| `automation-lab-deck` | A two-hour bonus session that introduces the lab, walks a run live, and sets the task. |
| `invoice-processing-deck` | One scenario followed all the way down, as a Document Understanding project: the process, the document, read → match → decide, the five levels, the three-way match, the decision. |

## Why it is built rather than drawn

The mentoring course already has a look: a near-black canvas with a faint grid,
Geist over Geist Mono, one gold accent, a rule along the top edge that grows
with the slide number, and a rhythm of eyebrow → headline → numbered rows. It is
a good deck design and it is already decided.

So these are not reconstructions of that style. Each one **is** one of those decks,
with different words in it: `rebuild.sh` unpacks `assets/source-session-deck.pptx`,
picks the slide archetypes the session needs, and replaces the runs inside chosen
text boxes. Every size, face, letter-spacing and position is the original's.

Which is also why a deck is written by choosing archetypes rather than by writing
slides. The source has eighteen of them — a cover, rows of four and of six, two
cards, three cards, a three-stage chain, a four-stage flow, a tagged list — and a
deck's spec names the ones it wants, in order. Wanting the same archetype twice is
what `CLONES` is for.

A reconstruction would have been close, and "close" is what reads as a different
deck two slides in.

## Rebuilding

```bash
./rebuild.sh                    # every deck
./rebuild.sh invoice            # just decks/invoice.py
pnpm deck:preview               # the PDF and a PNG of every slide, for every deck
```

Edit the words in `decks/<name>.py` and run both again. Shapes are addressed by
the order they appear on the source slide, so changing copy never touches
geometry.

| File | What it is |
|---|---|
| `decks/bonus.py` | every word the bonus session says, and which archetypes back it |
| `decks/invoice.py` | the same, for the invoice-processing project |
| `common.py` | the vocabulary a spec is written in — roles, eyebrows, rows, stages |
| `fill.py` | the mechanics — run replacement, the progress rule, slide numbering |
| `preview.py` | the package's geometry as HTML, so a browser can print it |
| `assets/source-session-deck.pptx` | the session deck the house style comes from |

A deck module declares four things: `OUTPUT` (the file it writes), `CLONES`
(archetypes it needs a second copy of), `ORDER` (which source slide backs each
position) and `SLIDES` (the words).

## What was checked

The package validates against the template (`validate.py --original`); the gold
rule measures `n/18` of the slide width on every slide; and no text from the
source session survives anywhere.

Every slide of both decks has also been rendered and looked at. `pnpm deck:preview`
reads the geometry straight out of the package, lays it out in HTML at exactly
13.333 × 7.5in, prints it with the same headless Chromium the app uses for its
own documents, and reports any text box whose content is taller than the box.
All thirty-six render clean.

One caveat, and it is the useful kind. Geist is neither installed here nor
embedded in the file, so the render substitutes a wider grotesque: anything that
fits in the PNGs fits in PowerPoint, but a line that looks comfortable here is
not proof of anything narrower. Position, size, colour, letter-spacing and the
gold rule are read from the package and are exact.

Open it once before you present it anyway — the PDF is a print of a
reconstruction, not of PowerPoint.

The checker only catches a box that has burst. It cannot tell you that a headline
has quietly wrapped onto a second line while still fitting, which is why the PNGs
get looked at too: four lines in the invoice deck were shortened for exactly that.

## What is not here

Exercise briefs, starter projects and a grade mapping. Those are teaching
decisions — how much to give away, what counts as a pass in *your* course, which
scenario a given cohort starts on — and they should be written by whoever is
standing in front of the room.
