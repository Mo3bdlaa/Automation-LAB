# Course material

`automation-lab-deck.pptx` — a two-hour bonus session that introduces the lab,
walks a run live, and sets the task. Eighteen slides.

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
```

Edit the words in `content.py` and run it again. Shapes are addressed by the
order they appear on the source slide, so changing copy never touches geometry.

| File | What it is |
|---|---|
| `content.py` | every word the deck says |
| `fill.py` | the mechanics — run replacement, the progress rule, slide numbering |
| `slide-order.json` | which source slide backs each of the 18 positions |
| `assets/source-session-deck.pptx` | the session deck the house style comes from |

## What was checked, and what was not

Checked: the package validates against the template (`validate.py --original`);
the gold rule measures `n/18` of the slide width on every slide; no text from the
source session survives anywhere; and every paragraph was measured against the
box it sits in and against the line it replaced, because the boxes are sized for
the original's copy and nothing here should be longer than what those boxes are
already known to hold.

**Not checked: how it looks.** The environment this was built in has no
LibreOffice and no PDF rasteriser, so no slide was ever rendered. The fit
estimates above are arithmetic, not a photograph, and Geist is not installed here
either — PowerPoint will lay it out slightly differently from any estimate.

Open it once before you present it. The two slides worth looking at first are
**12** and **17**, whose paragraphs are the longest relative to the lines they
replaced.

## What is not here

Exercise briefs, starter projects and a grade mapping. Those are teaching
decisions — how much to give away, what counts as a pass in *your* course, which
scenario a given cohort starts on — and they should be written by whoever is
standing in front of the room.
