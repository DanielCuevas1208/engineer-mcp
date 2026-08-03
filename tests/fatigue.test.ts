import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  criterionSafetyFactor,
  estimateEnduranceLimit,
  type FatigueInput,
} from "../src/engine/fatigue.js";

const BASE: FatigueInput = {
  meanStress: 100e6,
  amplitudeStress: 80e6,
  ultimateStrength: 600e6,
  yieldStrength: 450e6,
  enduranceLimit: 250e6,
};

function run(overrides: Partial<FatigueInput> = {}) {
  return analyzeFatigue({ ...BASE, ...overrides });
}

describe("fatigue engine", () => {
  it("computes the Soderberg safety factor", () => {
    const factor = criterionSafetyFactor("soderberg", 80e6, 100e6, 250e6, 600e6, 450e6);
    expect(factor).toBeCloseTo(1.8443, 4);
  });

  it("computes the modified Goodman safety factor", () => {
    const factor = criterionSafetyFactor("goodman", 80e6, 100e6, 250e6, 600e6, 450e6);
    expect(factor).toBeCloseTo(2.0548, 4);
  });

  it("computes the Gerber safety factor", () => {
    const factor = criterionSafetyFactor("gerber", 80e6, 100e6, 250e6, 600e6, 450e6);
    expect(factor).toBeCloseTo(2.5573, 4);
  });

  it("computes the ASME-elliptic safety factor", () => {
    const factor = criterionSafetyFactor("asme_elliptic", 80e6, 100e6, 250e6, 600e6, 450e6);
    expect(factor).toBeCloseTo(2.5668, 4);
  });

  it("returns every criterion in the all mode", () => {
    const result = run();
    const keys = result.quantities.map((q) => q.key);
    expect(keys).toContain("soderbergFactor");
    expect(keys).toContain("goodmanFactor");
    expect(keys).toContain("gerberFactor");
    expect(keys).toContain("asme_ellipticFactor");
  });

  it("reports the governing factor as the envelope safety factor", () => {
    const result = run();
    expect(result.safetyFactor?.key).toBe("governingFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(1.8443, 4);
  });

  it("reports the first-cycle yield factor", () => {
    const result = run();
    const factor = result.quantities.find((q) => q.key === "firstCycleYieldFactor");
    expect(factor?.value).toBeCloseTo(2.5, 6);
  });

  it("returns one criterion when a single criterion is selected", () => {
    const result = run({ criterion: "gerber" });
    const keys = result.quantities.map((q) => q.key);
    expect(keys).toContain("gerberFactor");
    expect(keys).not.toContain("soderbergFactor");
    expect(keys).not.toContain("goodmanFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(2.5573, 4);
  });

  it("uses the estimated endurance limit when none is given", () => {
    const result = run({ enduranceLimit: undefined });
    const endurance = result.quantities.find((q) => q.key === "enduranceLimit");
    expect(endurance?.value).toBeCloseTo(300e6, 6);
    expect(result.warnings.some((w) => w.includes("Endurance limit estimated"))).toBe(true);
  });

  it("caps the estimated endurance limit at 700 MPa", () => {
    expect(estimateEnduranceLimit(1200e6)).toBeCloseTo(600e6, 6);
    expect(estimateEnduranceLimit(2000e6)).toBeCloseTo(700e6, 6);
  });

  it("gives equal factors for a fully reversed load", () => {
    const result = run({ meanStress: 0 });
    const factors = ["soderberg", "goodman", "gerber", "asme_elliptic"].map((key) => {
      const quantity = result.quantities.find((q) => q.key === `${key}Factor`);
      return quantity?.value;
    });
    for (const factor of factors) {
      expect(factor).toBeCloseTo(3.125, 6);
    }
  });

  it("warns when the load has zero alternating stress", () => {
    const result = run({ amplitudeStress: 0 });
    expect(result.safetyFactor?.value).toBeCloseTo(4.5, 4);
    expect(result.warnings.some((w) => w.includes("alternating stress is zero"))).toBe(true);
  });

  it("warns and stays positive for a compressive mean stress", () => {
    const result = run({ meanStress: -50e6 });
    expect(result.safetyFactor?.value).toBeCloseTo(2.9377, 4);
    expect(result.warnings.some((w) => w.includes("compressive"))).toBe(true);
  });

  it("skips yield-based criteria when no yield strength is given", () => {
    const result = run({ yieldStrength: undefined });
    const keys = result.quantities.map((q) => q.key);
    expect(keys).not.toContain("soderbergFactor");
    expect(keys).not.toContain("asmeEllipticFactor");
    expect(keys).toContain("goodmanFactor");
    expect(result.warnings.some((w) => w.includes("Soderberg criterion is skipped"))).toBe(true);
    expect(result.safetyFactor?.value).toBeCloseTo(2.0548, 4);
  });

  it("requires yield strength for a single yield-based criterion", () => {
    expect(() => run({ criterion: "soderberg", yieldStrength: undefined })).toThrow(/requires yieldStrength/);
    expect(() => run({ criterion: "asme_elliptic", yieldStrength: undefined })).toThrow(/requires yieldStrength/);
  });

  it("warns when first-cycle yielding governs", () => {
    const result = run({ yieldStrength: 150e6 });
    expect(result.warnings.some((w) => w.includes("First-cycle yielding governs"))).toBe(true);
  });

  it("warns when the governing factor is below one", () => {
    const result = run({ meanStress: 400e6, amplitudeStress: 300e6, yieldStrength: 450e6 });
    expect(result.safetyFactor?.value).toBeLessThan(1);
    expect(result.warnings.some((w) => w.includes("below 1"))).toBe(true);
  });

  it("rejects an invalid ultimate strength", () => {
    expect(() => run({ ultimateStrength: 0 })).toThrow(/ultimateStrength/);
  });

  it("rejects a negative amplitude stress", () => {
    expect(() => run({ amplitudeStress: -1 })).toThrow(/amplitudeStress/);
  });

  it("rejects a fully zero load", () => {
    expect(() => run({ meanStress: 0, amplitudeStress: 0 })).toThrow(/nonzero/);
  });

  it("rejects a non-positive endurance limit", () => {
    expect(() => run({ enduranceLimit: 0 })).toThrow(/enduranceLimit/);
  });
});
