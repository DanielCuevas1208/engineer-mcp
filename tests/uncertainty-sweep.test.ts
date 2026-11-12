import { describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import { analyzeFatigue } from "../src/engine/fatigue.js";
import { analyzeUncertaintySweep, type UncertaintySweepInput } from "../src/engine/uncertainty-sweep.js";
import { createHandlers, type Handler } from "../src/handlers.js";
import type { ToolResult } from "../src/types.js";

const baseline = {
  ultimateStrength: 690e6,
  yieldStrength: 580e6,
  meanStress: 80e6,
  alternatingStress: 120e6,
  surfaceFinish: "ground" as const,
  reliability: 90,
};

function quantity(result: ReturnType<typeof analyzeUncertaintySweep>, key: string): number {
  const found = result.quantities.find((item) => item.key === key);
  if (!found) {
    throw new Error(`Missing quantity: ${key}`);
  }
  return found.value;
}

describe("analyzeUncertaintySweep", () => {
  it("matches endpoint rows to individual fatigue_analysis calls and ranks effects", () => {
    const input: UncertaintySweepInput = {
      calculation: "fatigue_analysis",
      baseline,
      sweeps: [
        {
          parameter: "meanStress",
          low: 60e6,
          high: 100e6,
          inputUnit: "MPa",
          calculationUnit: "Pa",
          baselineDisplayValue: 80,
          lowDisplayValue: 60,
          highDisplayValue: 100,
        },
        {
          parameter: "alternatingStress",
          low: 100e6,
          high: 140e6,
          inputUnit: "MPa",
          calculationUnit: "Pa",
          baselineDisplayValue: 120,
          lowDisplayValue: 100,
          highDisplayValue: 140,
        },
      ],
    };

    const result = analyzeUncertaintySweep(input);
    const meanStressRow = result.rows?.find((row) => row.parameter === "meanStress");
    const expectedLow = analyzeFatigue({ ...baseline, meanStress: 60e6 }).safetyFactor?.value;
    const expectedHigh = analyzeFatigue({ ...baseline, meanStress: 100e6 }).safetyFactor?.value;

    expect(meanStressRow).toMatchObject({
      inputUnit: "MPa",
      lowValue: 60,
      highValue: 100,
      lowFatigueSafetyFactor: expectedLow,
      highFatigueSafetyFactor: expectedHigh,
      referenceId: "shigley-2015",
    });
    expect(result.rows?.[0]?.rank).toBe(1);
    expect(quantity(result, "baselineFatigueSafetyFactor")).toBeCloseTo(analyzeFatigue(baseline).safetyFactor!.value, 9);
    expect(result.warnings.some((warning) => warning.includes("one input"))).toBe(true);
    expect(result.meta?.mostSensitiveParameter).toBe(result.rows?.[0]?.parameter);
  });

  it("rejects duplicate, reversed, and excessive sweep definitions", () => {
    const baseCase = {
      parameter: "meanStress" as const,
      low: 60e6,
      high: 100e6,
      inputUnit: "MPa",
      calculationUnit: "Pa",
      baselineDisplayValue: 80,
      lowDisplayValue: 60,
      highDisplayValue: 100,
    };
    expect(() => analyzeUncertaintySweep({ calculation: "fatigue_analysis", baseline, sweeps: [{ ...baseCase, low: 100e6 }] })).toThrow(
      /low must be smaller than high/,
    );
    expect(() => analyzeUncertaintySweep({ calculation: "fatigue_analysis", baseline, sweeps: [baseCase, { ...baseCase }] })).toThrow(
      /must be unique/,
    );
    expect(() =>
      analyzeUncertaintySweep({
        calculation: "fatigue_analysis",
        baseline,
        sweeps: [
          baseCase,
          { ...baseCase, parameter: "alternatingStress" },
          { ...baseCase, parameter: "ultimateStrength" },
          { ...baseCase, parameter: "yieldStrength" },
          { ...baseCase, parameter: "enduranceLimit" },
          { ...baseCase, parameter: "sizeFactor" },
        ],
      }),
    ).toThrow(/no more than 5/);
  });
});

describe("uncertainty_sweep tool", () => {
  it("converts endpoint units and exposes fatigue provenance through the handler", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).uncertainty_sweep as Handler;
      const response = handler({
        calculation: "fatigue_analysis",
        baseline,
        sweeps: [
          { parameter: "meanStress", low: 60, high: 100, unit: "MPa" },
          { parameter: "reliability", low: 90, high: 99, unit: "%" },
        ],
      });

      expect(response.ok).toBe(true);
      if (!response.ok) {
        return;
      }
      const result = response as ToolResult;
      expect(result.tool).toBe("uncertainty_sweep");
      expect(result.references.map((reference) => reference.id)).toContain("shigley-2015");
      expect(result.rows?.find((row) => row.parameter === "meanStress")).toMatchObject({
        inputUnit: "MPa",
        calculationUnit: "Pa",
        lowValue: 60,
        highValue: 100,
        lowCalculationValue: 60e6,
        highCalculationValue: 100e6,
      });
      expect(result.rows?.find((row) => row.parameter === "reliability")).toMatchObject({
        inputUnit: "%",
        calculationUnit: "%",
      });
    } finally {
      ctx.db.close();
    }
  });

  it("rejects a dimensioned unit for a dimensionless factor", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).uncertainty_sweep as Handler;
      const response = handler({
        calculation: "fatigue_analysis",
        baseline,
        sweeps: [{ parameter: "sizeFactor", low: 0.8, high: 1.2, unit: "MPa" }],
      });
      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error).toContain("dimensionless");
      }
    } finally {
      ctx.db.close();
    }
  });
});
