import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueCriterion = "soderberg" | "goodman" | "gerber" | "asme_elliptic";

export type FatigueInput = {
  meanStress: number;
  amplitudeStress: number;
  ultimateStrength: number;
  yieldStrength?: number;
  enduranceLimit?: number;
  criterion?: FatigueCriterion | "all";
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Constant-amplitude fatigue criteria",
  formula:
    "Soderberg: Sa/Se + Sm/Sy = 1/n. Goodman: Sa/Se + Sm/Sut = 1/n. Gerber: n Sa/Se + (n Sm/Sut)^2 = 1. ASME-elliptic: (n Sa/Se)^2 + (n Sm/Sy)^2 = 1",
  notes:
    "Criteria for fluctuating axial or bending loads. The endurance limit Se describes a polished test specimen. Apply surface, size, and loading factors for real parts. A negative mean stress is compressive and may make the criteria optimistic.",
  referenceIds: ["shigley-2015"],
};

const CRITERION_NAMES: Record<FatigueCriterion, string> = {
  soderberg: "Soderberg",
  goodman: "Modified Goodman",
  gerber: "Gerber",
  asme_elliptic: "ASME-elliptic",
};

const CRITERION_ORDER: FatigueCriterion[] = ["soderberg", "goodman", "gerber", "asme_elliptic"];

const ENDURANCE_LIMIT_CAP_PA = 700e6;

function needsYieldStrength(criterion: FatigueCriterion): boolean {
  return criterion === "soderberg" || criterion === "asme_elliptic";
}

export function estimateEnduranceLimit(ultimateStrength: number): number {
  return Math.min(0.5 * ultimateStrength, ENDURANCE_LIMIT_CAP_PA);
}

export function criterionSafetyFactor(
  criterion: FatigueCriterion,
  amplitudeStress: number,
  meanStress: number,
  enduranceLimit: number,
  ultimateStrength: number,
  yieldStrength: number,
): number | undefined {
  const amplitudeRatio = amplitudeStress / enduranceLimit;
  const meanUltimateRatio = meanStress / ultimateStrength;
  switch (criterion) {
    case "soderberg":
      return 1 / (amplitudeRatio + meanStress / yieldStrength);
    case "goodman":
      return 1 / (amplitudeRatio + meanUltimateRatio);
    case "gerber": {
      if (meanUltimateRatio === 0) {
        return amplitudeRatio === 0 ? undefined : 1 / amplitudeRatio;
      }
      return (-amplitudeRatio + Math.sqrt(amplitudeRatio ** 2 + 4 * meanUltimateRatio ** 2)) / (2 * meanUltimateRatio ** 2);
    }
    case "asme_elliptic":
      return 1 / Math.sqrt(amplitudeRatio ** 2 + (meanStress / yieldStrength) ** 2);
  }
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (!(input.amplitudeStress >= 0)) {
    throw new Error("amplitudeStress must be zero or positive.");
  }
  if (input.meanStress === 0 && input.amplitudeStress === 0) {
    throw new Error("Provide a nonzero meanStress or amplitudeStress.");
  }
  if (input.enduranceLimit !== undefined && !(input.enduranceLimit > 0)) {
    throw new Error("enduranceLimit must be positive.");
  }
  if (input.yieldStrength !== undefined && !(input.yieldStrength > 0)) {
    throw new Error("yieldStrength must be positive.");
  }

  const enduranceLimit = input.enduranceLimit ?? estimateEnduranceLimit(input.ultimateStrength);
  const criteria: FatigueCriterion[] =
    input.criterion === undefined || input.criterion === "all" ? [...CRITERION_ORDER] : [input.criterion];

  if (input.criterion !== undefined && input.criterion !== "all" && needsYieldStrength(input.criterion) && input.yieldStrength === undefined) {
    throw new Error(`The ${CRITERION_NAMES[input.criterion]} criterion requires yieldStrength.`);
  }

  const warnings: string[] = [];
  if (input.enduranceLimit === undefined) {
    warnings.push("Endurance limit estimated as half the ultimate strength, capped at 700 MPa.");
  }
  if (input.meanStress < 0) {
    warnings.push("Mean stress is compressive. The criteria may overestimate the fatigue life. Use a zero mean stress for a conservative estimate.");
  }
  if (input.amplitudeStress === 0) {
    warnings.push("The alternating stress is zero. Treat the load as static; fatigue does not govern.");
  }

  const factors = new Map<FatigueCriterion, number>();
  for (const criterion of criteria) {
    if (needsYieldStrength(criterion) && input.yieldStrength === undefined) {
      warnings.push(`The ${CRITERION_NAMES[criterion]} criterion is skipped. Provide yieldStrength to enable it.`);
      continue;
    }
    const factor = criterionSafetyFactor(
      criterion,
      input.amplitudeStress,
      input.meanStress,
      enduranceLimit,
      input.ultimateStrength,
      input.yieldStrength ?? 0,
    );
    if (factor === undefined || factor <= 0) {
      warnings.push(`The ${CRITERION_NAMES[criterion]} criterion gives no positive factor for this load and is skipped.`);
      continue;
    }
    factors.set(criterion, factor);
  }

  if (factors.size === 0) {
    throw new Error("No fatigue criterion could be evaluated. Choose a criterion that matches the available strengths.");
  }

  let governing: FatigueCriterion = "soderberg";
  let governingFactor = Number.POSITIVE_INFINITY;
  for (const [criterion, factor] of factors) {
    if (factor < governingFactor) {
      governingFactor = factor;
      governing = criterion;
    }
  }

  const quantities: Quantity[] = [
    {
      key: "enduranceLimit",
      label: "Endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description: "Fully reversed stress at which the material survives indefinitely. Estimated when not supplied.",
    },
    {
      key: "meanStress",
      label: "Mean stress",
      value: input.meanStress,
      unit: "Pa",
      description: "Steady component of the stress cycle. Positive values are tensile.",
    },
    {
      key: "amplitudeStress",
      label: "Alternating stress",
      value: input.amplitudeStress,
      unit: "Pa",
      description: "Reversing component of the stress cycle. Zero means a steady load.",
    },
  ];

  for (const criterion of CRITERION_ORDER) {
    const factor = factors.get(criterion);
    if (factor === undefined) {
      continue;
    }
    quantities.push({
      key: `${criterion}Factor`,
      label: `${CRITERION_NAMES[criterion]} fatigue factor`,
      value: factor,
      unit: "",
      description: `Fatigue safety factor from the ${CRITERION_NAMES[criterion]} criterion.`,
    });
  }

  let firstCycleYieldFactor: number | undefined;
  if (input.yieldStrength !== undefined && input.meanStress + input.amplitudeStress > 0) {
    firstCycleYieldFactor = input.yieldStrength / (input.meanStress + input.amplitudeStress);
    quantities.push({
      key: "firstCycleYieldFactor",
      label: "First-cycle yield factor",
      value: firstCycleYieldFactor,
      unit: "",
      description: "Yield strength divided by the sum of mean and alternating stress.",
    });
  }

  if (firstCycleYieldFactor !== undefined && firstCycleYieldFactor < governingFactor) {
    warnings.push("First-cycle yielding governs over fatigue. Check the static yield against the peak stress.");
  }
  if (governingFactor < 1) {
    warnings.push("The governing fatigue factor is below 1. The part may fail under the stated cycle.");
  }

  return {
    method: FATIGUE_METHOD,
    inputs: {
      meanStress: input.meanStress,
      amplitudeStress: input.amplitudeStress,
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      enduranceLimit: input.enduranceLimit,
      criterion: input.criterion ?? "all",
      enduranceLimitUsed: enduranceLimit,
    },
    quantities,
    safetyFactor: {
      key: "governingFactor",
      label: "Governing fatigue factor",
      value: governingFactor,
      unit: "",
      description: `Minimum fatigue safety factor across the evaluated criteria. Governed by ${CRITERION_NAMES[governing]}.`,
    },
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
