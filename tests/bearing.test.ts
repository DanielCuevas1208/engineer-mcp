import { describe, expect, it } from "vitest";
import { analyzeBearing, equivalentLoad } from "../src/engine/bearing.js";

describe("bearing life", () => {
  it("computes L10 for a ball bearing", () => {
    const result = analyzeBearing({ bearingType: "ball", dynamicLoadRating: 20000, equivalentLoad: 4000 });
    const l10 = result.quantities.find((q) => q.key === "l10Revolutions");
    expect(l10?.value).toBeCloseTo((5) ** 3 * 1e6, 3);
  });

  it("computes L10 in hours at a given speed", () => {
    const result = analyzeBearing({
      bearingType: "ball",
      dynamicLoadRating: 20000,
      equivalentLoad: 4000,
      speedRpm: 3000,
    });
    const hours = result.quantities.find((q) => q.key === "l10Hours");
    expect(hours?.value).toBeCloseTo(1.25e8 / (60 * 3000), 6);
  });

  it("uses the 10/3 exponent for roller bearings", () => {
    const result = analyzeBearing({ bearingType: "roller", dynamicLoadRating: 20000, equivalentLoad: 4000 });
    const l10 = result.quantities.find((q) => q.key === "l10Revolutions");
    expect(l10?.value).toBeCloseTo(5 ** (10 / 3) * 1e6, 3);
  });

  it("computes the life margin", () => {
    const result = analyzeBearing({
      bearingType: "ball",
      dynamicLoadRating: 20000,
      equivalentLoad: 4000,
      speedRpm: 3000,
      requiredLifeHours: 1000,
    });
    expect(result.safetyFactor?.value).toBeCloseTo(694.444 / 1000, 3);
  });

  it("derives the equivalent load for a deep-groove ball bearing", () => {
    expect(equivalentLoad("ball", 5000, 1000).load).toBeCloseTo(5000, 9);
    const combined = equivalentLoad("ball", 5000, 3000);
    expect(combined.load).toBeCloseTo(0.56 * 5000 + 1.4 * 3000, 9);
  });

  it("warns when a roller bearing takes axial load", () => {
    const combined = equivalentLoad("roller", 5000, 1000);
    expect(combined.warning).toBeTruthy();
  });

  it("rejects missing load inputs", () => {
    expect(() => analyzeBearing({ bearingType: "ball", dynamicLoadRating: 20000 })).toThrow();
    expect(() =>
      analyzeBearing({
        bearingType: "ball",
        dynamicLoadRating: 20000,
        equivalentLoad: 4000,
        radialLoad: 4000,
      }),
    ).toThrow();
  });
});
