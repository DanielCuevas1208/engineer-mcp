import { describe, expect, it } from "vitest";
import {
  analyzeSpring,
  solidHeight,
  totalCoils,
  wahlFactor,
  type SpringEndType,
} from "../src/engine/spring.js";

describe("spring geometry helpers", () => {
  it("computes the Wahl factor for a spring index of 5", () => {
    expect(wahlFactor(5)).toBeCloseTo(19 / 16 + 0.615 / 5, 9);
    expect(wahlFactor(5)).toBeCloseTo(1.3105, 9);
  });

  it("computes the Wahl factor for a spring index of 10", () => {
    expect(wahlFactor(10)).toBeCloseTo(39 / 36 + 0.615 / 10, 9);
  });

  it("counts total coils from the end condition", () => {
    expect(totalCoils(10, "plain")).toBe(10);
    expect(totalCoils(10, "plain_ground")).toBe(11);
    expect(totalCoils(10, "squared")).toBe(12);
    expect(totalCoils(10, "squared_ground")).toBe(12);
  });

  it("computes the solid height from the end condition", () => {
    expect(solidHeight(0.002, totalCoils(10, "plain"), "plain")).toBeCloseTo(0.022, 9);
    expect(solidHeight(0.002, totalCoils(10, "plain_ground"), "plain_ground")).toBeCloseTo(0.022, 9);
    expect(solidHeight(0.002, totalCoils(10, "squared"), "squared")).toBeCloseTo(0.026, 9);
    expect(solidHeight(0.002, totalCoils(10, "squared_ground"), "squared_ground")).toBeCloseTo(0.024, 9);
  });
});

describe("analyzeSpring", () => {
  it("computes a clean squared-and-ground spring design", () => {
    const result = analyzeSpring({
      wireDiameter: 0.008,
      meanDiameter: 0.04,
      activeCoils: 4,
      endType: "squared_ground",
      freeLength: 0.09,
      load: 2000,
      shearModulus: 79.3e9,
      shearYieldStrength: 700e6,
    });

    expect(result.quantities.find((q) => q.key === "springIndex")?.value).toBeCloseTo(5, 9);
    expect(result.quantities.find((q) => q.key === "wahlFactor")?.value).toBeCloseTo(1.3105, 6);
    expect(result.quantities.find((q) => q.key === "totalCoils")?.value).toBeCloseTo(6, 9);
    expect(result.quantities.find((q) => q.key === "solidHeight")?.value).toBeCloseTo(0.048, 9);
    expect(result.quantities.find((q) => q.key === "springRate")?.value).toBeCloseTo(158600, 2);
    expect(result.quantities.find((q) => q.key === "deflection")?.value).toBeCloseTo(2000 / 158600, 6);
    expect(result.quantities.find((q) => q.key === "workingLength")?.value).toBeCloseTo(0.09 - 2000 / 158600, 6);

    const expectedStress = (1.3105 * 8 * 2000 * 0.04) / (Math.PI * 0.008 ** 3);
    expect(result.quantities.find((q) => q.key === "maxShearStress")?.value).toBeCloseTo(expectedStress, 6);

    const safety = result.safetyFactor;
    expect(safety?.key).toBe("springSafetyFactor");
    expect(safety?.value).toBeCloseTo(700e6 / expectedStress, 6);
    expect(result.warnings.length).toBe(0);
  });

  it("defaults to squared and ground ends", () => {
    const result = analyzeSpring({
      wireDiameter: 0.008,
      meanDiameter: 0.04,
      activeCoils: 4,
      freeLength: 0.09,
      load: 2000,
      shearModulus: 79.3e9,
    });
    expect(result.inputs.endType).toBe("squared_ground");
    expect(result.quantities.find((q) => q.key === "totalCoils")?.value).toBeCloseTo(6, 9);
  });

  it("skips the safety factor without a shear yield strength", () => {
    const result = analyzeSpring({
      wireDiameter: 0.008,
      meanDiameter: 0.04,
      activeCoils: 4,
      freeLength: 0.09,
      load: 2000,
      shearModulus: 79.3e9,
    });
    expect(result.safetyFactor).toBeUndefined();
  });

  it("handles a zero load as a geometry check", () => {
    const result = analyzeSpring({
      wireDiameter: 0.004,
      meanDiameter: 0.032,
      activeCoils: 8,
      freeLength: 0.16,
      load: 0,
      shearModulus: 79.3e9,
    });
    expect(result.quantities.find((q) => q.key === "deflection")?.value).toBe(0);
    expect(result.quantities.find((q) => q.key === "maxShearStress")?.value).toBe(0);
    expect(result.safetyFactor).toBeUndefined();
  });
});

describe("analyzeSpring validation", () => {
  it("rejects a mean diameter that does not exceed the wire diameter", () => {
    expect(() =>
      analyzeSpring({
        wireDiameter: 0.01,
        meanDiameter: 0.01,
        activeCoils: 5,
        freeLength: 0.1,
        load: 100,
        shearModulus: 79.3e9,
      }),
    ).toThrow("meanDiameter must exceed wireDiameter");
  });

  it("rejects a free length that does not exceed the solid height", () => {
    expect(() =>
      analyzeSpring({
        wireDiameter: 0.002,
        meanDiameter: 0.016,
        activeCoils: 4,
        freeLength: 0.012,
        load: 100,
        shearModulus: 79.3e9,
      }),
    ).toThrow("freeLength must exceed the solid height");
  });

  it("rejects a negative load", () => {
    expect(() =>
      analyzeSpring({
        wireDiameter: 0.004,
        meanDiameter: 0.032,
        activeCoils: 8,
        freeLength: 0.16,
        load: -10,
        shearModulus: 79.3e9,
      }),
    ).toThrow("load must be zero or positive");
  });

  it("rejects a non-positive active coil count", () => {
    expect(() =>
      analyzeSpring({
        wireDiameter: 0.004,
        meanDiameter: 0.032,
        activeCoils: 0,
        freeLength: 0.16,
        load: 100,
        shearModulus: 79.3e9,
      }),
    ).toThrow("activeCoils must be positive");
  });
});

describe("analyzeSpring warnings", () => {
  it("warns when the spring index is below 4", () => {
    const result = analyzeSpring({
      wireDiameter: 0.01,
      meanDiameter: 0.02,
      activeCoils: 8,
      freeLength: 0.12,
      load: 500,
      shearModulus: 79.3e9,
    });
    expect(result.warnings.some((w) => w.includes("below 4"))).toBe(true);
  });

  it("warns when the spring index exceeds 12", () => {
    const result = analyzeSpring({
      wireDiameter: 0.002,
      meanDiameter: 0.05,
      activeCoils: 8,
      freeLength: 0.06,
      load: 500,
      shearModulus: 79.3e9,
    });
    expect(result.warnings.some((w) => w.includes("exceeds 12"))).toBe(true);
  });

  it("warns about buckling risk for an unguided spring", () => {
    const result = analyzeSpring({
      wireDiameter: 0.004,
      meanDiameter: 0.032,
      activeCoils: 8,
      freeLength: 0.1,
      load: 500,
      shearModulus: 79.3e9,
    });
    expect(result.inputs.slenderness).toBeCloseTo(3.125, 6);
    expect(result.warnings.some((w) => w.includes("2.63"))).toBe(true);
  });

  it("warns about buckling risk even for a guided spring", () => {
    const result = analyzeSpring({
      wireDiameter: 0.004,
      meanDiameter: 0.032,
      activeCoils: 8,
      freeLength: 0.2,
      load: 500,
      shearModulus: 79.3e9,
    });
    expect(result.warnings.some((w) => w.includes("5.4"))).toBe(true);
  });

  it("warns when the load compresses the spring to solid height", () => {
    const result = analyzeSpring({
      wireDiameter: 0.008,
      meanDiameter: 0.04,
      activeCoils: 4,
      freeLength: 0.09,
      load: 8000,
      shearModulus: 79.3e9,
    });
    expect(result.warnings.some((w) => w.includes("solid height"))).toBe(true);
  });

  it("carries the Shigley provenance", () => {
    const result = analyzeSpring({
      wireDiameter: 0.008,
      meanDiameter: 0.04,
      activeCoils: 4,
      freeLength: 0.09,
      load: 2000,
      shearModulus: 79.3e9,
    });
    expect(result.referenceIds).toContain("shigley-2015");
    expect(result.referenceIds).toContain("machinery-handbook");
    expect(result.method.id).toBe("spring-design");
  });
});

describe("end condition variants", () => {
  const endTypes: SpringEndType[] = ["plain", "plain_ground", "squared", "squared_ground"];
  const wireDiameter = 0.004;
  const meanDiameter = 0.032;

  it("accepts every end type", () => {
    for (const endType of endTypes) {
      const result = analyzeSpring({
        wireDiameter,
        meanDiameter,
        activeCoils: 6,
        endType,
        freeLength: 0.1,
        load: 300,
        shearModulus: 79.3e9,
      });
      expect(result.quantities.find((q) => q.key === "totalCoils")?.value).toBe(
        totalCoils(6, endType),
      );
    }
  });
});
