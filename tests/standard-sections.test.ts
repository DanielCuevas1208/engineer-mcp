import { describe, expect, it } from "vitest";
import { createContext, type AppContext, type StandardSectionRow } from "../src/context.js";
import { createHandlers, type Handler } from "../src/handlers.js";
import type { ToolResult } from "../src/types.js";

type Handlers = {
  section_catalog: Handler;
  section_properties: Handler;
  beam_bending: Handler;
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

describe("standard section catalog", () => {
  it("loads the catalog and finds a section by exact designation", () => {
    setup();
    const section = ctx.findSection("IPE 300");
    expect(section).toBeDefined();
    expect(section?.series).toBe("IPE");
    expect(section?.heightMm).toBe(300);
    expect(section?.secondMomentCm4).toBe(8356);
    expect(section?.sectionModulusCm3).toBe(557);
  });

  it("returns undefined for an unknown designation", () => {
    setup();
    expect(ctx.findSection("XYZ 999")).toBeUndefined();
  });

  it("searches across designation, series, and standard", () => {
    setup();
    const bySeries = ctx.searchSections("hea");
    expect(bySeries.length).toBeGreaterThan(0);
    expect(bySeries.every((row) => row.series === "HEA")).toBe(true);

    const byStandard = ctx.searchSections("en 10365", 5);
    expect(byStandard.length).toBeGreaterThan(0);
    expect(byStandard.length).toBeLessThanOrEqual(5);
  });

  it("lists the distinct series", () => {
    setup();
    const series = ctx.listSectionSeries();
    expect(series).toEqual(["HEA", "HEB", "IPE", "UPN"]);
  });

  it("orders search results by series and height", () => {
    setup();
    const rows = ctx.searchSections("ipe", 100) as StandardSectionRow[];
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]?.heightMm).toBeGreaterThan(rows[i - 1]?.heightMm ?? 0);
    }
  });
});

describe("section_catalog tool", () => {
  it("returns matched rows with the section properties", () => {
    setup();
    const response = handlers.section_catalog({ query: "HEB 200" });
    const result = expectOk(response);
    expect(result.tool).toBe("section_catalog");
    expect(result.method.id).toBe("section-catalog");
    expect(result.references[0]?.id).toBe("en-10365");
    expect(result.rows?.[0]).toMatchObject({
      designation: "HEB 200",
      series: "HEB",
      heightMm: 200,
    });
  });

  it("returns no match as a failure", () => {
    setup();
    const response = handlers.section_catalog({ query: "no-such-section" });
    expect(response.ok).toBe(false);
  });

  it("honours the limit", () => {
    setup();
    const response = handlers.section_catalog({ query: "ipe", limit: 3 });
    const result = expectOk(response);
    expect(result.rows?.length).toBeLessThanOrEqual(3);
  });
});

describe("section_properties tool with a standard section", () => {
  it("returns published properties for a designation", () => {
    setup();
    const response = handlers.section_properties({ section: { shape: "standard", designation: "IPE 300" } });
    const result = expectOk(response);

    const area = result.quantities.find((q) => q.key === "area");
    expect(area?.value).toBeCloseTo(53.8e-4, 6);
    expect(area?.unit).toBe("m2");

    const moment = result.quantities.find((q) => q.key === "secondMomentOfArea");
    expect(moment?.value).toBeCloseTo(8356e-8, 10);
    expect(moment?.unit).toBe("m4");

    const modulus = result.quantities.find((q) => q.key === "sectionModulus");
    expect(modulus?.value).toBeCloseTo(557e-6, 9);
    expect(modulus?.unit).toBe("m3");

    const mass = result.quantities.find((q) => q.key === "massPerMetre");
    expect(mass?.value).toBe(42.2);
    expect(mass?.unit).toBe("kg/m");

    expect(result.references.some((ref) => ref.id === "en-10365")).toBe(true);
  });

  it("converts quantities on request", () => {
    setup();
    const response = handlers.section_properties({
      section: { shape: "standard", designation: "HEA 200" },
      outputUnits: { secondMomentOfArea: "cm4", massPerMetre: "g/m" },
    });
    const result = expectOk(response);

    const moment = result.quantities.find((q) => q.key === "secondMomentOfArea");
    expect(moment?.unit).toBe("cm4");
    expect(moment?.value).toBeCloseTo(3692, 3);

    const mass = result.quantities.find((q) => q.key === "massPerMetre");
    expect(mass?.unit).toBe("g/m");
    expect(mass?.value).toBeCloseTo(42300, 1);
  });

  it("reports an unknown designation", () => {
    setup();
    const response = handlers.section_properties({ section: { shape: "standard", designation: "XYZ 999" } });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("Unknown standard section");
    }
  });
});

describe("beam_bending tool with a standard section", () => {
  it("uses the published section properties", () => {
    setup();
    const response = handlers.beam_bending({
      support: "simply_supported",
      load: "point",
      loadMagnitude: 20000,
      length: 3,
      material: "Structural steel S355",
      section: { shape: "standard", designation: "IPE 300" },
      outputUnits: { maxBendingStress: "MPa", maxDeflection: "mm" },
    });
    const result = expectOk(response);

    const expectedMoment = (20000 * 3) / 4;
    const expectedStressPa = expectedMoment / (557e-6);
    const expectedDeflection = (20000 * 3 ** 3) / (48 * 210e9 * 8356e-8);

    expect(result.quantities.find((q) => q.key === "maxBendingMoment")?.value).toBeCloseTo(expectedMoment, 6);
    expect(result.quantities.find((q) => q.key === "maxBendingStress")?.value).toBeCloseTo(expectedStressPa / 1e6, 6);
    expect(result.quantities.find((q) => q.key === "maxDeflection")?.value).toBeCloseTo(expectedDeflection * 1000, 9);
    expect(result.references.some((ref) => ref.id === "en-10365")).toBe(true);
  });

  it("reports an unknown standard designation", () => {
    setup();
    const response = handlers.beam_bending({
      support: "simply_supported",
      load: "point",
      loadMagnitude: 1000,
      length: 2,
      material: "Structural steel S355",
      section: { shape: "standard", designation: "XYZ 999" },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("Unknown standard section");
    }
  });
});
