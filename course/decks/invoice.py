"""
Invoice processing, taught as a Document Understanding project.

One scenario, followed all the way down: what accounts payable does by hand,
what the document actually contains, the read-match-decide pipeline, the five
levels of damage the same page arrives in, the three-way match, and the
decision at the end of it. The lab's own invoice-processing scenario is the
worked example throughout, so every number on these slides is one a
participant can go and check.

Every string a slide shows is here; fill.py does the mechanics. Shapes are
addressed by the order they appear in the source slide, which is what the
layout already decided — so editing the words never means touching geometry.
"""
from common import n, b, w, m, a, eyebrow, line, rows, stages  # noqa: F401

OUTPUT = "invoice-processing-deck.pptx"

# One extra six-row slide: the contents needs one, and so does the ladder.
CLONES = [("slide2.xml", "slide2.xml")]

ORDER = [
    "slide1.xml",   # 01  cover
    "slide2.xml",   # 02  contents — six rows
    "slide3.xml",   # 03  expected to learn — four rows
    "slide4.xml",   # 04  as-is / to-be — two cards
    "slide6.xml",   # 05  why it is hard — three arrows
    "slide11.xml",  # 06  the pipeline — three-stage chain
    "slide8.xml",   # 07  the document — headline, paragraph, three tags
    "slide9.xml",   # 08  the fields — four rows
    "slide19.xml",  # 09  the ladder — five of six rows
    "slide7.xml",   # 10  validate — four-stage flow
    "slide5.xml",   # 11  the three-way match — three cards
    "slide12.xml",  # 12  the decision — three marked rows
    "slide13.xml",  # 13  live together
    "slide14.xml",  # 14  your task — two cards
    "slide15.xml",  # 15  interview seed
    "slide16.xml",  # 16  recap
    "slide17.xml",  # 17  what's missing
    "slide18.xml",  # 18  next
]

DECK = {
    "kicker": "PROJECT / INVOICE PROCESSING · AUTOMATION LAB",
    "footer": "v2026.1 · PROJECT · INVOICE PROCESSING",
}

SLIDES = [

    # 01 — cover
    {"fill": {
        "5": [[("— A DOCUMENT UNDERSTANDING PROJECT · ACCOUNTS PAYABLE", "a")]],
        "6": [[("Invoice ", "w"), ("Processing.", "n")]],
        "7": line(n("One scenario, end to end · Read the page · Match three documents · Decide")),
        "8": [[("●  ", "a"), ("12 INVOICES", "m"), ("     ", "m"),
               ("●  ", "a"), ("5 LEVELS", "m"), ("     ", "m"),
               ("●  ", "a"), ("15 RULES", "m"), ("     ", "m"),
               ("●  ", "a"), ("ONE DECISION EACH", "m")]],
    }},

    # 02 — contents
    {"fill": dict({
        "4": eyebrow("PROJECT", "CONTENTS"),
        "5": line(b("What we'll cover.")),
    }, **rows(
        ("01", [b("The process"), n("  — what accounts payable does all day.")]),
        ("02", [b("The document"), n("  — an invoice is a picture, not a form.")]),
        ("03", [b("The pipeline"), n("  — read, match, decide, and where each breaks.")]),
        ("04", [b("The fields"), n("  — what you extract, and what is checked.")]),
        ("05", [b("The match"), n("  — three documents that have to agree.")]),
        ("06", [b("Build it live"), n("  — then your own bot, scored.")]),
    ))},

    # 03 — expected to learn
    {"fill": dict({
        "4": eyebrow("01", "EXPECTED TO LEARN"),
        "5": line(b("By the end of today, you can —")),
    }, **rows(
        ("01", [n("Scope a DU project: "), b("the document, the fields, the decision"), n(".")]),
        ("02", [n("Read an invoice at "), b("five levels of damage"), n(" — and say where yours stops.")]),
        ("03", [n("Run a three-way match and read a violation "), b("by its rule ID"), n(".")]),
        ("04", [n("Approve, reject or hold — and "), b("defend which one"), n(".")]),
    ))},

    # 04 — as-is / to-be
    {"fill": {
        "4": eyebrow("02", "THE PROCESS"),
        "5": [[("— AS-IS · A PERSON", "m")]],
        "6": line(b("Ninety seconds an invoice")),
        "7": [line(n("Opens the PDF and reads it"))[0],
              line(n("Finds the order and the receipt"))[0],
              line(n("Compares price, quantity and tax"))[0],
              line(n("Keys the result into the system"))[0],
              line(n("Repeats until the queue is empty"))[0]],
        "8": [[("— TO-BE · A BOT", "a")]],
        "9": line(b("The same ninety seconds, once")),
        "10": [line(n("Claims one item from the queue"))[0],
               line(n("Extracts the header and the lines"))[0],
               line(n("Submits, then reads the match result"))[0],
               line(n("Approves, rejects or holds"))[0],
               line(n("Closes the item with its reason"))[0]],
        "11": [[("●  ", "a"), ("THE HARD PART WAS NEVER THE CLICKING", "m")]],
    }},

    # 05 — why it is hard
    {"fill": dict({
        "4": eyebrow("02.1", "WHY IT IS HARD"),
        "5": line(b("Three problems. Only one is reading.")),
    }, **rows(
        ("→", [n("A tutorial invoice puts every field where you expect it. A real one is a photograph.")]),
        ("→", [n("A third of these invoices are wrong, and the wrong ones are the ones that matter.")]),
        ("→", [n("The truth is not on the page. It is on the page, the order and the receipt.")]),
    ))},

    # 06 — the pipeline
    {"fill": dict({
        "4": eyebrow("03", "THE PIPELINE"),
        "5": line(b("Read it. Match it. Decide it.")),
    }, **stages(
        ("PAPER", [n("The invoice PDF")]),
        ("READ", [n("Header + lines")]),
        ("DECIDE", [n("Approve · reject · hold")]),
    ), **{
        "12": [[("→", "a")]],
        "13": line(n("Each stage fails differently — a misread digit is not a wrong decision.")),
        "14": [[("→", "a")]],
        "15": line(n("They are scored separately, so you can tell which stage cost you.")),
        "16": line(m("Build all three or you have built none: a reader that approves a duplicate has failed.")),
    })},

    # 07 — the document
    {"fill": {
        "4": eyebrow("04", "THE DOCUMENT"),
        "5": line(b("Three regions")),
        "6": line(n("Every supplier invoice in the lab has the same three parts and prints them differently: about half the vendors print bilingual, a third print Arabic first, and two in five write their numbers in Eastern Arabic digits. Your reader has to find the parts, not the pixels.")),
        "7": [[("hdr", "a")]],
        "8": line(n("The header — who billed, against which order, in which currency. Twelve fields.")),
        "9": [[("lin", "a")]],
        "10": line(n("The lines — code, quantity, unit, price, tax, total. Eight fields on each one.")),
        "11": [[("tot", "a")]],
        "12": line(n("The totals — printed on the page, and not always equal to the sum of the lines.")),
    }},

    # 08 — the fields
    {"fill": dict({
        "4": eyebrow("04.1", "WHAT YOU EXTRACT"),
        "5": line(b("Twelve header fields, eight per line.")),
    }, **rows(
        ("01", [b("Identity"), n(" — number, date, due date, and the vendor as printed on the page.")]),
        ("02", [b("Reference"), n(" — the purchase order number. Without it there is nothing to match.")]),
        ("03", [b("Money"), n(" — currency, subtotal, tax, grand total. Read them; do not compute them.")]),
        ("04", [b("Payment"), n(" — IBAN and bank name. The most expensive field on the page.")]),
    ))},

    # 09 — the ladder (five of the six rows; the sixth row's rule goes too)
    {"drop": [16, 17], "trim": 6.3,
     "fill": dict({
        "4": eyebrow("04.2", "THE LADDER"),
        "5": line(b("The same invoice, five times harder.")),
    }, **rows(
        ("01", [b("Native PDF"), n(" — vector text, selectable. No OCR needed.")]),
        ("02", [b("Clean scan"), n(" — 300 dpi, faint blur, a fraction of a degree of skew.")]),
        ("03", [b("Office scan"), n(" — 200 dpi, three degrees of skew, noise, uneven light.")]),
        ("04", [b("Phone photo"), n(" — perspective, a shadow gradient, a warm cast, soft focus.")]),
        ("05", [b("Handled document"), n(" — stamps, handwriting, staple marks, fold lines.")]),
    ))},

    # 10 — validate
    {"fill": {
        "4": eyebrow("05", "VALIDATE"),
        "5": line(b("A confidence score is a routing decision.")),
        "6": line(n("Extraction")),
        "7": [[("CONFIDENCE", "a")]],
        "8": line(n("Below threshold")),
        "9": line(n("A human")),
        "10": line(n("Posted")),
        "11": [[("→", "a")]],
        "12": line(n("High confidence posts straight through; low confidence goes to a person.")),
        "13": [[("→", "a")]],
        "14": line(n("Threshold too high and a human does the work. Too low and the wrong number is paid.")),
        "15": line(m("The lab gives you no confidence to hide behind: you submit what you read, and it is right or not.")),
    }},

    # 11 — the three-way match
    {"fill": {
        "4": eyebrow("06", "THE THREE-WAY MATCH"),
        "5": line(b("Three documents. One version of events.")),
        "6": [[("ORDER", "a")]],
        "7": line(b("What we agreed")),
        "8": line(m("price · quantity · vendor")),
        "9": [[("RECEIPT", "a")]],
        "10": line(b("What arrived")),
        "11": line(m("quantity · date · condition")),
        "12": [[("INVOICE", "a")]],
        "13": line(b("What they billed")),
        "14": line(m("price · quantity · tax")),
        "15": line(m("Every violation carries a rule ID — PO-INV-PRICE, GRN-QTY, BANK-CHANGE. Branch on the ID, never on the message text: the message is written for a person and may change.")),
    }},

    # 12 — the decision
    {"fill": dict({
        "4": eyebrow("07", "THE DECISION"),
        "5": line(b("Approve, reject, or refuse to pay.")),
    }, **rows(
        ("✓", [b("Clean"), n(" — approve it and pay it. A warning is approved with a note, not held.")]),
        ("✗", [b("Error"), n(" — reject it. Wrong price, wrong quantity, no purchase order: it goes back.")]),
        ("✗", [b("Critical"), n(" — never pay it. A duplicate, or a changed bank account, is an exception.")]),
    ), **{"12": line(m("Holding a clean invoice costs you as much as paying a bad one. The rubric counts both."))})},

    # 13 — live together
    {"fill": dict({
        "4": [[("LIVE · TOGETHER", "a")]],
        "5": line(b("What we'll do right now.")),
    }, **rows(
        ("①", [n("Open the queue and claim one invoice — twelve are waiting.")]),
        ("②", [n("Read it at level 1, submit the header and lines, watch the match run.")]),
        ("③", [n("Open the same invoice at level 4 and read it again. Watch what your eyes do.")]),
        ("④", [n("Break it on purpose: change the IBAN by one digit, and watch BANK-CHANGE fire.")]),
    ))},

    # 14 — your task
    {"fill": {
        "4": eyebrow("08", "YOUR TASK"),
        "5": line(b("Automate the twelve.")),
        "6": [[("DO", "a")]],
        "7": [line(n("Practise until the match result holds no surprises at level 1."))[0],
              line(n("Move to level 3 and practise again — the reading is the hard part."))[0],
              line(n("Take one scored run. Finish it, whatever the number says."))[0],
              line(n("Note the rule ID that cost you the most items."))[0]],
        "8": [[("DELIVER — BEFORE THE NEXT SESSION", "a")]],
        "9": [line(n("Your certificate code, or your score if you did not pass."))[0],
              line(n("The header fields your reader got wrong, and at which level."))[0],
              line(n("One sentence: where would you set the confidence threshold, and why."))[0]],
    }},

    # 15 — interview seed
    {"fill": dict({
        "4": eyebrow("08.1", "INTERVIEW SEED"),
        "5": line(b("If they ask: “Walk me through an invoice automation.”")),
    }, **rows(
        ("1", [b("Name the documents"), n(" — invoice, purchase order, goods receipt. Three-way match.")]),
        ("2", [b("Name the reading"), n(" — five levels of scan quality, bilingual, Eastern Arabic digits.")]),
        ("3", [b("Name the control"), n(" — every violation has a rule ID, and the bot branches on the ID.")]),
        ("4", [b("Name the exception"), n(" — what your bot refuses to decide, and who it hands it to.")]),
    ), **{"14": [[("●  ", "a"), ("THE EXCEPTION PATH IS THE ANSWER THEY ARE LISTENING FOR", "m")]]})},

    # 16 — recap
    {"fill": dict({
        "4": eyebrow("09", "RECAP"),
        "5": line(b("A document, a match, a decision.")),
    }, **rows(
        ("✓", [n("An invoice is three regions and twenty-odd fields, printed differently by every vendor.")]),
        ("✓", [n("A three-way match turns three documents into one answer, with a rule ID behind it.")]),
        ("✓", [n("Approve, reject or hold — and the hold is a decision you have to defend.")]),
    ))},

    # 17 — what's missing
    {"fill": {
        "4": eyebrow("09.1", "WHAT'S MISSING"),
        "5": line(b("One scenario is not a pipeline.")),
        "6": line(n("Invoice processing is the deepest of the four, but it is still one queue and one document type. Classification, routing between types, and a production exception queue are the next session. Bring the rule ID that cost you the most.")),
    }},

    # 18 — next
    {"fill": {
        "4": eyebrow("10", "NEXT"),
        "5": line(b("Bring me twelve invoices.")),
        "6": [[("NEXT →   Your scored run on invoice-processing", "a")]],
        "7": line(n("the breakdown · the rule that fired most · where you would set the threshold")),
        "8": [[("●  ", "a"), ("MOHAMMED SHAKER", "m"), ("     ", "m"),
               ("●  ", "a"), ("UIPATH MVP", "m"), ("     ", "m"),
               ("●  ", "a"), ("MOHAMMEDSHAKER.COM", "m")]],
    }},
]
