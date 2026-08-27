import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueCriterion = "goodman" | "soderberg" | "gerber";
export type FatigueMaterial = "steel" | "aluminium" | "aluminum";

export function goodmanEquivalentAlternatingStress(
  meanStress: number,
  alternatingStress: number,
  ultimateStrength: number,
): number {
  const effectiveMean = Math.max(meanStress, 0);
  if (effectiveMean >= ultimateStrength) {
    throw new Error("meanStress must be below ultimateStrength for Goodman correction.");
  }
  return alternatingStress / (1 - effectiveMean / ultimateStrength);
}

export type FatigueInput = {
  meanStress: number;
  alternatingStress: number;
  ultimateStrength: number;
  yieldStrength?: number;
  enduranceLimit?: number;
  materialType?: FatigueMaterial;
  criterion?: FatigueCriterion;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Constant-amplitude fatigue analysis",
  formula:
    "Goodman: 1/n = sa/Se + sm/Sut. Soderberg: 1/n = sa/Se + sm/Sy. Gerber: n sa/Se + (n sm/Sut)^2 = 1",
  notes:
    "The tool evaluates a constant-amplitude cyclic normal stress against the endurance limit. Compressive mean stress is treated as zero, which is conservative. The endurance estimate is the uncorrected rotating-beam value. Apply the Marin factors for the real part.",
  referenceIds: ["shigley-2015"],
};

export function enduranceLimitEstimate(materialType: FatigueMaterial, ultimateStrength: number): number {
  if (materialType === "steel") {
    return Math.min(0.5 * ultimateStrength, 700e6);
  }
  return Math.min(0.4 * ultimateStrength, 130e6);
}

export function fatigueSafetyFactor(
  criterion: FatigueCriterion,
  meanStress: number,
  alternatingStress: number,
  enduranceLimit: number,
  ultimateStrength: number,
  yieldStrength?: number,
): number {
  const effectiveMean = Math.max(meanStress, 0);
  if (criterion === "goodman") {
    return 1 / (alternatingStress / enduranceLimit + effectiveMean / ultimateStrength);
  }
  if (criterion === "soderberg") {
    if (!yieldStrength) {
      throw new Error("The Soderberg criterion requires yieldStrength.");
    }
    return 1 / (alternatingStress / enduranceLimit + effectiveMean / yieldStrength);
  }
  const a = (effectiveMean / ultimateStrength) ** 2;
  const b = alternatingStress / enduranceLimit;
  if (a === 0) {
    return b === 0 ? Number.POSITIVE_INFINITY : 1 / b;
  }
  return (-b + Math.sqrt(b * b + 4 * a)) / (2 * a);
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!Number.isFinite(input.meanStress)) {
    throw new Error("meanStress must be a number.");
  }
  if (!(input.alternatingStress >= 0)) {
    throw new Error("alternatingStress must be zero or positive.");
  }
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (input.yieldStrength !== undefined && !(input.yieldStrength > 0)) {
    throw new Error("yieldStrength must be positive.");
  }
  if (input.enduranceLimit !== undefined && !(input.enduranceLimit > 0)) {
    throw new Error("enduranceLimit must be positive.");
  }

  const materialType = (input.materialType ?? "steel").replace("aluminum", "aluminium") as FatigueMaterial;
  const criterion = input.criterion ?? "goodman";
  const enduranceLimit = input.enduranceLimit ?? enduranceLimitEstimate(materialType, input.ultimateStrength);

  const effectiveMean = Math.max(input.meanStress, 0);
  const maxStress = input.alternatingStress + input.meanStress;
  if (maxStress === 0) {
    throw new Error("Provide a non-zero stress state.");
  }
  const minStress = input.meanStress - input.alternatingStress;
  const stressRatio = minStress / maxStress;

  const fatigueFactor = fatigueSafetyFactor(
    criterion,
    input.meanStress,
    input.alternatingStress,
    enduranceLimit,
    input.ultimateStrength,
    input.yieldStrength,
  );
  const peakTension = Math.max(maxStress, 0);
  const yieldFactor = input.yieldStrength && peakTension > 0 ? input.yieldStrength / peakTension : undefined;

  const warnings: string[] = [];
  if (input.enduranceLimit === undefined) {
    warnings.push("The endurance limit is an uncorrected estimate from the ultimate strength. Apply the Marin factors for the real surface, size, load, temperature, and reliability.");
  }
  if (input.meanStress < 0) {
    warnings.push("A compressive mean stress is treated as zero. The estimate is conservative.");
  }
  if (input.alternatingStress >= enduranceLimit) {
    warnings.push("The alternating stress reaches or exceeds the endurance limit. The part may have a finite life.");
  }
  if (fatigueFactor < 1) {
    warnings.push("The fatigue safety factor is below one. Reduce the stress or strengthen the part.");
  }
  if (yieldFactor !== undefined && yieldFactor < 1) {
    warnings.push("The peak stress exceeds the yield strength.");
  }

  const quantities: Quantity[] = [
    {
      key: "stressRatio",
      label: "Stress ratio",
      value: stressRatio,
      unit: "",
      description: "Ratio of the minimum stress to the maximum stress of the cycle.",
    },
    {
      key: "maximumStress",
      label: "Maximum cycle stress",
      value: maxStress,
      unit: "Pa",
      description: "Peak stress of the cycle, the sum of the mean and alternating components.",
    },
    {
      key: "minimumStress",
      label: "Minimum cycle stress",
      value: minStress,
      unit: "Pa",
      description: "Lowest stress of the cycle, the mean minus the alternating component.",
    },
    {
      key: "meanStress",
      label: "Mean stress",
      value: input.meanStress,
      unit: "Pa",
      description: "Steady component of the cyclic stress.",
    },
    {
      key: "alternatingStress",
      label: "Alternating stress",
      value: input.alternatingStress,
      unit: "Pa",
      description: "Amplitude of the cyclic stress about the mean.",
    },
    {
      key: "enduranceLimit",
      label: "Endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description: "Endurance limit used for the failure criterion.",
    },
    {
      key: "fatigueSafetyFactor",
      label: "Fatigue safety factor",
      value: fatigueFactor,
      unit: "",
      description: "Safety factor of the selected fatigue failure criterion.",
    },
  ];

  const safetyCandidates: Quantity[] = [];
  if (yieldFactor !== undefined) {
    safetyCandidates.push({
      key: "yieldSafetyFactor",
      label: "Yield safety factor",
      value: yieldFactor,
      unit: "",
      description: "Yield strength divided by the peak cycle stress.",
    });
  }
  const allQuantities: Quantity[] = [...quantities, ...safetyCandidates];
  const governing = [...safetyCandidates, quantities[6] as Quantity].reduce((lowest, candidate) =>
    candidate.value < lowest.value ? candidate : lowest,
  );

  return {
    method: FATIGUE_METHOD,
    inputs: {
      meanStress: input.meanStress,
      alternatingStress: input.alternatingStress,
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      enduranceLimit: input.enduranceLimit ?? undefined,
      materialType,
      criterion,
      stressRatio,
    },
    quantities: allQuantities,
    safetyFactor: governing,
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
