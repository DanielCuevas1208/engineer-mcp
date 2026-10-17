import { describe, expect, it } from "vitest";
import { loadReferences, loadSections, type SectionSeed } from "../src/assets.js";

const STEEL_DENSITY_KG_M3 = 7850;
const MASS_TOLERANCE = 0.005;
const MODULUS_TOLERANCE = 0.01;

const EXPECTED_DESIGNATIONS: Record<string, string[]> = {
  IPE: [80, 100, 120, 140, 160, 180, 200, 220, 240, 270, 300, 330, 360, 400, 450, 500].map(
    (size) => `IPE ${size}`,
  ),
  HEA: [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300].map((size) => `HEA ${size}`),
  HEB: [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300].map((size) => `HEB ${size}`),
  UPN: [80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300].map((size) => `UPN ${size}`),
};

type GoldenAnchor = {
  designation: string;
  dimensionsSource: string;
  propertiesSource: string;
  expected: Pick<
    SectionSeed,
    | "heightMm"
    | "flangeWidthMm"
    | "webThicknessMm"
    | "flangeThicknessMm"
    | "massPerMetreKgM"
    | "areaCm2"
    | "secondMomentCm4"
    | "sectionModulusCm3"
  >;
};

const GOLDEN_ANCHORS: GoldenAnchor[] = [
  {
    designation: "IPE 300",
    dimensionsSource: "en-10365",
    propertiesSource: "arcelormittal-sections",
    expected: {
      heightMm: 300,
      flangeWidthMm: 150,
      webThicknessMm: 7.1,
      flangeThicknessMm: 10.7,
      massPerMetreKgM: 42.2,
      areaCm2: 53.8,
      secondMomentCm4: 8356,
      sectionModulusCm3: 557,
    },
  },
  {
    designation: "HEA 200",
    dimensionsSource: "en-10365",
    propertiesSource: "arcelormittal-sections",
    expected: {
      heightMm: 190,
      flangeWidthMm: 200,
      webThicknessMm: 6.5,
      flangeThicknessMm: 10.0,
      massPerMetreKgM: 42.3,
      areaCm2: 53.8,
      secondMomentCm4: 3692,
      sectionModulusCm3: 389,
    },
  },
  {
    designation: "HEB 100",
    dimensionsSource: "en-10365",
    propertiesSource: "arcelormittal-sections",
    expected: {
      heightMm: 100,
      flangeWidthMm: 100,
      webThicknessMm: 6.0,
      flangeThicknessMm: 10.0,
      massPerMetreKgM: 20.4,
      areaCm2: 26.0,
      secondMomentCm4: 450,
      sectionModulusCm3: 89.9,
    },
  },
  {
    designation: "UPN 200",
    dimensionsSource: "en-10365",
    propertiesSource: "arcelormittal-sections",
    expected: {
      heightMm: 200,
      flangeWidthMm: 75,
      webThicknessMm: 8.5,
      flangeThicknessMm: 11.5,
      massPerMetreKgM: 25.3,
      areaCm2: 32.2,
      secondMomentCm4: 1910,
      sectionModulusCm3: 191,
    },
  },
];

function sectionsBySeries(sections: SectionSeed[]): Map<string, SectionSeed[]> {
  const bySeries = new Map<string, SectionSeed[]>();
  for (const section of sections) {
    const list = bySeries.get(section.series) ?? [];
    list.push(section);
    bySeries.set(section.series, list);
  }
  return bySeries;
}

describe("section catalog data audit", () => {
  it("keeps dimensions and section properties linked to separate sources", () => {
    const references = loadReferences();
    expect(references["en-10365"]?.note).toContain("does not supply the section-property columns");
    expect(references["arcelormittal-sections"]?.section).toContain("IPE tables");
    expect(references["arcelormittal-sections"]?.url).toContain("ArcelorMittal_FR_EN_RU_web.pdf");
  });

  it("gives every row a traceable source for each property group", () => {
    const references = loadReferences();
    for (const section of loadSections()) {
      expect(references[section.dimensionsReferenceId]).toBeDefined();
      expect(references[section.propertiesReferenceId]).toBeDefined();
      expect(section.dimensionsReferenceId).toBe("en-10365");
      expect(section.propertiesReferenceId).toBe("arcelormittal-sections");
    }
  });

  it("keeps every designation unique", () => {
    const designations = loadSections().map((section) => section.designation);
    expect(new Set(designations).size).toBe(designations.length);
  });

  it("covers exactly the documented series and sizes", () => {
    const bySeries = sectionsBySeries(loadSections());
    expect([...bySeries.keys()].sort()).toEqual(["HEA", "HEB", "IPE", "UPN"]);
    for (const [series, expected] of Object.entries(EXPECTED_DESIGNATIONS)) {
      const designations = (bySeries.get(series) ?? []).map((section) => section.designation);
      expect(designations).toEqual(expected);
    }
  });

  it("orders each series by height", () => {
    const bySeries = sectionsBySeries(loadSections());
    for (const list of bySeries.values()) {
      for (let i = 1; i < list.length; i += 1) {
        expect(list[i]?.heightMm).toBeGreaterThan(list[i - 1]?.heightMm ?? 0);
      }
    }
  });

  it("keeps the web thinner than the flange", () => {
    for (const section of loadSections()) {
      expect(section.webThicknessMm).toBeLessThanOrEqual(section.flangeThicknessMm);
    }
  });

  it("keeps the mass consistent with the area and steel density", () => {
    for (const section of loadSections()) {
      const expectedMass = section.areaCm2 * 1e-4 * STEEL_DENSITY_KG_M3;
      expect(Math.abs(section.massPerMetreKgM - expectedMass)).toBeLessThan(expectedMass * MASS_TOLERANCE);
    }
  });

  it("keeps the section modulus consistent with the second moment of area", () => {
    for (const section of loadSections()) {
      const halfHeightM = section.heightMm / 2 * 1e-3;
      const expectedModulusCm3 = (section.secondMomentCm4 * 1e-8) / halfHeightM * 1e6;
      expect(Math.abs(section.sectionModulusCm3 - expectedModulusCm3)).toBeLessThan(
        expectedModulusCm3 * MODULUS_TOLERANCE,
      );
    }
  });

  it("matches published anchor values for each series", () => {
    const byDesignation = new Map(loadSections().map((section) => [section.designation, section]));
    for (const anchor of GOLDEN_ANCHORS) {
      const section = byDesignation.get(anchor.designation);
      expect(section).toBeDefined();
      expect(section?.dimensionsReferenceId).toBe(anchor.dimensionsSource);
      expect(section?.propertiesReferenceId).toBe(anchor.propertiesSource);
      expect(section).toMatchObject(anchor.expected);
    }
  });

  it("keeps every dimension and property positive and finite", () => {
    for (const section of loadSections()) {
      const values = [
        section.heightMm,
        section.flangeWidthMm,
        section.webThicknessMm,
        section.flangeThicknessMm,
        section.areaCm2,
        section.massPerMetreKgM,
        section.secondMomentCm4,
        section.sectionModulusCm3,
      ];
      for (const value of values) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});
