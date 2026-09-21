"""
The vocabulary a deck spec is written in.

A spec says what each slide says, never how it looks: `fill.py` replaces the
runs inside shapes the source deck already positioned, so the house style —
sizes, faces, letter-spacing, the gold rule — survives untouched.

Roles: w near-white · b bold near-white · n grey body · m dim meta · a gold
"""


def n(t): return (t, "n")
def b(t): return (t, "b")
def w(t): return (t, "w")
def m(t): return (t, "m")
def a(t): return (t, "a")


def eyebrow(num, label):
    return [[(f"— {num}", "n"), ("   /   ", "m"), (label, "n")]]


def line(*segs):
    return [list(segs)]


def rows(*items, start=6):
    """Marker/text pairs filling consecutive shape slots."""
    out = {}
    for i, (marker, segs) in enumerate(items):
        out[str(start + i * 2)] = [[(marker, "a")]]
        out[str(start + 1 + i * 2)] = [list(segs)]
    return out


def stages(*items, start=6):
    """
    Label/value pairs for the chain and flow archetypes.

    Same shape as `rows`, different reading: the marker slot is a small gold
    caption above a box rather than a row number beside a line.
    """
    out = {}
    for i, (label, segs) in enumerate(items):
        out[str(start + i * 2)] = [[(label, "a")]]
        out[str(start + 1 + i * 2)] = [list(segs)]
    return out
