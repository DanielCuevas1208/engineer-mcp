import { describe, expect, it } from "vitest";
import { analyzeFatigue, criterionSafetyFactor, estimateEnduranceLimit } from "../src/engine/fatigue.js";

const BASE = {
  meanStress: 100e6,
  amplitudeStress: 100e6,
  ultimateStrength: 620e6,
  yieldStrength: 340e6,
};

describe("fatigue endurance limit", () => {
  it("estimates half the ultimate strength", () => {
    expect(estimateEnduranceLimit(620e6)).toBeCloseTo(310e6, 6);
  });

  it("caps the estimate at 700 MPa", () => {
    expect(estimateEnduranceLimit(2000e6)).toBeCloseTo(700e6, 6);
  });
});

describe("fatigue criteria", () => {
  it("computes the Soderberg factor", () => {
    const factor = criterionSafetyFactor("soderberg", 100e6, 100e6, 310e6, 620e6, 340e6);
    expect(factor).toBeCloseTo(1.6215, 3);
  });

  it("computes the Goodman factor", () => {
    const factor = criterionSafetyFactor("goodman", 100e6, 100e6, 310e6, 620e6, 340e6);
    expect(factor).toBeCloseTo(2.0667, 3);
  });

  it("computes the Gerber factor", () => {
    const factor = criterionSafetyFactor("gerber", 100e6, 100e6, 310e6, 620e6, 340e6);
    expect(factor).toBeCloseTo(2.5682, 3);
  });

  it("computes the ASME-elliptic factor", () => {
    const factor = criterionSafetyFactor("asme_elliptic", 100e6, 100e6, 310e6, 620e6, 340e6);
    expect(factor).toBeCloseTo(2.2908, 3);
  });

  it("handles a fully reversed load with zero mean stress", () => {
    const factor = criterionSafetyFactor("goodman", 100e6, 0, 310e6, 620e6, 340e6);
    expect(factor).toBeCloseTo(3.1, 3);
  });
});

describe("fatigue analysis", () => {
  it("reports the governing factor across all criteria", () => {
    const result = analyzeFatigue(BASE);
    expect(result.safetyFactor?.key).toBe("governingFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(1.6215, 3);
    expect(result.quantities.find((q) => q.key === "soderbergFactor")?.value).toBeCloseTo(1.6215, 3);
    expect(result.quantities.find((q) => q.key === "goodmanFactor")?.value).toBeCloseTo(2.0667, 3);
    expect(result.quantities.find((q) => q.key === "gerberFactor")?.value).toBeCloseTo(2.5682, 3);
    expect(result.quantities.find((q) => q.key === "asme_ellipticFactor")?.value).toBeCloseTo(2.2908, 3);
  });

  it("reports the first-cycle yield factor", () => {
    const result = analyzeFatigue(BASE);
    const factor = result.quantities.find((q) => q.key === "firstCycleYieldFactor");
    expect(factor?.value).toBeCloseTo(1.7, 6);
  });

  it("skips yield-based criteria when yield strength is missing", () => {
    const result = analyzeFatigue({ meanStress: 100e6, amplitudeStress: 100e6, ultimateStrength: 620e6 });
    expect(result.quantities.find((q) => q.key === "soderbergFactor")).toBeUndefined();
    expect(result.quantities.find((q) => q.key === "asmeEllipticFactor")).toBeUndefined();
    expect(result.safetyFactor?.value).toBeCloseTo(2.0667, 3);
    expect(result.warnings.some((w) => w.includes("estimated"))).toBe(true);
  });

  it("evaluates a single requested criterion", () => {
    const result = analyzeFatigue({ ...BASE, criterion: "gerber" });
    expect(result.quantities.find((q) => q.key === "goodmanFactor")).toBeUndefined();
    expect(result.quantities.find((q) => q.key === "gerberFactor")).toBeDefined();
    expect(result.safetyFactor?.value).toBeCloseTo(2.5682, 3);
  });

  it("warns on a zero alternating stress", () => {
    const result = analyzeFatigue({ ...BASE, amplitudeStress: 0 });
    expect(result.warnings.some((w) => w.includes("static"))).toBe(true);
  });

  it("warns on a compressive mean stress", () => {
    const result = analyzeFatigue({ ...BASE, meanStress: -50e6 });
    expect(result.warnings.some((w) => w.includes("compressive"))).toBe(true);
  });

  it("warns when the governing factor is below one", () => {
    const result = analyzeFatigue({ ...BASE, meanStress: 500e6, amplitudeStress: 200e6 });
    expect(result.safetyFactor?.value).toBeLessThan(1);
    expect(result.warnings.some((w) => w.includes("below 1"))).toBe(true);
  });

  it("throws when a yield-based criterion lacks yield strength", () => {
    expect(() =>
      analyzeFatigue({ meanStress: 100e6, amplitudeStress: 100e6, ultimateStrength: 620e6, criterion: "soderberg" }),
    ).toThrow(/yieldStrength/);
  });

  it("throws on invalid input", () => {
    expect(() => analyzeFatigue({ ...BASE, meanStress: 0, amplitudeStress: 0 })).toThrow(/nonzero/);
    expect(() => analyzeFatigue({ ...BASE, ultimateStrength: 0 })).toThrow(/positive/);
  });
});
