import { describe, expect, it } from "vitest";
import { expectedInvoiceOutcome, f1, timeFraction } from "./score";

describe("exception scoring", () => {
  it("rewards catching what is there without inventing what is not", () => {
    expect(f1(3, 0, 0)).toBe(1);
    expect(f1(0, 0, 0)).toBe(1); // nothing seeded, nothing raised: correct
    expect(f1(0, 3, 0)).toBe(0); // missed everything
    expect(f1(3, 0, 3)).toBeCloseTo(0.667, 2); // caught everything, cried wolf as often
    expect(f1(0, 0, 5)).toBe(0); // raised five that were not there
  });

  it("puts a bot that flags everything below one that reads the documents", () => {
    const flagsEverything = f1(4, 0, 8);
    const readsCarefully = f1(3, 1, 0);
    expect(readsCarefully).toBeGreaterThan(flagsEverything);
  });
});

describe("time scoring", () => {
  it("gives full marks at or under par and decays in proportion after it", () => {
    expect(timeFraction(60_000, 120)).toBe(1);
    expect(timeFraction(120_000, 120)).toBe(1);
    expect(timeFraction(240_000, 120)).toBe(0.5);
    expect(timeFraction(1_200_000, 120)).toBeCloseTo(0.1, 3);
  });
});

describe("expected invoice outcome", () => {
  it("never expects a critical invoice to be paid", () => {
    const critical = expectedInvoiceOutcome(["warning", "critical"]);
    expect(critical.allowed).not.toContain("paid");
    expect(critical.allowed).toContain("exception");
  });
  it("expects an error to be rejected and a clean invoice to be paid", () => {
    expect(expectedInvoiceOutcome(["error"]).allowed).toEqual(["rejected"]);
    expect(expectedInvoiceOutcome([]).allowed).toEqual(["approved", "paid"]);
    expect(expectedInvoiceOutcome(["warning"]).allowed).toEqual(["approved", "paid"]);
  });
});
