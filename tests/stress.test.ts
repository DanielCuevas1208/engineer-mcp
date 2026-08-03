import { describe, expect, it } from "vitest";
import { vonMises } from "../src/engine/stress.js";

describe("von Mises stress", () => {
  it("computes the equivalent stress from principal stresses", () => {
    const result = vonMises({ mode: "principal", sigma1: 100e6, sigma2: 0, sigma3: 0 });
    const vm = result.quantities.find((q) => q.key === "vonMisesStress");
    const shear = result.quantities.find((q) => q.key === "maxShearStress");
    expect(vm?.value).toBeCloseTo(100e6, 6);
    expect(shear?.value).toBeCloseTo(50e6, 6);
  });

  it("computes a uniaxial tension correctly", () => {
    const result = vonMises({ mode: "principal", sigma1: 50e6, sigma2: 0, sigma3: 0 });
    expect(result.quantities.find((q) => q.key === "vonMisesStress")?.value).toBeCloseTo(50e6, 6);
  });

  it("computes the equivalent stress from cartesian components", () => {
    const result = vonMises({ mode: "cartesian", sigmaX: 100e6, sigmaY: 50e6, tauXY: 20e6 });
    const expected = Math.sqrt(100e6 ** 2 - 100e6 * 50e6 + 50e6 ** 2 + 3 * 20e6 ** 2);
    expect(result.quantities.find((q) => q.key === "vonMisesStress")?.value).toBeCloseTo(expected, 3);
  });

  it("computes the yield safety factor", () => {
    const result = vonMises({ mode: "principal", sigma1: 100e6, sigma2: 0, sigma3: 0, yieldStrength: 250e6 });
    expect(result.safetyFactor?.value).toBeCloseTo(2.5, 6);
  });
});
