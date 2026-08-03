import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueCriterion = "soderberg" | "goodman" | "gerber" | "asme";

export type FatigueInput = {
  meanStress: number;
  alternatingStress: number;
  ultimateStrength: number;
  yieldStrength: number;
  enduranceLimit?: number;
  criterion?: FatigueCriterion | "all";
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Fatigue failure criteria for fluctuating stress",
  formula:
    "Soderberg: sa/Se + sm/Sy = 1/n. Goodman: sa/Se + sm/Sut = 1/n. Gerber: n.sa/Se + (n.sm/Sut)^2 = 1. ASME-elliptic: (n.sa/Se)^2 + (n.sm/Sy)^2 = 1",
  notes:
    "Each criterion returns the safety factor for a mean stress and an alternating stress. Soderberg is the most conservative line for ductile materials. Without an endurance limit, the tool estimates it as 0.5 x ultimate strength for steel. Use modifying factors for a precise value.",
  referenceIds: ["shigley-2015"],
};

export const ESTIMATED_ENDURANCE_FRACTION = 0.5;

const FACTOR_LABELS: Record<FatigueCriterion, string> = {
  soderberg: "Soderberg safety factor",
  goodman: "Goodman safety factor",
  gerber: "Gerber safety factor",
  asme: "ASME-elliptic safety factor",
};

const FACTOR_DESCRIPTIONS: Record<FatigueCriterion, string> = {
  soderberg: "Factor for the Soderberg line from Se to Sy. It is the most conservative criterion.",
  goodman: "Factor for the modified Goodman line from Se to Sut.",
  gerber: "Factor for the Gerber parabola through Se and Sut.",
  asme: "Factor for the ASME-elliptic curve through Se and Sy.",
};

export function fatigueSafetyFactor(
  criterion: FatigueCriterion,
  alternatingStress: number,
  meanStress: number,
  enduranceLimit: number,
  ultimateStrength: number,
  yieldStrength: number,
): number {
  switch (criterion) {
    case "soderberg":
      return 1 / (alternatingStress / enduranceLimit + meanStress / yieldStrength);
    case "goodman":
      return 1 / (alternatingStress / enduranceLimit + meanStress / ultimateStrength);
    case "gerber": {
      const a = (meanStress / ultimateStrength) ** 2;
      const b = alternatingStress / enduranceLimit;
      if (a === 0) {
        return 1 / b;
      }
      return (-b + Math.sqrt(b ** 2 + 4 * a)) / (2 * a);
    }
    case "asme":
      return 1 / Math.sqrt((alternatingStress / enduranceLimit) ** 2 + (meanStress / yieldStrength) ** 2);
  }
}

const CRITERIA: FatigueCriterion[] = ["soderberg", "goodman", "gerber", "asme"];

function factorQuantity(criterion: FatigueCriterion, value: number): Quantity {
  return {
    key: `${criterion}Factor`,
    label: FACTOR_LABELS[criterion],
    value,
    unit: "",
    description: FACTOR_DESCRIPTIONS[criterion],
  };
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (!(input.yieldStrength > 0)) {
    throw new Error("yieldStrength must be positive.");
  }
  if (!(input.meanStress >= 0)) {
    throw new Error("meanStress must be zero or positive.");
  }
  if (!(input.alternatingStress >= 0)) {
    throw new Error("alternatingStress must be zero or positive.");
  }
  if (input.meanStress === 0 && input.alternatingStress === 0) {
    throw new Error("Provide a positive meanStress or alternatingStress.");
  }
  if (input.enduranceLimit !== undefined && !(input.enduranceLimit > 0)) {
    throw new Error("enduranceLimit must be positive.");
  }

  const { meanStress, alternatingStress, ultimateStrength, yieldStrength } = input;
  const warnings: string[] = [];

  const enduranceLimit = input.enduranceLimit ?? ESTIMATED_ENDURANCE_FRACTION * ultimateStrength;
  if (input.enduranceLimit === undefined) {
    warnings.push(
      "The endurance limit is estimated as 0.5 x ultimate strength. Apply surface, size, load, temperature, and reliability factors for a precise value.",
    );
  }

  const factors: Record<FatigueCriterion, number> = {
    soderberg: fatigueSafetyFactor("soderberg", alternatingStress, meanStress, enduranceLimit, ultimateStrength, yieldStrength),
    goodman: fatigueSafetyFactor("goodman", alternatingStress, meanStress, enduranceLimit, ultimateStrength, yieldStrength),
    gerber: fatigueSafetyFactor("gerber", alternatingStress, meanStress, enduranceLimit, ultimateStrength, yieldStrength),
    asme: fatigueSafetyFactor("asme", alternatingStress, meanStress, enduranceLimit, ultimateStrength, yieldStrength),
  };

  const stressRatio = (meanStress - alternatingStress) / (meanStress + alternatingStress);

  const quantities: Quantity[] = [
    {
      key: "meanStress",
      label: "Mean stress",
      value: meanStress,
      unit: "Pa",
      description: "Steady component of the fluctuating stress.",
    },
    {
      key: "alternatingStress",
      label: "Alternating stress",
      value: alternatingStress,
      unit: "Pa",
      description: "Amplitude of the fluctuating stress about the mean.",
    },
    {
      key: "stressRatio",
      label: "Stress ratio",
      value: stressRatio,
      unit: "",
      description: "Ratio R of the minimum stress to the maximum stress. A fully reversed load gives -1.",
    },
    {
      key: "enduranceLimit",
      label: "Endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description: "Completely reversed stress amplitude for indefinite life at the selected material state.",
    },
    ...CRITERIA.map((criterion) => factorQuantity(criterion, factors[criterion])),
  ];

  const selected = input.criterion ?? "all";
  const headline: FatigueCriterion = selected === "all" ? "soderberg" : selected;

  const lowest = Math.min(...CRITERIA.map((criterion) => factors[criterion]));
  if (lowest < 1) {
    warnings.push("The lowest fatigue safety factor is below 1. The design may fail in fatigue.");
  }

  return {
    method: FATIGUE_METHOD,
    inputs: {
      meanStress,
      alternatingStress,
      ultimateStrength,
      yieldStrength,
      enduranceLimit,
      criterion: selected,
      stressRatio,
    },
    quantities,
    safetyFactor: factorQuantity(headline, factors[headline]),
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
