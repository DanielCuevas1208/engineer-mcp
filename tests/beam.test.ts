import { describe, expect, it } from "vitest";
import { analyzeBeam } from "../src/engine/beam.js";
import type { BeamInput } from "../src/engine/beam.js";

const E = 210e9;
const RECT = { shape: "rectangle", width: 0.05, height: 0.1 } as const;
const I = (0.05 * 0.1 ** 3) / 12;
const Z = I / 0.05;

function run(input: Partial<BeamInput> & { support: BeamInput["support"]; load: BeamInput["load"]; loadMagnitude: number; length: number }) {
  return analyzeBeam({ elasticModulus: E, section: RECT, ...input });
}

describe("beam analysis", () => {
  it("computes a simply supported beam under a central point load", () => {
    const result = run({ support: "simply_supported", load: "point", loadMagnitude: 1000, length: 2 });
    const moment = result.quantities.find((q) => q.key === "maxBendingMoment");
    const stress = result.quantities.find((q) => q.key === "maxBendingStress");
    const deflection = result.quantities.find((q) => q.key === "maxDeflection");
    expect(moment?.value).toBeCloseTo(500, 9);
    expect(stress?.value).toBeCloseTo(500 / Z, 6);
    expect(deflection?.value).toBeCloseTo((1000 * 2 ** 3) / (48 * E * I), 9);
  });

  it("computes a simply supported beam under a uniform load", () => {
    const result = run({ support: "simply_supported", load: "uniform", loadMagnitude: 1000, length: 2 });
    const moment = result.quantities.find((q) => q.key === "maxBendingMoment");
    const deflection = result.quantities.find((q) => q.key === "maxDeflection");
    expect(moment?.value).toBeCloseTo(500, 9);
    expect(deflection?.value).toBeCloseTo((5 * 1000 * 2 ** 4) / (384 * E * I), 9);
  });

  it("computes a cantilever beam under an end point load", () => {
    const result = run({ support: "cantilever", load: "point", loadMagnitude: 1000, length: 2 });
    const moment = result.quantities.find((q) => q.key === "maxBendingMoment");
    const deflection = result.quantities.find((q) => q.key === "maxDeflection");
    expect(moment?.value).toBeCloseTo(2000, 9);
    expect(deflection?.value).toBeCloseTo((1000 * 2 ** 3) / (3 * E * I), 9);
  });

  it("computes a cantilever beam under a uniform load", () => {
    const result = run({ support: "cantilever", load: "uniform", loadMagnitude: 1000, length: 2 });
    const moment = result.quantities.find((q) => q.key === "maxBendingMoment");
    const deflection = result.quantities.find((q) => q.key === "maxDeflection");
    expect(moment?.value).toBeCloseTo(2000, 9);
    expect(deflection?.value).toBeCloseTo((1000 * 2 ** 4) / (8 * E * I), 9);
  });

  it("computes the safety factor from yield strength", () => {
    const result = run({
      support: "simply_supported",
      load: "point",
      loadMagnitude: 1000,
      length: 2,
      yieldStrength: 300e6,
    });
    expect(result.safetyFactor?.value).toBeCloseTo(300e6 / (500 / Z), 6);
  });

  it("works with explicit moment of inertia and section modulus", () => {
    const result = analyzeBeam({
      support: "simply_supported",
      load: "point",
      loadMagnitude: 1000,
      length: 2,
      elasticModulus: E,
      secondMomentOfArea: I,
      sectionModulus: Z,
    });
    expect(result.quantities.find((q) => q.key === "maxDeflection")?.value).toBeCloseTo(
      (1000 * 8) / (48 * E * I),
      9,
    );
  });

  it("throws when no section data is provided", () => {
    expect(() =>
      analyzeBeam({
        support: "simply_supported",
        load: "point",
        loadMagnitude: 1000,
        length: 2,
        elasticModulus: E,
      }),
    ).toThrow();
  });
});
