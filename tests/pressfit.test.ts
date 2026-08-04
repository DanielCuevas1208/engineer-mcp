import { describe, expect, it } from "vitest";
import { analyzePressFit, planeStressVonMises } from "../src/engine/fit.js";

const BASE = {
  hubOuterDiameter: 0.06,
  interfaceDiameter: 0.03,
  hubLength: 0.03,
  diametralInterference: 20e-6,
  hubElasticModulus: 210e9,
  shaftElasticModulus: 210e9,
  hubYieldStrength: 355e6,
};

describe("press fit", () => {
  it("computes the contact pressure for a steel hub on a solid shaft", () => {
    const result = analyzePressFit(BASE);
    const pressure = result.quantities.find((q) => q.key === "contactPressure");
    expect(pressure?.value).toBeCloseTo(52.5e6, 3);
  });

  it("computes the hoop and radial stresses", () => {
    const result = analyzePressFit(BASE);
    expect(result.quantities.find((q) => q.key === "hubTangentialStress")?.value).toBeCloseTo(87.5e6, 3);
    expect(result.quantities.find((q) => q.key === "shaftTangentialStress")?.value).toBeCloseTo(-52.5e6, 3);
    expect(result.quantities.find((q) => q.key === "radialStress")?.value).toBeCloseTo(-52.5e6, 3);
  });

  it("computes the von Mises stresses", () => {
    const result = analyzePressFit(BASE);
    expect(result.quantities.find((q) => q.key === "hubVonMisesStress")?.value).toBeCloseTo(122.5e6, 3);
    expect(result.quantities.find((q) => q.key === "shaftVonMisesStress")?.value).toBeCloseTo(52.5e6, 3);
  });

  it("computes the press-in force and torque capacity", () => {
    const result = analyzePressFit(BASE);
    const pressForce = result.quantities.find((q) => q.key === "pressForce");
    expect(pressForce?.value).toBeCloseTo(22266.038, 2);
    expect(result.quantities.find((q) => q.key === "torqueCapacity")?.value).toBeCloseTo(333.99, 2);
  });

  it("reports the hub safety factor", () => {
    const result = analyzePressFit(BASE);
    expect(result.safetyFactor?.key).toBe("hubSafetyFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(355e6 / 122.5e6, 3);
  });

  it("reports the shaft and axial joint safety factors when provided", () => {
    const result = analyzePressFit({ ...BASE, shaftYieldStrength: 355e6, appliedAxialForce: 10000 });
    expect(result.quantities.find((q) => q.key === "shaftSafetyFactor")?.value).toBeCloseTo(355e6 / 52.5e6, 3);
    const joint = result.quantities.find((q) => q.key === "axialJointSafetyFactor");
    expect(joint?.value).toBeCloseTo(22266.038 / 10000, 2);
  });

  it("warns when the applied axial force exceeds the press-in force", () => {
    const result = analyzePressFit({ ...BASE, appliedAxialForce: 100000 });
    expect(result.warnings.some((w) => w.includes("exceeds"))).toBe(true);
  });

  it("handles a hollow shaft", () => {
    const result = analyzePressFit({ ...BASE, shaftInnerDiameter: 0.012 });
    expect(result.quantities.find((q) => q.key === "contactPressure")?.value).toBeGreaterThan(0);
  });

  it("rejects invalid geometry", () => {
    expect(() => analyzePressFit({ ...BASE, interfaceDiameter: 0.06 })).toThrow(/exceed/);
    expect(() => analyzePressFit({ ...BASE, shaftInnerDiameter: 0.03 })).toThrow(/smaller/);
    expect(() => analyzePressFit({ ...BASE, diametralInterference: 0 })).toThrow(/positive/);
    expect(() => analyzePressFit({ ...BASE, hubPoissonRatio: 0.6 })).toThrow(/below 0.5/);
  });

  it("computes the plane-stress von Mises stress", () => {
    expect(planeStressVonMises(87.5e6, -52.5e6)).toBeCloseTo(122.5e6, 3);
  });
});
