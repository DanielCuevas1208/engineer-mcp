import { describe, expect, it } from "vitest";
import {
  analyzeFatigue,
  equivalentAmplitude,
  estimateBaseEnduranceLimit,
  fatigueSafetyFactor,
  finiteLifeCycles,
  surfaceFinishFactor,
  type FatigueCriterion,
  type SurfaceFinish,
} from "../src/engine/fatigue.js";

describe("endurance limit estimation", () => {
  it("estimates the base endurance limit as half the ultimate strength", () => {
    expect(estimateBaseEnduranceLimit(1200e6)).toBeCloseTo(600e6, 9);
  });

  it("caps the base endurance limit at 700 MPa", () => {
    expect(estimateBaseEnduranceLimit(2000e6)).toBeCloseTo(700e6, 9);
    expect(estimateBaseEnduranceLimit(1000e6)).toBeCloseTo(500e6, 9);
  });
});

describe("surface finish factor", () => {
  it("computes the Marin surface factor for a machined finish", () => {
    expect(surfaceFinishFactor("machined", 1200e6)).toBeCloseTo(4.51 * 1200 ** -0.265, 6);
  });

  it("computes the factor for every finish preset", () => {
    const finishes: SurfaceFinish[] = ["ground", "machined", "hot_rolled", "as_forged"];
    const expected: Record<SurfaceFinish, number> = {
      ground: 1.58 * 1200 ** -0.085,
      machined: 4.51 * 1200 ** -0.265,
      hot_rolled: 57.7 * 1200 ** -0.718,
      as_forged: 272 * 1200 ** -0.995,
    };
    for (const finish of finishes) {
      expect(surfaceFinishFactor(finish, 1200e6)).toBeCloseTo(expected[finish], 6);
    }
  });

  it("orders the presets by severity", () => {
    const ground = surfaceFinishFactor("ground", 1200e6);
    const forged = surfaceFinishFactor("as_forged", 1200e6);
    expect(ground).toBeGreaterThan(forged);
  });
});

describe("fatigueSafetyFactor", () => {
  const sut = 1200e6;
  const sy = 950e6;
  const se = 500e6;
  const sa = 200e6;
  const sm = 400e6;

  it("computes the Goodman factor", () => {
    expect(fatigueSafetyFactor("goodman", sa, sm, se, sut, sy)).toBeCloseTo(1 / (200e6 / 500e6 + 400e6 / 1200e6), 9);
  });

  it("computes the Soderberg factor", () => {
    expect(fatigueSafetyFactor("soderberg", sa, sm, se, sut, sy)).toBeCloseTo(1 / (200e6 / 500e6 + 400e6 / 950e6), 9);
  });

  it("computes the ASME-elliptic factor", () => {
    const expected = 1 / Math.sqrt((200e6 / 500e6) ** 2 + (400e6 / 950e6) ** 2);
    expect(fatigueSafetyFactor("asme_elliptic", sa, sm, se, sut, sy)).toBeCloseTo(expected, 9);
  });

  it("computes the Gerber factor through its quadratic root", () => {
    const expected = (-(200e6 / 500e6) + Math.sqrt((200e6 / 500e6) ** 2 + 4 * (400e6 / 1200e6) ** 2)) /
      (2 * (400e6 / 1200e6) ** 2);
    expect(fatigueSafetyFactor("gerber", sa, sm, se, sut, sy)).toBeCloseTo(expected, 9);
  });

  it("reduces Gerber to the endurance ratio at zero mean stress", () => {
    expect(fatigueSafetyFactor("gerber", sa, 0, se, sut, sy)).toBeCloseTo(500e6 / 200e6, 9);
  });

  it("requires a yield strength for the Soderberg criterion", () => {
    expect(() => fatigueSafetyFactor("soderberg", sa, sm, se, sut)).toThrow("yieldStrength");
  });

  it("requires a yield strength for the ASME-elliptic criterion", () => {
    expect(() => fatigueSafetyFactor("asme_elliptic", sa, sm, se, sut)).toThrow("yieldStrength");
  });
});

describe("equivalentAmplitude", () => {
  const sut = 1200e6;
  const sy = 950e6;
  const sa = 200e6;
  const sm = 400e6;

  it("computes the Goodman equivalent amplitude", () => {
    expect(equivalentAmplitude("goodman", sa, sm, sut, sy)).toBeCloseTo(200e6 / (1 - 400e6 / 1200e6), 9);
  });

  it("computes the Gerber equivalent amplitude", () => {
    expect(equivalentAmplitude("gerber", sa, sm, sut, sy)).toBeCloseTo(200e6 / (1 - (400e6 / 1200e6) ** 2), 9);
  });

  it("computes the Soderberg equivalent amplitude", () => {
    expect(equivalentAmplitude("soderberg", sa, sm, sut, sy)).toBeCloseTo(200e6 / (1 - 400e6 / 950e6), 9);
  });

  it("computes the ASME-elliptic equivalent amplitude", () => {
    const expected = 200e6 / Math.sqrt(1 - (400e6 / 950e6) ** 2);
    expect(equivalentAmplitude("asme_elliptic", sa, sm, sut, sy)).toBeCloseTo(expected, 9);
  });
});

describe("finiteLifeCycles", () => {
  it("reports infinite life at or below the endurance limit", () => {
    expect(finiteLifeCycles(300e6, 500e6, 1200e6)).toBe(1e6);
  });

  it("reports a finite life above the endurance limit", () => {
    const life = finiteLifeCycles(600e6, 500e6, 1200e6);
    expect(life).toBeGreaterThan(1e3);
    expect(life).toBeLessThan(1e6);
  });

  it("reports a lower life at a higher stress", () => {
    const low = finiteLifeCycles(600e6, 500e6, 1200e6);
    const high = finiteLifeCycles(900e6, 500e6, 1200e6);
    expect(high).toBeLessThan(low);
  });
});

describe("analyzeFatigue", () => {
  it("computes a clean fatigue analysis with all four criteria", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      yieldStrength: 950e6,
      stressAmplitude: 200e6,
      meanStress: 400e6,
      enduranceLimit: 500e6,
      criterion: "goodman",
    });

    expect(result.method.id).toBe("fatigue-analysis");
    expect(result.referenceIds).toContain("shigley-2015");

    expect(result.quantities.find((q) => q.key === "baseEnduranceLimit")?.value).toBeCloseTo(500e6, 9);
    expect(result.quantities.find((q) => q.key === "correctedEnduranceLimit")?.value).toBeCloseTo(500e6, 9);
    expect(result.quantities.find((q) => q.key === "stressRatio")?.value).toBeCloseTo((400e6 - 200e6) / (400e6 + 200e6), 9);
    expect(result.quantities.find((q) => q.key === "peakStress")?.value).toBeCloseTo(600e6, 9);

    const goodman = result.quantities.find((q) => q.key === "goodmanFactor");
    expect(goodman?.value).toBeCloseTo(1 / (200e6 / 500e6 + 400e6 / 1200e6), 9);

    expect(result.safetyFactor?.key).toBe("goodmanFactor");
    expect(result.quantities.find((q) => q.key === "soderbergFactor")).toBeDefined();
    expect(result.quantities.find((q) => q.key === "gerberFactor")).toBeDefined();
    expect(result.quantities.find((q) => q.key === "asme_ellipticFactor")).toBeDefined();
    expect(result.warnings.length).toBe(0);
  });

  it("defaults the criterion to Goodman", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      yieldStrength: 950e6,
      stressAmplitude: 200e6,
      meanStress: 400e6,
      enduranceLimit: 500e6,
    });
    expect(result.inputs.criterion).toBe("goodman");
    expect(result.safetyFactor?.key).toBe("goodmanFactor");
  });

  it("estimates the endurance limit and applies the Marin factors", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      yieldStrength: 950e6,
      stressAmplitude: 200e6,
      meanStress: 400e6,
      surfaceFinish: "machined",
      loading: "bending",
    });

    const base = result.quantities.find((q) => q.key === "baseEnduranceLimit");
    expect(base?.value).toBeCloseTo(600e6, 9);

    const ka = surfaceFinishFactor("machined", 1200e6);
    expect(result.quantities.find((q) => q.key === "enduranceCorrectionFactor")?.value).toBeCloseTo(ka, 6);
    expect(result.quantities.find((q) => q.key === "correctedEnduranceLimit")?.value).toBeCloseTo(600e6 * ka, 6);
    expect(result.warnings.some((w) => w.includes("estimated"))).toBe(true);
  });

  it("applies the explicit Marin factors when supplied", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      stressAmplitude: 200e6,
      meanStress: 400e6,
      enduranceLimit: 600e6,
      surfaceFactor: 0.9,
      loadFactor: 0.85,
      sizeFactor: 0.95,
      temperatureFactor: 1,
      reliabilityFactor: 0.9,
      miscellaneousFactor: 1,
    });
    const correction = 0.9 * 0.85 * 0.95 * 1 * 0.9 * 1;
    expect(result.quantities.find((q) => q.key === "enduranceCorrectionFactor")?.value).toBeCloseTo(correction, 9);
    expect(result.quantities.find((q) => q.key === "correctedEnduranceLimit")?.value).toBeCloseTo(600e6 * correction, 9);
  });

  it("treats a compressive mean stress as zero with a warning", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      stressAmplitude: 200e6,
      meanStress: -400e6,
      enduranceLimit: 500e6,
    });
    expect(result.inputs.meanStress).toBe(0);
    expect(result.warnings.some((w) => w.includes("zero"))).toBe(true);
  });

  it("skips the yield-based criteria without a yield strength", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      stressAmplitude: 200e6,
      meanStress: 400e6,
      enduranceLimit: 500e6,
    });
    expect(result.quantities.find((q) => q.key === "goodmanFactor")).toBeDefined();
    expect(result.quantities.find((q) => q.key === "gerberFactor")).toBeDefined();
    expect(result.quantities.find((q) => q.key === "soderbergFactor")).toBeUndefined();
    expect(result.quantities.find((q) => q.key === "asme_ellipticFactor")).toBeUndefined();
  });

  it("warns when a safety factor falls below one", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      yieldStrength: 950e6,
      stressAmplitude: 600e6,
      meanStress: 400e6,
      enduranceLimit: 500e6,
    });
    expect(result.warnings.some((w) => w.includes("below 1"))).toBe(true);
  });

  it("warns when the peak stress exceeds the yield strength", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      yieldStrength: 500e6,
      stressAmplitude: 300e6,
      meanStress: 400e6,
      enduranceLimit: 500e6,
    });
    expect(result.warnings.some((w) => w.includes("yield strength"))).toBe(true);
  });

  it("reports a finite life above the endurance limit", () => {
    const result = analyzeFatigue({
      ultimateStrength: 1200e6,
      stressAmplitude: 600e6,
      meanStress: 200e6,
      enduranceLimit: 500e6,
    });
    const life = result.quantities.find((q) => q.key === "fatigueLifeCycles");
    expect(life?.value).toBeGreaterThan(1e3);
    expect(life?.value).toBeLessThan(1e6);
  });
});

describe("analyzeFatigue validation", () => {
  it("rejects a non-positive ultimate strength", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 0,
        stressAmplitude: 100e6,
      }),
    ).toThrow("ultimateStrength");
  });

  it("rejects a non-positive stress amplitude and a non-positive mean stress", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 1200e6,
        stressAmplitude: 0,
        meanStress: 0,
      }),
    ).toThrow("stressAmplitude or meanStress");
  });

  it("rejects the Soderberg criterion without a yield strength", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 1200e6,
        stressAmplitude: 200e6,
        meanStress: 400e6,
        criterion: "soderberg",
      }),
    ).toThrow("yieldStrength");
  });

  it("rejects a mean stress at or above the ultimate strength", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 1200e6,
        stressAmplitude: 200e6,
        meanStress: 1300e6,
      }),
    ).toThrow("ultimateStrength");
  });

  it("rejects a non-positive Marin factor", () => {
    expect(() =>
      analyzeFatigue({
        ultimateStrength: 1200e6,
        stressAmplitude: 200e6,
        meanStress: 400e6,
        reliabilityFactor: 0,
      }),
    ).toThrow("reliabilityFactor");
  });
});

describe("analyzeFatigue criteria variants", () => {
  const criteria: FatigueCriterion[] = ["soderberg", "goodman", "gerber", "asme_elliptic"];

  it("accepts every criterion as the headline", () => {
    for (const criterion of criteria) {
      const result = analyzeFatigue({
        ultimateStrength: 1200e6,
        yieldStrength: 950e6,
        stressAmplitude: 200e6,
        meanStress: 400e6,
        enduranceLimit: 500e6,
        criterion,
      });
      expect(result.safetyFactor?.key).toBe(`${criterion}Factor`);
    }
  });
});
