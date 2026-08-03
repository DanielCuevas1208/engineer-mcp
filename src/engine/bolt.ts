import type { Computation, MethodRecord, Quantity } from "../types.js";

export type BoltInput = {
  nominalDiameterMm: number;
  pitchMm: number;
  propertyClass: string;
  axialLoad: number;
  preloadFraction: number;
};

export type BoltGradeData = {
  proofStressMPa: number;
  yieldStressMPa: number;
  ultimateStressMPa: number;
};

export const BOLT_METHOD: MethodRecord = {
  id: "bolt-strength",
  name: "ISO 898 bolt tensile design",
  formula: "At = (pi/4)(d - 0.9382P)^2, Fi = fraction x Sp x At, capacity = Sy x At",
  notes:
    "The tensile stress area uses the ISO 898 formula with the coarse thread pitch. Preload follows the Shigley recommendation of 75% of proof load. The safety factor uses yield strength over applied axial load.",
  referenceIds: ["iso-898-1", "iso-724", "shigley-2015"],
};

export function tensileStressArea(nominalDiameterMm: number, pitchMm: number): number {
  return (Math.PI / 4) * (nominalDiameterMm - 0.9382 * pitchMm) ** 2;
}

export function analyzeBolt(input: BoltInput, grade: BoltGradeData): Computation {
  const stressAreaMm2 = tensileStressArea(input.nominalDiameterMm, input.pitchMm);
  const proofStressPa = grade.proofStressMPa * 1e6;
  const yieldStressPa = grade.yieldStressMPa * 1e6;
  const stressAreaM2 = stressAreaMm2 * 1e-6;

  const preload = input.preloadFraction * proofStressPa * stressAreaM2;
  const yieldCapacity = yieldStressPa * stressAreaM2;
  const safety = yieldCapacity / input.axialLoad;

  const quantities: Quantity[] = [
    {
      key: "tensileStressArea",
      label: "Tensile stress area",
      value: stressAreaMm2,
      unit: "mm2",
      description: "Effective tensile area of the threaded portion per ISO 898.",
    },
    {
      key: "proofStrength",
      label: "Proof strength",
      value: grade.proofStressMPa,
      unit: "MPa",
      description: "Proof stress of the selected property class for diameters up to 16 mm.",
    },
    {
      key: "yieldStrength",
      label: "Yield strength",
      value: grade.yieldStressMPa,
      unit: "MPa",
      description: "Minimum yield strength of the selected property class.",
    },
    {
      key: "recommendedPreload",
      label: "Recommended preload",
      value: preload,
      unit: "N",
      description: "Target clamp load at the chosen preload fraction of proof load.",
    },
    {
      key: "yieldCapacity",
      label: "Yield load capacity",
      value: yieldCapacity,
      unit: "N",
      description: "Axial force that would bring the bolt section to yield.",
    },
    {
      key: "appliedLoad",
      label: "Applied axial load",
      value: input.axialLoad,
      unit: "N",
      description: "The axial load supplied to the connection.",
    },
  ];

  return {
    method: BOLT_METHOD,
    inputs: {
      nominalDiameterMm: input.nominalDiameterMm,
      pitchMm: input.pitchMm,
      propertyClass: input.propertyClass,
      axialLoad: input.axialLoad,
      preloadFraction: input.preloadFraction,
    },
    quantities,
    safetyFactor: {
      key: "boltSafetyFactor",
      label: "Bolt safety factor",
      value: safety,
      unit: "",
      description: "Yield capacity divided by the applied axial load.",
    },
    referenceIds: BOLT_METHOD.referenceIds,
    warnings: [],
  };
}
