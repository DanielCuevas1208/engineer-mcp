import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  fatigueSafetyFactor,
  loadFactor,
  reliabilityFactor,
  sizeFactor,
  surfaceFactor,
  temperatureFactor,
  unmodifiedEnduranceLimit,
} from "../src/engine/fatigue.js";

const SUT = 490e6;
const SY = 355e6;
const SE_UNMODIFIED = 0.5 * SUT;
const KA_MACHINED = 4.51 * 490 ** -0.265;
const SE_BENDING = KA_MACHINED * SE_UNMODIFIED;

describe("fatigue helper factors", () => {
  it("computes the machined surface factor", () => {
    expect(surfaceFactor("machined", SUT)).toBeCloseTo(KA_MACHINED, 9);
    expect(surfaceFactor("machined", SUT)).toBeCloseTo(0.8733, 3);
  });

  it("computes every surface factor", () => {
    expect(surfaceFactor("ground", SUT)).toBeCloseTo(1.58 * 490 ** -0.085, 9);
    expect(surfaceFactor("cold_drawn", SUT)).toBeCloseTo(KA_MACHINED, 9);
    expect(surfaceFactor("hot_rolled", SUT)).toBeCloseTo(57.7 * 490 ** -0.718, 9);
    expect(surfaceFactor("as_forged", SUT)).toBeCloseTo(272 * 490 ** -0.995, 9);
  });

  it("returns a size factor of 1 for axial loading", () => {
    const result = sizeFactor("axial");
    expect(result.value).toBe(1);
    expect(result.note).toBeDefined();
  });

  it("returns a size factor of 1 for a small section", () => {
    expect(sizeFactor("bending", 6).value).toBe(1);
    expect(sizeFactor("bending").value).toBe(1);
  });

  it("computes the size factor for a 20 mm section", () => {
    expect(sizeFactor("bending", 20).value).toBeCloseTo(1.24 * 20 ** -0.107, 6);
    expect(sizeFactor("bending", 20).value).toBeCloseTo(0.8999, 3);
  });

  it("caps the size factor for a very large section", () => {
    const result = sizeFactor("bending", 500);
    expect(result.value).toBe(0.75);
    expect(result.note).toBeDefined();
  });

  it("sets the load factor by loading type", () => {
    expect(loadFactor("bending")).toBe(1);
    expect(loadFactor("torsion")).toBe(1);
    expect(loadFactor("axial")).toBe(0.85);
  });

  it("interpolates the temperature factor", () => {
    expect(temperatureFactor(20).value).toBe(1);
    expect(temperatureFactor(100).value).toBe(1.02);
    expect(temperatureFactor(150).value).toBe(1.025);
    expect(temperatureFactor(175).value).toBeCloseTo(1.0225, 9);
    expect(temperatureFactor(200).value).toBe(1.02);
    expect(temperatureFactor(600).value).toBe(0.549);
  });

  it("clamps the temperature factor outside the table", () => {
    expect(temperatureFactor(10).value).toBe(1);
    expect(temperatureFactor(650).value).toBe(0.549);
    expect(temperatureFactor(650).note).toBeDefined();
  });

  it("maps reliability percentages to factors", () => {
    expect(reliabilityFactor(50)).toBe(1);
    expect(reliabilityFactor(90)).toBe(0.897);
    expect(reliabilityFactor(95)).toBe(0.868);
    expect(reliabilityFactor(99)).toBe(0.814);
    expect(reliabilityFactor(99.9)).toBe(0.753);
    expect(reliabilityFactor(99.9999)).toBe(0.62);
    expect(reliabilityFactor(85)).toBeUndefined();
  });

  it("computes the unmodified endurance limit", () => {
    expect(unmodifiedEnduranceLimit(SUT).value).toBeCloseTo(245e6, 6);
    expect(unmodifiedEnduranceLimit(SUT).capped).toBe(false);
    expect(unmodifiedEnduranceLimit(1500e6).value).toBe(700e6);
    expect(unmodifiedEnduranceLimit(1500e6).capped).toBe(true);
  });
});

describe("fatigueSafetyFactor", () => {
  it("matches hand-computed factors for a mean stress case", () => {
    const sigmaA = 80e6;
    const sigmaM = 120e6;
    expect(fatigueSafetyFactor("soderberg", sigmaA, sigmaM, SE_BENDING, SUT, SY)).toBeCloseTo(1.40465, 3);
    expect(fatigueSafetyFactor("goodman", sigmaA, sigmaM, SE_BENDING, SUT, SY)).toBeCloseTo(1.61605, 3);
    expect(fatigueSafetyFactor("gerber", sigmaA, sigmaM, SE_BENDING, SUT, SY)).toBeCloseTo(2.02003, 3);
    expect(fatigueSafetyFactor("asmeElliptic", sigmaA, sigmaM, SE_BENDING, SUT, SY)).toBeCloseTo(1.98397, 3);
  });

  it("uses the endurance ratio when the mean is zero", () => {
    const n = fatigueSafetyFactor("gerber", 100e6, 0, SE_BENDING, SUT, SY);
    expect(n).toBeCloseTo(SE_BENDING / 100e6, 9);
  });
});

describe("analyzeFatigue", () => {
  it("computes a fully reversed bending case", () => {
    const result = analyzeFatigue({
      alternatingStress: 100e6,
      meanStress: 0,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
    });

    expect(result.method.id).toBe("fatigue-analysis");
    expect(result.quantities.find((q) => q.key === "surfaceFactor")?.value).toBeCloseTo(KA_MACHINED, 9);
    expect(result.quantities.find((q) => q.key === "enduranceLimit")?.value).toBeCloseTo(SE_BENDING, 6);
    expect(result.quantities.find((q) => q.key === "soderbergSafetyFactor")?.value).toBeCloseTo(SE_BENDING / 100e6, 6);
    expect(result.quantities.find((q) => q.key === "gerberSafetyFactor")?.value).toBeCloseTo(SE_BENDING / 100e6, 6);
    expect(result.quantities.find((q) => q.key === "yieldSafetyFactor")?.value).toBeCloseTo(3.55, 6);
    expect(result.safetyFactor?.value).toBeCloseTo(SE_BENDING / 100e6, 6);
    expect(result.referenceIds).toContain("shigley-2015");
  });

  it("reports the governing criterion for a mean stress case", () => {
    const result = analyzeFatigue({
      alternatingStress: 80e6,
      meanStress: 120e6,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
    });
    expect(result.safetyFactor?.value).toBeCloseTo(1.40465, 3);
    expect(result.quantities.find((q) => q.key === "soderbergSafetyFactor")?.value).toBeCloseTo(1.40465, 3);
    expect(result.quantities.find((q) => q.key === "goodmanSafetyFactor")?.value).toBeCloseTo(1.61605, 3);
  });

  it("applies the von Mises transformation for torsion", () => {
    const result = analyzeFatigue({
      alternatingStress: 60e6,
      meanStress: 40e6,
      loading: "torsion",
      ultimateStrength: SUT,
      yieldStrength: SY,
    });
    const alternating = result.quantities.find((q) => q.key === "equivalentAlternatingStress");
    expect(alternating?.value).toBeCloseTo(Math.sqrt(3) * 60e6, 6);
    const mean = result.quantities.find((q) => q.key === "equivalentMeanStress");
    expect(mean?.value).toBeCloseTo(Math.sqrt(3) * 40e6, 6);
    expect(result.warnings.some((w) => w.includes("von Mises"))).toBe(true);
  });

  it("applies the size and reliability factors", () => {
    const result = analyzeFatigue({
      alternatingStress: 100e6,
      meanStress: 0,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
      diameterMm: 20,
      reliabilityPct: 99,
    });
    const size = result.quantities.find((q) => q.key === "sizeFactor");
    expect(size?.value).toBeCloseTo(1.24 * 20 ** -0.107, 6);
    const reliability = result.quantities.find((q) => q.key === "reliabilityFactor");
    expect(reliability?.value).toBe(0.814);
    const endurance = result.quantities.find((q) => q.key === "enduranceLimit");
    expect(endurance?.value).toBeCloseTo(KA_MACHINED * (1.24 * 20 ** -0.107) * 0.814 * SE_UNMODIFIED, 6);
  });

  it("honours explicit factor overrides", () => {
    const result = analyzeFatigue({
      alternatingStress: 100e6,
      meanStress: 0,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
      surfaceFactor: 0.9,
      sizeFactor: 0.9,
      loadFactor: 0.8,
      reliabilityFactor: 0.9,
      miscellaneousFactor: 0.85,
      temperatureFactor: 0.95,
    });
    const endurance = result.quantities.find((q) => q.key === "enduranceLimit");
    const expected = 0.9 * 0.9 * 0.8 * 0.95 * 0.9 * 0.85 * SE_UNMODIFIED;
    expect(endurance?.value).toBeCloseTo(expected, 6);
  });

  it("warns and caps the endurance limit for a very strong steel", () => {
    const result = analyzeFatigue({
      alternatingStress: 200e6,
      meanStress: 0,
      loading: "bending",
      ultimateStrength: 1500e6,
      yieldStrength: 1200e6,
    });
    expect(result.quantities.find((q) => q.key === "unmodifiedEnduranceLimit")?.value).toBe(700e6);
    expect(result.warnings.some((w) => w.includes("1400 MPa"))).toBe(true);
  });

  it("treats a compressive mean stress conservatively", () => {
    const result = analyzeFatigue({
      alternatingStress: 100e6,
      meanStress: -20e6,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
    });
    expect(result.warnings.some((w) => w.includes("compressive"))).toBe(true);
    expect(result.quantities.find((q) => q.key === "soderbergSafetyFactor")?.value).toBeCloseTo(SE_BENDING / 100e6, 6);
    expect(result.quantities.find((q) => q.key === "yieldSafetyFactor")?.value).toBeCloseTo(355e6 / 80e6, 6);
  });

  it("skips the yield check for a fully compressive cycle", () => {
    const result = analyzeFatigue({
      alternatingStress: 100e6,
      meanStress: -200e6,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
    });
    expect(result.quantities.find((q) => q.key === "yieldSafetyFactor")).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("static yield check is skipped"))).toBe(true);
    expect(result.safetyFactor?.value).toBeCloseTo(SE_BENDING / 100e6, 6);
  });

  it("carries a warning when no diameter is given", () => {
    const result = analyzeFatigue({
      alternatingStress: 100e6,
      meanStress: 0,
      loading: "bending",
      ultimateStrength: SUT,
      yieldStrength: SY,
    });
    expect(result.warnings.some((w) => w.includes("No diameter"))).toBe(true);
  });
});

describe("analyzeFatigue validation", () => {
  it("rejects a non-positive alternating stress", () => {
    expect(() =>
      analyzeFatigue({
        alternatingStress: 0,
        meanStress: 0,
        loading: "bending",
        ultimateStrength: SUT,
        yieldStrength: SY,
      }),
    ).toThrow("alternatingStress");
  });

  it("rejects a non-positive ultimate strength", () => {
    expect(() =>
      analyzeFatigue({
        alternatingStress: 100e6,
        meanStress: 0,
        loading: "bending",
        ultimateStrength: 0,
        yieldStrength: SY,
      }),
    ).toThrow("ultimateStrength");
  });

  it("rejects a non-positive yield strength", () => {
    expect(() =>
      analyzeFatigue({
        alternatingStress: 100e6,
        meanStress: 0,
        loading: "bending",
        ultimateStrength: SUT,
        yieldStrength: 0,
      }),
    ).toThrow("yieldStrength");
  });

  it("rejects an unsupported reliability percentage", () => {
    expect(() =>
      analyzeFatigue({
        alternatingStress: 100e6,
        meanStress: 0,
        loading: "bending",
        ultimateStrength: SUT,
        yieldStrength: SY,
        reliabilityPct: 85,
      }),
    ).toThrow("Unsupported reliability");
  });
});
