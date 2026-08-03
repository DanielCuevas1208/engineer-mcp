import { describe, expect, it } from "vitest";
import { analyzeShaft } from "../src/engine/shaft.js";

describe("shaft analysis", () => {
  it("computes torsion stress and twist for a solid shaft", () => {
    const result = analyzeShaft({
      outerDiameter: 0.05,
      length: 1,
      torque: 1000,
      elasticModulus: 210e9,
      shearModulus: 79.3e9,
      density: 7850,
    });
    const j = (Math.PI * 0.05 ** 4) / 32;
    const stress = result.quantities.find((q) => q.key === "maxShearStress");
    const twist = result.quantities.find((q) => q.key === "angleOfTwist");
    expect(stress?.value).toBeCloseTo((1000 * 0.025) / j, 3);
    expect(twist?.value).toBeCloseTo(1000 / (j * 79.3e9), 6);
  });

  it("computes torsion for a hollow shaft", () => {
    const result = analyzeShaft({
      outerDiameter: 0.05,
      innerDiameter: 0.04,
      length: 1,
      torque: 1000,
      elasticModulus: 210e9,
      shearModulus: 79.3e9,
      density: 7850,
    });
    const j = (Math.PI * (0.05 ** 4 - 0.04 ** 4)) / 32;
    const stress = result.quantities.find((q) => q.key === "maxShearStress");
    expect(stress?.value).toBeCloseTo((1000 * 0.025) / j, 3);
  });

  it("computes a plausible first critical speed", () => {
    const result = analyzeShaft({
      outerDiameter: 0.05,
      length: 1,
      torque: 500,
      elasticModulus: 210e9,
      shearModulus: 79.3e9,
      density: 7850,
    });
    const speed = result.quantities.find((q) => q.key === "criticalSpeed");
    expect(speed?.value).toBeGreaterThan(5000);
    expect(speed?.value).toBeLessThan(8000);
  });

  it("computes the safety factor from shear yield strength", () => {
    const result = analyzeShaft({
      outerDiameter: 0.05,
      length: 1,
      torque: 1000,
      elasticModulus: 210e9,
      shearModulus: 79.3e9,
      density: 7850,
      shearYieldStrength: 0.577 * 355e6,
    });
    const j = (Math.PI * 0.05 ** 4) / 32;
    expect(result.safetyFactor?.value).toBeCloseTo((0.577 * 355e6) / ((1000 * 0.025) / j), 3);
  });

  it("rejects a hollow shaft with reversed diameters", () => {
    expect(() =>
      analyzeShaft({
        outerDiameter: 0.04,
        innerDiameter: 0.05,
        length: 1,
        torque: 100,
        elasticModulus: 210e9,
        shearModulus: 79.3e9,
        density: 7850,
      }),
    ).toThrow();
  });
});
