import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueCriterion = "goodman" | "gerber" | "soderberg" | "asme_elliptic";

export type FatigueInput = {
  ultimateStrength: number;
  yieldStrength?: number;
  enduranceLimit?: number;
  stressAmplitude: number;
  meanStress?: number;
  surfaceFactor?: number;
  sizeFactor?: number;
  loadFactor?: number;
  temperatureFactor?: number;
  reliabilityFactor?: number;
  miscellaneousFactor?: number;
  criterion?: FatigueCriterion;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Fatigue analysis for fluctuating stress",
  formula:
    "Se' = 0.5 Sut, Se = ka kb kc kd ke kf Se', Goodman: n = 1/(sa/Se + sm/Sut), S-N: Sf = a N^b with a = (0.9 Sut)^2/Se and b = -log10(0.9 Sut/Se)/3",
  notes:
    "The base endurance limit defaults to 0.5 x ultimate strength for steel. The corrected endurance limit applies the Marin factors. The safety factor follows the chosen mean-stress criterion. Finite life uses the S-N curve for the equivalent fully reversed amplitude.",
  referenceIds: ["shigley-2015", "machinery-handbook"],
};

const LOW_CYCLE_LIMIT = 1e3;
const INFINITE_LIFE_LIMIT = 1e6;

const CRITERION_LABEL: Record<FatigueCriterion, string> = {
  goodman: "modified Goodman",
  gerber: "Gerber",
  soderberg: "Soderberg",
  asme_elliptic: "ASME-elliptic",
};

export function enduranceLimitEstimate(ultimateStrength: number): number {
  return Math.min(0.5 * ultimateStrength, 700e6);
}

export function fatigueSafetyFactor(
  criterion: FatigueCriterion,
  stressAmplitude: number,
  meanStress: number,
  enduranceLimit: number,
  ultimateStrength: number,
  yieldStrength?: number,
): number {
  switch (criterion) {
    case "goodman":
      return 1 / (stressAmplitude / enduranceLimit + meanStress / ultimateStrength);
    case "gerber": {
      const coefficient = (meanStress / ultimateStrength) ** 2;
      if (coefficient === 0) {
        return enduranceLimit / stressAmplitude;
      }
      const linear = stressAmplitude / enduranceLimit;
      return (-linear + Math.sqrt(linear ** 2 + 4 * coefficient)) / (2 * coefficient);
    }
    case "soderberg":
      if (!yieldStrength) {
        throw new Error("The soderberg criterion requires yieldStrength.");
      }
      return 1 / (stressAmplitude / enduranceLimit + meanStress / yieldStrength);
    case "asme_elliptic":
      if (!yieldStrength) {
        throw new Error("The asme_elliptic criterion requires yieldStrength.");
      }
      return 1 / Math.sqrt((stressAmplitude / enduranceLimit) ** 2 + (meanStress / yieldStrength) ** 2);
  }
}

export function equivalentAmplitude(
  criterion: FatigueCriterion,
  stressAmplitude: number,
  meanStress: number,
  ultimateStrength: number,
  yieldStrength?: number,
): number {
  switch (criterion) {
    case "goodman":
      return stressAmplitude / (1 - meanStress / ultimateStrength);
    case "gerber":
      return stressAmplitude / (1 - (meanStress / ultimateStrength) ** 2);
    case "soderberg":
      if (!yieldStrength) {
        throw new Error("The soderberg criterion requires yieldStrength.");
      }
      return stressAmplitude / (1 - meanStress / yieldStrength);
    case "asme_elliptic":
      if (!yieldStrength) {
        throw new Error("The asme_elliptic criterion requires yieldStrength.");
      }
      return stressAmplitude / Math.sqrt(1 - (meanStress / yieldStrength) ** 2);
  }
}

function snLife(stressAmplitude: number, enduranceLimit: number, ultimateStrength: number): number {
  const strengthCoefficient = (0.9 * ultimateStrength) ** 2 / enduranceLimit;
  const exponent = -Math.log10((0.9 * ultimateStrength) / enduranceLimit) / 3;
  return (stressAmplitude / strengthCoefficient) ** (1 / exponent);
}

export function finiteLifeCycles(stressAmplitude: number, enduranceLimit: number, ultimateStrength: number): number {
  if (stressAmplitude <= enduranceLimit) {
    return INFINITE_LIFE_LIMIT;
  }
  const life = snLife(stressAmplitude, enduranceLimit, ultimateStrength);
  return Math.min(Math.max(life, LOW_CYCLE_LIMIT), INFINITE_LIFE_LIMIT);
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (!(input.stressAmplitude >= 0)) {
    throw new Error("stressAmplitude must be zero or positive.");
  }
  const meanStress = input.meanStress ?? 0;
  if (input.stressAmplitude === 0 && !(meanStress > 0)) {
    throw new Error("Provide a non-zero stressAmplitude or a positive meanStress.");
  }

  const criterion = input.criterion ?? "goodman";
  if (criterion === "soderberg" || criterion === "asme_elliptic") {
    if (!input.yieldStrength) {
      throw new Error(`The ${CRITERION_LABEL[criterion]} criterion requires yieldStrength.`);
    }
    if (meanStress >= input.yieldStrength) {
      throw new Error(`meanStress must stay below the yield strength for the ${CRITERION_LABEL[criterion]} criterion.`);
    }
  } else if (meanStress >= input.ultimateStrength) {
    throw new Error("meanStress must stay below the ultimate strength for the fatigue criteria.");
  }

  const enduranceLimit = input.enduranceLimit ?? enduranceLimitEstimate(input.ultimateStrength);
  if (!(enduranceLimit > 0)) {
    throw new Error("enduranceLimit must be positive.");
  }
  if (enduranceLimit >= 0.9 * input.ultimateStrength) {
    throw new Error("enduranceLimit must stay below 0.9 times the ultimate strength.");
  }

  const factors = {
    surfaceFactor: input.surfaceFactor ?? 1,
    sizeFactor: input.sizeFactor ?? 1,
    loadFactor: input.loadFactor ?? 1,
    temperatureFactor: input.temperatureFactor ?? 1,
    reliabilityFactor: input.reliabilityFactor ?? 1,
    miscellaneousFactor: input.miscellaneousFactor ?? 1,
  };
  for (const [name, value] of Object.entries(factors)) {
    if (!(value > 0)) {
      throw new Error(`${name} must be positive.`);
    }
  }
  const correctionFactor = Object.values(factors).reduce((product, value) => product * value, 1);
  const correctedEnduranceLimit = enduranceLimit * correctionFactor;

  const safetyFactor = fatigueSafetyFactor(
    criterion,
    input.stressAmplitude,
    meanStress,
    correctedEnduranceLimit,
    input.ultimateStrength,
    input.yieldStrength,
  );

  const equivalent = equivalentAmplitude(
    criterion,
    input.stressAmplitude,
    meanStress,
    input.ultimateStrength,
    input.yieldStrength,
  );
  const rawLife =
    equivalent <= correctedEnduranceLimit
      ? INFINITE_LIFE_LIMIT
      : snLife(equivalent, correctedEnduranceLimit, input.ultimateStrength);
  const life = Math.min(Math.max(rawLife, LOW_CYCLE_LIMIT), INFINITE_LIFE_LIMIT);

  const warnings: string[] = [];
  if (input.enduranceLimit === undefined) {
    warnings.push(
      "The endurance limit is estimated as 0.5 x ultimate strength for steel. Use a tested value for the final design.",
    );
  }
  if (rawLife < LOW_CYCLE_LIMIT) {
    warnings.push("The predicted life falls below 10^3 cycles. Check static yield before relying on the S-N estimate.");
  }

  const quantities: Quantity[] = [
    {
      key: "baseEnduranceLimit",
      label: "Base endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description:
        input.enduranceLimit === undefined
          ? "Estimated as 0.5 x ultimate strength. The steel rule applies before any correction factors."
          : "Endurance limit supplied for the material condition.",
    },
    {
      key: "enduranceCorrectionFactor",
      label: "Endurance correction factor",
      value: correctionFactor,
      unit: "",
      description: "Product of the surface, size, load, temperature, reliability, and miscellaneous factors.",
    },
    {
      key: "correctedEnduranceLimit",
      label: "Corrected endurance limit",
      value: correctedEnduranceLimit,
      unit: "Pa",
      description: "Base endurance limit multiplied by the correction factor.",
    },
    {
      key: "fatigueStrengthAt1000Cycles",
      label: "Fatigue strength at 10^3 cycles",
      value: 0.9 * input.ultimateStrength,
      unit: "Pa",
      description: "S-N curve strength at the low-cycle knee, estimated as 0.9 x ultimate strength.",
    },
    {
      key: "equivalentAmplitude",
      label: "Equivalent fully reversed amplitude",
      value: equivalent,
      unit: "Pa",
      description: "Alternating stress converted by the chosen mean-stress criterion for the S-N life estimate.",
    },
    {
      key: "fatigueLifeCycles",
      label: "Predicted fatigue life",
      value: life,
      unit: "cycles",
      description:
        equivalent <= correctedEnduranceLimit
          ? "The stress amplitude is at or below the corrected endurance limit. The design has infinite life beyond 10^6 cycles."
          : "Predicted cycles to failure from the S-N curve for the equivalent fully reversed amplitude.",
    },
  ];

  return {
    method: FATIGUE_METHOD,
    inputs: {
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      enduranceLimit: input.enduranceLimit,
      stressAmplitude: input.stressAmplitude,
      meanStress,
      criterion,
      ...factors,
      correctedEnduranceLimit,
      equivalentAmplitude: equivalent,
    },
    quantities,
    safetyFactor: {
      key: "fatigueSafetyFactor",
      label: "Fatigue safety factor",
      value: safetyFactor,
      unit: "",
      description: `Safety factor from the ${CRITERION_LABEL[criterion]} mean-stress criterion.`,
    },
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
