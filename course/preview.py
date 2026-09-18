#!/usr/bin/env python3
"""
Lay a deck out as HTML so a browser can print it, without PowerPoint.

Why this exists: LibreOffice is installed in this environment but cannot load
anything — it fails the same way on a one-line HTML file as on a deck — so the
usual pptx → pdf path is closed. Chromium works, though, and a slide is not a
complicated thing: a background, some rectangles, and text boxes at known
positions. So this reads the geometry straight out of the package and lays it
out in HTML at exactly 13.333 × 7.5 inches.

Two warnings about what comes out.

The typeface is not the deck's. Geist and Geist Mono are not installed here and
are not embedded in the file, so the render substitutes. Everything else —
position, size, colour, letter-spacing, the gold rule — is read from the
package and is exact.

That substitution is why the render is still worth making: the stand-in is
wider than Geist at the same size, so anything that fits here fits in
PowerPoint. It cannot prove a line is safe by being narrow.

    python3 preview.py automation-lab-deck.pptx out/     # writes out/deck.html

`pnpm deck:preview` drives this end to end: it runs this, prints the result to
course/automation-lab-deck.pdf, shoots a PNG of every slide and reports any text
box whose content is taller than the box.
"""
import base64, json, re, sys, zipfile
from pathlib import Path
from xml.dom import minidom

EMU = 914400.0
PT = 12700.0  # EMU per point
SLIDE_W, SLIDE_H = 13.333, 7.5

# Geist is a geometric grotesque; these are the closest installed shapes.
# Single quotes on purpose: these land inside a double-quoted style attribute,
# and double quotes here close it early — which silently dropped every
# font-family and rendered the whole deck in the browser's default serif.
FACE = {
    "Geist": "'Liberation Sans','DejaVu Sans',sans-serif",
    "Geist Mono": "'DejaVu Sans Mono','Liberation Mono',monospace",
}
DEFAULT_FACE = "'Liberation Sans','DejaVu Sans',sans-serif"


def child(node, tag):
    for c in node.childNodes:
        if c.nodeType == 1 and c.tagName == tag:
            return c
    return None


def colour_of(node):
    if node is None:
        return None
    c = node.getElementsByTagName("a:srgbClr")
    return f"#{c[0].getAttribute('val')}" if c else None


def frame(sp):
    off = sp.getElementsByTagName("a:off")
    ext = sp.getElementsByTagName("a:ext")
    if not off or not ext:
        return None
    return (int(off[0].getAttribute("x")) / EMU, int(off[0].getAttribute("y")) / EMU,
            int(ext[0].getAttribute("cx")) / EMU, int(ext[0].getAttribute("cy")) / EMU)


def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace(" ", "&nbsp;") if t.strip() != t else
            t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def runs_html(para):
    out = []
    for r in para.childNodes:
        if r.nodeType != 1 or r.tagName not in ("a:r", "a:br"):
            continue
        if r.tagName == "a:br":
            out.append("<br>")
            continue
        t = r.getElementsByTagName("a:t")
        if not t or not t[0].firstChild:
            continue
        rPr = child(r, "a:rPr")
        style = []
        if rPr is not None:
            if rPr.getAttribute("sz"):
                style.append(f"font-size:{int(rPr.getAttribute('sz'))/100:.2f}pt")
            if rPr.getAttribute("b") == "1":
                style.append("font-weight:700")
            if rPr.getAttribute("i") == "1":
                style.append("font-style:italic")
            if rPr.getAttribute("spc"):
                style.append(f"letter-spacing:{int(rPr.getAttribute('spc'))/100:.2f}pt")
            col = colour_of(child(rPr, "a:solidFill"))
            if col:
                style.append(f"color:{col}")
            lat = rPr.getElementsByTagName("a:latin")
            if lat:
                style.append(f"font-family:{FACE.get(lat[0].getAttribute('typeface'), DEFAULT_FACE)}")
        out.append(f'<span style="{";".join(style)}">{esc(t[0].firstChild.data)}</span>')
    return "".join(out)


def shape_html(sp, media):
    f = frame(sp)
    if f is None:
        return ""
    x, y, w, h = f
    box = f"position:absolute;left:{x:.3f}in;top:{y:.3f}in;width:{w:.3f}in;height:{h:.3f}in"
    parts = []

    spPr = child(sp, "p:spPr")
    if spPr is not None:
        fill = colour_of(child(spPr, "a:solidFill"))
        ln = child(spPr, "a:ln")
        prst = child(spPr, "a:prstGeom")
        geom = prst.getAttribute("prst") if prst is not None else "rect"
        deco = [box]
        if fill:
            deco.append(f"background:{fill}")
        if ln is not None:
            lc = colour_of(child(ln, "a:solidFill"))
            lw = int(ln.getAttribute("w") or 9525) / PT
            if lc:
                deco.append(f"border:{lw:.2f}pt solid {lc}")
        if geom == "roundRect":
            deco.append("border-radius:10px")
        if fill or (ln is not None and colour_of(child(ln, "a:solidFill"))):
            parts.append(f'<div style="{";".join(deco)}"></div>')

    tx = child(sp, "p:txBody")
    if tx is not None:
        bodyPr = child(tx, "a:bodyPr")
        anchor = (bodyPr.getAttribute("anchor") if bodyPr is not None else "") or "t"
        ins = {"l": 91440, "r": 91440, "t": 45720, "b": 45720}
        if bodyPr is not None:
            for k, attr in (("l", "lIns"), ("r", "rIns"), ("t", "tIns"), ("b", "bIns")):
                if bodyPr.getAttribute(attr):
                    ins[k] = int(bodyPr.getAttribute(attr))
        just = {"t": "flex-start", "ctr": "center", "b": "flex-end"}[anchor if anchor in ("t", "ctr", "b") else "t"]
        pad = (f"padding:{ins['t']/EMU:.3f}in {ins['r']/EMU:.3f}in "
               f"{ins['b']/EMU:.3f}in {ins['l']/EMU:.3f}in")
        inner = []
        for para in tx.getElementsByTagName("a:p"):
            pPr = child(para, "a:pPr")
            pstyle = ["margin:0"]
            if pPr is not None:
                algn = pPr.getAttribute("algn")
                pstyle.append({"r": "text-align:right", "ctr": "text-align:center",
                               "just": "text-align:justify"}.get(algn, "text-align:left"))
                ln_ = child(pPr, "a:lnSpc")
                if ln_ is not None:
                    pct = ln_.getElementsByTagName("a:spcPct")
                    if pct:
                        pstyle.append(f"line-height:{int(pct[0].getAttribute('val'))/100000:.3f}")
                bef = child(pPr, "a:spcBef")
                if bef is not None:
                    pts = bef.getElementsByTagName("a:spcPts")
                    if pts:
                        pstyle.append(f"margin-top:{int(pts[0].getAttribute('val'))/100:.2f}pt")
                aft = child(pPr, "a:spcAft")
                if aft is not None:
                    pts = aft.getElementsByTagName("a:spcPts")
                    if pts:
                        pstyle.append(f"margin-bottom:{int(pts[0].getAttribute('val'))/100:.2f}pt")
            body = runs_html(para)
            inner.append(f'<p style="{";".join(pstyle)}">{body or "&nbsp;"}</p>')
        parts.append(
            f'<div style="{box};{pad};box-sizing:border-box;display:flex;'
            f'flex-direction:column;justify-content:{just};overflow:visible">{"".join(inner)}</div>')
    return "".join(parts)


def pic_html(pic, media, rels):
    f = frame(pic)
    if f is None:
        return ""
    x, y, w, h = f
    blip = pic.getElementsByTagName("a:blip")
    if not blip:
        return ""
    rid = blip[0].getAttribute("r:embed")
    target = rels.get(rid)
    if not target or target not in media:
        return ""
    b64 = base64.b64encode(media[target]).decode()
    return (f'<img src="data:image/png;base64,{b64}" style="position:absolute;'
            f'left:{x:.3f}in;top:{y:.3f}in;width:{w:.3f}in;height:{h:.3f}in">')


def background_css(d, rels, media):
    """The canvas is a p:bg blip fill, not a picture shape."""
    bg = d.getElementsByTagName("p:bg")
    if not bg:
        return ""
    blip = bg[0].getElementsByTagName("a:blip")
    if not blip:
        return ""
    target = rels.get(blip[0].getAttribute("r:embed"))
    if not target or target not in media:
        return ""
    b64 = base64.b64encode(media[target]).decode()
    return f";background-image:url(data:image/png;base64,{b64});background-size:100% 100%"


def slide_html(data, rels, media):
    d = minidom.parseString(data)
    tree = d.getElementsByTagName("p:spTree")[0]
    bg = background_css(d, rels, media)
    parts = []
    for node in tree.childNodes:
        if node.nodeType != 1:
            continue
        if node.tagName == "p:pic":
            parts.append(pic_html(node, media, rels))
        elif node.tagName == "p:sp":
            parts.append(shape_html(node, media))
    return (f'<section style="{bg}">' + "".join(parts) + "</section>")


def build(pptx, outdir):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(pptx)
    media = {n.split("/")[-1]: z.read(n) for n in z.namelist() if n.startswith("ppt/media/") and n.endswith((".png", ".jpg", ".jpeg"))}

    presrels = z.read("ppt/_rels/presentation.xml.rels").decode()
    rid2file = {r: t.split("/")[-1] for r, t in re.findall(r'Id="([^"]+)"[^>]*Target="(slides/slide\d+\.xml)"', presrels)}
    pres = z.read("ppt/presentation.xml").decode()
    ids = re.findall(r'<p:sldId id="\d+" r:id="([^"]+)"/>', re.search(r"<p:sldIdLst>(.*?)</p:sldIdLst>", pres, re.S).group(1))
    files = [rid2file[i] for i in ids]

    sections = []
    for f in files:
        srels = {}
        try:
            txt = z.read(f"ppt/slides/_rels/{f}.rels").decode()
            srels = {r: t.split("/")[-1] for r, t in re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', txt)}
        except KeyError:
            pass
        sections.append(slide_html(z.read(f"ppt/slides/{f}"), srels, media))

    html = f"""<!doctype html><meta charset="utf-8"><style>
@page {{ size: {SLIDE_W}in {SLIDE_H}in; margin: 0; }}
html,body {{ margin:0; padding:0; background:#000; }}
section {{ position:relative; width:{SLIDE_W}in; height:{SLIDE_H}in; overflow:hidden;
           page-break-after:always; break-after:page; background:#0A0A0B; }}
section:last-child {{ page-break-after:auto; break-after:auto; }}
p {{ margin:0 }}
</style>{"".join(sections)}"""
    (out / "deck.html").write_text(html, encoding="utf-8")
    print(f"wrote {out/'deck.html'} ({len(files)} slides)")
    return out / "deck.html", len(files)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
