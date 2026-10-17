import { describe, expect, it } from "vitest";
import { analyzePressFit } from "../src/engine/fit.js";

const BASE = {
  interfaceRadius: 0.025,
  hubOuterRadius: 0.05,
  interference: 5e-5,
  length: 0.05,
  shaftElasticModulus: 207e9,
  hubElasticModulus: 207e9,
};

function pressureFormula(input: typeof BASE): number {
  const { interfaceRadius, hubOuterRadius, interference } = input;
  const r = interfaceRadius;
  const ro = hubOuterRadius;
  const shaftTerm = 1 - 0.3;
  const hubTerm = (ro ** 2 + r ** 2) / (ro ** 2 - r ** 2) + 0.3;
  return interference / (2 * r * ((shaftTerm + hubTerm) / 207e9));
}

describe("press fit engine", () => {
  it("computes the interface pressure from the Lamé formula", () => {
    const result = analyzePressFit({ ...BASE, frictionCoefficient: 0.12 });
    const pressure = result.quantities.find((q) => q.key === "interfacePressure");
    expect(pressure?.value).toBeCloseTo(pressureFormula(BASE), 6);
    expect(pressure?.value).toBeGreaterThan(7e7);
    expect(pressure?.value).toBeLessThan(8e7);
  });

  it("computes the friction torque and axial force capacity", () => {
    const result = analyzePressFit({ ...BASE, frictionCoefficient: 0.12 });
    const pressure = result.quantities.find((q) => q.key === "interfacePressure")?.value ?? 0;
    const torque = result.quantities.find((q) => q.key === "torqueCapacity");
    const axial = result.quantities.find((q) => q.key === "axialForceCapacity");
    const expectedTorque = 2 * Math.PI * 0.025 ** 2 * 0.05 * pressure * 0.12;
    expect(torque?.value).toBeCloseTo(expectedTorque, 6);
    expect(axial?.value).toBeCloseTo(expectedTorque / 0.025, 6);
  });

  it("uses a uniform compressive stress for a solid shaft", () => {
    const result = analyzePressFit({ ...BASE });
    const pressure = result.quantities.find((q) => q.key === "interfacePressure")?.value ?? 0;
    const stress = result.quantities.find((q) => q.key === "shaftTangentialStress");
    expect(stress?.value).toBeCloseTo(pressure, 9);
  });

  it("reports the governing safety factor across shaft, hub, and torque", () => {
    const result = analyzePressFit({
      ...BASE,
      frictionCoefficient: 0.12,
      shaftYieldStrength: 300e6,
      hubYieldStrength: 300e6,
      requiredTorque: 1000,
    });
    expect(result.safetyFactor).toBeDefined();
    expect(result.safetyFactor?.key).toBe("hubSafetyFactor");
    expect(result.quantities.map((q) => q.key)).toContain("shaftSafetyFactor");
    expect(result.quantities.map((q) => q.key)).toContain("hubSafetyFactor");
    expect(result.quantities.map((q) => q.key)).toContain("torqueSafetyFactor");
  });

  it("reports a higher hoop stress at the bore of a hollow shaft", () => {
    const solid = analyzePressFit({ ...BASE });
    const hollow = analyzePressFit({ ...BASE, shaftInnerRadius: 0.0125 });
    const solidPressure = solid.quantities.find((q) => q.key === "interfacePressure")?.value ?? 0;
    const hollowPressure = hollow.quantities.find((q) => q.key === "interfacePressure")?.value ?? 0;
    const hollowStress = hollow.quantities.find((q) => q.key === "shaftTangentialStress")?.value ?? 0;
    expect(hollowStress).toBeCloseTo((2 * hollowPressure * 0.025 ** 2) / (0.025 ** 2 - 0.0125 ** 2), 6);
    expect(hollowStress).toBeGreaterThan(solidPressure);
  });

  it("warns when a member exceeds its yield strength", () => {
    const result = analyzePressFit({
      ...BASE,
      shaftYieldStrength: 20e6,
      hubYieldStrength: 300e6,
    });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toContain("shaft yield strength");
  });

  it("warns when the torque capacity falls below the required torque", () => {
    const result = analyzePressFit({
      ...BASE,
      frictionCoefficient: 0.05,
      requiredTorque: 1e6,
    });
    expect(result.warnings.some((w) => w.includes("slip"))).toBe(true);
  });

  it("rejects a clearance fit", () => {
    expect(() => analyzePressFit({ ...BASE, interference: -1e-5 })).toThrow("interference");
  });

  it("rejects an invalid hub geometry", () => {
    expect(() => analyzePressFit({ ...BASE, hubOuterRadius: 0.02 })).toThrow("hubOuterRadius");
  });

  it("rejects an invalid shaft bore", () => {
    expect(() => analyzePressFit({ ...BASE, shaftInnerRadius: 0.03 })).toThrow("shaftInnerRadius");
  });
});
