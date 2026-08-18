import type { Computation, MethodRecord, Quantity } from "../types.js";

export type SurfaceFinish = "ground" | "machined" | "cold_drawn" | "hot_rolled" | "as_forged";

export type FatigueCriterion = "modified_goodman" | "soderberg" | "gerber" | "asme_elliptic";

export type EnduranceLimitInput = {
  ultimateStrength: number;
  enduranceLimit?: number;
  surfaceFinish?: SurfaceFinish;
  sizeFactor?: number;
  loadFactor?: number;
  temperatureFactor?: number;
  reliabilityFactor?: number;
  reliability?: number;
  miscellaneousFactor?: number;
};

export type FatigueInput = EnduranceLimitInput & {
  yieldStrength?: number;
  meanStress: number;
  alternatingStress: number;
  criterion?: FatigueCriterion;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Fatigue analysis by endurance limit and mean-stress criterion",
  formula:
    "Se' = 0.5 Sut for steel, Se = ka kb kc kd ke kf Se', 1/n = sigma_a/Se + sigma_m/Sut",
  notes:
    "The endurance limit follows the modified Marin method for steel. The safety factor follows the selected mean-stress fatigue criterion. The tool warns when the static yield check governs.",
  referenceIds: ["shigley-2015"],
};

const SURFACE_COEFFICIENTS: Record<SurfaceFinish, { a: number; b: number }> = {
  ground: { a: 1.58, b: -0.085 },
  machined: { a: 4.51, b: -0.265 },
  cold_drawn: { a: 4.51, b: -0.265 },
  hot_rolled: { a: 57.7, b: -0.718 },
  as_forged: { a: 272, b: -0.995 },
};

const RELIABILITY_FACTORS: Array<{ reliability: number; factor: number }> = [
  { reliability: 50, factor: 1 },
  { reliability: 90, factor: 0.897 },
  { reliability: 95, factor: 0.868 },
  { reliability: 99, factor: 0.814 },
  { reliability: 99.9, factor: 0.753 },
  { reliability: 99.99, factor: 0.702 },
];

const UNLIMITED_ENDURANCE_SUT = 1400e6;
const UNLIMITED_ENDURANCE_LIMIT = 700e6;

export function surfaceFactor(finish: SurfaceFinish, ultimateStrengthPa: number): number {
  if (!(ultimateStrengthPa > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  const { a, b } = SURFACE_COEFFICIENTS[finish];
  return a * (ultimateStrengthPa / 1e6) ** b;
}

export function reliabilityFactor(reliability: number): number {
  if (reliability < 50 || reliability > 99.99) {
    throw new Error("reliability must be between 50 and 99.99 percent.");
  }
  const first = RELIABILITY_FACTORS[0];
  const last = RELIABILITY_FACTORS[RELIABILITY_FACTORS.length - 1];
  if (!first || !last) {
    return 1;
  }
  let lower = first;
  let upper = last;
  for (const entry of RELIABILITY_FACTORS) {
    if (entry.reliability <= reliability) {
      lower = entry;
    }
    if (entry.reliability >= reliability) {
      upper = entry;
      break;
    }
  }
  if (lower === upper) {
    return lower.factor;
  }
  const t = (reliability - lower.reliability) / (upper.reliability - lower.reliability);
  return lower.factor + t * (upper.factor - lower.factor);
}

export function enduranceLimit(input: EnduranceLimitInput): number {
  if (input.enduranceLimit !== undefined) {
    if (!(input.enduranceLimit > 0)) {
      throw new Error("enduranceLimit must be positive.");
    }
    return input.enduranceLimit;
  }
  const sut = input.ultimateStrength;
  if (!(sut > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  const testLimit = sut <= UNLIMITED_ENDURANCE_SUT ? 0.5 * sut : UNLIMITED_ENDURANCE_LIMIT;
  const finish = input.surfaceFinish ?? "machined";
  const kb = input.sizeFactor ?? 1;
  const kc = input.loadFactor ?? 1;
  const kd = input.temperatureFactor ?? 1;
  const ke =
    input.reliabilityFactor !== undefined
      ? input.reliabilityFactor
      : input.reliability !== undefined
        ? reliabilityFactor(input.reliability)
        : 1;
  const kf = input.miscellaneousFactor ?? 1;
  return testLimit * surfaceFactor(finish, sut) * kb * kc * kd * ke * kf;
}

function criterionSafetyFactor(input: FatigueInput, se: number): number {
  const sa = input.alternatingStress;
  const sm = input.meanStress;
  const sut = input.ultimateStrength;
  const criterion = input.criterion ?? "modified_goodman";

  switch (criterion) {
    case "modified_goodman":
      if (sm >= sut) {
        throw new Error(
          "The mean stress reaches the ultimate strength. The modified Goodman criterion has no positive safety factor.",
        );
      }
      return 1 / (sa / se + sm / sut);
    case "soderberg": {
      const sy = input.yieldStrength;
      if (sy === undefined) {
        throw new Error("The soderberg criterion requires yieldStrength.");
      }
      if (sm >= sy) {
        throw new Error("The mean stress reaches the yield strength. The soderberg criterion has no positive safety factor.");
      }
      return 1 / (sa / se + sm / sy);
    }
    case "gerber": {
      const a = sm / sut;
      const b = sa / se;
      if (a === 0) {
        return b === 0 ? Infinity : 1 / b;
      }
      return (-b + Math.sqrt(b * b + 4 * a * a)) / (2 * a * a);
    }
    case "asme_elliptic": {
      const sy = input.yieldStrength;
      if (sy === undefined) {
        throw new Error("The asme_elliptic criterion requires yieldStrength.");
      }
      const denominator = Math.sqrt((sa / se) ** 2 + (sm / sy) ** 2);
      return denominator === 0 ? Infinity : 1 / denominator;
    }
  }
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (!(input.meanStress >= 0)) {
    throw new Error("meanStress must be zero or positive.");
  }
  if (!(input.alternatingStress >= 0)) {
    throw new Error("alternatingStress must be zero or positive.");
  }
  if (input.meanStress === 0 && input.alternatingStress === 0) {
    throw new Error("meanStress and alternatingStress cannot both be zero.");
  }

  const criterion = input.criterion ?? "modified_goodman";
  const se = enduranceLimit(input);
  const factor = criterionSafetyFactor(input, se);

  const warnings: string[] = [];
  if (input.enduranceLimit !== undefined) {
    const corrections =
      input.surfaceFinish !== undefined ||
      input.sizeFactor !== undefined ||
      input.loadFactor !== undefined ||
      input.temperatureFactor !== undefined ||
      input.reliabilityFactor !== undefined ||
      input.reliability !== undefined ||
      input.miscellaneousFactor !== undefined;
    if (corrections) {
      warnings.push("enduranceLimit overrides the Marin estimate. The surface and reliability corrections are ignored.");
    }
  }

  const maxStress = input.alternatingStress + input.meanStress;
  let staticYieldSafetyFactor: number | undefined;
  if (input.yieldStrength !== undefined && maxStress > 0) {
    staticYieldSafetyFactor = input.yieldStrength / maxStress;
    if (staticYieldSafetyFactor < factor) {
      warnings.push(
        "The static yield check governs the design. The maximum combined stress reaches yield before the fatigue criterion. Use the soderberg or asme_elliptic criterion, or increase the section.",
      );
    }
  }

  const endurable = Number.isFinite(factor) && factor > 1;
  if (!endurable && factor > 0) {
    warnings.push("The fatigue safety factor is below 1. The part does not meet the infinite-life requirement.");
  }

  const quantityEndurance: Quantity = {
    key: "enduranceLimit",
    label: "Endurance limit",
    value: se,
    unit: "Pa",
    description:
      input.enduranceLimit !== undefined
        ? "Fully corrected endurance limit Se provided by the caller."
        : "Fully corrected endurance limit Se from the modified Marin method for steel.",
  };
  const quantityStatic: Quantity | undefined =
    staticYieldSafetyFactor !== undefined
      ? {
          key: "staticYieldSafetyFactor",
          label: "Static yield safety factor",
          value: staticYieldSafetyFactor,
          unit: "",
          description: "Yield strength divided by the maximum combined stress.",
        }
      : undefined;

  const quantities: Quantity[] = [quantityEndurance];
  if (quantityStatic) {
    quantities.push(quantityStatic);
  }

  return {
    method: FATIGUE_METHOD,
    inputs: {
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      meanStress: input.meanStress,
      alternatingStress: input.alternatingStress,
      criterion,
      enduranceLimit: input.enduranceLimit,
      surfaceFinish: input.surfaceFinish,
      sizeFactor: input.sizeFactor,
      loadFactor: input.loadFactor,
      temperatureFactor: input.temperatureFactor,
      reliabilityFactor: input.reliabilityFactor,
      reliability: input.reliability,
      miscellaneousFactor: input.miscellaneousFactor,
    },
    quantities,
    safetyFactor: {
      key: "fatigueSafetyFactor",
      label: "Fatigue safety factor",
      value: factor,
      unit: "",
      description: `Safety factor for the ${criterion.replaceAll("_", " ")} mean-stress criterion.`,
    },
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
