"""
What the Automation Lab session says.

Every string a slide shows is here; fill.py does the mechanics. Shapes are
addressed by the order they appear in the source slide, which is what the
layout already decided — so editing the words never means touching geometry.

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


DECK = {
    "kicker": "BONUS / PRACTICE LAB · AUTOMATION LAB",
    "footer": "v2026.1 · BONUS · THE AUTOMATION LAB",
}

SLIDES = [

    # 01 — cover
    {"fill": {
        "5": [[("— BONUS · THE AUTOMATION LAB · PRACTISE ON A REAL SYSTEM", "a")]],
        "6": [[("The Automation ", "w"), ("Lab.", "n")]],
        "7": line(n("A working ERP · Four scenarios · Scored runs · A verifiable certificate")),
        "8": [[("●  ", "a"), ("2 HOURS", "m"), ("     ", "m"),
               ("●  ", "a"), ("BONUS MODULE", "m"), ("     ", "m"),
               ("●  ", "a"), ("BRING A BOT", "m"), ("     ", "m"),
               ("●  ", "a"), ("OPEN ALL YEAR", "m")]],
    }},

    # 02 — contents
    {"fill": dict({
        "4": [[("— Bonus", "n"), ("   /   ", "m"), ("CONTENTS", "n")]],
        "5": line(b("What we'll cover.")),
    }, **rows(
        ("01", [b("What the lab is"), n("  — a working system, not a practice form.")]),
        ("02", [b("Al-Nahda"), n("  — the company, and the paper trail it leaves behind.")]),
        ("03", [b("The document ladder"), n("  — the same invoice, five times harder.")]),
        ("04", [b("The four scenarios"), n("  — what each one actually asks of you.")]),
        ("05", [b("How a run is scored"), n("  — five parameters, published up front.")]),
        ("06", [b("Sign up live"), n("  — open a run together, then your task.")]),
    ))},

    # 03 — outcomes
    {"fill": dict({
        "4": eyebrow("01", "EXPECTED TO LEARN"),
        "5": line(b("By the end of today, you can —")),
    }, **rows(
        ("01", [n("Say why a "), b("demo sandbox teaches nothing"), n(" — and what a real system adds.")]),
        ("02", [n("Work a scenario "), b("end to end"), n(" — through the screens or the API, your choice.")]),
        ("03", [n("Read a "), b("score breakdown"), n(" and name the parameter you would attack next.")]),
        ("04", [n("Point a bot at the API with "), b("its own credential"), n(" — no browser involved.")]),
    ))},

    # 04 — what it is (two cards)
    {"fill": {
        "4": eyebrow("02", "WHAT IT IS"),
        "5": [[("— A PRACTICE FORM", "m")]],
        "6": line(b("Four rows and a submit")),
        "7": [line(n("Data invented for the exercise"))[0],
              line(n("Every field already clean"))[0],
              line(n("Nothing references anything else"))[0],
              line(n("Break it and nobody notices"))[0],
              line(n("You finish, and learn the form"))[0]],
        "8": [[("— THE AUTOMATION LAB", "a")]],
        "9": line(b("A company with a history")),
        "10": [line(n("Two years of purchasing behind it"))[0],
               line(n("Documents that argue with each other"))[0],
               line(n("Orders, receipts and invoices that must agree"))[0],
               line(n("Break the chain and it tells you"))[0],
               line(n("You finish, and learn the process"))[0]],
        "11": [[("●  ", "a"), ("YOU ARE GIVEN A LOGIN, NOT A TUTORIAL", "m")]],
    }},

    # 05 — three ways in
    {"fill": {
        "4": eyebrow("02.1", "THREE WAYS IN"),
        "5": line(b("Screens for people. API for bots. Paper for both.")),
        "6": [[("SCREENS", "a")]],
        "7": line(b("Click it through")),
        "8": line(n("queues · forms · decisions")),
        "9": [[("API", "a")]],
        "10": line(b("Drive it headless")),
        "11": line(n("REST · tokens · work items")),
        "12": [[("DOCUMENTS", "a")]],
        "13": line(b("Read the paper")),
        "14": line(n("PDF · five levels · Arabic")),
        "15": line(n("The scoring is the same either way — the lab does not care whether a human or a robot did the work.")),
    }},

    # 06 — the problem
    {"fill": dict({
        "4": eyebrow("03", "THE PROBLEM"),
        "5": line(b("Clean data teaches you nothing.")),
    }, **rows(
        ("→", [n("A tutorial invoice has every field where you expect it, spelled the way you expect.")]),
        ("→", [n("Production has a "), b("photograph of a creased page"), n(", in Arabic, with the total handwritten.")]),
        ("→", [n("A bot that only ever met the first one fails on its first real day.")]),
    ))},

    # 07 — the paper trail
    {"fill": dict({
        "4": eyebrow("04", "THE PAPER TRAIL"),
        "5": line(b("Every document points at another one.")),
    }, **rows(
        ("01", [b("Request for quotation"), n(" — you ask several suppliers, they answer with prices that expire.")]),
        ("02", [b("Purchase order"), n(" — you award one; everything later is measured against it.")]),
        ("03", [b("Delivery note, goods receipt"), n(" — what arrived, and what you admit arrived.")]),
        ("04", [b("Invoice, payment"), n(" — the supplier's claim, matched three ways before a riyal moves.")]),
    ))},

    # 08 — the document ladder (five rows)
    {"drop": [16, 17],
     "fill": dict({
        "4": eyebrow("04.1", "THE DOCUMENT LADDER"),
        "5": line(b("The same invoice, five times harder.")),
    }, **rows(
        ("01", [b("Digital print"), n(" — born a PDF, text you can select.")]),
        ("02", [b("Clean scan"), n(" — 300 dpi, straight, a little soft.")]),
        ("03", [b("Office scan"), n(" — skewed, speckled, a fold down the middle.")]),
        ("04", [b("Phone photo"), n(" — shadow across the page, taken at a door.")]),
        ("05", [b("Bad phone photo"), n(" — creased, dim, Arabic. Where readers break.")]),
    ))},

    # 09 — the four scenarios
    {"fill": dict({
        "4": eyebrow("05", "THE FOUR SCENARIOS"),
        "5": line(b("Pick the one that worries you.")),
    }, **rows(
        ("01", [b("Invoice processing"), n(" — 12 invoices. Read, match against order and receipt, decide.")]),
        ("02", [b("Supplier onboarding"), n(" — 10 applications. Check the licence and tax card, then decide.")]),
        ("03", [b("Goods receipt"), n(" — 8 deliveries. Post what arrived; refuse what should not be.")]),
        ("04", [b("Award the quotation"), n(" — 6 requests. Compare, award the right one, raise the order.")]),
    ))},

    # 10 — how a run is scored (five rows)
    {"drop": [16, 17],
     "fill": dict({
        "4": eyebrow("05.1", "HOW A RUN IS SCORED"),
        "5": line(b("Five parameters, published before you start.")),
    }, **rows(
        ("01", [b("Accuracy"), n(" — every field against what the document says.")]),
        ("02", [b("Decisions"), n(" — approve, reject, refuse, against the rules.")]),
        ("03", [b("Exceptions"), n(" — defects caught, minus the ones invented.")]),
        ("04", [b("Coverage"), n(" — how much you finished before the clock stopped.")]),
        ("05", [b("Time"), n(" — wall clock against a competent baseline.")]),
    ))},

    # 11 — two modes
    {"fill": {
        "4": eyebrow("05.2", "TWO MODES"),
        "5": [[("— PRACTICE", "m")]],
        "6": line(b("Tells you as you go")),
        "7": [line(n("One item at a time, as often as you like"))[0],
              line(n("The match result is shown as you work"))[0],
              line(n("Wrong answers explained on the spot"))[0],
              line(n("Kept in your history, off the board"))[0],
              line(n("This is where you learn"))[0]],
        "8": [[("— SCORED", "a")]],
        "9": line(b("Tells you at the end")),
        "10": [line(n("The whole set, one run at a time"))[0],
               line(n("Feedback is switched off while the clock runs"))[0],
               line(n("Marking arrives when you finish"))[0],
               line(n("Sixty or better earns a certificate"))[0],
               line(n("This is where you find out"))[0]],
        "11": [[("●  ", "a"), ("PRACTISE UNTIL IT IS BORING, THEN GO SCORED", "m")]],
    }},

    # 12 — judgment
    {"fill": dict({
        "4": eyebrow("06", "JUDGMENT"),
        "5": line(b("What the score measures — and what it doesn't.")),
    }, **rows(
        ("✓", [n("Whether your bot read the page correctly and then did the right thing about it.")]),
        ("✗", [n("How clever the code is. Share it freely — the lab scores the work, not the author.")]),
        ("✗", [n("How fast you type. Time is five points in a hundred — the smallest of the five, on purpose.")]),
    ), **{"12": [[("Easy to game by sharing code, hard to game by guessing — copy whatever you like, you still have to read the page.", "n")]]})},

    # 13 — live together
    {"fill": dict({
        "4": [[("LIVE · TOGETHER", "a")]],
        "5": line(b("What we'll do right now.")),
    }, **rows(
        ("①", [n("Sign up. Your workspace opens immediately — there is nothing to provision.")]),
        ("②", [n("Open a practice run on goods receipt — one delivery, with the match result showing.")]),
        ("③", [n("Mint an API token and post the same receipt again with a single HTTP call.")]),
        ("④", [n("Refuse an over-delivery on purpose, and watch the lab agree with you.")]),
    ))},

    # 14 — your task
    {"fill": {
        "4": eyebrow("07", "YOUR TASK"),
        "5": line(b("Earn a certificate.")),
        "6": [[("DO", "a")]],
        "7": [line(n("Practise invoice processing until the match result holds no surprises."))[0],
              line(n("Move to level 3 and practise again — the reading is the hard part."))[0],
              line(n("Take one scored run. Finish it, whatever the number says."))[0],
              line(n("Read the breakdown and write down which parameter cost you most."))[0]],
        "8": [[("DELIVER — BEFORE THE NEXT SESSION", "a")]],
        "9": [line(n("Your certificate code, or your score if you did not pass."))[0],
              line(n("The parameter that cost you most, and what you would change."))[0],
              line(n("One sentence: which of the four scenarios is closest to your day job, and why."))[0]],
    }},

    # 15 — interview seed
    {"fill": dict({
        "4": eyebrow("07.1", "INTERVIEW SEED"),
        "5": line(b("If they ask: “Have you automated anything end to end?”")),
    }, **rows(
        ("1", [b("Name the process"), n(" — not the tool. Three-way match, supplier onboarding, goods receipt.")]),
        ("2", [b("Name the hard part"), n(" — reading a creased photograph, not clicking a button.")]),
        ("3", [b("Name the number"), n(" — a score, on a published rubric, that somebody else can verify.")]),
        ("4", [b("Name what you would do next"), n(" — the parameter you lost. That is the interview.")]),
    ), **{"14": [[("●  ", "a"), ("A CODE THEY CAN CHECK BEATS A SENTENCE THEY CANNOT", "m")]]})},

    # 16 — recap
    {"fill": dict({
        "4": eyebrow("08", "RECAP"),
        "5": line(b("A real system, a fixed rubric, a number you can defend.")),
    }, **rows(
        ("✓", [n("Why clean tutorial data is the worst possible preparation.")]),
        ("✓", [n("Five levels of the same page, and where your reader breaks.")]),
        ("✓", [n("A scored run, a breakdown, and a certificate with a public code.")]),
    ))},

    # 17 — what's missing
    {"fill": {
        "4": eyebrow("08.1", "WHAT'S MISSING"),
        "5": line(b("It scores you. It doesn't teach you.")),
        "6": [[("The lab tells you how many fields your reader missed and how many decisions disagreed with the rules. It does not tell you why, or what to try instead. Bring your breakdown to the next session.", "n")]],
    }},

    # 18 — next
    {"fill": {
        "4": eyebrow("09", "NEXT"),
        "5": line(b("Bring me a number.")),
        "6": [[("NEXT →   Your scored run — whatever it says", "a")]],
        "7": line(n("the breakdown · the parameter that hurt · one change you would make")),
        "8": [[("●  ", "a"), ("MOHAMMED SHAKER", "m"), ("     ", "m"),
               ("●  ", "a"), ("UIPATH MVP", "m"), ("     ", "m"),
               ("●  ", "a"), ("MOHAMMEDSHAKER.COM", "m")]],
    }},
]
