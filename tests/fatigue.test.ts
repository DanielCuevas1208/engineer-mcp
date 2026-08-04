import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  enduranceLimitEstimate,
  fatigueSafetyFactor,
} from "../src/engine/fatigue.js";

describe("enduranceLimitEstimate", () => {
  it("estimates half the ultimate strength for steel", () => {
    expect(enduranceLimitEstimate("steel", 1000e6)).toBeCloseTo(500e6, 6);
  });

  it("caps the steel estimate at 700 MPa", () => {
    expect(enduranceLimitEstimate("steel", 2000e6)).toBeCloseTo(700e6, 6);
  });

  it("estimates 40 percent of the ultimate strength for aluminium", () => {
    expect(enduranceLimitEstimate("aluminium", 300e6)).toBeCloseTo(120e6, 6);
  });

  it("caps the aluminium estimate at 130 MPa", () => {
    expect(enduranceLimitEstimate("aluminum", 1000e6)).toBeCloseTo(130e6, 6);
  });
});

describe("fatigueSafetyFactor", () => {
  const se = 400e6;
  const sut = 800e6;
  const sy = 600e6;

  it("treats a fully reversed cycle by the Goodman criterion", () => {
    const n = fatigueSafetyFactor("goodman", 0, 100e6, se, sut);
    expect(n).toBeCloseTo(4, 9);
  });

  it("combines mean and alternating stress by Goodman", () => {
    const n = fatigueSafetyFactor("goodman", 100e6, 100e6, se, sut);
    expect(n).toBeCloseTo(1 / (100e6 / se + 100e6 / sut), 9);
  });

  it("uses the yield strength for the Soderberg criterion", () => {
    const n = fatigueSafetyFactor("soderberg", 100e6, 100e6, se, sut, sy);
    expect(n).toBeCloseTo(1 / (100e6 / se + 100e6 / sy), 9);
  });

  it("solves the quadratic for the Gerber criterion", () => {
    const n = fatigueSafetyFactor("gerber", 100e6, 100e6, se, sut);
    const a = (100e6 / sut) ** 2;
    const b = 100e6 / se;
    const expected = (-b + Math.sqrt(b * b + 4 * a)) / (2 * a);
    expect(n).toBeCloseTo(expected, 9);
  });

  it("returns the endurance ratio for a zero mean on Gerber", () => {
    const n = fatigueSafetyFactor("gerber", 0, 100e6, se, sut);
    expect(n).toBeCloseTo(4, 9);
  });

  it("treats a compressive mean stress as zero", () => {
    const goodman = fatigueSafetyFactor("goodman", -100e6, 100e6, se, sut);
    expect(goodman).toBeCloseTo(4, 9);
  });

  it("rejects the Soderberg criterion without a yield strength", () => {
    expect(() => fatigueSafetyFactor("soderberg", 0, 100e6, se, sut)).toThrow(/yieldStrength/);
  });
});

describe("analyzeFatigue", () => {
  it("reports the stress ratio and cycle stresses", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      alternatingStress: 60e6,
      ultimateStrength: 800e6,
      yieldStrength: 600e6,
      enduranceLimit: 400e6,
    });

    expect(result.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo(0.25, 9);
    expect(result.quantities.find((q) => q.key === "maximumStress")?.value).toBeCloseTo(160e6, 6);
    expect(result.quantities.find((q) => q.key === "minimumStress")?.value).toBeCloseTo(40e6, 6);
  });

  it("picks the governing safety factor as the lower margin", () => {
    const result = analyzeFatigue({
      meanStress: 200e6,
      alternatingStress: 100e6,
      ultimateStrength: 800e6,
      yieldStrength: 400e6,
      enduranceLimit: 400e6,
    });

    const fatigue = result.quantities.find((q) => q.key === "fatigueSafetyFactor");
    expect(fatigue?.value).toBeCloseTo(1 / (100e6 / 400e6 + 200e6 / 800e6), 9);
    const yieldQ = result.quantities.find((q) => q.key === "yieldSafetyFactor");
    expect(yieldQ?.value).toBeCloseTo(400e6 / 300e6, 9);
    expect(result.safetyFactor?.key).toBe("yieldSafetyFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(400e6 / 300e6, 9);
  });

  it("warns when it estimates the endurance limit", () => {
    const result = analyzeFatigue({
      meanStress: 50e6,
      alternatingStress: 30e6,
      ultimateStrength: 1000e6,
    });
    expect(result.quantities.find((q) => q.key === "enduranceLimit")?.value).toBeCloseTo(500e6, 6);
    expect(result.warnings.some((w) => w.includes("estimate"))).toBe(true);
  });

  it("warns when the alternating stress reaches the endurance limit", () => {
    const result = analyzeFatigue({
      meanStress: 0,
      alternatingStress: 400e6,
      ultimateStrength: 1000e6,
      enduranceLimit: 400e6,
    });
    expect(result.warnings.some((w) => w.includes("endurance limit"))).toBe(true);
  });

  it("warns when the fatigue safety factor is below one", () => {
    const result = analyzeFatigue({
      meanStress: 0,
      alternatingStress: 600e6,
      ultimateStrength: 1000e6,
      enduranceLimit: 400e6,
    });
    expect(result.safetyFactor?.value).toBeLessThan(1);
    expect(result.warnings.some((w) => w.includes("below one"))).toBe(true);
  });

  it("rejects a negative alternating stress", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 0,
        alternatingStress: -10e6,
        ultimateStrength: 800e6,
      }),
    ).toThrow(/alternatingStress/);
  });

  it("rejects a non-positive ultimate strength", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 0,
        alternatingStress: 10e6,
        ultimateStrength: 0,
      }),
    ).toThrow(/ultimateStrength/);
  });

  it("rejects a zero stress state", () => {
    expect(() =>
      analyzeFatigue({
        meanStress: 0,
        alternatingStress: 0,
        ultimateStrength: 800e6,
      }),
    ).toThrow(/non-zero/);
  });
});
