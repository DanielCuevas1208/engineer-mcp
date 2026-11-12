import type { Computation, MethodRecord, Quantity } from "../types.js";

export type ShaftLoadCaseSection = {
  name: string;
  outerDiameter: number;
  innerDiameter?: number;
};

export type ShaftLoadCase = {
  name: string;
  bendingMoment: number;
  torque: number;
};

export type ShaftLoadCasesInput = {
  sections: ShaftLoadCaseSection[];
  loadCases: ShaftLoadCase[];
  yieldStrength: number;
};

export type ShaftStressCriterion = "bending" | "torsion" | "von_mises_combined";

export const SHAFT_LOAD_CASES_METHOD: MethodRecord = {
  id: "shaft-load-cases",
  name: "Shaft combined bending and torsion load cases",
  formula:
    "sigma = 32 M D / (pi (D^4 - d^4)); tau = 16 T D / (pi (D^4 - d^4)); sigma_vm = sqrt(sigma^2 + 3 tau^2)",
  notes:
    "Each row evaluates a round shaft section under one bending and torque pair. The von Mises rule uses plane stress with zero axial stress. Axial loads and keyed stress concentrations are not modeled. An optional fatigue screen reuses the existing Marin method.",
  referenceIds: ["shigley-2015", "roark-2011"],
};

export function roundShaftBendingStress(bendingMoment: number, outerDiameter: number, innerDiameter: number): number {
  const polarFourth = outerDiameter ** 4 - innerDiameter ** 4;
  if (!(polarFourth > 0)) {
    throw new Error("Outer diameter must exceed inner diameter.");
  }
  return (32 * bendingMoment * outerDiameter) / (Math.PI * polarFourth);
}

export function roundShaftTorsionalShear(torque: number, outerDiameter: number, innerDiameter: number): number {
  const polarFourth = outerDiameter ** 4 - innerDiameter ** 4;
  if (!(polarFourth > 0)) {
    throw new Error("Outer diameter must exceed inner diameter.");
  }
  return (16 * torque * outerDiameter) / (Math.PI * polarFourth);
}

export function combinedVonMisesStress(bendingStress: number, torsionalShear: number): number {
  return Math.sqrt(bendingStress ** 2 + 3 * torsionalShear ** 2);
}

function criterionForCase(bendingMoment: number, torque: number, bendingStress: number, torsionalShear: number): ShaftStressCriterion {
  const hasBending = bendingMoment > 0;
  const hasTorque = torque > 0;
  if (hasBending && hasTorque) {
    return "von_mises_combined";
  }
  if (hasBending) {
    return "bending";
  }
  return "torsion";
}

export function analyzeShaftLoadCases(input: ShaftLoadCasesInput): Computation {
  validateInput(input);

  const rows: Record<string, unknown>[] = [];
  let governingSectionIndex = 0;
  let governingLoadCaseIndex = 0;
  let governingCriterion: ShaftStressCriterion = "bending";
  let minimumSafetyFactor = Number.POSITIVE_INFINITY;
  let governingVonMises = 0;

  for (const [sectionIndex, section] of input.sections.entries()) {
    const innerDiameter = section.innerDiameter ?? 0;
    if (!(section.outerDiameter > 0)) {
      throw new Error(`sections[${sectionIndex}].outerDiameter must be positive.`);
    }
    if (innerDiameter < 0 || innerDiameter >= section.outerDiameter) {
      throw new Error(`sections[${sectionIndex}] inner diameter must be zero or smaller than the outer diameter.`);
    }

    for (const [caseIndex, loadCase] of input.loadCases.entries()) {
      if (loadCase.bendingMoment === 0 && loadCase.torque === 0) {
        throw new Error(`loadCases[${caseIndex}] must include a non-zero bendingMoment or torque.`);
      }
      if (loadCase.bendingMoment < 0 || loadCase.torque < 0) {
        throw new Error(`loadCases[${caseIndex}] bendingMoment and torque must be zero or positive.`);
      }

      const bendingStress = loadCase.bendingMoment > 0 ? roundShaftBendingStress(loadCase.bendingMoment, section.outerDiameter, innerDiameter) : 0;
      const torsionalShear = loadCase.torque > 0 ? roundShaftTorsionalShear(loadCase.torque, section.outerDiameter, innerDiameter) : 0;
      const vonMisesStress = combinedVonMisesStress(bendingStress, torsionalShear);
      const yieldSafetyFactor = input.yieldStrength / vonMisesStress;
      const criterion = criterionForCase(loadCase.bendingMoment, loadCase.torque, bendingStress, torsionalShear);
      const isGoverning = yieldSafetyFactor < minimumSafetyFactor;

      if (isGoverning) {
        minimumSafetyFactor = yieldSafetyFactor;
        governingSectionIndex = sectionIndex + 1;
        governingLoadCaseIndex = caseIndex + 1;
        governingCriterion = criterion;
        governingVonMises = vonMisesStress;
      }

      rows.push({
        sectionIndex: sectionIndex + 1,
        sectionName: section.name,
        loadCaseIndex: caseIndex + 1,
        loadCaseName: loadCase.name,
        outerDiameterM: section.outerDiameter,
        innerDiameterM: innerDiameter,
        bendingMomentNm: loadCase.bendingMoment,
        torqueNm: loadCase.torque,
        bendingStressPa: bendingStress,
        torsionalShearPa: torsionalShear,
        vonMisesStressPa: vonMisesStress,
        yieldSafetyFactor,
        governingCriterion: criterion,
        referenceId: "shigley-2015",
        isGoverning,
      });
    }
  }

  for (const row of rows) {
    row.isGoverning = row.sectionIndex === governingSectionIndex && row.loadCaseIndex === governingLoadCaseIndex;
  }

  const warnings = [
    "Plane-stress von Mises stress assumes zero axial load and elastic material behavior.",
    "The comparison does not include stress concentrations, fatigue, or dynamic amplification.",
  ];
  if (minimumSafetyFactor < 1) {
    warnings.push("At least one load case exceeds the tensile yield strength by the von Mises rule.");
  }

  const quantities: Quantity[] = [
    {
      key: "governingSectionIndex",
      label: "Governing section index",
      value: governingSectionIndex,
      unit: "",
      description: "One-based index of the section with the lowest yield safety factor.",
    },
    {
      key: "governingLoadCaseIndex",
      label: "Governing load case index",
      value: governingLoadCaseIndex,
      unit: "",
      description: "One-based index of the load case that governs the comparison.",
    },
    {
      key: "governingVonMisesStress",
      label: "Governing von Mises stress",
      value: governingVonMises,
      unit: "Pa",
      description: "Highest von Mises equivalent stress among the evaluated section and load case pairs.",
    },
    {
      key: "evaluatedCombinations",
      label: "Evaluated combinations",
      value: rows.length,
      unit: "",
      description: "Count of section and load case pairs in the report.",
    },
  ];

  return {
    method: SHAFT_LOAD_CASES_METHOD,
    inputs: {
      sections: input.sections,
      loadCases: input.loadCases,
      yieldStrength: input.yieldStrength,
    },
    quantities,
    safetyFactor: {
      key: "minimumYieldSafetyFactor",
      label: "Minimum yield safety factor",
      value: minimumSafetyFactor,
      unit: "",
      description: "Tensile yield strength divided by the governing von Mises stress.",
    },
    rows,
    referenceIds: SHAFT_LOAD_CASES_METHOD.referenceIds,
    warnings,
    meta: {
      governingSection: input.sections[governingSectionIndex - 1]?.name ?? "",
      governingLoadCase: input.loadCases[governingLoadCaseIndex - 1]?.name ?? "",
      governingCriterion,
    },
  };
}

function validateInput(input: ShaftLoadCasesInput): void {
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    throw new Error("Provide at least one shaft section.");
  }
  if (input.sections.length > 20) {
    throw new Error("Provide no more than 20 shaft sections.");
  }
  if (!Array.isArray(input.loadCases) || input.loadCases.length === 0) {
    throw new Error("Provide at least one load case.");
  }
  if (input.loadCases.length > 20) {
    throw new Error("Provide no more than 20 load cases.");
  }
  if (!(input.yieldStrength > 0) || !Number.isFinite(input.yieldStrength)) {
    throw new Error("yieldStrength must be a positive finite number.");
  }
  for (const [index, section] of input.sections.entries()) {
    if (typeof section.name !== "string" || section.name.trim().length === 0) {
      throw new Error(`sections[${index}].name must be a non-empty string.`);
    }
  }
  for (const [index, loadCase] of input.loadCases.entries()) {
    if (typeof loadCase.name !== "string" || loadCase.name.trim().length === 0) {
      throw new Error(`loadCases[${index}].name must be a non-empty string.`);
    }
  }
}
