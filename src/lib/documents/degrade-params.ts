/**
 * Parameters for one degraded rendering, derived from (document id, level) so
 * the same document at the same level always comes out identical. Kept apart
 * from the renderer so it can be unit-tested without a browser.
 */
import { Rng, hashString } from "../generator/rng";
import { LEVEL_SPECS, type Level } from "./levels";

export interface Stamp {
  text: string;
  textAr: string;
  ink: string;
  /** Percentage of the sheet, from its top-left corner. */
  x: number;
  y: number;
  rotate: number;
  scale: number;
  round: boolean;
}

export interface Handwriting {
  text: string;
  ink: string;
  x: number;
  y: number;
  rotate: number;
  /** Font size as a percentage of sheet height. */
  size: number;
  /** A signature is drawn as a squiggle instead of text. */
  squiggle: string | null;
}

export interface DegradeParams {
  level: Level;
  dpi: number;
  jpegQuality: number;
  /** Blur radius in output pixels. */
  blur: number;
  /** In-plane rotation of the sheet, degrees. */
  rotate: number;
  noise: { opacity: number; frequency: number; seed: number };
  /** CSS filter components applied to the whole photo. */
  brightness: number;
  contrast: number;
  saturate: number;
  sepia: number;
  /** Perspective, for the levels photographed rather than scanned. */
  perspective: { depth: number; rotX: number; rotY: number; scale: number } | null;
  /** Uneven lighting: a diagonal gradient across the sheet, 0 disables it. */
  lighting: { angle: number; strength: number };
  vignette: number;
  /** Desk colour behind a photographed sheet; the paper colour for a scan. */
  background: string;
  paper: string;
  stamps: Stamp[];
  handwriting: Handwriting[];
  staples: boolean;
  /** Fold lines as fractions of the sheet height. */
  folds: number[];
}

const STAMPS: [string, string][] = [
  ["PAID", "مدفوع"],
  ["RECEIVED", "مستلم"],
  ["APPROVED", "معتمد"],
  ["POSTED", "مقيد"],
  ["ORIGINAL", "أصل"],
];
const INKS = ["#1f3f8f", "#8f1f2a", "#1f6f3f", "#3b3b3b"];

/** A hand-drawn-looking signature: a single seeded cubic path. */
function squiggle(rng: Rng): string {
  const pts: string[] = ["M 2 26"];
  let x = 2;
  for (let i = 0; i < 5; i++) {
    const c1x = x + rng.float(6, 14);
    const c1y = rng.float(2, 20);
    const c2x = c1x + rng.float(4, 12);
    const c2y = rng.float(18, 40);
    x = c2x + rng.float(4, 10);
    pts.push(`C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x.toFixed(1)} ${rng.float(20, 32).toFixed(1)}`);
  }
  return pts.join(" ");
}

/**
 * Deterministic per (document, level). The seed folds in the document id, so
 * two documents at the same level are degraded differently, and re-rendering
 * one reproduces its exact scan.
 */
export function degradeParams(documentId: string, level: Level): DegradeParams {
  const spec = LEVEL_SPECS[level];
  if (level === 1 || spec.dpi === null) throw new Error("Level 1 is rendered, not degraded");
  const rng = new Rng(hashString(`automation-lab:degrade:${documentId}:L${level}`));
  const base: DegradeParams = {
    level,
    dpi: spec.dpi,
    jpegQuality: 84,
    blur: 0.4,
    rotate: 0,
    noise: { opacity: 0, frequency: 0.8, seed: rng.int(1, 9999) },
    brightness: 1,
    contrast: 1,
    saturate: 1,
    sepia: 0,
    perspective: null,
    lighting: { angle: 0, strength: 0 },
    vignette: 0,
    background: "#f2f2ef",
    paper: "#fdfdfb",
    stamps: [],
    handwriting: [],
    staples: false,
    folds: [],
  };

  if (level === 2) {
    return {
      ...base,
      jpegQuality: 78,
      blur: rng.float(0.5, 0.8),
      rotate: rng.float(-0.5, 0.5),
      noise: { ...base.noise, opacity: rng.float(0.02, 0.05), frequency: 0.9 },
      brightness: rng.float(0.99, 1.02),
      contrast: rng.float(1.0, 1.04),
      paper: rng.pick(["#fdfdfb", "#fcfbf7", "#fbfbfd"]),
    };
  }

  if (level === 3) {
    return {
      ...base,
      jpegQuality: 50,
      blur: rng.float(0.9, 1.3),
      rotate: rng.float(-3, 3),
      noise: { ...base.noise, opacity: rng.float(0.14, 0.2), frequency: rng.float(0.5, 0.8) },
      brightness: rng.float(0.9, 0.98),
      contrast: rng.float(0.78, 0.9),
      saturate: rng.float(0.85, 1.0),
      lighting: { angle: rng.float(0, 360), strength: rng.float(0.18, 0.3) },
      paper: rng.pick(["#fbfaf5", "#f8f7f2", "#fcfbf6"]),
      folds: rng.chance(0.35) ? [rng.float(0.3, 0.36)] : [],
    };
  }

  // Levels 4 and 5 are photographs; 5 is the same photograph of a handled page.
  const photo: DegradeParams = {
    ...base,
    jpegQuality: 44,
    blur: rng.float(1.0, 1.5),
    rotate: rng.float(-2.5, 2.5),
    noise: { ...base.noise, opacity: rng.float(0.05, 0.1), frequency: rng.float(0.7, 1.1) },
    brightness: rng.float(0.92, 1.04),
    contrast: rng.float(0.88, 0.98),
    saturate: rng.float(1.02, 1.15),
    sepia: rng.float(0.06, 0.16),
    perspective: { depth: rng.float(900, 1600), rotX: rng.float(-5, 5), rotY: rng.float(-7, 7), scale: rng.float(0.86, 0.93) },
    lighting: { angle: rng.float(0, 360), strength: rng.float(0.18, 0.34) },
    vignette: rng.float(0.2, 0.4),
    background: rng.pick(["#e8e6e1", "#dfdcd6", "#eceae4", "#d9d6cf"]),
    paper: rng.pick(["#fdfcf8", "#fbfaf4", "#fcfbf9"]),
  };
  if (level === 4) return photo;

  const [text, textAr] = rng.pick(STAMPS);
  const stamps: Stamp[] = [
    { text, textAr, ink: rng.pick(INKS), x: rng.float(0.52, 0.72), y: rng.float(0.58, 0.78), rotate: rng.float(-18, 14), scale: rng.float(0.9, 1.25), round: rng.chance(0.5) },
  ];
  if (rng.chance(0.4)) {
    const [t2, t2Ar] = rng.pick(STAMPS);
    stamps.push({ text: t2, textAr: t2Ar, ink: rng.pick(INKS), x: rng.float(0.08, 0.24), y: rng.float(0.12, 0.2), rotate: rng.float(-12, 12), scale: rng.float(0.6, 0.85), round: rng.chance(0.4) });
  }
  const ink = rng.pick(["#1c3f9c", "#14204a"]);
  const handwriting: Handwriting[] = [
    { text: "", ink, x: rng.float(0.58, 0.74), y: rng.float(0.82, 0.9), rotate: rng.float(-6, 4), size: 0, squiggle: squiggle(rng) },
    { text: rng.pick(["OK to pay", "checked", "GRN attached", "ref. AP-2026", "قيد المراجعة"]), ink, x: rng.float(0.06, 0.2), y: rng.float(0.86, 0.93), rotate: rng.float(-5, 5), size: rng.float(1.1, 1.6), squiggle: null },
  ];
  // Level 5 is level 4 plus the wear of an office: a worse photograph of a page
  // that has been stamped, annotated, stapled and folded.
  return {
    ...photo,
    jpegQuality: 38,
    blur: photo.blur + rng.float(0.2, 0.5),
    vignette: photo.vignette + 0.05,
    stamps,
    handwriting,
    staples: rng.chance(0.7),
    folds: rng.chance(0.6) ? [rng.float(0.31, 0.36), rng.float(0.64, 0.7)] : [rng.float(0.48, 0.52)],
  };
}
