/**
 * The machinery every Process Definition Document in this repository shares:
 * one content model, four emitters (Markdown, HTML, Word, PDF) and the figure
 * registry that ties a screenshot to its callouts.
 *
 * It was one file until there were two documents. The lab-wide PDD
 * (scripts/build-pdd.ts) and one process's PDD written to a client's template
 * (scripts/build-process-pdd.ts) differ only in their words, so the emitters
 * live here and a document is a title page plus a list of blocks.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} from "docx";
import { closeRenderer, renderHtmlToPdf } from "../../src/lib/documents/renderer";
import { fontFaceCss } from "../../src/lib/documents/fonts";

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------
/**
 * A table cell is text, or a picture of one — a step table reads far better
 * with a thumbnail of the screen in it than with the endpoint written out.
 * `img` names a figure in the same registries the figure blocks draw from, so
 * a picture in a cell is captured, sized and version-controlled exactly like
 * any other figure; it simply does not get a number or a caption.
 */
export type Cell = string | { img: string };

export type Block =
  | { t: "h1" | "h2" | "h3"; text: string }
  | { t: "p"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "numbered"; items: string[] }
  | { t: "table"; header: string[]; rows: Cell[][]; widths?: number[] }
  | { t: "note"; text: string }
  | { t: "figure"; id: string }
  | { t: "pagebreak" };

export interface Figure {
  id: string;
  title: string;
  file: string;
  width: number;
  height: number;
  scale: number;
  callouts: { n: number; selector: string; text: string }[];
}

export interface DocMeta {
  title: string;
  subtitle: string;
  version: string;
  date: string;
  author: string;
  status: string;
  /** One line under the rule on the cover. */
  strapline: string;
  /** Shown on the cover as "Target application". */
  targetApp: string;
  /** Word document properties. */
  description: string;
}

export interface PddSpec {
  doc: DocMeta;
  blocks: Block[];
  /** Written side by side as <outBase>.docx, .pdf and .html. */
  outBase: string;
  /** Optional Markdown copy, tracked in the repository. */
  markdown?: { file: string; notes: string[] };
  /**
   * Figure registries, merged in order. Defaults to the one the screenshot
   * capture writes; a document that also has drawn diagrams passes both, and a
   * later file wins on a duplicate id.
   */
  figureFiles?: string[];
}

/**
 * Emit one document in every format.
 *
 * Figures are numbered in the order the blocks reach them, and `{{fig:id}}`
 * anywhere in the prose becomes "Figure N" — so a cross-reference cannot go
 * stale when a screenshot is inserted ahead of it, and a reference to a figure
 * the document does not contain is an error rather than a wrong number.
 */
export async function buildPdd(spec: PddSpec): Promise<{ docx: number; pdf: number; pages: number }> {
  const DOC = spec.doc;
  const B = spec.blocks;
  const FIGURES: Map<string, Figure> = new Map(
    (spec.figureFiles ?? ["docs/pdd-assets/figures.json"])
      .flatMap((file) => JSON.parse(readFileSync(file, "utf8")) as Figure[])
      .map((f) => [f.id, f] as const),
  );
  const figureNumbers = new Map<string, number>();
  function figureOf(id: string): Figure & { n: number } {
    const f = FIGURES.get(id);
    if (!f) throw new Error(`Figure "${id}" is missing. Run: node scripts/capture-pdd-figures.mjs`);
    return { ...f, n: figureNumbers.get(id)! };
  }

  for (const b of B) if (b.t === "figure") figureNumbers.set(b.id, figureNumbers.size + 1);
  /** Replaces {{fig:id}} cross-references with "Figure N". */
  function T(text: string): string {
    return text.replace(/\{\{fig:([\w-]+)\}\}/g, (_, id: string) => {
      const n = figureNumbers.get(id);
      if (!n) throw new Error(`Cross-reference to unknown figure "${id}"`);
      return `Figure ${n}`;
    });
  }
  const FIGURE_LIST = [...figureNumbers.entries()].map(([id, n]) => ({ n, title: FIGURES.get(id)!.title, id }));

  // ---------------------------------------------------------------------------
  // Markdown emitter
  // ---------------------------------------------------------------------------
  function toMarkdown(notes: string[]): string {
    const out: string[] = [
      `# ${DOC.title} — ${DOC.subtitle}`, "",
      `**Version:** ${DOC.version} · **Date:** ${DOC.date} · **Author:** ${DOC.author} · **Status:** ${DOC.status}`, "",
      ...notes.map((n) => `> ${n}`), "",
      "**Figures**", "",
      ...FIGURE_LIST.map((f) => `${f.n}. ${f.title}`), "",
    ];
    const esc = (c: Cell) =>
      typeof c === "string" ? T(c).replace(/\|/g, "\\|") : `![](${FIGURES.get(c.img)?.file ?? c.img})`;
    for (const b of B) {
      switch (b.t) {
        case "h1": out.push(`## ${b.text}`, ""); break;
        case "h2": out.push(`### ${b.text}`, ""); break;
        case "h3": out.push(`#### ${b.text}`, ""); break;
        case "p": out.push(T(b.text), ""); break;
        case "note": out.push(`> ${T(b.text)}`, ""); break;
        case "bullets": out.push(...b.items.map((i) => `- ${T(i)}`), ""); break;
        case "numbered": out.push(...b.items.map((i, n) => `${n + 1}. ${T(i)}`), ""); break;
        case "table":
          out.push(`| ${b.header.map(esc).join(" | ")} |`, `| ${b.header.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(esc).join(" | ")} |`), "");
          break;
        case "figure": {
          const f = figureOf(b.id);
          out.push(`![Figure ${f.n}. ${f.title}](${f.file})`, "", `**Figure ${f.n}. ${f.title}**`, "", ...f.callouts.map((c) => `${c.n}. ${c.text}`), "");
          break;
        }
        case "pagebreak": break;
      }
    }
    return out.join("\n");
  }

  // ---------------------------------------------------------------------------
  // HTML emitter (for the PDF)
  // ---------------------------------------------------------------------------
  const escHtml = (s: string) => T(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function toHtml(): string {
    const body: string[] = [];
    const toc: { level: 1 | 2; text: string; id: string }[] = [];
    for (const b of B) {
      switch (b.t) {
        case "h1": { const id = slug(b.text); toc.push({ level: 1, text: b.text, id }); body.push(`<h1 id="${id}">${escHtml(b.text)}</h1>`); break; }
        case "h2": { const id = slug(b.text); toc.push({ level: 2, text: b.text, id }); body.push(`<h2 id="${id}">${escHtml(b.text)}</h2>`); break; }
        case "h3": body.push(`<h3>${escHtml(b.text)}</h3>`); break;
        case "p": body.push(`<p>${escHtml(b.text)}</p>`); break;
        case "note": body.push(`<p class="note">${escHtml(b.text)}</p>`); break;
        case "bullets": body.push(`<ul>${b.items.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>`); break;
        case "numbered": body.push(`<ol>${b.items.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ol>`); break;
        case "table": {
          const total = (b.widths ?? b.header.map(() => 1)).reduce((a, x) => a + x, 0);
          const cols = (b.widths ?? b.header.map(() => 1)).map((w) => `<col style="width:${((100 * w) / total).toFixed(2)}%">`).join("");
          const td = (c: Cell) => {
          if (typeof c === "string") return `<td>${escHtml(c)}</td>`;
          const f = FIGURES.get(c.img);
          if (!f) throw new Error(`Table cell references figure "${c.img}", which is not in any registry`);
          return `<td class="shot"><img src="data:image/png;base64,${readFileSync(f.file).toString("base64")}" alt=""></td>`;
        };
        body.push(`<table><colgroup>${cols}</colgroup><thead><tr>${b.header.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody></table>`);
          break;
        }
        case "figure": {
          const f = figureOf(b.id);
          const b64 = readFileSync(f.file).toString("base64");
          body.push(
            `<figure><img src="data:image/png;base64,${b64}" alt="${escHtml(f.title)}"><figcaption><b>Figure ${f.n}. ${escHtml(f.title)}</b><ol class="callouts">${f.callouts.map((c) => `<li>${escHtml(c.text)}</li>`).join("")}</ol></figcaption></figure>`,
          );
          break;
        }
        case "pagebreak": body.push(`<div class="pb"></div>`); break;
      }
    }
    const tocHtml = `<nav class="toc"><h1>Contents</h1><ul>${toc.map((e) => `<li class="l${e.level}"><a href="#${e.id}">${escHtml(e.text)}</a></li>`).join("")}</ul></nav>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(`${DOC.title} — ${DOC.subtitle}`)}</title><style>
  ${fontFaceCss()}
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans", Arial, sans-serif; font-size: 10pt; color: #1d2d3e; line-height: 1.45; margin: 0; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
  .cover h1 { font-size: 34pt; color: #1d3557; margin: 0 0 4pt; }
  .cover .sub { font-size: 20pt; color: #354a5f; border-bottom: 3px solid #1d3557; padding-bottom: 10pt; margin-bottom: 18pt; }
  .cover .course { color: #556b82; font-size: 12pt; margin-bottom: 40pt; }
  .cover dl { display: grid; grid-template-columns: 34mm 1fr; row-gap: 3pt; font-size: 11pt; }
  .cover dt { color: #556b82; } .cover dd { margin: 0; font-weight: 600; }
  .cover .warn { margin-top: 50pt; color: #7a0000; font-style: italic; font-size: 9pt; }
  .pb { page-break-after: always; }
  h1 { font-size: 16pt; color: #1d3557; margin: 18pt 0 8pt; page-break-after: avoid; }
  h2 { font-size: 12.5pt; color: #1d3557; margin: 14pt 0 6pt; page-break-after: avoid; }
  h3 { font-size: 11pt; color: #354a5f; margin: 10pt 0 4pt; page-break-after: avoid; }
  p { margin: 0 0 7pt; text-align: justify; }
  p.note { font-style: italic; margin: 0 10pt 7pt; text-align: left; }
  ul, ol { margin: 0 0 8pt; padding-left: 18pt; } li { margin-bottom: 3pt; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 8.8pt; page-break-inside: auto; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #1d3557; color: #fff; text-align: left; padding: 4pt 5pt; font-weight: 600; }
  td { border: 1px solid #c9d2dc; padding: 3.5pt 5pt; vertical-align: top; word-wrap: break-word; }
  tbody tr:nth-child(even) td { background: #f2f4f7; }
td.shot { padding: 3pt; }
td.shot img { display: block; width: 100%; max-height: ${CELL_IMAGE_MAX_H}px; object-fit: contain; object-position: left top; border: 1px solid #c9d2dc; }
  figure { margin: 8pt 0 12pt; page-break-inside: avoid; }
  figure img { display: block; width: 100%; max-height: 168mm; object-fit: contain; object-position: left top; border: 1px solid #c9d2dc; }
  figcaption { font-size: 8.5pt; color: #354a5f; margin-top: 4pt; }
  figcaption b { color: #1d3557; }
  ol.callouts { margin: 3pt 0 0; padding-left: 16pt; }
  ol.callouts li { margin-bottom: 1.5pt; }
  .figlist { font-size: 9.5pt; } .figlist ol { padding-left: 16pt; } .figlist li { margin-bottom: 2pt; }
  .toc h1 { margin-top: 0; } .toc ul { list-style: none; padding: 0; } .toc li.l1 { font-weight: 600; margin-top: 6pt; } .toc li.l2 { margin-left: 14pt; font-size: 9.5pt; } .toc a { color: #1d2d3e; text-decoration: none; }
  </style></head><body>
  <div class="cover">
    <h1>${escHtml(DOC.title)}</h1>
    <div class="sub">${escHtml(DOC.subtitle)}</div>
    <div class="course">${escHtml(DOC.strapline)}</div>
    <dl><dt>Version</dt><dd>${DOC.version}</dd><dt>Date</dt><dd>${DOC.date}</dd><dt>Author</dt><dd>${escHtml(DOC.author)}</dd><dt>Status</dt><dd>${escHtml(DOC.status)}</dd><dt>Target application</dt><dd>${escHtml(DOC.targetApp)}</dd></dl>
    <div class="warn">All data in Automation Lab is fictitious. Documents are watermarked SPECIMEN - TRAINING ONLY.</div>
  </div>
  <div class="pb"></div>
  ${tocHtml}
  <div class="figlist"><h2>Figures</h2><ol>${FIGURE_LIST.map((f) => `<li>${escHtml(f.title)}</li>`).join("")}</ol></div>
  <div class="pb"></div>
  ${body.join("\n")}
  </body></html>`;
  }

  // ---------------------------------------------------------------------------
  // DOCX emitter
  // ---------------------------------------------------------------------------
  /** Tallest a picture inside a table cell may be, in pixels at 96 dpi. */
  const CELL_IMAGE_MAX_H = 120;
  const FONT = "Calibri";
  const NAVY = "1D3557";
  const GREY = "F2F4F7";
  const PAGE_W = 11906 - 2 * 1134; // A4 minus 2 cm margins = 9638 DXA

  function run(text: string, opts: Partial<{ bold: boolean; size: number; color: string; italics: boolean }> = {}) {
    return new TextRun({ text: T(text), font: FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color, italics: opts.italics });
  }

  /** The picture a cell holds, sized to the column it sits in. */
  function cellImage(id: string, columnDxa: number): ImageRun {
    const f = FIGURES.get(id);
    if (!f) throw new Error(`Table cell references figure "${id}", which is not in any registry`);
    // 1 DXA is a twentieth of a point; a pixel at 96 dpi is three quarters of
    // one. Leave a little room so the picture does not touch the cell border.
    const box = Math.max(40, Math.round(columnDxa / 15) - 12);
    const scale = Math.min(box / f.width, CELL_IMAGE_MAX_H / f.height);
    return new ImageRun({
      type: "png",
      data: readFileSync(f.file),
      transformation: { width: Math.round(f.width * scale), height: Math.round(f.height * scale) },
    });
  }

  function table(header: string[], rows: Cell[][], widths?: number[]): Table {
    const n = header.length;
    let w = widths ?? Array.from({ length: n }, () => Math.floor(PAGE_W / n));
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum !== PAGE_W) w = w.map((x) => Math.round((x * PAGE_W) / sum));
    const diff = PAGE_W - w.reduce((a, b) => a + b, 0);
    w[w.length - 1] += diff;
    const border = { style: BorderStyle.SINGLE, size: 4, color: "C9D2DC" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cell = (value: Cell, i: number, head: boolean) =>
      new TableCell({
        width: { size: w[i], type: WidthType.DXA },
        borders,
        shading: head ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: [
          new Paragraph({
            children: [typeof value === "string" ? run(value, { bold: head, size: head ? 19 : 18, color: head ? "FFFFFF" : undefined }) : cellImage(value.img, w[i])],
            spacing: { after: 0 },
          }),
        ],
      });
    return new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: w,
      rows: [
        new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r, ri) =>
          new TableRow({
            children: r.map((c, i) => {
              const tc = cell(c, i, false);
              if (ri % 2 === 1) (tc as unknown as { options: { shading?: unknown } }).options.shading = { type: ShadingType.CLEAR, fill: GREY, color: "auto" };
              return tc;
            }),
          }),
        ),
      ],
    });
  }

  function blocksToDocx(): (Paragraph | Table)[] {
    const out: (Paragraph | Table)[] = [];
    for (const b of B) {
      switch (b.t) {
        case "h1": out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(b.text, { size: 30, bold: true, color: NAVY })], spacing: { before: 360, after: 160 } })); break;
        case "h2": out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(b.text, { size: 25, bold: true, color: NAVY })], spacing: { before: 280, after: 120 } })); break;
        case "h3": out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(b.text, { size: 22, bold: true, color: "354A5F" })], spacing: { before: 200, after: 80 } })); break;
        case "p": out.push(new Paragraph({ children: [run(b.text)], spacing: { after: 140 }, alignment: AlignmentType.JUSTIFIED })); break;
        case "note": out.push(new Paragraph({ children: [run(b.text, { italics: true })], spacing: { after: 140 }, indent: { left: 400, right: 400 } })); break;
        case "bullets": for (const i of b.items) out.push(new Paragraph({ children: [run(i)], numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 } })); break;
        case "numbered": for (const i of b.items) out.push(new Paragraph({ children: [run(i)], numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 } })); break;
        case "table": out.push(table(b.header, b.rows, b.widths), new Paragraph({ children: [], spacing: { after: 120 } })); break;
        case "figure": {
          const f = figureOf(b.id);
          // Content area is 9638 DXA wide (6.69 in = 642 px at 96 dpi); cap the height so a figure
          // plus its caption still fits on one page.
          const scale = Math.min(636 / f.width, 720 / f.height);
          out.push(
            new Paragraph({
              children: [new ImageRun({ type: "png", data: readFileSync(f.file), transformation: { width: Math.round(f.width * scale), height: Math.round(f.height * scale) } })],
              spacing: { before: 120, after: 60 },
            }),
            new Paragraph({ children: [run(`Figure ${f.n}. ${f.title}`, { bold: true, size: 17, color: NAVY })], spacing: { after: 60 }, keepNext: true }),
            ...f.callouts.map((c) => new Paragraph({ children: [run(`${c.n}. ${c.text}`, { size: 17 })], spacing: { after: 30 }, indent: { left: 200 } })),
            new Paragraph({ children: [], spacing: { after: 100 } }),
          );
          break;
        }
        case "pagebreak": out.push(new Paragraph({ children: [new PageBreak()] })); break;
      }
    }
    return out;
  }

  function cover(): Paragraph[] {
    return [
      new Paragraph({ children: [run("", { size: 20 })], spacing: { before: 2400 } }),
      new Paragraph({ children: [run(DOC.title, { size: 56, bold: true, color: NAVY })], spacing: { after: 120 } }),
      new Paragraph({ children: [run(DOC.subtitle, { size: 34, color: "354A5F" })], spacing: { after: 600 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 } } }),
      new Paragraph({ children: [run(DOC.strapline, { size: 24, color: "556B82" })], spacing: { after: 1200 } }),
      ...[["Version", DOC.version], ["Date", DOC.date], ["Author", DOC.author], ["Status", DOC.status], ["Target application", DOC.targetApp]].map(
        ([k, v]) => new Paragraph({ children: [run(`${k}: `, { bold: true, size: 22 }), run(v, { size: 22 })], spacing: { after: 80 } }),
      ),
      new Paragraph({ children: [run("All data in Automation Lab is fictitious. Documents are watermarked SPECIMEN - TRAINING ONLY.", { italics: true, size: 18, color: "7A0000" })], spacing: { before: 1800 } }),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("Contents", { size: 30, bold: true, color: NAVY })], spacing: { after: 160 } }),
      new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }) as unknown as Paragraph,
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("Figures", { size: 30, bold: true, color: NAVY })], spacing: { after: 160 } }),
      ...FIGURE_LIST.map((f) => new Paragraph({ children: [run(`Figure ${f.n}. ${f.title}`, { size: 19 })], spacing: { after: 50 } })),
      new Paragraph({ children: [new PageBreak()] }),
    ];
  }

  mkdirSync(path.dirname(spec.outBase), { recursive: true });
  if (spec.markdown) {
    mkdirSync(path.dirname(spec.markdown.file), { recursive: true });
    writeFileSync(spec.markdown.file, toMarkdown(spec.markdown.notes));
  }

  const doc = new Document({
      creator: DOC.author,
      title: `${DOC.title} — ${DOC.subtitle}`,
    description: DOC.description,
      styles: {
        default: { document: { run: { font: FONT, size: 21 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 25, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
          { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, color: "354A5F", font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
        ],
      },
      numbering: {
        config: [
          { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
          { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
        ],
      },
      features: { updateFields: true },
      sections: [
        {
          properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
          headers: { default: new Header({ children: [new Paragraph({ children: [run(`${DOC.title} · ${DOC.subtitle} · v${DOC.version}`, { size: 16, color: "556B82" })], alignment: AlignmentType.RIGHT })] }) },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [run("SPECIMEN - TRAINING ONLY · fictitious data · page ", { size: 16, color: "7A0000" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "7A0000" })],
                }),
              ],
            }),
          },
          children: [...cover(), ...blocksToDocx()],
        },
      ],
    });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(`${spec.outBase}.docx`, buf);

  const html = toHtml();
  writeFileSync(`${spec.outBase}.html`, html);
  const chrome = 'font-family: Arial, sans-serif; font-size: 7.5pt; color: #556b82; width: 100%; padding: 0 14mm;';
  const { pdf, pages } = await renderHtmlToPdf(html, {
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    headerTemplate: `<div style="${chrome} text-align: right;">${escHtml(`${DOC.title} · ${DOC.subtitle} · v${DOC.version}`)}</div>`,
    footerTemplate: `<div style="${chrome} text-align: center; color: #7a0000;">SPECIMEN - TRAINING ONLY · fictitious data · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  writeFileSync(`${spec.outBase}.pdf`, pdf);
  await closeRenderer();
  return { docx: buf.byteLength, pdf: pdf.byteLength, pages };
}
