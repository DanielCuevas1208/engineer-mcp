import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  equivalentStressAmplitude,
  estimateEnduranceLimit,
  estimateFatigueLife,
  fatigueSafetyFactor,
  surfaceFinishFactor,
} from "../src/engine/fatigue.js";

describe("fatigue endurance limit", () => {
  it("estimates the machined bending endurance limit for steel", () => {
    const result = estimateEnduranceLimit({ ultimateStrength: 490e6 });
    expect(result.baseEnduranceLimit).toBeCloseTo(245e6, 6);
    expect(result.ka).toBeCloseTo(4.51 * 490 ** -0.265, 6);
    expect(result.kc).toBe(1);
    expect(result.enduranceLimit).toBeCloseTo(result.ka * result.kc * 245e6, 3);
  });

  it("caps the rotating-beam endurance limit at 700 MPa", () => {
    const result = estimateEnduranceLimit({ ultimateStrength: 2000e6, surfaceFinish: "ground" });
    expect(result.baseEnduranceLimit).toBe(700e6);
  });

  it("applies the axial and torsion load factors", () => {
    expect(estimateEnduranceLimit({ ultimateStrength: 490e6, loading: "axial" }).kc).toBeCloseTo(0.85, 9);
    expect(estimateEnduranceLimit({ ultimateStrength: 490e6, loading: "torsion" }).kc).toBeCloseTo(0.59, 9);
  });

  it("applies the size factor", () => {
    const result = estimateEnduranceLimit({ ultimateStrength: 490e6, sizeFactor: 0.8 });
    expect(result.enduranceLimit).toBeCloseTo(0.8 * estimateEnduranceLimit({ ultimateStrength: 490e6 }).enduranceLimit, 6);
  });

  it("computes the surface finish factor from the Shigley table", () => {
    expect(surfaceFinishFactor("ground", 490e6)).toBeCloseTo(1.58 * 490 ** -0.085, 6);
    expect(surfaceFinishFactor("hot_rolled", 490e6)).toBeCloseTo(57.7 * 490 ** -0.718, 6);
  });
});

describe("fatigue safety factor", () => {
  it("gives Se/Sa for a fully reversed cycle", () => {
    expect(fatigueSafetyFactor(100e6, 0, 200e6, "goodman", 400e6)).toBeCloseTo(2, 9);
  });

  it("applies the Modified Goodman mean stress correction", () => {
    const n = fatigueSafetyFactor(100e6, 100e6, 200e6, "goodman", 400e6);
    expect(n).toBeCloseTo(1 / (100e6 / 200e6 + 100e6 / 400e6), 9);
    expect(n).toBeCloseTo(4 / 3, 9);
  });

  it("applies the Soderberg criterion against yield strength", () => {
    const n = fatigueSafetyFactor(100e6, 100e6, 200e6, "soderberg", 400e6, 250e6);
    expect(n).toBeCloseTo(1 / (0.5 + 0.4), 9);
  });

  it("requires yield strength for the Soderberg criterion", () => {
    expect(() => fatigueSafetyFactor(100e6, 100e6, 200e6, "soderberg", 400e6)).toThrow();
  });

  it("applies the Gerber criterion", () => {
    const n = fatigueSafetyFactor(100e6, 100e6, 200e6, "gerber", 400e6);
    expect(n).toBeCloseTo(1 / (0.5 + 0.25 ** 2), 9);
  });
});

describe("fatigue life", () => {
  it("converts a fluctuating cycle to a fully reversed amplitude", () => {
    expect(equivalentStressAmplitude(100e6, 100e6, 400e6)).toBeCloseTo(100e6 / (1 - 0.25), 9);
  });

  it("estimates a finite life above the endurance limit", () => {
    const life = estimateFatigueLife(240e6, 214.1e6, 490e6);
    expect(life).toBeGreaterThan(0);
    expect(life).toBeLessThan(1e6);
  });

  it("predicts failure inside the fitted S-N range", () => {
    const life = estimateFatigueLife(260e6, 214.1e6, 490e6);
    expect(life).toBeGreaterThan(1e3);
    expect(life).toBeLessThan(1e6);
  });
});

describe("analyzeFatigue", () => {
  it("computes a fully reversed safety factor", () => {
    const result = analyzeFatigue({ ultimateStrength: 400e6, stressAmplitude: 100e6, enduranceLimit: 200e6 });
    const safety = result.quantities.find((q) => q.key === "fatigueSafetyFactor");
    expect(safety?.value).toBeCloseTo(2, 9);
    expect(result.quantities.find((q) => q.key === "estimatedLifeCycles")).toBeUndefined();
  });

  it("estimates the endurance limit from the Marin factors", () => {
    const result = analyzeFatigue({
      ultimateStrength: 490e6,
      stressAmplitude: 120e6,
      meanStress: 40e6,
      surfaceFinish: "machined",
      loading: "bending",
    });
    const endurance = result.quantities.find((q) => q.key === "enduranceLimit");
    expect(endurance?.value).toBeGreaterThan(0);
    expect(result.inputs.surfaceFactor).toBeCloseTo(4.51 * 490 ** -0.265, 6);
  });

  it("uses a supplied endurance limit without estimation", () => {
    const result = analyzeFatigue({ ultimateStrength: 400e6, stressAmplitude: 100e6, enduranceLimit: 250e6 });
    expect(result.quantities.find((q) => q.key === "enduranceLimit")?.value).toBe(250e6);
    expect(result.inputs).not.toHaveProperty("surfaceFactor");
  });

  it("warns when yielding occurs before fatigue failure", () => {
    const result = analyzeFatigue({
      ultimateStrength: 400e6,
      yieldStrength: 180e6,
      stressAmplitude: 120e6,
      meanStress: 80e6,
      enduranceLimit: 200e6,
    });
    expect(result.warnings.some((w) => w.includes("yield strength"))).toBe(true);
  });

  it("warns when fatigue failure is predicted", () => {
    const result = analyzeFatigue({ ultimateStrength: 400e6, stressAmplitude: 300e6, enduranceLimit: 200e6 });
    expect(result.warnings.some((w) => w.includes("below 1"))).toBe(true);
  });

  it("treats a compressive mean stress as zero with a warning", () => {
    const result = analyzeFatigue({ ultimateStrength: 400e6, stressAmplitude: 100e6, meanStress: -50e6, enduranceLimit: 200e6 });
    expect(result.inputs.meanStress).toBe(0);
    expect(result.warnings.some((w) => w.includes("Compressive"))).toBe(true);
    expect(result.quantities.find((q) => q.key === "fatigueSafetyFactor")?.value).toBeCloseTo(2, 9);
  });

  it("estimates life in the finite-life region", () => {
    const result = analyzeFatigue({
      ultimateStrength: 490e6,
      stressAmplitude: 240e6,
      surfaceFinish: "machined",
    });
    const life = result.quantities.find((q) => q.key === "estimatedLifeCycles");
    expect(life).toBeDefined();
    expect(life?.value).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("exceeds the endurance limit"))).toBe(true);
  });

  it("reports an allowable amplitude for a target safety factor", () => {
    const result = analyzeFatigue({
      ultimateStrength: 400e6,
      stressAmplitude: 60e6,
      enduranceLimit: 200e6,
      targetSafetyFactor: 1.5,
    });
    const allowable = result.quantities.find((q) => q.key === "allowableAmplitude");
    expect(allowable?.value).toBeCloseTo(200e6 / 1.5, 6);
  });

  it("rejects a missing stress input", () => {
    expect(() => analyzeFatigue({ ultimateStrength: 400e6 })).toThrow();
  });

  it("rejects a non-positive ultimate strength", () => {
    expect(() => analyzeFatigue({ ultimateStrength: 0, stressAmplitude: 100e6, enduranceLimit: 200e6 })).toThrow();
  });

  it("carries the Shigley provenance", () => {
    const result = analyzeFatigue({ ultimateStrength: 400e6, stressAmplitude: 100e6, enduranceLimit: 200e6 });
    expect(result.referenceIds).toContain("shigley-2015");
    expect(result.method.id).toBe("fatigue-analysis");
  });
});
