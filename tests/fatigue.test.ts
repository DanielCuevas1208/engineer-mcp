import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  estimateEnduranceLimit,
  type FatigueCriterion,
} from "../src/engine/fatigue.js";

const SE = 245e6;
const SUT = 490e6;
const SY = 355e6;

function baseInput() {
  return {
    meanStress: 150e6,
    amplitudeStress: 100e6,
    ultimateStrength: SUT,
    yieldStrength: SY,
    enduranceLimit: SE,
  };
}

describe("estimateEnduranceLimit", () => {
  it("estimates half the ultimate strength for steel", () => {
    expect(estimateEnduranceLimit(490e6)).toBeCloseTo(245e6, 6);
  });

  it("caps the estimate at 700 MPa", () => {
    expect(estimateEnduranceLimit(2000e6)).toBe(700e6);
  });

  it("rejects a non-positive ultimate strength", () => {
    expect(() => estimateEnduranceLimit(0)).toThrow("ultimateStrength");
  });
});

describe("analyzeFatigue factors", () => {
  it("computes the modified Goodman factor", () => {
    const result = analyzeFatigue(baseInput());
    const goodman = result.quantities.find((q) => q.key === "goodmanSafetyFactor");
    expect(goodman?.value).toBeCloseTo(1 / (100e6 / SE + 150e6 / SUT), 9);
    expect(goodman?.value).toBeCloseTo(1.4, 6);
  });

  it("computes the Soderberg factor from yield strength", () => {
    const result = analyzeFatigue(baseInput());
    const soderberg = result.quantities.find((q) => q.key === "soderbergSafetyFactor");
    expect(soderberg?.value).toBeCloseTo(1 / (100e6 / SE + 150e6 / SY), 9);
  });

  it("computes the Gerber factor", () => {
    const result = analyzeFatigue(baseInput());
    const gerber = result.quantities.find((q) => q.key === "gerberSafetyFactor");
    const a = 150e6 / SUT;
    const b = 100e6 / SE;
    const expected = (Math.sqrt(b * b + 4 * a * a) - b) / (2 * a * a);
    expect(gerber?.value).toBeCloseTo(expected, 9);
    expect(gerber?.value).toBeGreaterThan(1.7);
  });

  it("computes the ASME-elliptic factor", () => {
    const result = analyzeFatigue(baseInput());
    const asme = result.quantities.find((q) => q.key === "asmeEllipticSafetyFactor");
    const inner = (100e6 / SE) ** 2 + (150e6 / SY) ** 2;
    expect(asme?.value).toBeCloseTo(1 / Math.sqrt(inner), 9);
  });

  it("computes the yield safety factor from the cycle peak", () => {
    const result = analyzeFatigue(baseInput());
    const yieldFactor = result.quantities.find((q) => q.key === "yieldSafetyFactor");
    expect(yieldFactor?.value).toBeCloseTo(SY / 250e6, 9);
  });

  it("reports the stress ratio and cycle extremes", () => {
    const result = analyzeFatigue(baseInput());
    expect(result.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo(0.2, 9);
    expect(result.quantities.find((q) => q.key === "minStress")?.value).toBe(50e6);
    expect(result.quantities.find((q) => q.key === "maxStress")?.value).toBe(250e6);
  });

  it("sets the default safety factor to the Goodman criterion", () => {
    const result = analyzeFatigue(baseInput());
    expect(result.safetyFactor?.key).toBe("fatigueSafetyFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(1.4, 6);
    expect(result.safetyFactor?.label).toContain("Goodman");
  });

  it("selects the requested criterion for the safety factor", () => {
    const result = analyzeFatigue({ ...baseInput(), criterion: "soderberg" });
    expect(result.safetyFactor?.label).toContain("Soderberg");
    const soderberg = result.quantities.find((q) => q.key === "soderbergSafetyFactor");
    expect(result.safetyFactor?.value).toBe(soderberg?.value);
  });
});

describe("analyzeFatigue endurance limit", () => {
  it("uses an explicit endurance limit", () => {
    const result = analyzeFatigue(baseInput());
    expect(result.quantities.find((q) => q.key === "enduranceLimit")?.value).toBe(SE);
    expect(result.inputs.enduranceLimit).toBe(SE);
  });

  it("estimates the endurance limit and warns when it is omitted", () => {
    const result = analyzeFatigue({
      meanStress: 150e6,
      amplitudeStress: 100e6,
      ultimateStrength: SUT,
      yieldStrength: SY,
    });
    expect(result.quantities.find((q) => q.key === "enduranceLimit")?.value).toBeCloseTo(245e6, 6);
    expect(result.warnings.some((w) => w.includes("estimated"))).toBe(true);
  });

  it("warns when the amplitude exceeds the endurance limit", () => {
    const result = analyzeFatigue({
      meanStress: 0,
      amplitudeStress: 300e6,
      ultimateStrength: SUT,
      yieldStrength: SY,
      enduranceLimit: SE,
    });
    expect(result.warnings.some((w) => w.includes("exceeds the endurance limit"))).toBe(true);
  });
});

describe("analyzeFatigue warnings", () => {
  it("warns on a compressive mean stress", () => {
    const result = analyzeFatigue({
      meanStress: -50e6,
      amplitudeStress: 100e6,
      ultimateStrength: SUT,
      yieldStrength: SY,
      enduranceLimit: SE,
    });
    expect(result.warnings.some((w) => w.includes("compressive"))).toBe(true);
  });

  it("warns when the cycle peak exceeds yield", () => {
    const result = analyzeFatigue({
      meanStress: 300e6,
      amplitudeStress: 200e6,
      ultimateStrength: SUT,
      yieldStrength: SY,
      enduranceLimit: SE,
    });
    expect(result.warnings.some((w) => w.includes("peak"))).toBe(true);
  });
});

describe("analyzeFatigue validation", () => {
  it("rejects a non-positive amplitude", () => {
    expect(() => analyzeFatigue({ ...baseInput(), amplitudeStress: 0 })).toThrow("amplitudeStress");
  });

  it("rejects a non-positive ultimate strength", () => {
    expect(() => analyzeFatigue({ ...baseInput(), ultimateStrength: 0 })).toThrow("ultimateStrength");
  });

  it("rejects a non-positive endurance limit", () => {
    expect(() => analyzeFatigue({ ...baseInput(), enduranceLimit: -1 })).toThrow("enduranceLimit");
  });

  it("requires yield strength for the Soderberg criterion", () => {
    const { yieldStrength: _ignored, ...withoutYield } = baseInput();
    expect(() => analyzeFatigue({ ...withoutYield, criterion: "soderberg" })).toThrow("yieldStrength");
  });

  it("requires yield strength for the ASME-elliptic criterion", () => {
    const { yieldStrength: _ignored, ...withoutYield } = baseInput();
    expect(() => analyzeFatigue({ ...withoutYield, criterion: "asme_elliptic" })).toThrow("yieldStrength");
  });

  it("works without yield strength for Goodman and Gerber", () => {
    const { yieldStrength: _ignored, ...withoutYield } = baseInput();
    const goodman = analyzeFatigue({ ...withoutYield });
    expect(goodman.safetyFactor?.value).toBeCloseTo(1.4, 6);
    expect(goodman.quantities.some((q) => q.key === "soderbergSafetyFactor")).toBe(false);
    const gerber = analyzeFatigue({ ...withoutYield, criterion: "gerber" });
    expect(gerber.safetyFactor?.key).toBe("fatigueSafetyFactor");
  });
});

describe("analyzeFatigue provenance", () => {
  it("carries the Shigley reference", () => {
    const result = analyzeFatigue(baseInput());
    expect(result.referenceIds).toContain("shigley-2015");
    expect(result.method.id).toBe("fatigue-analysis");
  });

  it("accepts every criterion enum", () => {
    const criteria: FatigueCriterion[] = ["goodman", "soderberg", "gerber", "asme_elliptic"];
    for (const criterion of criteria) {
      const result = analyzeFatigue({ ...baseInput(), criterion });
      expect(result.safetyFactor?.value).toBeGreaterThan(0);
    }
  });
});
