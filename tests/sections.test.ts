import { describe, expect, it } from "vitest";
import { computeSection } from "../src/engine/sections.js";

describe("section properties", () => {
  it("computes a rectangle", () => {
    const props = computeSection({ shape: "rectangle", width: 0.1, height: 0.2 });
    expect(props.area).toBeCloseTo(0.02, 9);
    expect(props.secondMomentOfArea).toBeCloseTo(0.1 * 0.2 ** 3 / 12, 9);
    expect(props.sectionModulus).toBeCloseTo((0.1 * 0.2 ** 3 / 12) / 0.1, 9);
    expect(props.centroidY).toBeCloseTo(0.1, 9);
  });

  it("computes a circle", () => {
    const props = computeSection({ shape: "circle", diameter: 0.1 });
    expect(props.area).toBeCloseTo(Math.PI * 0.1 ** 2 / 4, 9);
    expect(props.secondMomentOfArea).toBeCloseTo(Math.PI * 0.1 ** 4 / 64, 9);
    expect(props.sectionModulus).toBeCloseTo(Math.PI * 0.1 ** 3 / 32, 9);
  });

  it("computes a hollow circle", () => {
    const props = computeSection({ shape: "hollow_circle", outerDiameter: 0.12, innerDiameter: 0.08 });
    const expected = (Math.PI * (0.12 ** 4 - 0.08 ** 4)) / 64;
    expect(props.secondMomentOfArea).toBeCloseTo(expected, 9);
    expect(props.sectionModulus).toBeCloseTo(expected / 0.06, 9);
  });

  it("computes an I-beam", () => {
    const props = computeSection({
      shape: "i_beam",
      height: 0.3,
      flangeWidth: 0.15,
      flangeThickness: 0.012,
      webThickness: 0.008,
    });
    const webHeight = 0.3 - 2 * 0.012;
    const expected = (0.15 * 0.3 ** 3 - (0.15 - 0.008) * webHeight ** 3) / 12;
    expect(props.area).toBeCloseTo(2 * 0.15 * 0.012 + webHeight * 0.008, 9);
    expect(props.secondMomentOfArea).toBeCloseTo(expected, 9);
    expect(props.sectionModulus).toBeCloseTo(expected / 0.15, 9);
    expect(props.secondMomentOfAreaY).toBeCloseTo(
      (2 * 0.012 * 0.15 ** 3 + webHeight * 0.008 ** 3) / 12,
      12,
    );
  });

  it("computes a box section", () => {
    const props = computeSection({ shape: "box", width: 0.1, height: 0.2, thickness: 0.01 });
    expect(props.area).toBeCloseTo(0.02 - 0.08 * 0.18, 9);
    expect(props.secondMomentOfArea).toBeCloseTo((0.1 * 0.2 ** 3 - 0.08 * 0.18 ** 3) / 12, 9);
  });

  it("rejects invalid dimensions", () => {
    expect(() => computeSection({ shape: "hollow_circle", outerDiameter: 0.08, innerDiameter: 0.1 })).toThrow();
    expect(() => computeSection({ shape: "rectangle", width: 0, height: 0.1 })).toThrow();
    expect(() => computeSection({ shape: "box", width: 0.1, height: 0.2, thickness: 0.1 })).toThrow();
  });
});
