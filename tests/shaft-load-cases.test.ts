import { describe, expect, it } from "vitest";
import {
  analyzeShaftLoadCases,
  combinedVonMisesStress,
  roundShaftBendingStress,
  roundShaftTorsionalShear,
} from "../src/engine/shaft-load-cases.js";
import { createContext } from "../src/context.js";
import { createHandlers, type Handler } from "../src/handlers.js";

const D = 0.05;
const SY = 300e6;

describe("round shaft stress formulas", () => {
  it("matches hand-calculated bending stress for a solid section", () => {
    const sigma = roundShaftBendingStress(500, D, 0);
    const expected = (32 * 500 * D) / (Math.PI * D ** 4);
    expect(sigma).toBeCloseTo(expected, 9);
  });

  it("matches hand-calculated torsional shear for a solid section", () => {
    const tau = roundShaftTorsionalShear(300, D, 0);
    const expected = (16 * 300 * D) / (Math.PI * D ** 4);
    expect(tau).toBeCloseTo(expected, 9);
  });

  it("matches hand-calculated combined von Mises stress", () => {
    const sigma = roundShaftBendingStress(500, D, 0);
    const tau = roundShaftTorsionalShear(300, D, 0);
    expect(combinedVonMisesStress(sigma, tau)).toBeCloseTo(Math.sqrt(sigma ** 2 + 3 * tau ** 2), 9);
  });

  it("rejects a hollow section with reversed diameters", () => {
    expect(() => roundShaftBendingStress(100, 0.04, 0.05)).toThrow("Outer diameter");
  });
});

describe("analyzeShaftLoadCases", () => {
  it("identifies the governing combined load case on a solid section", () => {
    const result = analyzeShaftLoadCases({
      sections: [{ name: "midspan", outerDiameter: D }],
      loadCases: [
        { name: "bending_only", bendingMoment: 500, torque: 0 },
        { name: "torque_only", bendingMoment: 0, torque: 300 },
        { name: "combined_peak", bendingMoment: 500, torque: 300 },
      ],
      yieldStrength: SY,
    });

    expect(result.meta?.governingLoadCase).toBe("combined_peak");
    expect(result.meta?.governingCriterion).toBe("von_mises_combined");
    expect(result.safetyFactor?.value).toBeCloseTo(SY / combinedVonMisesStress(roundShaftBendingStress(500, D, 0), roundShaftTorsionalShear(300, D, 0)), 6);
    expect(result.rows?.length).toBe(3);
    const governing = result.rows?.find((row) => row.isGoverning);
    expect(governing?.referenceId).toBe("shigley-2015");
    expect(governing?.governingCriterion).toBe("von_mises_combined");
  });

  it("selects the smaller diameter section when loads are equal", () => {
    const result = analyzeShaftLoadCases({
      sections: [
        { name: "large", outerDiameter: 0.06 },
        { name: "small", outerDiameter: 0.04 },
      ],
      loadCases: [{ name: "service", bendingMoment: 400, torque: 200 }],
      yieldStrength: SY,
    });
    expect(result.meta?.governingSection).toBe("small");
    expect(result.quantities.find((q) => q.key === "governingSectionIndex")?.value).toBe(2);
  });

  it("rejects a load case with zero bending and zero torque", () => {
    expect(() =>
      analyzeShaftLoadCases({
        sections: [{ name: "a", outerDiameter: D }],
        loadCases: [{ name: "idle", bendingMoment: 0, torque: 0 }],
        yieldStrength: SY,
      }),
    ).toThrow("non-zero");
  });
});

describe("shaft_load_cases tool", () => {
  it("returns provenance rows and converts diameter units", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).shaft_load_cases as Handler;
      const response = handler({
        sections: [{ name: "shoulder", outerDiameter: 50, unit: "mm" }],
        loadCases: [{ name: "peak", bendingMoment: 500, torque: 300 }],
        yieldStrength: SY,
        outputUnits: { governingVonMisesStress: "MPa" },
      });
      expect(response.ok).toBe(true);
      if (!response.ok) {
        return;
      }
      expect(response.tool).toBe("shaft_load_cases");
      expect(response.references.map((ref) => ref.id)).toContain("shigley-2015");
      expect(response.rows?.length).toBe(1);
      const stress = response.quantities.find((q) => q.key === "governingVonMisesStress");
      expect(stress?.unit).toBe("MPa");
      expect(stress?.value).toBeCloseTo(combinedVonMisesStress(roundShaftBendingStress(500, D, 0), roundShaftTorsionalShear(300, D, 0)) / 1e6, 3);
    } finally {
      ctx.db.close();
    }
  });

  it("rejects unsupported idle load cases through the handler", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).shaft_load_cases as Handler;
      const response = handler({
        sections: [{ name: "a", outerDiameter: D }],
        loadCases: [{ name: "idle", bendingMoment: 0, torque: 0 }],
        yieldStrength: SY,
      });
      expect(response.ok).toBe(false);
      if (response.ok) {
        return;
      }
      expect(response.error).toContain("non-zero");
    } finally {
      ctx.db.close();
    }
  });

  it("loads yield strength from a material name", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).shaft_load_cases as Handler;
      const response = handler({
        sections: [{ name: "a", outerDiameter: D }],
        loadCases: [{ name: "bend", bendingMoment: 500, torque: 0 }],
        material: "Structural steel S355",
      });
      expect(response.ok).toBe(true);
    } finally {
      ctx.db.close();
    }
  });
});
