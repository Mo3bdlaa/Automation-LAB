#!/usr/bin/env python3
"""
Fill a deck from its content spec (`decks/<name>.py`).

The deck is not drawn from scratch: it is the mentoring course's own session
deck with new words in it. That is deliberate. The house style — the near-black
canvas and its faint grid, Geist over Geist Mono, the gold rule that grows with
the slide number, the eyebrow / headline / numbered-row rhythm — is already
decided and already right, and a reconstruction of it would differ in a dozen
small ways that all read as "not quite the same deck".

So this script does structural edits only: it replaces the runs inside chosen
shapes, keeping every size, face, letter-spacing and position the original set.

Roles map to the palette lifted from that deck:
  w  near-white F4F4F2, the emphasis colour       b  the same, bold
  n  grey       9B9EA6, body                      m  dim grey 6A6D75, meta
  a  gold       E8B84B, the one accent            ab the same, bold
"""
import importlib, sys
from xml.dom import minidom

INK = {"w": ("0", "F4F4F2"), "b": ("1", "F4F4F2"), "n": ("0", "9B9EA6"),
       "m": ("0", "6A6D75"), "a": ("0", "E8B84B"), "ab": ("1", "E8B84B")}
SLIDE_W = 12191695  # EMU, 13.333in


def runs_of(para):
    return [r for r in para.childNodes if r.nodeType == 1 and r.tagName == "a:r"]


def set_para(doc, para, segments):
    """
    Replace a paragraph's runs, keeping the formatting of the run in each
    position.

    Position matters rather than just the first run: the meta strip alternates
    an 8pt gold bullet with 11pt grey capitals, and the cover's headline is two
    sizes of nothing-alike. Cloning run 0 for everything would flatten both. A
    segment past the last source run reuses the last one's formatting.
    """
    existing = runs_of(para)
    if not existing:
        return
    made = []
    for i, (text, role) in enumerate(segments):
        run = existing[min(i, len(existing) - 1)].cloneNode(True)
        bold, colour = INK[role]
        rPr = run.getElementsByTagName("a:rPr")
        if rPr:
            rPr[0].setAttribute("b", bold)
            for c in rPr[0].getElementsByTagName("a:srgbClr"):
                c.setAttribute("val", colour)
        t = run.getElementsByTagName("a:t")[0]
        while t.firstChild:
            t.removeChild(t.firstChild)
        t.appendChild(doc.createTextNode(text))
        if text != text.strip():
            t.setAttribute("xml:space", "preserve")
        made.append(run)
    ref = existing[-1].nextSibling
    for r in existing:
        para.removeChild(r)
    for run in made:
        para.insertBefore(run, ref)


def text_shapes(doc):
    """Shapes carrying text, in document order — the addressing the spec uses."""
    out = []
    for sp in doc.getElementsByTagName("p:sp"):
        if any(t.firstChild for t in sp.getElementsByTagName("a:t")):
            out.append(sp)
    return out


def paras_of(sp):
    return [p for p in sp.getElementsByTagName("a:p")
            if any(t.firstChild for t in p.getElementsByTagName("a:t"))]


def fill_shape(doc, sp, blocks):
    """blocks: one list of (text, role) segments per paragraph in the shape."""
    ps = paras_of(sp)
    for i, block in enumerate(blocks):
        if i < len(ps):
            set_para(doc, ps[i], block)
    # A shape given fewer lines than it has loses the rest.
    for p in ps[len(blocks):]:
        p.parentNode.removeChild(p)


def drop_shapes(doc, indices):
    shapes = text_shapes(doc)
    for i in sorted(indices, reverse=True):
        shapes[i].parentNode.removeChild(shapes[i])


def trim_below(doc, inches):
    """
    Remove blank furniture below a given height.

    The row archetypes carry one hairline rule per row, and the rules hold no
    text — so `drop`, which addresses text shapes, cannot reach them. A slide
    that uses fewer rows than its source is left with the leftover rules
    hanging under the last row. This sweeps them.
    """
    limit = inches * 914400
    for sp in list(doc.getElementsByTagName("p:sp")):
        if any(t.firstChild for t in sp.getElementsByTagName("a:t")):
            continue
        off = sp.getElementsByTagName("a:off")
        if off and int(off[0].getAttribute("y")) >= limit:
            sp.parentNode.removeChild(sp)


def set_progress(doc, n, total):
    """The gold rule along the top edge: its width is how far through you are."""
    for sp in doc.getElementsByTagName("p:sp"):
        off = sp.getElementsByTagName("a:off")
        ext = sp.getElementsByTagName("a:ext")
        if not off or not ext:
            continue
        if off[0].getAttribute("x") == "0" and off[0].getAttribute("y") == "0":
            fills = [c.getAttribute("val") for c in sp.getElementsByTagName("a:srgbClr")]
            if "E8B84B" in fills:
                ext[0].setAttribute("cx", str(round(SLIDE_W * n / total)))
                return


def build(deck_name, root):
    spec = importlib.import_module(f"decks.{deck_name}")
    order, deck, total = spec.ORDER, spec.DECK, len(spec.SLIDES)
    assert len(order) == total, f"{len(order)} slides in the package, {total} in the spec"

    for n, (slide, fname) in enumerate(zip(spec.SLIDES, order), start=1):
        path = f"{root}/ppt/slides/{fname}"
        doc = minidom.parse(path)
        if slide.get("drop"):
            drop_shapes(doc, slide["drop"])
        if slide.get("trim"):
            trim_below(doc, slide["trim"])
        shapes = text_shapes(doc)

        # The furniture every slide carries.
        fill_shape(doc, shapes[1], [[(deck["kicker"], "m")]])
        fill_shape(doc, shapes[2], [[(deck["footer"], "m")]])
        fill_shape(doc, shapes[3], [[(f"{n:02d}", "w"), (f" / {total}", "m")]])
        set_progress(doc, n, total)

        for idx, blocks in slide["fill"].items():
            i = int(idx)
            if i >= len(shapes):
                raise SystemExit(f"slide {n} ({fname}): no shape [{i}] — it has {len(shapes)}")
            fill_shape(doc, shapes[i], [[tuple(seg) for seg in block] for block in blocks])
        with open(path, "w", encoding="utf-8") as f:
            doc.writexml(f, encoding="UTF-8")
    print(f"filled {total} slides")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
