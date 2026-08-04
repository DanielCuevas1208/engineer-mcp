import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  enduranceLimit,
  reliabilityFactor,
  surfaceFactor,
} from "../src/engine/fatigue.js";

describe("Marin endurance limit for steel", () => {
  it("estimates the surface factor for a machined part", () => {
    expect(surfaceFactor("machined", 690e6)).toBeCloseTo(0.798, 3);
  });

  it("estimates the surface factor for a ground part", () => {
    expect(surfaceFactor("ground", 690e6)).toBeCloseTo(0.906, 3);
  });

  it("caps the test endurance limit for very strong steel", () => {
    const se = enduranceLimit({
      ultimateStrength: 1600e6,
      surfaceFinish: "ground",
    });
    expect(se).toBeCloseTo(700e6 * surfaceFactor("ground", 1600e6), 0);
  });

  it("applies the reliability table values", () => {
    expect(reliabilityFactor(50)).toBeCloseTo(1, 6);
    expect(reliabilityFactor(90)).toBeCloseTo(0.897, 6);
    expect(reliabilityFactor(99.9)).toBeCloseTo(0.753, 6);
  });

  it("interpolates the reliability factor between table rows", () => {
    expect(reliabilityFactor(99.95)).toBeCloseTo(0.725, 3);
  });

  it("rejects a reliability outside the table range", () => {
    expect(() => reliabilityFactor(99.999)).toThrow(/between 50 and 99\.99/);
  });

  it("honors an explicit endurance limit override", () => {
    const se = enduranceLimit({ ultimateStrength: 690e6, enduranceLimit: 250e6 });
    expect(se).toBe(250e6);
  });
});

describe("fatigue safety factors", () => {
  const base = {
    ultimateStrength: 800e6,
    yieldStrength: 450e6,
    enduranceLimit: 200e6,
    meanStress: 100e6,
    alternatingStress: 100e6,
  };

  it("computes the modified Goodman safety factor", () => {
    const result = analyzeFatigue({ ...base });
    expect(result.safetyFactor?.value).toBeCloseTo(1.6, 6);
  });

  it("computes the Gerber safety factor", () => {
    const result = analyzeFatigue({ ...base, criterion: "gerber" });
    expect(result.safetyFactor?.value).toBeCloseTo(1.8885, 3);
  });

  it("computes the Soderberg safety factor", () => {
    const result = analyzeFatigue({ ...base, criterion: "soderberg" });
    expect(result.safetyFactor?.value).toBeCloseTo(1.3846, 3);
  });

  it("computes the ASME-elliptic safety factor", () => {
    const result = analyzeFatigue({ ...base, criterion: "asme_elliptic" });
    expect(result.safetyFactor?.value).toBeCloseTo(1.8276, 3);
  });

  it("defaults to the modified Goodman criterion", () => {
    const result = analyzeFatigue({ ...base });
    expect(result.method.id).toBe("fatigue-analysis");
    expect(result.safetyFactor?.description).toContain("modified goodman");
  });

  it("handles a purely alternating stress", () => {
    const result = analyzeFatigue({ ...base, meanStress: 0 });
    expect(result.safetyFactor?.value).toBeCloseTo(2, 6);
  });

  it("handles a purely steady stress", () => {
    const result = analyzeFatigue({ ...base, alternatingStress: 0 });
    expect(result.safetyFactor?.value).toBeCloseTo(8, 6);
  });

  it("requires yieldStrength for the soderberg criterion", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 800e6,
        meanStress: 100e6,
        alternatingStress: 100e6,
        criterion: "soderberg",
      }),
    ).toThrow(/requires yieldStrength/);
  });

  it("rejects zero stress on both axes", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 800e6,
        meanStress: 0,
        alternatingStress: 0,
      }),
    ).toThrow(/cannot both be zero/);
  });

  it("rejects a mean stress at the ultimate strength for Goodman", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 800e6,
        meanStress: 800e6,
        alternatingStress: 10e6,
      }),
    ).toThrow(/no positive safety factor/);
  });

  it("warns when the static yield check governs", () => {
    const result = analyzeFatigue({
      ultimateStrength: 800e6,
      yieldStrength: 150e6,
      meanStress: 100e6,
      alternatingStress: 100e6,
    });
    expect(result.warnings.some((w) => w.includes("static yield check"))).toBe(true);
  });

  it("warns when the safety factor is below unity", () => {
    const result = analyzeFatigue({
      ultimateStrength: 800e6,
      meanStress: 500e6,
      alternatingStress: 500e6,
    });
    expect(result.safetyFactor?.value).toBeLessThan(1);
    expect(result.warnings.some((w) => w.includes("below 1"))).toBe(true);
  });

  it("reports the endurance limit quantity", () => {
    const result = analyzeFatigue({ ...base });
    const se = result.quantities.find((q) => q.key === "enduranceLimit");
    expect(se?.value).toBe(200e6);
    expect(se?.unit).toBe("Pa");
  });
});
