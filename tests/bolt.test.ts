import { describe, expect, it } from "vitest";
import { analyzeBolt, tensileStressArea } from "../src/engine/bolt.js";

const GRADE_88 = { proofStressMPa: 600, yieldStressMPa: 640, ultimateStressMPa: 800 };

describe("bolt analysis", () => {
  it("computes the tensile stress area from ISO 898", () => {
    expect(tensileStressArea(12, 1.75)).toBeCloseTo(84.3, 1);
    expect(tensileStressArea(20, 2.5)).toBeCloseTo(244.8, 1);
    expect(tensileStressArea(24, 3.0)).toBeCloseTo(352.5, 1);
  });

  it("computes preload and safety factor for an M12 8.8 bolt", () => {
    const result = analyzeBolt(
      { nominalDiameterMm: 12, pitchMm: 1.75, propertyClass: "8.8", axialLoad: 30000, preloadFraction: 0.75 },
      GRADE_88,
    );
    const preload = result.quantities.find((q) => q.key === "recommendedPreload");
    const yieldCapacity = result.quantities.find((q) => q.key === "yieldCapacity");
    const area = result.quantities.find((q) => q.key === "tensileStressArea");

    const expectedArea = tensileStressArea(12, 1.75) * 1e-6;
    expect(area?.value).toBeCloseTo(84.3, 1);
    expect(preload?.value).toBeCloseTo(0.75 * 600e6 * expectedArea, 2);
    expect(yieldCapacity?.value).toBeCloseTo(640e6 * expectedArea, 2);
    expect(result.safetyFactor?.value).toBeCloseTo((640e6 * expectedArea) / 30000, 3);
  });

  it("uses a custom preload fraction", () => {
    const result = analyzeBolt(
      { nominalDiameterMm: 12, pitchMm: 1.75, propertyClass: "10.9", axialLoad: 30000, preloadFraction: 0.5 },
      { proofStressMPa: 830, yieldStressMPa: 940, ultimateStressMPa: 1040 },
    );
    const preload = result.quantities.find((q) => q.key === "recommendedPreload");
    expect(preload?.value).toBeCloseTo(0.5 * 830e6 * tensileStressArea(12, 1.75) * 1e-6, 2);
  });

  it("carries the correct method provenance", () => {
    const result = analyzeBolt(
      { nominalDiameterMm: 12, pitchMm: 1.75, propertyClass: "8.8", axialLoad: 30000, preloadFraction: 0.75 },
      GRADE_88,
    );
    expect(result.referenceIds).toContain("iso-898-1");
    expect(result.referenceIds).toContain("iso-724");
  });
});
