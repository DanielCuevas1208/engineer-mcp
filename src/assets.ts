import { readFileSync } from "node:fs";
import type { ReferenceRecord } from "./types.js";

function readJson<T>(relativePath: string): T {
  const url = new URL(relativePath, import.meta.url);
  const text = readFileSync(url, "utf8");
  return JSON.parse(text) as T;
}

export type MaterialSeed = {
  name: string;
  category: string;
  densityKgM3: number;
  elasticModulusGPa: number;
  shearModulusGPa: number;
  yieldStrengthMPa: number;
  ultimateStrengthMPa: number;
  elongationPct: number;
  note: string;
  referenceId: string;
};

export type FastenerSeed = {
  nominalDiameterMm: number;
  pitchMm: number;
  pitchDiameterMm: number;
  minorDiameterMm: number;
};

export type GradeSeed = {
  propertyClass: string;
  proofStressMPa: number;
  yieldStressMPa: number;
  ultimateStressMPa: number;
};

const MATERIALS_PATH = "../data/materials.json";
const FASTENERS_PATH = "../data/fasteners.json";
const REFERENCES_PATH = "../data/references.json";

export function loadMaterials(): MaterialSeed[] {
  return readJson<MaterialSeed[]>(MATERIALS_PATH);
}

export function loadFasteners(): FastenerSeed[] {
  return readJson<FastenerSeed[]>(FASTENERS_PATH);
}

export function loadReferences(): Record<string, ReferenceRecord> {
  return readJson<Record<string, ReferenceRecord>>(REFERENCES_PATH);
}

export const BOLT_GRADES: GradeSeed[] = [
  { propertyClass: "4.8", proofStressMPa: 310, yieldStressMPa: 340, ultimateStressMPa: 400 },
  { propertyClass: "5.8", proofStressMPa: 380, yieldStressMPa: 420, ultimateStressMPa: 500 },
  { propertyClass: "8.8", proofStressMPa: 600, yieldStressMPa: 640, ultimateStressMPa: 800 },
  { propertyClass: "10.9", proofStressMPa: 830, yieldStressMPa: 940, ultimateStressMPa: 1040 },
  { propertyClass: "12.9", proofStressMPa: 970, yieldStressMPa: 1100, ultimateStressMPa: 1220 },
];
