import { DatabaseSync } from "node:sqlite";
import { createDatabase } from "./db/database.js";
import type { ReferenceRecord } from "./types.js";
import { convertUnit, type UnitOutcome } from "./units/index.js";

export type MaterialRow = {
  name: string;
  category: string;
  densityKgM3: number;
  elasticModulusGPa: number;
  shearModulusGPa: number | null;
  yieldStrengthMPa: number | null;
  ultimateStrengthMPa: number;
  elongationPct: number | null;
  note: string | null;
  referenceId: string | null;
};

export type FastenerRow = {
  nominalDiameterMm: number;
  pitchMm: number;
  pitchDiameterMm: number;
  minorDiameterMm: number;
};

export type GradeRow = {
  propertyClass: string;
  proofStressMPa: number;
  yieldStressMPa: number;
  ultimateStressMPa: number;
};

export type StandardSectionRow = {
  designation: string;
  series: string;
  standard: string;
  dimensionsReferenceId: string;
  propertiesReferenceId: string;
  heightMm: number;
  flangeWidthMm: number;
  webThicknessMm: number;
  flangeThicknessMm: number;
  areaCm2: number;
  massPerMetreKgM: number;
  secondMomentCm4: number;
  sectionModulusCm3: number;
};

export type AppContext = {
  db: DatabaseSync;
  references: Map<string, ReferenceRecord>;
  convertUnit(value: number, fromSymbol: string, toSymbol: string): UnitOutcome;
  findMaterial(query: string): MaterialRow | undefined;
  searchMaterials(query: string, limit?: number): MaterialRow[];
  listMaterials(): MaterialRow[];
  findFastener(nominalDiameterMm: number): FastenerRow | undefined;
  findGrade(propertyClass: string): GradeRow | undefined;
  findSection(designation: string): StandardSectionRow | undefined;
  searchSections(query: string, limit?: number): StandardSectionRow[];
  listSectionSeries(): string[];
};

export function createContext(dbPath = ":memory:"): AppContext {
  const db = createDatabase(dbPath);

  const references = new Map<string, ReferenceRecord>();
  for (const row of db.prepare("SELECT * FROM sources").all() as Array<Record<string, unknown>>) {
    references.set(row.id as string, {
      id: row.id as string,
      title: row.title as string,
      source: row.source as string,
      edition: (row.edition as string | null) ?? undefined,
      section: (row.section as string | null) ?? undefined,
      url: (row.url as string | null) ?? undefined,
      note: (row.note as string | null) ?? undefined,
    });
  }

  return {
    db,
    references,
    convertUnit,
    findMaterial(query) {
      const like = `%${query.toLowerCase()}%`;
      const rows = db
        .prepare("SELECT * FROM materials WHERE LOWER(name) LIKE ? OR LOWER(category) LIKE ?")
        .all(like, like) as unknown as Array<Record<string, unknown>>;
      return rows[0] ? mapMaterial(rows[0]) : undefined;
    },
    searchMaterials(query, limit = 10) {
      const like = `%${query.toLowerCase()}%`;
      const rows = db
        .prepare(
          "SELECT * FROM materials WHERE LOWER(name) LIKE ? OR LOWER(category) LIKE ? ORDER BY name LIMIT ?",
        )
        .all(like, like, limit) as unknown as Array<Record<string, unknown>>;
      return rows.map(mapMaterial);
    },
    listMaterials() {
      const rows = db.prepare("SELECT * FROM materials ORDER BY name").all() as unknown as Array<Record<string, unknown>>;
      return rows.map(mapMaterial);
    },
    findFastener(nominalDiameterMm) {
      const row = db
        .prepare("SELECT * FROM fasteners WHERE nominal_diameter_mm = ?")
        .get(nominalDiameterMm) as Record<string, unknown> | undefined;
      return row ? mapFastener(row) : undefined;
    },
    findGrade(propertyClass) {
      const row = db
        .prepare("SELECT * FROM bolt_grades WHERE property_class = ?")
        .get(propertyClass) as Record<string, unknown> | undefined;
      return row ? mapGrade(row) : undefined;
    },
    findSection(designation) {
      const row = db
        .prepare("SELECT * FROM standard_sections WHERE designation = ?")
        .get(designation) as Record<string, unknown> | undefined;
      return row ? mapSection(row) : undefined;
    },
    searchSections(query, limit = 10) {
      const like = `%${query.toLowerCase()}%`;
      const rows = db
        .prepare(
          "SELECT * FROM standard_sections WHERE LOWER(designation) LIKE ? OR LOWER(series) LIKE ? OR LOWER(standard) LIKE ? ORDER BY series, height_mm LIMIT ?",
        )
        .all(like, like, like, limit) as unknown as Array<Record<string, unknown>>;
      return rows.map(mapSection);
    },
    listSectionSeries() {
      const rows = db
        .prepare("SELECT DISTINCT series FROM standard_sections ORDER BY series")
        .all() as unknown as Array<Record<string, unknown>>;
      return rows.map((row) => row.series as string);
    },
  };
}

function mapMaterial(row: Record<string, unknown>): MaterialRow {
  return {
    name: row.name as string,
    category: row.category as string,
    densityKgM3: row.density_kg_m3 as number,
    elasticModulusGPa: row.elastic_modulus_gpa as number,
    shearModulusGPa: (row.shear_modulus_gpa as number | null) ?? null,
    yieldStrengthMPa: (row.yield_strength_mpa as number | null) ?? null,
    ultimateStrengthMPa: row.ultimate_strength_mpa as number,
    elongationPct: (row.elongation_pct as number | null) ?? null,
    note: (row.note as string | null) ?? null,
    referenceId: (row.reference_id as string | null) ?? null,
  };
}

function mapFastener(row: Record<string, unknown>): FastenerRow {
  return {
    nominalDiameterMm: row.nominal_diameter_mm as number,
    pitchMm: row.pitch_mm as number,
    pitchDiameterMm: row.pitch_diameter_mm as number,
    minorDiameterMm: row.minor_diameter_mm as number,
  };
}

function mapGrade(row: Record<string, unknown>): GradeRow {
  return {
    propertyClass: row.property_class as string,
    proofStressMPa: row.proof_stress_mpa as number,
    yieldStressMPa: row.yield_stress_mpa as number,
    ultimateStressMPa: row.ultimate_stress_mpa as number,
  };
}

function mapSection(row: Record<string, unknown>): StandardSectionRow {
  return {
    designation: row.designation as string,
    series: row.series as string,
    standard: row.standard as string,
    dimensionsReferenceId: row.reference_id as string,
    propertiesReferenceId: row.properties_reference_id as string,
    heightMm: row.height_mm as number,
    flangeWidthMm: row.flange_width_mm as number,
    webThicknessMm: row.web_thickness_mm as number,
    flangeThicknessMm: row.flange_thickness_mm as number,
    areaCm2: row.area_cm2 as number,
    massPerMetreKgM: row.mass_per_metre_kg_m as number,
    secondMomentCm4: row.second_moment_cm4 as number,
    sectionModulusCm3: row.section_modulus_cm3 as number,
  };
}
