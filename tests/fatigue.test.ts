import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  enduranceLimitEstimate,
  surfaceFactor,
} from "../src/engine/fatigue.js";

describe("endurance limit estimate", () => {
  it("estimates half the ultimate strength for lower-strength steel", () => {
    expect(enduranceLimitEstimate(1000e6)).toBeCloseTo(500e6, 9);
    expect(enduranceLimitEstimate(620e6)).toBeCloseTo(310e6, 9);
  });

  it("caps the estimate at 700 MPa for high-strength steel", () => {
    expect(enduranceLimitEstimate(1600e6)).toBeCloseTo(700e6, 9);
    expect(enduranceLimitEstimate(1400e6)).toBeCloseTo(700e6, 9);
  });
});

describe("surface factor", () => {
  it("applies the Shigley constants for a machined finish", () => {
    const expected = 4.51 * 1000 ** -0.265;
    expect(surfaceFactor("machined", 1000e6)).toBeCloseTo(expected, 9);
    expect(surfaceFactor("machined", 1000e6)).toBeCloseTo(0.7231, 4);
  });

  it("uses the ground finish constants", () => {
    const expected = 1.58 * 1000 ** -0.085;
    expect(surfaceFactor("ground", 1000e6)).toBeCloseTo(expected, 9);
  });

  it("uses the as-forged finish constants", () => {
    const expected = 272 * 1000 ** -0.995;
    expect(surfaceFactor("as_forged", 1000e6)).toBeCloseTo(expected, 9);
  });
});

describe("analyzeFatigue", () => {
  it("computes the Shigley mean-stress criteria for a machined bending cycle", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
      yieldStrength: 700e6,
      loading: "bending",
      surfaceFinish: "machined",
    });

    const enduranceMpa = (result.quantities.find((q) => q.key === "enduranceLimit")?.value ?? 0) / 1e6;
    expect(enduranceMpa).toBeCloseTo(361.5318, 2);

    const goodman = result.quantities.find((q) => q.key === "goodmanSafetyFactor")?.value;
    expect(goodman).toBeCloseTo(1.5309, 4);

    const gerber = result.quantities.find((q) => q.key === "gerberSafetyFactor")?.value;
    expect(gerber).toBeCloseTo(1.7522, 4);

    const soderberg = result.quantities.find((q) => q.key === "soderbergSafetyFactor")?.value;
    expect(soderberg).toBeCloseTo(1.4367, 4);

    const yieldFactor = result.quantities.find((q) => q.key === "yieldSafetyFactor")?.value;
    expect(yieldFactor).toBeCloseTo(700 / 300, 9);

    expect(result.safetyFactor?.key).toBe("governingSafetyFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(1.4367, 4);
  });

  it("reports the stress ratio of the cycle", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
    });
    expect(result.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo(-1 / 3, 9);
  });

  it("marks a fully reversed cycle with a ratio of minus one", () => {
    const result = analyzeFatigue({
      meanStress: 0,
      stressAmplitude: 100e6,
      ultimateStrength: 1000e6,
    });
    expect(result.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo(-1, 9);
    const goodman = result.quantities.find((q) => q.key === "goodmanSafetyFactor")?.value;
    const gerber = result.quantities.find((q) => q.key === "gerberSafetyFactor")?.value;
    expect(gerber).toBeCloseTo(goodman as number, 9);
  });

  it("applies the axial load factor", () => {
    const axial = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
      loading: "axial",
    });
    const bending = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
      loading: "bending",
    });
    const axialEndurance = axial.quantities.find((q) => q.key === "enduranceLimit")?.value;
    const bendingEndurance = bending.quantities.find((q) => q.key === "enduranceLimit")?.value;
    expect(axialEndurance).toBeCloseTo((bendingEndurance as number) * 0.85, 9);
    expect(axial.inputs.loadFactor).toBeCloseTo(0.85, 9);
  });

  it("applies the torsion load factor", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
      loading: "torsion",
    });
    expect(result.inputs.loadFactor).toBeCloseTo(0.59, 9);
  });

  it("honours an explicit endurance limit override", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
      enduranceLimit: 400e6,
    });
    expect(result.inputs.baseEnduranceLimit).toBeCloseTo(400e6, 9);
    expect(result.inputs.enduranceLimit).toBeCloseTo(400e6, 9);
  });

  it("skips the Soderberg and yield factors without a yield strength", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
    });
    expect(result.quantities.find((q) => q.key === "soderbergSafetyFactor")).toBeUndefined();
    expect(result.quantities.find((q) => q.key === "yieldSafetyFactor")).toBeUndefined();
  });

  it("carries the Shigley provenance", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1000e6,
    });
    expect(result.method.id).toBe("fatigue-analysis");
    expect(result.referenceIds).toContain("shigley-2015");
  });
});

describe("analyzeFatigue validation", () => {
  it("rejects a non-positive stress amplitude", () => {
    expect(() =>
      analyzeFatigue({ meanStress: 0, stressAmplitude: 0, ultimateStrength: 1000e6 }),
    ).toThrow("stressAmplitude");
  });

  it("rejects a non-positive ultimate strength", () => {
    expect(() =>
      analyzeFatigue({ meanStress: 0, stressAmplitude: 100e6, ultimateStrength: 0 }),
    ).toThrow("ultimateStrength");
  });

  it("rejects a non-positive yield strength", () => {
    expect(() =>
      analyzeFatigue({ meanStress: 0, stressAmplitude: 100e6, ultimateStrength: 1000e6, yieldStrength: -1 }),
    ).toThrow("yieldStrength");
  });
});

describe("analyzeFatigue warnings", () => {
  it("warns when the peak cycle stress exceeds yield", () => {
    const result = analyzeFatigue({
      meanStress: 300e6,
      stressAmplitude: 500e6,
      ultimateStrength: 1000e6,
      yieldStrength: 700e6,
    });
    expect(result.warnings.some((w) => w.includes("first cycle"))).toBe(true);
  });

  it("warns above the endurance limit cap for high-strength steel", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 1600e6,
    });
    expect(result.warnings.some((w) => w.includes("700 MPa"))).toBe(true);
  });

  it("warns below the surface formula range", () => {
    const result = analyzeFatigue({
      meanStress: 100e6,
      stressAmplitude: 200e6,
      ultimateStrength: 300e6,
    });
    expect(result.warnings.some((w) => w.includes("400 MPa"))).toBe(true);
  });
});
