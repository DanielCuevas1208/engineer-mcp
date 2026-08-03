import { DatabaseSync } from "node:sqlite";
import { BOLT_GRADES, loadFasteners, loadMaterials, loadReferences } from "../assets.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  edition TEXT,
  section TEXT,
  url TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  name TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  density_kg_m3 REAL NOT NULL,
  elastic_modulus_gpa REAL NOT NULL,
  shear_modulus_gpa REAL,
  yield_strength_mpa REAL,
  ultimate_strength_mpa REAL NOT NULL,
  elongation_pct REAL,
  note TEXT,
  reference_id TEXT
);

CREATE TABLE IF NOT EXISTS bolt_grades (
  property_class TEXT PRIMARY KEY,
  proof_stress_mpa REAL NOT NULL,
  yield_stress_mpa REAL NOT NULL,
  ultimate_stress_mpa REAL NOT NULL,
  reference_id TEXT
);

CREATE TABLE IF NOT EXISTS fasteners (
  nominal_diameter_mm REAL PRIMARY KEY,
  pitch_mm REAL NOT NULL,
  pitch_diameter_mm REAL NOT NULL,
  minor_diameter_mm REAL NOT NULL,
  reference_id TEXT
);
`;

export function createDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  seedIfEmpty(db);
  return db;
}

function tableIsEmpty(db: DatabaseSync, table: string): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count === 0;
}

export function seedIfEmpty(db: DatabaseSync): void {
  if (tableIsEmpty(db, "sources")) {
    const insert = db.prepare(
      "INSERT INTO sources (id, title, source, edition, section, url, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const [id, record] of Object.entries(loadReferences())) {
      insert.run(id, record.title, record.source, record.edition ?? null, record.section ?? null, record.url ?? null, record.note ?? null);
    }
  }

  if (tableIsEmpty(db, "materials")) {
    const insert = db.prepare(
      `INSERT INTO materials
        (name, category, density_kg_m3, elastic_modulus_gpa, shear_modulus_gpa, yield_strength_mpa, ultimate_strength_mpa, elongation_pct, note, reference_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of loadMaterials()) {
      insert.run(m.name, m.category, m.densityKgM3, m.elasticModulusGPa, m.shearModulusGPa, m.yieldStrengthMPa, m.ultimateStrengthMPa, m.elongationPct, m.note, m.referenceId);
    }
  }

  if (tableIsEmpty(db, "bolt_grades")) {
    const insert = db.prepare(
      "INSERT INTO bolt_grades (property_class, proof_stress_mpa, yield_stress_mpa, ultimate_stress_mpa, reference_id) VALUES (?, ?, ?, ?, ?)",
    );
    for (const g of BOLT_GRADES) {
      insert.run(g.propertyClass, g.proofStressMPa, g.yieldStressMPa, g.ultimateStressMPa, "iso-898-1");
    }
  }

  if (tableIsEmpty(db, "fasteners")) {
    const insert = db.prepare(
      "INSERT INTO fasteners (nominal_diameter_mm, pitch_mm, pitch_diameter_mm, minor_diameter_mm, reference_id) VALUES (?, ?, ?, ?, ?)",
    );
    for (const f of loadFasteners()) {
      insert.run(f.nominalDiameterMm, f.pitchMm, f.pitchDiameterMm, f.minorDiameterMm, "iso-724");
    }
  }
}
