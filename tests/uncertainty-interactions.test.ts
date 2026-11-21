import { describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import { analyzeFatigue } from "../src/engine/fatigue.js";
import {
  analyzeUncertaintyInteractions,
  type UncertaintyInteractionsInput,
} from "../src/engine/uncertainty-interactions.js";
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

function endpoint(
  parameter: "meanStress" | "alternatingStress",
  low: number,
  high: number,
  displayLow: number,
  displayHigh: number,
) {
  return {
    parameter,
    low,
    high,
    inputUnit: "MPa",
    calculationUnit: "Pa",
    baselineDisplayValue: parameter === "meanStress" ? 80 : 120,
    lowDisplayValue: displayLow,
    highDisplayValue: displayHigh,
  };
}

function quantity(result: ReturnType<typeof analyzeUncertaintyInteractions>, key: string): number {
  const found = result.quantities.find((item) => item.key === key);
  if (!found) {
    throw new Error(`Missing quantity: ${key}`);
  }
  return found.value;
}

function sfAt(overrides: Partial<typeof baseline> & Record<string, number>): number {
  const value = analyzeFatigue({ ...baseline, ...overrides }).safetyFactor?.value;
  if (value === undefined) {
    throw new Error("Missing safety factor");
  }
  return value;
}

describe("analyzeUncertaintyInteractions", () => {
  it("matches corners and one-factor rows to individual fatigue_analysis calls", () => {
    const parameterA = endpoint("meanStress", 60e6, 100e6, 60, 100);
    const parameterB = endpoint("alternatingStress", 100e6, 140e6, 100, 140);
    const input: UncertaintyInteractionsInput = {
      calculation: "fatigue_analysis",
      baseline,
      parameterA,
      parameterB,
    };

    const result = analyzeUncertaintyInteractions(input);
    const corners = {
      lowLow: sfAt({ meanStress: 60e6, alternatingStress: 100e6 }),
      lowHigh: sfAt({ meanStress: 60e6, alternatingStress: 140e6 }),
      highLow: sfAt({ meanStress: 100e6, alternatingStress: 100e6 }),
      highHigh: sfAt({ meanStress: 100e6, alternatingStress: 140e6 }),
    };

    for (const [corner, expected] of Object.entries(corners)) {
      const row = result.rows?.find((item) => item.corner === corner);
      expect(row?.fatigueSafetyFactor).toBeCloseTo(expected, 9);
    }

    const oneFactorA = result.rows?.find((row) => row.role === "parameterA");
    expect(oneFactorA?.lowFatigueSafetyFactor).toBeCloseTo(sfAt({ meanStress: 60e6 }), 9);
    expect(oneFactorA?.highFatigueSafetyFactor).toBeCloseTo(sfAt({ meanStress: 100e6 }), 9);

    const interaction =
      corners.highHigh - corners.highLow - corners.lowHigh + corners.lowLow;
    expect(quantity(result, "interactionEffect")).toBeCloseTo(interaction, 9);
    expect(quantity(result, "baselineFatigueSafetyFactor")).toBeCloseTo(sfAt({}), 9);
    expect(result.referenceIds).toContain("shigley-2015");
  });

  it("rejects duplicate parameters and reversed endpoints", () => {
    const shared = endpoint("meanStress", 60e6, 100e6, 60, 100);
    const other = endpoint("alternatingStress", 100e6, 140e6, 100, 140);
    expect(() =>
      analyzeUncertaintyInteractions({
        calculation: "fatigue_analysis",
        baseline,
        parameterA: shared,
        parameterB: { ...other, parameter: "meanStress" },
      }),
    ).toThrow(/must differ/);
    expect(() =>
      analyzeUncertaintyInteractions({
        calculation: "fatigue_analysis",
        baseline,
        parameterA: { ...shared, low: 100e6, high: 60e6 },
        parameterB: other,
      }),
    ).toThrow(/smaller than high/);
  });
});

describe("uncertainty_interactions tool", () => {
  it("converts endpoint units and exposes fatigue provenance through the handler", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).uncertainty_interactions as Handler;
      const response = handler({
        calculation: "fatigue_analysis",
        baseline,
        pair: {
          parameterA: "meanStress",
          lowA: 60,
          highA: 100,
          unitA: "MPa",
          parameterB: "alternatingStress",
          lowB: 100,
          highB: 140,
          unitB: "MPa",
        },
      });

      expect(response.ok).toBe(true);
      if (!response.ok) {
        return;
      }
      const result = response as ToolResult;
      expect(result.tool).toBe("uncertainty_interactions");
      expect(result.references.map((reference) => reference.id)).toContain("shigley-2015");
      expect(result.quantities.find((item) => item.key === "interactionEffect")).toBeDefined();
      const corner = result.rows?.find((row) => row.corner === "highHigh");
      expect(corner).toMatchObject({
        parameterACalculationValue: 100e6,
        parameterBCalculationValue: 140e6,
      });
    } finally {
      ctx.db.close();
    }
  });
});