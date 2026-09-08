/**
 * The two documents a participant gets for each scenario.
 *
 * The PDD is ours to write: it states the process as the business runs it, the
 * exceptions, and how the result will be judged. It is generated from the same
 * scenario definition the scoring uses, so the document cannot describe a
 * process the grader does not measure.
 *
 * The SDD is theirs to write. We ship a skeleton with the facts already filled
 * in and the thinking left blank, because designing the solution is the work
 * the exercise is asking for - handing over a finished design would remove it.
 */
import { describeRules } from "@/lib/validation/engine";
import { ALL_RULES } from "@/lib/validation/rules";
import { esc } from "@/lib/documents/templates/base";
import { fontFaceCss } from "@/lib/documents/fonts";
import { DIFFICULTY_LABELS, PARAMETERS, PARAMETER_LABELS, PARAMETER_MEANINGS, type Scenario } from "./scenarios";

const ruleCatalogue = () => new Map(describeRules(ALL_RULES).map((r) => [r.id, r]));

export function scenarioPddHtml(scenario: Scenario, origin: string): string {
  const rules = ruleCatalogue();
  const base = origin.replace(/\/$/, "");
  const css = `
${fontFaceCss()}
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
body { font-family: "Noto Sans", Arial, sans-serif; font-size: 10.5pt; color: #16283e; line-height: 1.45; }
h1 { font-size: 22pt; font-weight: 300; color: #1b4b8f; margin: 0 0 2mm; }
h2 { font-size: 13pt; color: #1b4b8f; margin: 8mm 0 2mm; border-bottom: 1px solid #cfd6de; padding-bottom: 1mm; }
h3 { font-size: 11pt; margin: 5mm 0 1mm; }
p, li { margin: 0 0 2mm; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.5pt; }
th { background: #1b4b8f; color: #fff; text-align: left; padding: 2mm; font-weight: 600; }
td { border-bottom: 1px solid #e1e6ec; padding: 2mm; vertical-align: top; }
code { background: #f2f4f7; padding: 0 1mm; font-size: 9pt; }
.meta { color: #6b7a8d; font-size: 9pt; }
.lead { font-size: 11.5pt; color: #4a5b70; }
`;
  const stepRows = scenario.steps
    .map(
      (s, i) => `<tr><td>${i + 1}</td><td><strong>${esc(s.title)}</strong><div>${esc(s.detail)}</div></td><td>${s.handles.map((h) => `<code>${esc(h)}</code>`).join("<br>")}</td></tr>`,
    )
    .join("");
  const ruleRows = scenario.rules
    .map((id) => {
      const r = rules.get(id);
      return `<tr><td><code>${esc(id)}</code></td><td>${esc(r?.severity ?? "")}</td><td>${esc(r?.description ?? "")}</td></tr>`;
    })
    .join("");
  const judgingRows = PARAMETERS.map(
    (key) => `<tr><td>${PARAMETER_LABELS[key]}</td><td>${scenario.weights[key]}</td><td>${esc(PARAMETER_MEANINGS[key])}</td></tr>`,
  ).join("");

  return `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>PDD ${esc(scenario.title)}</title><style>${css}</style></head>
<body>
<h1>${esc(scenario.title)}</h1>
<p class="lead">${esc(scenario.tagline)}</p>
<p class="meta">Process definition document · Automation Lab challenge · scenario <code>${esc(scenario.slug)}</code> version ${scenario.version} · ${DIFFICULTY_LABELS[scenario.difficulty]}</p>

<h2>1. Purpose</h2>
<p>${esc(scenario.brief)}</p>

<h2>2. Scope of one run</h2>
<table>
  <tr><th>Item</th><th>Value</th></tr>
  <tr><td>Work queue</td><td><code>${esc(scenario.queue)}</code></td></tr>
  <tr><td>Items in a scored run</td><td>${scenario.targetSize}</td></tr>
  <tr><td>Par time</td><td>${Math.round((scenario.parSecondsPerItem * scenario.targetSize) / 60)} minutes (${scenario.parSecondsPerItem}s per item)</td></tr>
  <tr><td>Documents</td><td>${scenario.documentUnderstanding ? "Reading the PDFs is part of the process" : "No document reading required"}</td></tr>
  <tr><td>Pass mark</td><td>${scenario.passMark} / 100</td></tr>
</table>

<h2>3. The process, step by step</h2>
<table>
  <tr><th style="width:8mm">#</th><th>Step</th><th style="width:60mm">Selectors and endpoints</th></tr>
  ${stepRows}
</table>

<h2>4. Exceptions</h2>
<p>Every finding the application raises carries a rule ID. Branch on the rule ID, never on the message text: the text is translated, the ID is a contract.</p>
<table>
  <tr><th style="width:35mm">Rule</th><th style="width:20mm">Severity</th><th>What it means</th></tr>
  ${ruleRows}
</table>
<p>A <strong>critical</strong> finding must never result in payment or approval. An <strong>error</strong> sends the item back. A <strong>warning</strong> is recorded and the item continues.</p>

<h2>5. How the run is judged</h2>
<table>
  <tr><th>Parameter</th><th style="width:20mm">Weight</th><th>What it measures</th></tr>
  ${judgingRows}
</table>
<p>Only the first submission for a document counts, and while a scored run is open the application returns the business result but never the grade. The score, the breakdown and the list of what went wrong all arrive when the run is closed.</p>

<h2>6. Running it</h2>
<p>Through the screens, or through the API:</p>
<table>
  <tr><th style="width:70mm">Call</th><th>Purpose</th></tr>
  <tr><td><code>POST ${base}/api/challenge/runs</code></td><td>Open the run. The clock starts here.</td></tr>
  <tr><td><code>GET ${base}/api/work-items?queue=${esc(scenario.queue)}</code></td><td>The queue for this scenario.</td></tr>
  <tr><td><code>POST ${base}/api/work-items/claim</code></td><td>Take one item under a lease.</td></tr>
  <tr><td><code>POST ${base}/api/challenge/runs/{id}/close</code></td><td>Close the run and receive the score.</td></tr>
</table>
<p class="meta">Full API reference: ${base}/api/docs</p>
</body></html>`;
}

/** The SDD skeleton: facts filled in, design left to the participant. */
export async function scenarioSddDocx(scenario: Scenario): Promise<Buffer> {
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");

  const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ text, heading: level });
  const body = (text: string) => new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
  const prompt = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, italics: true, color: "6B7A8D" })], spacing: { after: 200 } });
  const factRow = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })], width: { size: 35, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph(value)] }),
      ],
    });

  const sections = [
    ["1. Solution overview", "Describe in a paragraph what your automation does and what it leaves to a human."],
    ["2. Architecture", "Which UiPath components you used: dispatcher, performer, Orchestrator queues, assets, credentials. A diagram belongs here."],
    ["3. Workflow design", "The main workflows and what each one is responsible for. Name them as they appear in your project."],
    ["4. Queue design", "The queue item shape you chose, the reference you used, and why. How do you avoid processing the same item twice?"],
    ["5. Exception handling", "For each rule ID in the process definition, what your robot does: retry, business exception, or stop. Say what happens to an item you cannot decide."],
    ["6. Configuration", "Assets, credentials and settings the robot needs. Nothing here should be a value hard-coded in a workflow."],
    ["7. Logging and reporting", "What you log per item, and what a run report looks like at the end."],
    ["8. Test evidence", "How you tested: which items, which cases, what you saw. Include your run score and what you would improve."],
  ];

  const doc = new Document({
    creator: "Automation Lab",
    title: `Solution design: ${scenario.title}`,
    description: "Template. Fill in each section; the italic prompts are guidance and should be deleted.",
    sections: [
      {
        children: [
          heading("Solution design document", HeadingLevel.TITLE),
          body(scenario.title),
          prompt("This is a template. The facts below come from the process definition; everything else is yours to write. Delete these italic prompts as you go."),
          heading("Process facts", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              factRow("Scenario", `${scenario.title} (${scenario.slug} v${scenario.version})`),
              factRow("Work queue", scenario.queue),
              factRow("Items per run", String(scenario.targetSize)),
              factRow("Par time", `${Math.round((scenario.parSecondsPerItem * scenario.targetSize) / 60)} minutes`),
              factRow("Document understanding", scenario.documentUnderstanding ? "Required" : "Not required"),
              factRow("Rules in scope", scenario.rules.join(", ")),
              factRow("Pass mark", `${scenario.passMark} / 100`),
              factRow("Judged on", PARAMETERS.map((p) => `${PARAMETER_LABELS[p]} ${scenario.weights[p]}`).join(" · ")),
            ],
          }),
          new Paragraph({ text: "", spacing: { after: 200 } }),
          ...sections.flatMap(([title, guidance]) => [heading(title, HeadingLevel.HEADING_1), prompt(guidance), body(" ")]),
          heading("Sign-off", HeadingLevel.HEADING_1),
          body("Prepared by: "),
          body("Date: "),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
