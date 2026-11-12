import { describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import { analyzeFatigue } from "../src/engine/fatigue.js";
import { analyzeShaftFatigueScreen } from "../src/engine/shaft-fatigue-screen.js";
import { createHandlers, type Handler } from "../src/handlers.js";

const DIAMETER_M = 0.05;
const MEAN_STRESS_PA = 100e6;
const ALTERNATING_STRESS_PA = 50e6;
const BENDING_MOMENT_NM = (MEAN_STRESS_PA * Math.PI * DIAMETER_M ** 3) / 32;

describe("shaft fatigue screen", () => {
  it("matches the existing fatigue analysis for a hand-calculated fixture", () => {
    const input = {
      ultimateStrength: 800e6,
      yieldStrength: 450e6,
      meanStress: MEAN_STRESS_PA,
      alternatingStress: ALTERNATING_STRESS_PA,
      enduranceLimit: 200e6,
    } as const;
    const expected = analyzeFatigue(input);
    const screened = analyzeShaftFatigueScreen(input);

    expect(screened.enduranceLimitPa).toBe(200e6);
    expect(screened.fatigueSafetyFactor).toBeCloseTo(1 / (50e6 / 200e6 + 100e6 / 800e6), 12);
    expect(screened.fatigueSafetyFactor).toBe(expected.safetyFactor?.value);
    expect(screened.staticYieldSafetyFactor).toBe(expected.quantities.find((quantity) => quantity.key === "staticYieldSafetyFactor")?.value);
  });

  it("adds fatigue and yield margins to the governing row", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).shaft_load_cases as Handler;
      const response = handler({
        sections: [{ name: "governing", outerDiameter: 50, unit: "mm" }],
        loadCases: [{ name: "service", bendingMoment: BENDING_MOMENT_NM, torque: 0 }],
        yieldStrength: 450e6,
        fatigue: {
          alternatingStress: 50,
          ultimateStrength: 800,
          enduranceLimit: 200,
          stressUnit: "MPa",
        },
        outputUnits: { fatigueEnduranceLimit: "MPa" },
      });

      expect(response.ok).toBe(true);
      if (!response.ok) {
        return;
      }
      const governing = response.rows?.find((row) => row.isGoverning);
      expect(governing?.fatigueMeanStressPa).toBeCloseTo(MEAN_STRESS_PA, 5);
      expect(governing?.fatigueAlternatingStressPa).toBe(ALTERNATING_STRESS_PA);
      expect(governing?.fatigueSafetyFactor).toBeCloseTo(2.6666666666666665, 12);
      expect(governing?.fatigueStaticYieldSafetyFactor).toBeCloseTo(3, 12);
      expect(governing?.yieldSafetyFactor).toBeCloseTo(4.5, 12);
      expect(response.quantities.find((quantity) => quantity.key === "fatigueEnduranceLimit")?.value).toBe(200);
      expect(response.quantities.find((quantity) => quantity.key === "fatigueEnduranceLimit")?.unit).toBe("MPa");
      expect(response.references.map((reference) => reference.id)).toContain("shigley-2015");
    } finally {
      ctx.db.close();
    }
  });

  it("derives alternating stress from a governing load fraction", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).shaft_load_cases as Handler;
      const response = handler({
        sections: [{ name: "governing", outerDiameter: DIAMETER_M }],
        loadCases: [{ name: "service", bendingMoment: BENDING_MOMENT_NM, torque: 0 }],
        yieldStrength: 450e6,
        fatigue: {
          loadFraction: 0.5,
          ultimateStrength: 800e6,
          enduranceLimit: 200e6,
        },
      });

      expect(response.ok).toBe(true);
      if (!response.ok) {
        return;
      }
      const governing = response.rows?.find((row) => row.isGoverning);
      expect(governing?.fatigueAlternatingStressPa).toBeCloseTo(ALTERNATING_STRESS_PA, 5);
      expect(response.warnings).toContain("The alternating stress equals 50% of the governing von Mises stress.");
    } finally {
      ctx.db.close();
    }
  });

  it("rejects missing or duplicate alternating-stress sources", () => {
    const ctx = createContext(":memory:");
    try {
      const handler = createHandlers(ctx).shaft_load_cases as Handler;
      const base = {
        sections: [{ name: "governing", outerDiameter: DIAMETER_M }],
        loadCases: [{ name: "service", bendingMoment: BENDING_MOMENT_NM, torque: 0 }],
        yieldStrength: 450e6,
      };
      const missing = handler({ ...base, fatigue: { ultimateStrength: 800e6 } });
      const duplicate = handler({
        ...base,
        fatigue: { alternatingStress: ALTERNATING_STRESS_PA, loadFraction: 0.5, ultimateStrength: 800e6 },
      });

      expect(missing.ok).toBe(false);
      expect(duplicate.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.error).toContain("exactly one");
      }
      if (!duplicate.ok) {
        expect(duplicate.error).toContain("exactly one");
      }
    } finally {
      ctx.db.close();
    }
  });
});
