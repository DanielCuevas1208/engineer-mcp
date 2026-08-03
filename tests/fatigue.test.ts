import { describe, expect, it } from "vitest";
import { analyzeFatigue, fatigueSafetyFactor, type FatigueCriterion } from "../src/engine/fatigue.js";

const CRITERIA: FatigueCriterion[] = ["soderberg", "goodman", "gerber", "asme"];

describe("fatigueSafetyFactor", () => {
  it("computes each criterion from the closed-form expressions", () => {
    const sa = 200e6;
    const sm = 400e6;
    const se = 500e6;
    const sut = 1200e6;
    const sy = 950e6;

    expect(fatigueSafetyFactor("soderberg", sa, sm, se, sut, sy)).toBeCloseTo(1 / (sa / se + sm / sy), 6);
    expect(fatigueSafetyFactor("goodman", sa, sm, se, sut, sy)).toBeCloseTo(1 / (sa / se + sm / sut), 6);
    const a = (sm / sut) ** 2;
    const b = sa / se;
    expect(fatigueSafetyFactor("gerber", sa, sm, se, sut, sy)).toBeCloseTo((-b + Math.sqrt(b ** 2 + 4 * a)) / (2 * a), 6);
    expect(fatigueSafetyFactor("asme", sa, sm, se, sut, sy)).toBeCloseTo(1 / Math.sqrt((sa / se) ** 2 + (sm / sy) ** 2), 6);
  });

  it("reduces Gerber to the endurance ratio for a zero mean stress", () => {
    expect(fatigueSafetyFactor("gerber", 100e6, 0, 300e6, 600e6, 400e6)).toBeCloseTo(3, 6);
  });
});

describe("analyzeFatigue", () => {
  it("computes all four criteria and reports Soderberg as the headline", () => {
    const result = analyzeFatigue({
      meanStress: 400e6,
      alternatingStress: 200e6,
      ultimateStrength: 1200e6,
      yieldStrength: 950e6,
      enduranceLimit: 500e6,
    });

    const sa = 200e6;
    const sm = 400e6;
    const se = 500e6;
    const sut = 1200e6;
    const sy = 950e6;

    expect(result.method.id).toBe("fatigue-analysis");
    expect(result.referenceIds).toContain("shigley-2015");
    expect(result.safetyFactor?.key).toBe("soderbergFactor");
    expect(result.quantities.find((q) => q.key === "soderbergFactor")?.value).toBeCloseTo(1 / (sa / se + sm / sy), 6);
    expect(result.quantities.find((q) => q.key === "goodmanFactor")?.value).toBeCloseTo(1 / (sa / se + sm / sut), 6);
    expect(result.quantities.find((q) => q.key === "gerberFactor")?.value).toBeCloseTo(
      ((-sa / se + Math.sqrt((sa / se) ** 2 + 4 * (sm / sut) ** 2)) / (2 * (sm / sut) ** 2)),
      6,
    );
    expect(result.quantities.find((q) => q.key === "asmeFactor")?.value).toBeCloseTo(
      1 / Math.sqrt((sa / se) ** 2 + (sm / sy) ** 2),
      6,
    );
    expect(result.warnings.length).toBe(0);
  });

  it("reports the stress ratio for the load cycle", () => {
    const reversed = analyzeFatigue({
      meanStress: 0,
      alternatingStress: 100e6,
      ultimateStrength: 600e6,
      yieldStrength: 400e6,
      enduranceLimit: 300e6,
    });
    expect(reversed.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo(-1, 9);

    const pulsating = analyzeFatigue({
      meanStress: 100e6,
      alternatingStress: 100e6,
      ultimateStrength: 600e6,
      yieldStrength: 400e6,
      enduranceLimit: 300e6,
    });
    expect(pulsating.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo(0, 9);
  });

  it("uses the requested criterion for the headline safety factor", () => {
    const result = analyzeFatigue({
      meanStress: 400e6,
      alternatingStress: 200e6,
      ultimateStrength: 1200e6,
      yieldStrength: 950e6,
      enduranceLimit: 500e6,
      criterion: "gerber",
    });
    expect(result.safetyFactor?.key).toBe("gerberFactor");
  });

  it("estimates the endurance limit and warns when it is not supplied", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      alternatingStress: 100e6,
      ultimateStrength: 800e6,
      yieldStrength: 600e6,
    });
    expect(result.quantities.find((q) => q.key === "enduranceLimit")?.value).toBeCloseTo(400e6, 6);
    expect(result.warnings.some((w) => w.includes("estimated"))).toBe(true);
  });

  it("treats a static load with the yield line", () => {
    const result = analyzeFatigue({
      meanStress: 200e6,
      alternatingStress: 0,
      ultimateStrength: 600e6,
      yieldStrength: 400e6,
      enduranceLimit: 300e6,
    });
    expect(result.quantities.find((q) => q.key === "soderbergFactor")?.value).toBeCloseTo(2, 6);
    expect(result.quantities.find((q) => q.key === "asmeFactor")?.value).toBeCloseTo(2, 6);
  });

  it("warns when a safety factor drops below 1", () => {
    const result = analyzeFatigue({
      meanStress: 0,
      alternatingStress: 600e6,
      ultimateStrength: 800e6,
      yieldStrength: 600e6,
      enduranceLimit: 400e6,
    });
    expect(result.warnings.some((w) => w.includes("below 1"))).toBe(true);
  });

  it("carries every safety factor as a quantity", () => {
    const result = analyzeFatigue({
      meanStress: 300e6,
      alternatingStress: 150e6,
      ultimateStrength: 900e6,
      yieldStrength: 700e6,
      enduranceLimit: 450e6,
    });
    for (const criterion of CRITERIA) {
      const quantity = result.quantities.find((q) => q.key === `${criterion}Factor`);
      expect(quantity?.value).toBeGreaterThan(0);
      expect(quantity?.unit).toBe("");
    }
  });
});

describe("analyzeFatigue validation", () => {
  it("rejects a non-positive ultimate strength", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 100e6,
        alternatingStress: 50e6,
        ultimateStrength: 0,
        yieldStrength: 400e6,
      }),
    ).toThrow("ultimateStrength");
  });

  it("rejects a non-positive yield strength", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 100e6,
        alternatingStress: 50e6,
        ultimateStrength: 800e6,
        yieldStrength: -1,
      }),
    ).toThrow("yieldStrength");
  });

  it("rejects a negative mean stress", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: -100e6,
        alternatingStress: 50e6,
        ultimateStrength: 800e6,
        yieldStrength: 600e6,
      }),
    ).toThrow("meanStress");
  });

  it("rejects a zero load", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 0,
        alternatingStress: 0,
        ultimateStrength: 800e6,
        yieldStrength: 600e6,
      }),
    ).toThrow("Provide a positive meanStress or alternatingStress");
  });

  it("rejects a non-positive endurance limit", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 100e6,
        alternatingStress: 50e6,
        ultimateStrength: 800e6,
        yieldStrength: 600e6,
        enduranceLimit: 0,
      }),
    ).toThrow("enduranceLimit");
  });
});
