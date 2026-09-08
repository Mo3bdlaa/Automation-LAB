import { describe, expect, it } from "vitest";
import { PARAMETERS, SCENARIOS, parSeconds, scenarioBySlug } from "./scenarios";
import { ALL_RULES } from "../validation/rules";

describe("scenario catalogue", () => {
  it("has unique slugs and weights that add up to 100", () => {
    expect(new Set(SCENARIOS.map((s) => s.slug)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      const total = PARAMETERS.reduce((a, p) => a + s.weights[p], 0);
      expect(`${s.slug}:${total}`).toBe(`${s.slug}:100`);
    }
  });

  it("only names rule IDs that the engine actually raises", () => {
    const known = new Set(ALL_RULES.map((r) => r.id));
    for (const s of SCENARIOS) {
      for (const id of s.rules) expect(`${s.slug}:${id}`).toBe(`${s.slug}:${known.has(id) ? id : "UNKNOWN"}`);
    }
  });

  it("describes every scenario well enough to run it", () => {
    for (const s of SCENARIOS) {
      expect(s.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of s.steps) expect(step.handles.length).toBeGreaterThan(0);
      expect(s.targetSize).toBeGreaterThan(0);
      expect(s.passMark).toBeGreaterThan(0);
    }
  });

  it("scales par time with the amount of work", () => {
    const s = scenarioBySlug("invoice-processing")!;
    expect(parSeconds(s, 10)).toBe(s.parSecondsPerItem * 10);
    expect(parSeconds(s, 0)).toBe(s.parSecondsPerItem);
    expect(scenarioBySlug("nope")).toBeNull();
  });
});
