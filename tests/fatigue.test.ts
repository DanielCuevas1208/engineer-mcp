import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  enduranceLimitEstimate,
  equivalentAmplitude,
  fatigueSafetyFactor,
  finiteLifeCycles,
} from "../src/engine/fatigue.js";

const SUT = 600e6;
const SY = 450e6;
const SE = 300e6;

describe("endurance limit estimate", () => {
  it("uses half the ultimate strength below the steel cap", () => {
    expect(enduranceLimitEstimate(SUT)).toBe(SE);
  });

  it("caps the estimate at 700 MPa for high-strength steel", () => {
    expect(enduranceLimitEstimate(2000e6)).toBe(700e6);
  });
});

describe("fatigue safety factors", () => {
  const sa = 100e6;
  const sm = 100e6;

  it("computes the modified Goodman factor", () => {
    expect(fatigueSafetyFactor("goodman", sa, sm, SE, SUT)).toBeCloseTo(2.0, 6);
  });

  it("computes the Gerber factor from the quadratic", () => {
    const factor = fatigueSafetyFactor("gerber", sa, sm, SE, SUT);
    expect(factor).toBeCloseTo(2.4853, 3);
    expect(factor).toBeGreaterThan(fatigueSafetyFactor("goodman", sa, sm, SE, SUT));
  });

  it("computes the Soderberg factor", () => {
    expect(fatigueSafetyFactor("soderberg", sa, sm, SE, SUT, SY)).toBeCloseTo(1.8, 6);
  });

  it("computes the ASME-elliptic factor", () => {
    expect(fatigueSafetyFactor("asme_elliptic", sa, sm, SE, SUT, SY)).toBeCloseTo(2.4962, 3);
  });

  it("reduces to the endurance ratio for a fully reversed load", () => {
    expect(fatigueSafetyFactor("goodman", 150e6, 0, SE, SUT)).toBeCloseTo(2.0, 6);
    expect(fatigueSafetyFactor("gerber", 150e6, 0, SE, SUT)).toBeCloseTo(2.0, 6);
  });

  it("requires a yield strength for the yield-based criteria", () => {
    expect(() => fatigueSafetyFactor("soderberg", sa, sm, SE, SUT)).toThrow("yieldStrength");
    expect(() => fatigueSafetyFactor("asme_elliptic", sa, sm, SE, SUT)).toThrow("yieldStrength");
  });
});

describe("equivalent fully reversed amplitude", () => {
  it("amplifies the alternating stress for Goodman", () => {
    expect(equivalentAmplitude("goodman", 100e6, 100e6, SUT)).toBeCloseTo(120e6, 6);
  });

  it("amplifies the alternating stress for Gerber", () => {
    expect(equivalentAmplitude("gerber", 100e6, 100e6, SUT)).toBeCloseTo(100e6 / (1 - (100e6 / SUT) ** 2), 6);
  });

  it("uses the yield strength for Soderberg", () => {
    expect(equivalentAmplitude("soderberg", 100e6, 100e6, SUT, SY)).toBeCloseTo(100e6 / (1 - 100e6 / SY), 6);
  });
});

describe("finite life from the S-N curve", () => {
  it("returns the endurance-limit knee for an amplitude below the limit", () => {
    expect(finiteLifeCycles(200e6, SE, SUT)).toBe(1e6);
  });

  it("predicts a finite life above the endurance limit", () => {
    const a = (0.9 * SUT) ** 2 / SE;
    const b = -Math.log10((0.9 * SUT) / SE) / 3;
    const expected = (400e6 / a) ** (1 / b);
    const life = finiteLifeCycles(400e6, SE, SUT);
    expect(life).toBeLessThan(1e6);
    expect(life).toBeGreaterThan(1e3);
    expect(life).toBeCloseTo(expected, 0);
  });

  it("clamps to the low-cycle limit", () => {
    expect(finiteLifeCycles(580e6, SE, SUT)).toBe(1e3);
  });
});

describe("analyzeFatigue", () => {
  it("computes an infinite-life design with a Goodman factor", () => {
    const result = analyzeFatigue({
      ultimateStrength: SUT,
      stressAmplitude: 200e6,
      meanStress: 50e6,
    });

    expect(result.method.id).toBe("fatigue-analysis");
    expect(result.referenceIds).toContain("shigley-2015");
    expect(result.quantities.find((q) => q.key === "baseEnduranceLimit")?.value).toBe(SE);
    expect(result.quantities.find((q) => q.key === "correctedEnduranceLimit")?.value).toBe(SE);
    expect(result.quantities.find((q) => q.key === "fatigueLifeCycles")?.value).toBe(1e6);
    expect(result.safetyFactor?.value).toBeCloseTo(1.3333, 3);
    expect(result.safetyFactor?.key).toBe("fatigueSafetyFactor");
    expect(result.warnings.some((w) => w.includes("estimated"))).toBe(true);
  });

  it("applies the Marin correction factors", () => {
    const result = analyzeFatigue({
      ultimateStrength: SUT,
      stressAmplitude: 100e6,
      surfaceFactor: 0.9,
      sizeFactor: 0.85,
      temperatureFactor: 0.9,
    });
    const corrected = SE * 0.9 * 0.85 * 0.9;
    expect(result.quantities.find((q) => q.key === "correctedEnduranceLimit")?.value).toBeCloseTo(corrected, 2);
    expect(result.safetyFactor?.value).toBeCloseTo(corrected / 100e6, 6);
  });

  it("honours a supplied endurance limit without the estimate warning", () => {
    const result = analyzeFatigue({
      ultimateStrength: SUT,
      enduranceLimit: 260e6,
      stressAmplitude: 130e6,
    });
    expect(result.quantities.find((q) => q.key === "baseEnduranceLimit")?.value).toBe(260e6);
    expect(result.warnings.some((w) => w.includes("estimated"))).toBe(false);
  });

  it("reports a finite life and its warning", () => {
    const result = analyzeFatigue({
      ultimateStrength: SUT,
      stressAmplitude: 550e6,
    });
    const life = result.quantities.find((q) => q.key === "fatigueLifeCycles");
    expect(life?.value).toBe(1e3);
    expect(result.safetyFactor?.value).toBeCloseTo(300e6 / 550e6, 6);
    expect(result.warnings.some((w) => w.includes("10^3"))).toBe(true);
  });

  it("defaults the criterion to modified Goodman", () => {
    const result = analyzeFatigue({
      ultimateStrength: SUT,
      stressAmplitude: 100e6,
      meanStress: 100e6,
    });
    expect(result.inputs.criterion).toBe("goodman");
    expect(result.safetyFactor?.description).toContain("modified Goodman");
  });

  it("supports the Soderberg criterion with a yield strength", () => {
    const result = analyzeFatigue({
      ultimateStrength: SUT,
      yieldStrength: SY,
      stressAmplitude: 100e6,
      meanStress: 100e6,
      criterion: "soderberg",
    });
    expect(result.safetyFactor?.value).toBeCloseTo(1.8, 6);
    expect(result.safetyFactor?.description).toContain("Soderberg");
  });
});

describe("analyzeFatigue validation", () => {
  it("rejects a non-positive ultimate strength", () => {
    expect(() => analyzeFatigue({ ultimateStrength: 0, stressAmplitude: 100e6 })).toThrow("ultimateStrength");
  });

  it("rejects a negative stress amplitude", () => {
    expect(() => analyzeFatigue({ ultimateStrength: SUT, stressAmplitude: -1 })).toThrow("stressAmplitude");
  });

  it("rejects a zero stress amplitude with no mean stress", () => {
    expect(() => analyzeFatigue({ ultimateStrength: SUT, stressAmplitude: 0 })).toThrow("stressAmplitude");
  });

  it("accepts a mean-stress-only state", () => {
    const result = analyzeFatigue({ ultimateStrength: SUT, stressAmplitude: 0, meanStress: 300e6 });
    expect(result.safetyFactor?.value).toBeCloseTo(2.0, 6);
  });

  it("rejects an endurance limit at or above 0.9 times ultimate strength", () => {
    expect(() =>
      analyzeFatigue({ ultimateStrength: SUT, enduranceLimit: 540e6, stressAmplitude: 100e6 }),
    ).toThrow("0.9 times the ultimate strength");
  });

  it("rejects a non-positive correction factor", () => {
    expect(() =>
      analyzeFatigue({ ultimateStrength: SUT, stressAmplitude: 100e6, surfaceFactor: 0 }),
    ).toThrow("surfaceFactor");
  });

  it("rejects a mean stress at or above the ultimate strength", () => {
    expect(() =>
      analyzeFatigue({ ultimateStrength: SUT, stressAmplitude: 100e6, meanStress: SUT }),
    ).toThrow("ultimate strength");
  });

  it("rejects the Soderberg criterion without a yield strength", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: SUT,
        stressAmplitude: 100e6,
        meanStress: 100e6,
        criterion: "soderberg",
      }),
    ).toThrow("yieldStrength");
  });

  it("rejects the ASME-elliptic criterion with a mean stress at yield", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: SUT,
        yieldStrength: SY,
        stressAmplitude: 100e6,
        meanStress: SY,
        criterion: "asme_elliptic",
      }),
    ).toThrow("yield strength");
  });
});
