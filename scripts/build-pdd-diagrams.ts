/**
 * Draws the invoice-processing process maps and writes them next to the
 * screenshots, in the same registry shape, so the PDD builder treats a drawn
 * map and a photographed screen identically.
 *
 * The as-is and to-be maps are built from one skeleton on purpose: put them on
 * facing pages and the only thing that has changed is which lane the work sits
 * in, which is the argument the chapter is making.
 *
 *   pnpm pdd:diagrams
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { BOT_COLOUR, toSvg, type Diagram } from "./pdd/diagrams";
import { resolveChromiumExecutable } from "../src/lib/documents/renderer";

const OUT = "docs/pdd-assets";

/** The five stages, for a reader who wants the shape before the detail. */
const HIGH_LEVEL: Diagram = {
  across: true,
  id: "map-as-is-high",
  title: "Invoice processing, as-is: the process at a glance",
  lanes: [],
  nodes: [
    { id: "n1", row: 0, shape: "start", text: "Invoice arrives as a PDF" },
    { id: "n2", row: 1, text: "Read the document" },
    { id: "n3", row: 2, text: "Find the order and the goods receipt" },
    { id: "n4", row: 3, text: "Compare the three, line by line" },
    { id: "n5", row: 4, shape: "end", text: "Approve, reject or hold" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n3", to: "n4" },
    { from: "n4", to: "n5" },
  ],
};

/** Both detailed maps share a skeleton; only the second lane changes hands. */
function detailed(opts: {
  id: string;
  title: string;
  laneTitle: string;
  tone: "human" | "bot";
  bot: boolean;
  steps: [string, string];
  decision: string;
  legend?: { colour: string; text: string }[];
}): Diagram {
  const b = opts.bot;
  return {
    id: opts.id,
    title: opts.title,
    lanes: [
      { id: "vendor", title: "Supplier", tone: "vendor" },
      { id: "actor", title: opts.laneTitle, tone: opts.tone },
      { id: "erp", title: "Automation Lab (ERP)", tone: "system" },
      { id: "exc", title: "Exception queue (human)", tone: "human" },
    ],
    nodes: [
      { id: "v1", lane: "vendor", row: 0, shape: "start", text: "Issues an invoice against a purchase order" },
      { id: "s1", lane: "erp", row: 1, text: "Invoice queued, status pending extraction" },
      { id: "a1", lane: "actor", row: 2, bot: b, text: opts.steps[0] },
      { id: "a2", lane: "actor", row: 3, bot: b, text: opts.steps[1] },
      { id: "s2", lane: "erp", row: 4, text: "Three-way match runs on the submitted values" },
      { id: "a3", lane: "actor", row: 5, bot: b, shape: "decision", text: opts.decision },
      { id: "v2", lane: "vendor", row: 6, shape: "end", text: "Rejected back to the supplier" },
      { id: "s3", lane: "erp", row: 6, shape: "end", text: "Approved, then paid" },
      { id: "e1", lane: "exc", row: 6, shape: "end", text: "Held for a person to look at" },
    ],
    edges: [
      { from: "v1", to: "s1" },
      { from: "s1", to: "a1" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "s2" },
      { from: "s2", to: "a3" },
      { from: "a3", to: "v2", label: "error" },
      { from: "a3", to: "s3", label: "clean" },
      { from: "a3", to: "e1", label: "critical" },
    ],
    legend: opts.legend,
  };
}

const AS_IS = detailed({
  id: "map-as-is",
  title: "Invoice processing, as-is: every step done by hand",
  laneTitle: "Accounts payable clerk",
  tone: "human",
  bot: false,
  steps: ["Opens the invoice and reads it on screen", "Keys 12 header fields and 8 per line"],
  decision: "Any violation?",
});

const TO_BE = detailed({
  id: "map-to-be",
  title: "Invoice processing, to-be: the same path, driven by a robot",
  laneTitle: "Robot (unattended)",
  tone: "bot",
  bot: true,
  steps: ["Claims the work item and downloads the PDF", "Extracts the fields and submits them"],
  decision: "Highest severity?",
  legend: [
    { colour: BOT_COLOUR, text: "Performed by the robot" },
    { colour: "#8fa3b8", text: "Performed by a person or by the system" },
  ],
});

const DIAGRAMS = [HIGH_LEVEL, AS_IS, TO_BE];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const html = `<!doctype html><meta charset="utf-8"><style>
body { margin: 0; background: #fff; }
section { display: block; width: max-content; }
</style>${DIAGRAMS.map((d) => `<section id="${d.id}">${toSvg(d)}</section>`).join("")}`;

  const target = await resolveChromiumExecutable();
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: target.executablePath, args: [...target.args, "--no-sandbox"] });
  const registry: unknown[] = [];
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();
    await page.setContent(html, { waitUntil: "load" });
    for (const d of DIAGRAMS) {
      const el = (await page.$(`#${d.id}`))!;
      const file = `${OUT}/${d.id}.png`;
      await el.screenshot({ path: file });
      const box = (await el.boundingBox())!;
      registry.push({
        id: d.id,
        title: d.title,
        file,
        width: Math.round(box.width * 2),
        height: Math.round(box.height * 2),
        scale: 2,
        callouts: [],
      });
      console.log(`\u2713 ${d.id} (${Math.round(box.width)}x${Math.round(box.height)} css)`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  writeFileSync(`${OUT}/diagrams.json`, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Wrote ${DIAGRAMS.length} process maps and ${OUT}/diagrams.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
