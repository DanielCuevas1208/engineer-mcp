import { describe, expect, it } from "vitest";
import {
  allowableCycles,
  analyzeFatigueDamage,
  type SNCurvePoint,
} from "../src/engine/fatigue-damage.js";

const curve: SNCurvePoint[] = [
  { cycles: 1_000, alternatingStress: 600e6 },
  { cycles: 100_000, alternatingStress: 400e6 },
  { cycles: 1_000_000, alternatingStress: 300e6 },
];

describe("allowableCycles", () => {
  it("interpolates S-N data in log-log space", () => {
    const first = curve[1] as SNCurvePoint;
    const second = curve[2] as SNCurvePoint;
    const expected = Math.exp(
      Math.log(first.cycles) +
        ((Math.log(320e6) - Math.log(first.alternatingStress)) *
          (Math.log(second.cycles) - Math.log(first.cycles))) /
          (Math.log(second.alternatingStress) - Math.log(first.alternatingStress)),
    );
    expect(allowableCycles(320e6, curve).cycles).toBeCloseTo(expected, 6);
  });

  it("reports infinite life below the last S-N point", () => {
    expect(allowableCycles(299e6, curve)).toEqual({
      cycles: Number.POSITIVE_INFINITY,
      infinite: true,
      extrapolated: false,
    });
  });

  it("extrapolates above the highest S-N point", () => {
    const result = allowableCycles(700e6, curve);
    expect(result.infinite).toBe(false);
    expect(result.extrapolated).toBe(true);
    expect(result.cycles).toBeGreaterThan(1);
    expect(result.cycles).toBeLessThan(1_000);
  });
});

describe("analyzeFatigueDamage", () => {
  it("sums block damage and exposes a per-block trace", () => {
    const result = analyzeFatigueDamage({
      blocks: [
        { meanStress: 100e6, alternatingStress: 350e6, cycles: 10_000 },
        { meanStress: 50e6, alternatingStress: 300e6, cycles: 100_000 },
      ],
      snCurve: curve,
      ultimateStrength: 800e6,
    });
    const firstDamage = 10_000 / allowableCycles(400e6, curve).cycles;
    const secondDamage = 100_000 / allowableCycles(320e6, curve).cycles;

    expect(result.rows).toHaveLength(2);
    expect(result.rows?.[0]).toMatchObject({
      block: 1,
      correctedAlternatingStressPa: 400e6,
      allowableCycles: 100_000,
    });
    expect(result.rows?.[1]?.damage).toBeCloseTo(secondDamage, 12);
    expect(result.quantities.find((q) => q.key === "cumulativeDamage")?.value).toBeCloseTo(
      firstDamage + secondDamage,
      12,
    );
    expect(result.quantities.find((q) => q.key === "governingBlock")?.value).toBe(2);
  });

  it("uses no correction when the S-N curve already matches the stress ratio", () => {
    const input = {
      blocks: [{ meanStress: 100e6, alternatingStress: 350e6, cycles: 10_000 }],
      snCurve: curve,
      ultimateStrength: 800e6,
    };
    const goodman = analyzeFatigueDamage(input);
    const none = analyzeFatigueDamage({ ...input, meanStressCorrection: "none" });

    expect(goodman.rows?.[0]?.correctedAlternatingStressPa).toBe(400e6);
    expect(none.rows?.[0]?.correctedAlternatingStressPa).toBe(350e6);
    expect(none.warnings.some((warning) => warning.includes("disabled"))).toBe(true);
    expect(none.quantities.find((q) => q.key === "cumulativeDamage")?.value).toBeLessThan(
      goodman.quantities.find((q) => q.key === "cumulativeDamage")?.value ?? 0,
    );
  });

  it("treats compressive mean stress as zero for Goodman correction", () => {
    const result = analyzeFatigueDamage({
      blocks: [{ meanStress: -100e6, alternatingStress: 350e6, cycles: 10_000 }],
      snCurve: curve,
      ultimateStrength: 800e6,
    });

    expect(result.rows?.[0]?.correctedAlternatingStressPa).toBe(350e6);
    expect(result.warnings.some((warning) => warning.includes("compressive"))).toBe(true);
  });

  it("reports extrapolation and cumulative damage warnings", () => {
    const result = analyzeFatigueDamage({
      blocks: [{ meanStress: 0, alternatingStress: 700e6, cycles: 2_000 }],
      snCurve: curve,
      ultimateStrength: 800e6,
    });

    expect(result.rows?.[0]?.extrapolated).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("exceed"))).toBe(true);
  });

  it("reports infinite repeated-spectrum life when all blocks are below the curve", () => {
    const result = analyzeFatigueDamage({
      blocks: [{ meanStress: 0, alternatingStress: 250e6, cycles: 1_000_000 }],
      snCurve: curve,
      ultimateStrength: 800e6,
    });

    expect(result.quantities.find((q) => q.key === "cumulativeDamage")?.value).toBe(0);
    expect(result.quantities.find((q) => q.key === "cyclesToFailureEstimate")?.value).toBe(Number.POSITIVE_INFINITY);
    expect(result.safetyFactor?.value).toBe(Number.POSITIVE_INFINITY);
  });

  it("uses the yield margin when it governs", () => {
    const result = analyzeFatigueDamage({
      blocks: [{ meanStress: 100e6, alternatingStress: 350e6, cycles: 10_000 }],
      snCurve: curve,
      ultimateStrength: 800e6,
      yieldStrength: 300e6,
    });

    expect(result.quantities.find((q) => q.key === "yieldSafetyFactor")?.value).toBeCloseTo(300e6 / 450e6, 12);
    expect(result.safetyFactor?.key).toBe("fatigueDamageSafetyFactor");
    expect(result.safetyFactor?.value).toBeCloseTo(300e6 / 450e6, 12);
    expect(result.warnings.some((warning) => warning.includes("yield strength"))).toBe(true);
  });

  it("warns when the repeated spectrum exceeds the Miner limit", () => {
    const result = analyzeFatigueDamage({
      blocks: [{ meanStress: 0, alternatingStress: 400e6, cycles: 200_000 }],
      snCurve: curve,
      ultimateStrength: 800e6,
    });

    expect(result.quantities.find((q) => q.key === "cumulativeDamage")?.value).toBeCloseTo(2, 12);
    expect(result.warnings.some((warning) => warning.includes("exceeds one"))).toBe(true);
  });

  it("rejects unordered S-N points", () => {
    expect(() =>
      analyzeFatigueDamage({
        blocks: [{ meanStress: 0, alternatingStress: 100e6, cycles: 1_000 }],
        snCurve: [
          { cycles: 100_000, alternatingStress: 400e6 },
          { cycles: 1_000, alternatingStress: 600e6 },
        ],
        ultimateStrength: 800e6,
      }),
    ).toThrow(/cycles must increase/);
  });

  it("rejects a non-positive block cycle count", () => {
    expect(() =>
      analyzeFatigueDamage({
        blocks: [{ meanStress: 0, alternatingStress: 100e6, cycles: 0 }],
        snCurve: curve,
        ultimateStrength: 800e6,
      }),
    ).toThrow(/cycles must be a positive integer/);
  });
});
