import { describe, expect, it } from "vitest";
import { createContext, type AppContext } from "../src/context.js";
import { tensileStressArea } from "../src/engine/bolt.js";
import { createHandlers, type Handler } from "../src/handlers.js";
import { buildServer, listTools } from "../src/server.js";
import type { ToolResult } from "../src/types.js";

type Handlers = {
  beam_bending: Handler;
  section_properties: Handler;
  bolt_strength: Handler;
  spring_design: Handler;
  shaft_analysis: Handler;
  bearing_life: Handler;
  von_mises: Handler;
  fatigue_analysis: Handler;
  unit_convert: Handler;
  material_lookup: Handler;
};

let ctx: AppContext;
let handlers: Handlers;

function setup() {
  ctx = createContext(":memory:");
  handlers = createHandlers(ctx) as Handlers;
}

function expectOk(response: Awaited<ReturnType<Handler>>): ToolResult {
  expect(response.ok).toBe(true);
  return response as ToolResult;
}

describe("tool registry", () => {
  it("registers all ten tools", () => {
    expect(listTools().sort()).toEqual(
      [
        "beam_bending",
        "section_properties",
        "bolt_strength",
        "spring_design",
        "shaft_analysis",
        "bearing_life",
        "von_mises",
        "fatigue_analysis",
        "unit_convert",
        "material_lookup",
      ].sort(),
    );
  });

  it("builds an MCP server with a tool count", () => {
    const server = buildServer(ctx);
    expect(server).toBeTruthy();
  });
});

describe("beam_bending tool", () => {
  it("returns an envelope with provenance and converted units", () => {
    setup();
    const response = handlers.beam_bending({
      support: "simply_supported",
      load: "point",
      loadMagnitude: 20000,
      length: 3,
      material: "Structural steel S355",
      section: { shape: "i_beam", height: 0.3, flangeWidth: 0.15, flangeThickness: 0.012, webThickness: 0.008 },
      outputUnits: { maxBendingStress: "MPa", maxDeflection: "mm", maxBendingMoment: "kN·m" },
    });
    const result = expectOk(response);

    expect(result.tool).toBe("beam_bending");
    expect(result.method.id).toBe("beam-bending");
    expect(result.quantities.length).toBe(3);
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references[0]).toHaveProperty("title");
    expect(result.safetyFactor).toBeDefined();

    const stress = result.quantities.find((q) => q.key === "maxBendingStress");
    expect(stress?.unit).toBe("MPa");
    expect(stress?.value).toBeGreaterThan(0);
    const deflection = result.quantities.find((q) => q.key === "maxDeflection");
    expect(deflection?.unit).toBe("mm");
  });

  it("reports an unknown material", () => {
    setup();
    const response = handlers.beam_bending({
      support: "simply_supported",
      load: "point",
      loadMagnitude: 1000,
      length: 2,
      material: "Unobtainium",
      section: { shape: "rectangle", width: 0.05, height: 0.1 },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("Unknown material");
    }
  });
});

describe("section_properties tool", () => {
  it("returns geometry quantities", () => {
    setup();
    const response = handlers.section_properties({
      section: { shape: "circle", diameter: 0.1 },
    });
    const result = expectOk(response);
    expect(result.quantities.map((q) => q.key)).toContain("secondMomentOfArea");
    expect(result.quantities.map((q) => q.key)).toContain("sectionModulus");
  });
});

describe("bolt_strength tool", () => {
  it("computes a bolt and converts the preload unit", () => {
    setup();
    const response = handlers.bolt_strength({
      nominalDiameterMm: 12,
      propertyClass: "8.8",
      axialLoad: 30000,
      outputUnits: { recommendedPreload: "kN", tensileStressArea: "m2" },
    });
    const result = expectOk(response);
    const preload = result.quantities.find((q) => q.key === "recommendedPreload");
    expect(preload?.unit).toBe("kN");
    expect(preload?.value).toBeCloseTo((0.75 * 600e6 * tensileStressArea(12, 1.75) * 1e-6) / 1000, 2);
    const area = result.quantities.find((q) => q.key === "tensileStressArea");
    expect(area?.unit).toBe("m2");
  });

  it("rejects an unknown size", () => {
    setup();
    const response = handlers.bolt_strength({
      nominalDiameterMm: 13,
      propertyClass: "8.8",
      axialLoad: 30000,
    });
    expect(response.ok).toBe(false);
  });
});

describe("shaft_analysis tool", () => {
  it("computes a shaft from a material", () => {
    setup();
    const response = handlers.shaft_analysis({
      outerDiameter: 0.05,
      length: 1,
      torque: 1000,
      material: "Structural steel S355",
      outputUnits: { maxShearStress: "MPa" },
    });
    const result = expectOk(response);
    const stress = result.quantities.find((q) => q.key === "maxShearStress");
    expect(stress?.unit).toBe("MPa");
    expect(result.safetyFactor).toBeDefined();
  });

  it("rejects missing material data", () => {
    setup();
    const response = handlers.shaft_analysis({
      outerDiameter: 0.05,
      length: 1,
      torque: 1000,
    });
    expect(response.ok).toBe(false);
  });
});

describe("spring_design tool", () => {
  it("computes a spring and converts its units", () => {
    setup();
    const response = handlers.spring_design({
      wireDiameter: 0.008,
      meanDiameter: 0.04,
      activeCoils: 4,
      endType: "squared_ground",
      freeLength: 0.09,
      load: 2000,
      shearModulus: 79.3e9,
      shearYieldStrength: 700e6,
      outputUnits: { maxShearStress: "MPa", springRate: "N/mm", deflection: "mm", solidHeight: "mm", workingLength: "mm" },
    });
    const result = expectOk(response);

    expect(result.tool).toBe("spring_design");
    expect(result.method.id).toBe("spring-design");
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references[0]).toHaveProperty("title");

    const stress = result.quantities.find((q) => q.key === "maxShearStress");
    expect(stress?.unit).toBe("MPa");
    expect(stress?.value).toBeCloseTo(521.4, 0);
    const rate = result.quantities.find((q) => q.key === "springRate");
    expect(rate?.unit).toBe("N/mm");
    expect(rate?.value).toBeCloseTo(158.6, 0);
    const deflection = result.quantities.find((q) => q.key === "deflection");
    expect(deflection?.unit).toBe("mm");
    expect(deflection?.value).toBeCloseTo(12.6, 0);
    expect(result.safetyFactor).toBeDefined();
    expect(result.warnings.length).toBe(0);
  });

  it("checks the geometry with a zero load", () => {
    setup();
    const response = handlers.spring_design({
      wireDiameter: 0.004,
      meanDiameter: 0.032,
      activeCoils: 8,
      freeLength: 0.16,
      load: 0,
      shearModulus: 79.3e9,
    });
    const result = expectOk(response);
    expect(result.quantities.find((q) => q.key === "springRate")?.value).toBeGreaterThan(0);
    expect(result.safetyFactor).toBeUndefined();
  });

  it("rejects a mean diameter that does not exceed the wire diameter", () => {
    setup();
    const response = handlers.spring_design({
      wireDiameter: 0.01,
      meanDiameter: 0.01,
      activeCoils: 5,
      freeLength: 0.1,
      load: 100,
      shearModulus: 79.3e9,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("meanDiameter");
    }
  });
});

describe("bearing_life tool", () => {
  it("computes life with a life margin", () => {
    setup();
    const response = handlers.bearing_life({
      bearingType: "ball",
      dynamicLoadRating: 42300,
      equivalentLoad: 8500,
      speedRpm: 1500,
      requiredLifeHours: 20000,
    });
    const result = expectOk(response);
    expect(result.quantities.find((q) => q.key === "l10Revolutions")?.value).toBeGreaterThan(0);
    expect(result.safetyFactor?.value).toBeGreaterThan(0);
  });
});

describe("von_mises tool", () => {
  it("computes cartesian stress with yield", () => {
    setup();
    const response = handlers.von_mises({
      mode: "cartesian",
      sigmaX: 120e6,
      sigmaY: 40e6,
      tauXY: 25e6,
      yieldStrength: 355e6,
    });
    const result = expectOk(response);
    expect(result.quantities.find((q) => q.key === "vonMisesStress")?.value).toBeGreaterThan(0);
    expect(result.safetyFactor).toBeDefined();
  });

  it("computes principal stress", () => {
    setup();
    const response = handlers.von_mises({ mode: "principal", sigma1: 100e6, sigma2: 20e6, sigma3: -10e6 });
    expectOk(response);
  });

  it("rejects principal mode without all principal stresses", () => {
    setup();
    const response = handlers.von_mises({ mode: "principal", sigma1: 100e6 });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("sigma2");
    }
  });

  it("rejects cartesian mode without sigmaX and sigmaY", () => {
    setup();
    const response = handlers.von_mises({ mode: "cartesian", sigmaX: 100e6 });
    expect(response.ok).toBe(false);
  });
});

describe("fatigue_analysis tool", () => {
  it("computes a fatigue factor from a material", () => {
    setup();
    const response = handlers.fatigue_analysis({
      material: "Alloy steel 42CrMo4",
      stressAmplitude: 200e6,
      meanStress: 100e6,
      outputUnits: { correctedEnduranceLimit: "MPa" },
    });
    const result = expectOk(response);
    const corrected = result.quantities.find((q) => q.key === "correctedEnduranceLimit");
    expect(corrected?.unit).toBe("MPa");
    expect(result.safetyFactor?.value).toBeGreaterThan(0);
    expect(result.references.length).toBeGreaterThan(0);
  });

  it("rejects an unknown material", () => {
    setup();
    const response = handlers.fatigue_analysis({
      material: "Unobtainium",
      stressAmplitude: 200e6,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("Unknown material");
    }
  });

  it("requires the ultimate strength when no material is set", () => {
    setup();
    const response = handlers.fatigue_analysis({ stressAmplitude: 200e6 });
    expect(response.ok).toBe(false);
  });
});

describe("unit_convert tool", () => {
  it("converts and reports the factor", () => {
    setup();
    const response = handlers.unit_convert({ value: 1000, from: "psi", to: "MPa" });
    const result = expectOk(response);
    expect(result.meta?.category).toBe("pressure");
    expect(result.quantities.find((q) => q.key === "convertedValue")?.value).toBeCloseTo(6.8948, 3);
  });

  it("fails on a dimension mismatch", () => {
    setup();
    const response = handlers.unit_convert({ value: 10, from: "N·m", to: "J" });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("Category mismatch");
    }
  });
});

describe("material_lookup tool", () => {
  it("returns matched rows with references", () => {
    setup();
    const response = handlers.material_lookup({ query: "S355" });
    const result = expectOk(response);
    expect(result.rows?.length).toBeGreaterThan(0);
    expect(result.rows?.[0]).toHaveProperty("yieldStrengthMPa");
  });

  it("returns no match as a failure", () => {
    setup();
    const response = handlers.material_lookup({ query: "adamantium" });
    expect(response.ok).toBe(false);
  });
});
