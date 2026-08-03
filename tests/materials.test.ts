import { describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";

describe("material database", () => {
  it("seeds references and materials", () => {
    const ctx = createContext(":memory:");
    expect(ctx.references.has("shigley-2015")).toBe(true);
    expect(ctx.references.has("iso-898-1")).toBe(true);
    expect(ctx.listMaterials().length).toBeGreaterThanOrEqual(5);
  });

  it("finds a material by name", () => {
    const ctx = createContext(":memory:");
    const material = ctx.findMaterial("6061");
    expect(material?.name).toBe("Aluminium 6061-T6");
    expect(material?.elasticModulusGPa).toBeCloseTo(68.9, 9);
    expect(material?.yieldStrengthMPa).toBeCloseTo(276, 9);
  });

  it("searches materials by name and category", () => {
    const ctx = createContext(":memory:");
    const steel = ctx.searchMaterials("steel");
    expect(steel.length).toBeGreaterThanOrEqual(3);
    const aluminium = ctx.searchMaterials("aluminium");
    expect(aluminium.length).toBeGreaterThanOrEqual(2);
    const none = ctx.searchMaterials("zirconium 9000");
    expect(none.length).toBe(0);
  });

  it("respects the search limit", () => {
    const ctx = createContext(":memory:");
    const rows = ctx.searchMaterials("s", 2);
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it("returns fastener thread data", () => {
    const ctx = createContext(":memory:");
    const fastener = ctx.findFastener(12);
    expect(fastener?.pitchMm).toBeCloseTo(1.75, 9);
    expect(ctx.findFastener(13)).toBeUndefined();
  });

  it("returns bolt grade data", () => {
    const ctx = createContext(":memory:");
    const grade = ctx.findGrade("10.9");
    expect(grade?.proofStressMPa).toBeCloseTo(830, 9);
    expect(ctx.findGrade("7.7")).toBeUndefined();
  });

  it("persists data to a file database", () => {
    const path = ":memory:";
    const ctx = createContext(path);
    expect(ctx.listMaterials().length).toBeGreaterThan(0);
  });
});
