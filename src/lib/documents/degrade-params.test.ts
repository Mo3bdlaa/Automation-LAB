import { describe, expect, it } from "vitest";
import { degradeParams } from "./degrade-params";
import { easternDigits, hijriFromIso, hijriLabel } from "./templates/i18n";
import { isLevel, isLazyLevel, LEVELS, LEVEL_SPECS } from "./levels";

const DOC = "8f14e45f-ceea-467a-9b4d-1e3b6b0f5a21";

describe("difficulty levels", () => {
  it("describes every level and marks which ones need OCR", () => {
    expect(LEVELS).toEqual([1, 2, 3, 4, 5]);
    expect(LEVEL_SPECS[1].textLayer).toBe(true);
    for (const l of [2, 3, 4, 5] as const) {
      expect(LEVEL_SPECS[l].textLayer).toBe(false);
      expect(LEVEL_SPECS[l].dpi).toBeGreaterThan(0);
    }
    expect(isLevel(6)).toBe(false);
    expect(isLazyLevel(1)).toBe(false);
    expect(isLazyLevel(3)).toBe(true);
  });

  it("derives the same degradation from the same document and level", () => {
    for (const level of [2, 3, 4, 5] as const) {
      expect(degradeParams(DOC, level)).toEqual(degradeParams(DOC, level));
    }
  });

  it("degrades two documents differently and one document more at each level", () => {
    const other = "3c59dc04-8e88-4506-a504-8ff0e4b1cbb7";
    expect(degradeParams(DOC, 3)).not.toEqual(degradeParams(other, 3));
    const l2 = degradeParams(DOC, 2);
    const l3 = degradeParams(DOC, 3);
    const l5 = degradeParams(DOC, 5);
    expect(l2.jpegQuality).toBeGreaterThan(l3.jpegQuality);
    expect(l3.jpegQuality).toBeGreaterThan(l5.jpegQuality);
    expect(Math.abs(l3.rotate)).toBeGreaterThan(Math.abs(l2.rotate));
    expect(l2.perspective).toBeNull();
    expect(l5.perspective).not.toBeNull();
    // Only the top level shows a document that has been handled by people.
    expect(l3.stamps).toHaveLength(0);
    expect(l5.stamps.length).toBeGreaterThan(0);
    expect(l5.handwriting.length).toBeGreaterThan(0);
  });

  it("refuses to degrade level 1", () => {
    expect(() => degradeParams(DOC, 1 as unknown as 2)).toThrow();
  });
});

describe("Arabic document conventions", () => {
  it("writes Western digits as Arabic-Indic ones", () => {
    expect(easternDigits("2026-08-20")).toBe("٢٠٢٦-٠٨-٢٠");
    expect(easternDigits("SA14 1050")).toBe("SA١٤ ١٠٥٠");
  });

  it("converts Gregorian dates to a Hijri date within a day of Umm al-Qura", () => {
    // 20 August 2026 is 6 or 7 Safar 1448 depending on the calendar in use.
    const h = hijriFromIso("2026-08-20");
    expect(h.year).toBe(1448);
    expect(h.month).toBe(3);
    expect(Math.abs(h.day - 7)).toBeLessThanOrEqual(1);
    expect(hijriLabel("2026-08-20", false)).toBe("1448/03/06 هـ");
    expect(hijriLabel("2026-08-20", true)).toBe("١٤٤٨/٠٣/٠٦ هـ");
  });

  it("is stable: the same date always converts the same way", () => {
    expect(hijriFromIso("2000-02-29")).toEqual(hijriFromIso("2000-02-29"));
    expect(hijriFromIso("2026-01-01").year).toBe(1447);
  });
});
