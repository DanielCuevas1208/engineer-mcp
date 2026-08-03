import { describe, expect, it } from "vitest";
import { analyzePressFit, planeStressVonMises, PRESS_FIT_METHOD } from "../src/engine/fit.js";

function quantity(result: ReturnType<typeof analyzePressFit>, key: string): number {
  const found = result.quantities.find((q) => q.key === key);
  expect(found).toBeDefined();
  return found?.value as number;
}

function closeTo(value: number, expected: number): void {
  expect(Math.abs(value - expected)).toBeLessThan(Math.abs(expected) * 1e-6);
}

const solidSteel = {
  hubOuterDiameter: 0.05,
  interfaceDiameter: 0.025,
  shaftInnerDiameter: 0,
  hubLength: 0.03,
  diametralInterference: 0.00005,
  hubElasticModulus: 210e9,
  shaftElasticModulus: 210e9,
  hubPoissonRatio: 0.3,
  shaftPoissonRatio: 0.3,
  frictionCoefficient: 0.15,
};

describe("press fit engine", () => {
  it("computes the contact pressure by the Lamé closed form", () => {
    const result = analyzePressFit(solidSteel);
    const r = 0.0125;
    const u = 0.000025;
    const E = 210e9;
    closeTo(quantity(result, "contactPressure"), (3 * u * E) / (8 * r));
    expect(result.method.id).toBe("press-fit");
  });

  it("reports the hub hoop stress as tension and the shaft as compression", () => {
    const result = analyzePressFit(solidSteel);
    const p = quantity(result, "contactPressure");
    const ratio = (0.025 ** 2 + 0.0125 ** 2) / (0.025 ** 2 - 0.0125 ** 2);
    closeTo(quantity(result, "hubTangentialStress"), p * ratio);
    closeTo(quantity(result, "shaftTangentialStress"), -p);
    closeTo(quantity(result, "radialStress"), -p);
  });

  it("reports a shaft von Mises stress equal to the pressure magnitude", () => {
    const result = analyzePressFit(solidSteel);
    const p = quantity(result, "contactPressure");
    closeTo(quantity(result, "shaftVonMisesStress"), p);
  });

  it("computes the von Mises stress in the hub", () => {
    const result = analyzePressFit(solidSteel);
    const tangential = quantity(result, "hubTangentialStress");
    const radial = quantity(result, "radialStress");
    closeTo(quantity(result, "hubVonMisesStress"), planeStressVonMises(tangential, radial));
  });

  it("computes the press-in force and torque capacity", () => {
    const result = analyzePressFit(solidSteel);
    const p = quantity(result, "contactPressure");
    closeTo(quantity(result, "pressForce"), 0.15 * p * Math.PI * 0.025 * 0.03);
    closeTo(quantity(result, "torqueCapacity"), quantity(result, "pressForce") * 0.0125);
  });

  it("adds a hub safety factor when the hub yield strength is set", () => {
    const result = analyzePressFit({ ...solidSteel, hubYieldStrength: 700e6 });
    expect(result.safetyFactor?.key).toBe("hubSafetyFactor");
    expect(result.safetyFactor?.value).toBeGreaterThan(0);
  });

  it("adds a shaft safety factor when the shaft yield strength is set", () => {
    const result = analyzePressFit({
      ...solidSteel,
      interfaceDiameter: 0.03,
      hubOuterDiameter: 0.06,
      shaftInnerDiameter: 0.01,
      shaftYieldStrength: 500e6,
    });
    expect(quantity(result, "shaftVonMisesStress")).toBeGreaterThan(0);
    const shaftFactor = result.quantities.find((q) => q.key === "shaftSafetyFactor");
    expect(shaftFactor?.value).toBeGreaterThan(0);
  });

  it("reports the axial joint safety factor and warns when the joint slips", () => {
    const result = analyzePressFit({ ...solidSteel, appliedAxialForce: 100000 });
    const axial = result.quantities.find((q) => q.key === "axialJointSafetyFactor");
    expect(axial).toBeDefined();
    expect(result.warnings.some((w) => w.includes("exceeds"))).toBe(true);
  });

  it("warns for a thin hub", () => {
    const result = analyzePressFit({ ...solidSteel, hubOuterDiameter: 0.03 });
    expect(result.warnings.some((w) => w.includes("thin"))).toBe(true);
  });

  it("applies the default Poisson ratio and friction coefficient", () => {
    const result = analyzePressFit({
      hubOuterDiameter: 0.05,
      interfaceDiameter: 0.025,
      hubLength: 0.03,
      diametralInterference: 0.00005,
      hubElasticModulus: 210e9,
      shaftElasticModulus: 210e9,
    });
    expect(result.inputs.hubPoissonRatio).toBe(0.3);
    expect(result.inputs.shaftPoissonRatio).toBe(0.3);
    expect(result.inputs.frictionCoefficient).toBe(0.15);
  });

  it("rejects an interface diameter equal to the hub outer diameter", () => {
    expect(() => analyzePressFit({ ...solidSteel, hubOuterDiameter: 0.025 })).toThrow(/hubOuterDiameter/);
  });

  it("rejects a hollow shaft whose inner diameter reaches the interface", () => {
    expect(() => analyzePressFit({ ...solidSteel, shaftInnerDiameter: 0.025 })).toThrow(/shaftInnerDiameter/);
  });

  it("rejects a zero interference", () => {
    expect(() => analyzePressFit({ ...solidSteel, diametralInterference: 0 })).toThrow(/diametralInterference/);
  });

  it("cites the reference standards", () => {
    expect(PRESS_FIT_METHOD.referenceIds).toContain("shigley-2015");
  });
});
