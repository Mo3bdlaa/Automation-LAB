/**
 * The process maps the PDD needs, drawn rather than photographed.
 *
 * A screenshot shows one screen; a process map shows the order the screens are
 * used in and who is holding the mouse, which is the thing a developer opens a
 * PDD for. There is no drawing tool in this environment, so the maps are laid
 * out here as SVG and printed by the same headless Chromium that prints the
 * documents themselves.
 *
 * They flow downward, with each lane a column, because the page is portrait.
 * The first draft ran left to right across seven columns; scaled to fit a
 * 6.6-inch text column that put the step labels under five points, which is a
 * diagram nobody can read — worse than no diagram, because the chapter looks
 * finished. Turned on its side the same nine steps fit the page at eight.
 *
 * Coordinates are never written by hand. A node names its lane and its row;
 * this file turns that into pixels, sizes each box around the text it holds,
 * and routes every arrow from wherever its two ends landed. Hand-placed boxes
 * are how a diagram drifts out of step with the process it describes.
 */

export interface Lane {
  id: string;
  title: string;
  /** A lane the robot owns is tinted, so "who does this step" reads at a glance. */
  tone?: "human" | "bot" | "system" | "vendor";
}

export interface Node {
  id: string;
  /** Omitted on a map with no lanes, where every step sits in one column. */
  lane?: string;
  row: number;
  text: string;
  /** decision draws a diamond; start and end draw a pill. */
  shape?: "box" | "decision" | "start" | "end";
  /** Marks a step performed by the robot in the to-be map. */
  bot?: boolean;
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
}

export interface Diagram {
  id: string;
  title: string;
  lanes: Lane[];
  nodes: Node[];
  edges: Edge[];
  legend?: { colour: string; text: string }[];
  /**
   * Lay the rows out left to right instead of top to bottom. Only for a map
   * with no lanes and few steps: a lane-less chain drawn downward is a tall
   * narrow strip, and a figure is scaled to fit the page's height as well as
   * its width, so a tall strip comes out as a thin ribbon down a whole page.
   */
  across?: boolean;
}

const INK = "#1d2d3e";
const NAVY = "#1d3557";
const LINE = "#8fa3b8";
const BOT = "#c2410c";
const BOT_FILL = "#fdf0e7";
const LANE_TONE: Record<string, string> = {
  human: "#ffffff",
  bot: "#fdf8f4",
  system: "#f6f8fa",
  vendor: "#ffffff",
};

const LANE_W = 176;
const LANE_GAP = 22;
const NODE_W = 152;
const HEAD_H = 40;
const ROW_GAP = 38;
const PAD = 12;
const FS = 12.5;
const LH = 15;
const CHARS = 21; // what NODE_W holds at FS in Arial

export const BOT_COLOUR = BOT;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Wrap on spaces to a character budget the box can hold. */
function wrap(text: string, perLine = CHARS): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > perLine) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

interface Layout {
  width: number;
  height: number;
  laneX: (id: string | undefined) => number;
  box: (n: Node) => { x: number; y: number; w: number; h: number; cx: number; cy: number };
}

/**
 * Rows are as tall as the tallest box in them, so one three-line step does not
 * make every other row reserve three lines of space it does not use.
 */
function layout(d: Diagram): Layout {
  const lanes = d.lanes.length || 1;
  const headH = d.lanes.length ? HEAD_H : 0;

  const heightOf = (n: Node) => {
    const lines = wrap(n.text, n.shape === "decision" ? 15 : CHARS).length;
    const base = 18 + lines * LH;
    return n.shape === "decision" ? Math.max(base + 16, 70) : Math.max(base, 50);
  };
  const rows = Math.max(...d.nodes.map((n) => n.row)) + 1;

  if (d.across) {
    const h = Math.max(...d.nodes.map(heightOf));
    const stepX = NODE_W + LANE_GAP * 2;
    return {
      width: PAD * 2 + rows * NODE_W + (rows - 1) * LANE_GAP * 2,
      height: PAD * 2 + h,
      laneX: () => PAD,
      box: (n: Node) => {
        const x = PAD + n.row * stepX;
        return { x, y: PAD, w: NODE_W, h, cx: x + NODE_W / 2, cy: PAD + h / 2 };
      },
    };
  }

  const width = PAD * 2 + lanes * LANE_W + (lanes - 1) * LANE_GAP;
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...d.nodes.filter((n) => n.row === r).map(heightOf)));
  const rowY: number[] = [];
  let y = headH + PAD;
  for (let r = 0; r < rows; r++) {
    rowY.push(y);
    y += rowH[r] + ROW_GAP;
  }
  const height = y - ROW_GAP + PAD;

  const laneX = (id: string | undefined) => {
    const i = d.lanes.length ? d.lanes.findIndex((l) => l.id === id) : 0;
    return PAD + Math.max(i, 0) * (LANE_W + LANE_GAP);
  };
  const box = (n: Node) => {
    const h = heightOf(n);
    const w = n.shape === "decision" ? NODE_W + 16 : NODE_W;
    const x = laneX(n.lane) + (LANE_W - w) / 2;
    const yy = rowY[n.row] + (rowH[n.row] - h) / 2;
    return { x, y: yy, w, h, cx: x + w / 2, cy: yy + h / 2 };
  };
  return { width, height, laneX, box };
}

function shape(L: Layout, n: Node): string {
  const b = L.box(n);
  const stroke = n.bot ? BOT : LINE;
  const fill = n.bot ? BOT_FILL : "#ffffff";
  const lines = wrap(n.text, n.shape === "decision" ? 15 : CHARS);
  const y0 = b.cy - ((lines.length - 1) * LH) / 2 + 4;
  const label = lines.map((l, i) => `<tspan x="${b.cx}" y="${(y0 + i * LH).toFixed(1)}">${esc(l)}</tspan>`).join("");
  const text = `<text text-anchor="middle" font-size="${FS}" fill="${INK}" font-family="Arial, sans-serif">${label}</text>`;

  if (n.shape === "decision") {
    return `<polygon points="${b.cx},${b.y} ${b.x + b.w},${b.cy} ${b.cx},${b.y + b.h} ${b.x},${b.cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>${text}`;
  }
  const r = n.shape === "start" || n.shape === "end" ? Math.min(b.h / 2, 22) : 6;
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>${text}`;
}

/**
 * Route one arrow.
 *
 * Down the same lane is a straight drop. Into another lane it leaves the
 * bottom, runs along a bus halfway down the gap between the two rows and drops
 * into the top of the target — so three branches out of one decision share a
 * horizontal run and then separate, which is what a reader expects a fan-out
 * to look like.
 */
function edgeOf(d: Diagram, L: Layout, e: Edge): { path: string; label: string } {
  const a = d.nodes.find((n) => n.id === e.from);
  const z = d.nodes.find((n) => n.id === e.to);
  if (!a || !z) throw new Error(`Edge ${e.from} → ${e.to} names a node that does not exist`);
  const A = L.box(a);
  const Z = L.box(z);
  const stroke = `fill="none" stroke="${LINE}" stroke-width="1.6"`;
  let path: string;
  let lx: number;
  let ly: number;
  if (d.across) {
    path = `M ${A.x + A.w} ${A.cy} H ${Z.x}`;
    lx = A.x + A.w + 4;
    ly = A.cy - 8;
  } else if (a.lane === z.lane) {
    path = `M ${A.cx} ${A.y + A.h} V ${Z.y}`;
    lx = A.cx + 7;
    ly = (A.y + A.h + Z.y) / 2 + 4;
  } else {
    const bus = (A.y + A.h + Z.y) / 2;
    path = `M ${A.cx} ${A.y + A.h} V ${bus} H ${Z.cx} V ${Z.y}`;
    lx = Z.cx + 7;
    ly = (bus + Z.y) / 2 + 4;
  }
  // Labels come back separately because they are painted after the boxes: a
  // branch label that lands where a box lands would otherwise be buried.
  const label = e.label
    ? `<text x="${lx}" y="${ly}" font-size="11.5" font-weight="bold" fill="${NAVY}" font-family="Arial, sans-serif" text-anchor="start" paint-order="stroke" stroke="#ffffff" stroke-width="3.5">${esc(e.label)}</text>`
    : "";
  return { path: `<path d="${path}" ${stroke} marker-end="url(#arrow)"/>`, label };
}

export function toSvg(d: Diagram): string {
  const L = layout(d);
  const legendH = d.legend ? 34 : 0;
  const height = L.height + legendH;
  const routed = d.edges.map((e) => edgeOf(d, L, e));

  const lanes = d.lanes
    .map((l) => {
      const x = L.laneX(l.id);
      const headFill = l.tone === "bot" ? BOT_FILL : "#eef2f6";
      const headInk = l.tone === "bot" ? BOT : NAVY;
      const title = wrap(l.title, 24)
        .map(
          (t, k, all) =>
            `<text x="${x + LANE_W / 2}" y="${HEAD_H / 2 - ((all.length - 1) * 13) / 2 + 4 + k * 13}" text-anchor="middle" font-size="11.5" font-weight="bold" fill="${headInk}" font-family="Arial, sans-serif">${esc(t)}</text>`,
        )
        .join("");
      return `<rect x="${x}" y="${HEAD_H}" width="${LANE_W}" height="${L.height - HEAD_H}" fill="${LANE_TONE[l.tone ?? "human"]}" stroke="${LINE}" stroke-width="1"/>
<rect x="${x}" y="0" width="${LANE_W}" height="${HEAD_H}" fill="${headFill}" stroke="${LINE}" stroke-width="1"/>${title}`;
    })
    .join("\n");

  const legend = d.legend
    ? `<g transform="translate(${PAD},${L.height + 14})">${d.legend
        .map(
          (l, i) =>
            `<rect x="${i * 250}" y="0" width="15" height="11" rx="3" fill="${l.colour === BOT ? BOT_FILL : "#ffffff"}" stroke="${l.colour}" stroke-width="1.6"/>
<text x="${i * 250 + 22}" y="10" font-size="11" fill="${INK}" font-family="Arial, sans-serif">${esc(l.text)}</text>`,
        )
        .join("")}</g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${height}" viewBox="0 0 ${L.width} ${height}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="${LINE}"/></marker></defs>
<rect width="${L.width}" height="${height}" fill="#ffffff"/>
${lanes}
${routed.map((r) => r.path).join("\n")}
${d.nodes.map((n) => shape(L, n)).join("\n")}
${routed.map((r) => r.label).join("")}
${legend}
</svg>`;
}
