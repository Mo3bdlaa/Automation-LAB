/**
 * The difficulty ladder. Level 1 is the native-text PDF the templates render;
 * levels 2 to 5 are progressively worse scans of it, produced by
 * `src/lib/documents/degrade.ts`.
 *
 * The ladder is the teaching point of the course: a bot that reads level 1 with
 * a PDF text layer must switch to OCR at level 2, and must cope with skew,
 * noise, perspective and handwriting further up. Levels are therefore a public
 * contract - the numbers and their meaning must not be renumbered.
 */
export const LEVELS = [1, 2, 3, 4, 5] as const;
export type Level = (typeof LEVELS)[number];

export interface LevelSpec {
  level: Level;
  /** Short label used in the UI and in filenames. */
  label: string;
  labelAr: string;
  description: string;
  /** Raster resolution of the produced scan. Level 1 is vector, hence null. */
  dpi: number | null;
  /** True when the PDF still carries a text layer (no OCR needed). */
  textLayer: boolean;
}

export const LEVEL_SPECS: Record<Level, LevelSpec> = {
  1: {
    level: 1,
    label: "Native PDF",
    labelAr: "ملف أصلي",
    description: "The document as the system printed it: vector text, selectable, no OCR needed.",
    dpi: null,
    textLayer: true,
  },
  2: {
    level: 2,
    label: "Clean scan",
    labelAr: "مسح نظيف",
    description: "A flatbed scan at 300 dpi: faint blur, JPEG compression, a fraction of a degree of skew. OCR reads it almost perfectly.",
    dpi: 300,
    textLayer: false,
  },
  3: {
    level: 3,
    label: "Office scan",
    labelAr: "مسح مكتبي",
    description: "200 dpi with up to three degrees of skew, sensor noise and uneven lighting across the page.",
    dpi: 200,
    textLayer: false,
  },
  4: {
    level: 4,
    label: "Phone photo",
    labelAr: "صورة هاتف",
    description: "Photographed on a desk: perspective, a shadow gradient, a warm colour cast and a soft focus.",
    dpi: 150,
    textLayer: false,
  },
  5: {
    level: 5,
    label: "Handled document",
    labelAr: "مستند متداول",
    description: "A phone photo of paper that has been through an office: stamps, handwritten notes, staple marks and fold lines.",
    dpi: 150,
    textLayer: false,
  },
};

export function isLevel(n: number): n is Level {
  return (LEVELS as readonly number[]).includes(n);
}

/** Levels above 1 are rendered on first request, not at provisioning time. */
export function isLazyLevel(n: number): boolean {
  return isLevel(n) && n > 1;
}
