import { describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import { analyzeToleranceStack, type ToleranceDimension } from "../src/engine/tolerance-stack.js";
import { createHandlers, type Handler } from "../src/handlers.js";
import type { ToolResult } from "../src/types.js";

function quantity(result: ReturnType<typeof analyzeToleranceStack>, key: string): number {
  const found = result.quantities.find((item) => item.key === key);
  if (!found) {
    throw new Error(`Missing quantity: ${key}`);
  }
  return found.value;
}

function expectOk(response: ReturnType<Handler>): ToolResult {
  expect(response.ok).toBe(true);
  return response as ToolResult;
}

const firstDimension: ToleranceDimension = {
  name: "A",
  nominal: 0.01,
  tolerancePlus: 0.0002,
  toleranceMinus: 0.0002,
  sign: 1,
};
const handCalculatedDimensions: ToleranceDimension[] = [
  firstDimension,
  { name: "B", nominal: 0.004, tolerancePlus: 0.0001, toleranceMinus: 0.00005, sign: -1 },
  { name: "C", nominal: 0.002, tolerancePlus: 0.0001, toleranceMinus: 0.0001, sign: 1 },
];

describe("analyzeToleranceStack", () => {
  it("matches a hand-calculated signed worst-case and RSS stack", () => {
    const result = analyzeToleranceStack({ dimensions: handCalculatedDimensions });

    expect(quantity(result, "nominalStack")).toBeCloseTo(0.008, 12);
    expect(quantity(result, "worstCaseLower")).toBeCloseTo(0.0076, 12);
    expect(quantity(result, "worstCaseUpper")).toBeCloseTo(0.00835, 12);
    expect(quantity(result, "worstCaseToleranceMinus")).toBeCloseTo(0.0004, 12);
    expect(quantity(result, "worstCaseTolerancePlus")).toBeCloseTo(0.00035, 12);
    expect(quantity(result, "rssLowerBound")).toBeCloseTo(0.008 - Math.sqrt(6e-8), 12);
    expect(quantity(result, "rssUpperBound")).toBeCloseTo(0.008 + Math.sqrt(5.25e-8), 12);
    expect(result.rows?.[1]).toMatchObject({
      name: "B",
      sign: -1,
      signedNominalM: -0.004,
      signedLowerDeviationM: -0.0001,
      signedUpperDeviationM: 0.00005,
    });
    expect(result.warnings.some((warning) => warning.includes("at the same time"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("independent"))).toBe(true);
  });

  it("rejects invalid tolerance distributions", () => {
    expect(() =>
      analyzeToleranceStack({
        dimensions: [{ ...firstDimension, tolerancePlus: -0.001 }],
      }),
    ).toThrow(/zero or positive/);
    expect(() =>
      analyzeToleranceStack({
        dimensions: [{ ...firstDimension, sign: 0 as 1 | -1 }],
      }),
    ).toThrow(/sign must be 1 or -1/);
    expect(() =>
      analyzeToleranceStack({
        dimensions: [{ ...firstDimension, nominal: 0.0001, toleranceMinus: 0.0001 }],
      }),
    ).toThrow(/positive lower dimension limit/);
    expect(() =>
      analyzeToleranceStack({
        dimensions: [firstDimension, { ...handCalculatedDimensions[1]!, name: "A" }],
      }),
    ).toThrow(/names must be unique/);
  });
});

describe("tolerance_stack tool", () => {
  it("converts mixed input units and exposes the cited method", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).tolerance_stack as Handler;
      const response = handler({
        dimensions: [
          { name: "housing", nominal: 10, tolerancePlus: 0.1, toleranceMinus: 0.1, sign: 1, unit: "mm" },
          { name: "shaft", nominal: 0.9, tolerancePlus: 0.01, toleranceMinus: 0.01, sign: -1, unit: "cm" },
        ],
        outputUnits: {
          nominalStack: "mm",
          worstCaseLower: "mm",
          worstCaseUpper: "mm",
          rssLowerBound: "mm",
          rssUpperBound: "mm",
        },
      });
      const result = expectOk(response);

      expect(result.tool).toBe("tolerance_stack");
      expect(result.method.id).toBe("tolerance-stack");
      expect(result.references.map((reference) => reference.id)).toContain("asme-y14-5");
      expect(result.quantities.find((item) => item.key === "nominalStack")?.unit).toBe("mm");
      expect(result.quantities.find((item) => item.key === "nominalStack")?.value).toBeCloseTo(1, 12);
      expect(result.quantities.find((item) => item.key === "worstCaseLower")?.value).toBeCloseTo(0.8, 12);
      expect(result.quantities.find((item) => item.key === "worstCaseUpper")?.value).toBeCloseTo(1.2, 12);
    } finally {
      ctx.db.close();
    }
  });

  it("rejects a non-length input unit", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).tolerance_stack as Handler;
      const response = handler({
        dimensions: [{ name: "load", nominal: 10, tolerancePlus: 1, toleranceMinus: 1, sign: 1, unit: "N" }],
      });
      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error).toContain("dimensions[0].nominal");
        expect(response.error).toContain("Dimension mismatch");
      }
    } finally {
      ctx.db.close();
    }
  });
});
