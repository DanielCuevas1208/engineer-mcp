import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueCriterion = "goodman" | "soderberg" | "gerber" | "asme_elliptic";

export type FatigueInput = {
  meanStress: number;
  amplitudeStress: number;
  ultimateStrength: number;
  yieldStrength?: number;
  enduranceLimit?: number;
  criterion?: FatigueCriterion;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Infinite-life fatigue analysis",
  formula:
    "R = (sm - sa)/(sm + sa); Goodman: 1/n = sa/Se + sm/Sut; Soderberg: 1/n = sa/Se + sm/Sy; Gerber: n(sa/Se) + n^2(sm/Sut)^2 = 1; ASME-elliptic: n^2((sa/Se)^2 + (sm/Sy)^2) = 1",
  notes:
    "The criteria assume a constant-amplitude cycle and an infinite life. The endurance limit Se is the fully reversed bending limit. For steel it is near half the ultimate strength below 1400 MPa. A compressive mean stress makes the Goodman criterion conservative. Check the cycle peak against yield for local yielding.",
  referenceIds: ["shigley-2015"],
};

const ENDURANCE_CAP = 700e6;

export function estimateEnduranceLimit(ultimateStrength: number): number {
  if (!(ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  return Math.min(0.5 * ultimateStrength, ENDURANCE_CAP);
}

function requirePositive(value: number, name: string): void {
  if (!(value > 0)) {
    throw new Error(`${name} must be positive.`);
  }
}

function goodmanFactor(amplitudeStress: number, meanStress: number, enduranceLimit: number, ultimateStrength: number): number {
  const denominator = amplitudeStress / enduranceLimit + meanStress / ultimateStrength;
  return denominator > 0 ? 1 / denominator : Number.POSITIVE_INFINITY;
}

function soderbergFactor(amplitudeStress: number, meanStress: number, enduranceLimit: number, yieldStrength: number): number {
  const denominator = amplitudeStress / enduranceLimit + meanStress / yieldStrength;
  return denominator > 0 ? 1 / denominator : Number.POSITIVE_INFINITY;
}

function gerberFactor(amplitudeStress: number, meanStress: number, enduranceLimit: number, ultimateStrength: number): number {
  if (meanStress === 0) {
    return enduranceLimit / amplitudeStress;
  }
  const a = meanStress / ultimateStrength;
  const b = amplitudeStress / enduranceLimit;
  const discriminant = b * b + 4 * a * a;
  return (Math.sqrt(discriminant) - b) / (2 * a * a);
}

function asmeFactor(amplitudeStress: number, meanStress: number, enduranceLimit: number, yieldStrength: number): number {
  const sum = (amplitudeStress / enduranceLimit) ** 2 + (meanStress / yieldStrength) ** 2;
  return sum > 0 ? 1 / Math.sqrt(sum) : Number.POSITIVE_INFINITY;
}

const CRITERION_LABELS: Record<FatigueCriterion, string> = {
  goodman: "Modified Goodman",
  soderberg: "Soderberg",
  gerber: "Gerber",
  asme_elliptic: "ASME-elliptic",
};

export function analyzeFatigue(input: FatigueInput): Computation {
  requirePositive(input.amplitudeStress, "amplitudeStress");
  requirePositive(input.ultimateStrength, "ultimateStrength");
  if (input.enduranceLimit !== undefined) {
    requirePositive(input.enduranceLimit, "enduranceLimit");
  }
  if (input.yieldStrength !== undefined) {
    requirePositive(input.yieldStrength, "yieldStrength");
  }

  const criterion = input.criterion ?? "goodman";
  if ((criterion === "soderberg" || criterion === "asme_elliptic") && input.yieldStrength === undefined) {
    throw new Error(`${criterion} requires yieldStrength.`);
  }

  const { meanStress, amplitudeStress, ultimateStrength } = input;
  const yieldStrength = input.yieldStrength;
  const enduranceLimit = input.enduranceLimit ?? estimateEnduranceLimit(ultimateStrength);

  const minStress = meanStress - amplitudeStress;
  const maxStress = meanStress + amplitudeStress;
  const stressRatio = maxStress !== 0 ? minStress / maxStress : Number.POSITIVE_INFINITY;

  const warnings: string[] = [];
  if (input.enduranceLimit === undefined) {
    warnings.push("The endurance limit is estimated as half the ultimate strength. Use test data for exact values.");
  }
  if (amplitudeStress > enduranceLimit) {
    warnings.push("The amplitude exceeds the endurance limit. Infinite life is unlikely at this amplitude.");
  }
  if (meanStress < 0) {
    warnings.push("The mean stress is compressive. The criteria are conservative for compressive mean stress.");
  }
  if (yieldStrength !== undefined && maxStress > yieldStrength) {
    warnings.push("The cycle peak exceeds the yield strength. Local yielding may occur at the peak of the cycle.");
  }
  if (yieldStrength !== undefined && minStress < -yieldStrength) {
    warnings.push("The cycle trough exceeds the yield strength in compression. Local yielding may occur at the trough of the cycle.");
  }

  const goodman = goodmanFactor(amplitudeStress, meanStress, enduranceLimit, ultimateStrength);
  const gerber = gerberFactor(amplitudeStress, meanStress, enduranceLimit, ultimateStrength);
  const soderberg =
    yieldStrength !== undefined ? soderbergFactor(amplitudeStress, meanStress, enduranceLimit, yieldStrength) : undefined;
  const asme = yieldStrength !== undefined ? asmeFactor(amplitudeStress, meanStress, enduranceLimit, yieldStrength) : undefined;
  const yieldFactor = yieldStrength !== undefined && maxStress > 0 ? yieldStrength / maxStress : undefined;

  const quantities: Quantity[] = [
    {
      key: "meanStress",
      label: "Mean stress",
      value: meanStress,
      unit: "Pa",
      description: "Average of the maximum and minimum cycle stress.",
    },
    {
      key: "amplitudeStress",
      label: "Stress amplitude",
      value: amplitudeStress,
      unit: "Pa",
      description: "Half of the stress range of the cycle.",
    },
    {
      key: "minStress",
      label: "Minimum cycle stress",
      value: minStress,
      unit: "Pa",
      description: "Trough of the stress cycle.",
    },
    {
      key: "maxStress",
      label: "Maximum cycle stress",
      value: maxStress,
      unit: "Pa",
      description: "Peak of the stress cycle.",
    },
    {
      key: "stressRatio",
      label: "Stress ratio R",
      value: stressRatio,
      unit: "",
      description: "Ratio of the minimum to the maximum cycle stress.",
    },
    {
      key: "enduranceLimit",
      label: "Endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description: "Fully reversed fatigue limit used by the criteria.",
    },
    {
      key: "goodmanSafetyFactor",
      label: "Modified Goodman safety factor",
      value: goodman,
      unit: "",
      description: "Fatigue safety factor on the modified Goodman line.",
    },
    {
      key: "gerberSafetyFactor",
      label: "Gerber safety factor",
      value: gerber,
      unit: "",
      description: "Fatigue safety factor on the Gerber parabola.",
    },
  ];

  if (soderberg !== undefined) {
    quantities.push({
      key: "soderbergSafetyFactor",
      label: "Soderberg safety factor",
      value: soderberg,
      unit: "",
      description: "Conservative fatigue safety factor on the Soderberg line.",
    });
  }
  if (asme !== undefined) {
    quantities.push({
      key: "asmeEllipticSafetyFactor",
      label: "ASME-elliptic safety factor",
      value: asme,
      unit: "",
      description: "Fatigue safety factor on the ASME-elliptic curve.",
    });
  }
  if (yieldFactor !== undefined) {
    quantities.push({
      key: "yieldSafetyFactor",
      label: "Yield safety factor",
      value: yieldFactor,
      unit: "",
      description: "Yield strength divided by the maximum cycle stress.",
    });
  }

  const safetyFactorByCriterion: Record<FatigueCriterion, number> = {
    goodman,
    soderberg: soderberg ?? goodman,
    gerber,
    asme_elliptic: asme ?? gerber,
  };

  return {
    method: FATIGUE_METHOD,
    inputs: {
      meanStress,
      amplitudeStress,
      ultimateStrength,
      yieldStrength,
      enduranceLimit: input.enduranceLimit,
      criterion,
    },
    quantities,
    safetyFactor: {
      key: "fatigueSafetyFactor",
      label: `${CRITERION_LABELS[criterion]} fatigue safety factor`,
      value: safetyFactorByCriterion[criterion],
      unit: "",
      description: `Fatigue safety factor for infinite life on the ${CRITERION_LABELS[criterion]} criterion.`,
    },
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
