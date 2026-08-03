import type { Computation, MethodRecord, Quantity } from "../types.js";

export type SurfaceFinish = "ground" | "machined" | "hot_rolled" | "as_forged";
export type LoadingMode = "bending" | "axial" | "torsion";
export type FatigueCriterion = "soderberg" | "goodman" | "gerber" | "asme_elliptic";

export type FatigueInput = {
  ultimateStrength: number;
  yieldStrength?: number;
  stressAmplitude: number;
  meanStress?: number;
  enduranceLimit?: number;
  surfaceFinish?: SurfaceFinish;
  surfaceFactor?: number;
  loading?: LoadingMode;
  loadFactor?: number;
  sizeFactor?: number;
  temperatureFactor?: number;
  reliabilityFactor?: number;
  miscellaneousFactor?: number;
  criterion?: FatigueCriterion;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Fatigue analysis for fluctuating stress",
  formula:
    "Se' = 0.5 Sut (max 700 MPa). Se = ka kb kc kd ke kf Se'. Soderberg: 1/n = sa/Se + sm/Sy. Goodman: 1/n = sa/Se + sm/Sut. Gerber: n.sa/Se + (n.sm/Sut)^2 = 1. ASME-elliptic: (n.sa/Se)^2 + (n.sm/Sy)^2 = 1. S-N: Sf = a N^b, a = (0.9 Sut)^2/Se, b = -log10(0.9 Sut/Se)/3",
  notes:
    "The base endurance limit is 0.5 x ultimate strength for steel, capped at 700 MPa. The corrected endurance limit applies the Marin surface, size, load, temperature, reliability, and miscellaneous factors. The fitted S-N curve passes through 0.9 x Sut at 10^3 cycles and the endurance limit at 10^6 cycles. Confirm critical designs with test data.",
  referenceIds: ["shigley-2015", "machinery-handbook"],
};

export const ESTIMATED_ENDURANCE_FRACTION = 0.5;
const ENDURANCE_CAP_PA = 700e6;
const S_N_STRENGTH_AT_1E3_FRACTION = 0.9;
const LOW_CYCLE_LIMIT = 1e3;
const INFINITE_LIFE_LIMIT = 1e6;

const SURFACE_FINISH_FACTORS: Record<SurfaceFinish, { a: number; b: number }> = {
  ground: { a: 1.58, b: -0.085 },
  machined: { a: 4.51, b: -0.265 },
  hot_rolled: { a: 57.7, b: -0.718 },
  as_forged: { a: 272, b: -0.995 },
};

const LOADING_FACTORS: Record<LoadingMode, number> = {
  bending: 1,
  axial: 0.85,
  torsion: 0.59,
};

const FACTOR_LABELS: Record<FatigueCriterion, string> = {
  soderberg: "Soderberg safety factor",
  goodman: "Goodman safety factor",
  gerber: "Gerber safety factor",
  asme_elliptic: "ASME-elliptic safety factor",
};

const FACTOR_DESCRIPTIONS: Record<FatigueCriterion, string> = {
  soderberg: "Safety factor on the Soderberg line from Se to Sy.",
  goodman: "Safety factor on the modified Goodman line from Se to Sut.",
  gerber: "Safety factor on the Gerber parabola through Se and Sut.",
  asme_elliptic: "Safety factor on the ASME-elliptic curve through Se and Sy.",
};

const CRITERIA: FatigueCriterion[] = ["soderberg", "goodman", "gerber", "asme_elliptic"];
const YIELD_CRITERIA: FatigueCriterion[] = ["soderberg", "asme_elliptic"];

export function surfaceFinishFactor(finish: SurfaceFinish, ultimateStrength: number): number {
  const sutMpa = ultimateStrength / 1e6;
  const { a, b } = SURFACE_FINISH_FACTORS[finish];
  return a * sutMpa ** b;
}

export function estimateBaseEnduranceLimit(ultimateStrength: number): number {
  return Math.min(ESTIMATED_ENDURANCE_FRACTION * ultimateStrength, ENDURANCE_CAP_PA);
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
    case "soderberg":
      if (!yieldStrength) {
        throw new Error("The Soderberg criterion requires yieldStrength.");
      }
      return 1 / (stressAmplitude / enduranceLimit + meanStress / yieldStrength);
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
    case "asme_elliptic":
      if (!yieldStrength) {
        throw new Error("The ASME-elliptic criterion requires yieldStrength.");
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
        throw new Error("The Soderberg criterion requires yieldStrength.");
      }
      return stressAmplitude / (1 - meanStress / yieldStrength);
    case "asme_elliptic":
      if (!yieldStrength) {
        throw new Error("The ASME-elliptic criterion requires yieldStrength.");
      }
      return stressAmplitude / Math.sqrt(1 - (meanStress / yieldStrength) ** 2);
  }
}

export function finiteLifeCycles(stressAmplitude: number, enduranceLimit: number, ultimateStrength: number): number {
  if (stressAmplitude <= enduranceLimit) {
    return INFINITE_LIFE_LIMIT;
  }
  const intercept = (S_N_STRENGTH_AT_1E3_FRACTION * ultimateStrength) ** 2 / enduranceLimit;
  const exponent = -(1 / 3) * Math.log10((S_N_STRENGTH_AT_1E3_FRACTION * ultimateStrength) / enduranceLimit);
  const life = (stressAmplitude / intercept) ** (1 / exponent);
  return Math.min(Math.max(life, LOW_CYCLE_LIMIT), INFINITE_LIFE_LIMIT);
}

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
  if (!(input.stressAmplitude >= 0)) {
    throw new Error("stressAmplitude must be zero or positive.");
  }

  const warnings: string[] = [];
  let meanStress = input.meanStress ?? 0;
  if (input.stressAmplitude === 0 && meanStress <= 0) {
    throw new Error("Provide a positive stressAmplitude or meanStress.");
  }
  if (meanStress < 0) {
    warnings.push("Compressive mean stress is treated as zero. This follows the conservative convention.");
    meanStress = 0;
  }

  const criterion = input.criterion ?? "goodman";
  if (YIELD_CRITERIA.includes(criterion) && !input.yieldStrength) {
    throw new Error(`The ${FACTOR_LABELS[criterion]} criterion requires yieldStrength.`);
  }
  if (input.yieldStrength && !(input.yieldStrength > 0)) {
    throw new Error("yieldStrength must be positive.");
  }
  if (meanStress >= input.ultimateStrength) {
    throw new Error("meanStress must stay below ultimateStrength.");
  }
  if (input.yieldStrength && meanStress >= input.yieldStrength) {
    throw new Error("meanStress must stay below yieldStrength.");
  }

  const baseEnduranceLimit =
    input.enduranceLimit !== undefined ? input.enduranceLimit : estimateBaseEnduranceLimit(input.ultimateStrength);
  if (!(baseEnduranceLimit > 0)) {
    throw new Error("enduranceLimit must be positive.");
  }

  const surfaceFactor = input.surfaceFactor ?? (input.surfaceFinish ? surfaceFinishFactor(input.surfaceFinish, input.ultimateStrength) : 1);
  const loadFactor = input.loadFactor ?? (input.loading ? LOADING_FACTORS[input.loading] : 1);
  const sizeFactor = input.sizeFactor ?? 1;
  const temperatureFactor = input.temperatureFactor ?? 1;
  const reliabilityFactor = input.reliabilityFactor ?? 1;
  const miscellaneousFactor = input.miscellaneousFactor ?? 1;

  for (const [name, value] of [
    ["surfaceFactor", surfaceFactor],
    ["loadFactor", loadFactor],
    ["sizeFactor", sizeFactor],
    ["temperatureFactor", temperatureFactor],
    ["reliabilityFactor", reliabilityFactor],
    ["miscellaneousFactor", miscellaneousFactor],
  ] as const) {
    if (!(value > 0)) {
      throw new Error(`${name} must be positive.`);
    }
  }

  const correctionFactor = surfaceFactor * loadFactor * sizeFactor * temperatureFactor * reliabilityFactor * miscellaneousFactor;
  const correctedEnduranceLimit = baseEnduranceLimit * correctionFactor;

  const computable = input.yieldStrength ? CRITERIA : CRITERIA.filter((c) => !YIELD_CRITERIA.includes(c));
  const factors = new Map<FatigueCriterion, number>();
  for (const criterionName of computable) {
    factors.set(
      criterionName,
      fatigueSafetyFactor(
        criterionName,
        input.stressAmplitude,
        meanStress,
        correctedEnduranceLimit,
        input.ultimateStrength,
        input.yieldStrength,
      ),
    );
  }

  const equivalent = equivalentAmplitude(
    criterion,
    input.stressAmplitude,
    meanStress,
    input.ultimateStrength,
    input.yieldStrength,
  );
  const life = finiteLifeCycles(equivalent, correctedEnduranceLimit, input.ultimateStrength);
  const peakStress = meanStress + input.stressAmplitude;
  const stressRatio = meanStress + input.stressAmplitude === 0 ? 0 : (meanStress - input.stressAmplitude) / (meanStress + input.stressAmplitude);

  if (input.enduranceLimit === undefined) {
    warnings.push(
      "The base endurance limit is estimated as 0.5 x ultimate strength for steel. Apply the Marin factors or a tested value for a precise result.",
    );
  }
  if (input.yieldStrength && peakStress > input.yieldStrength) {
    warnings.push("The peak stress exceeds the yield strength. Yielding occurs before fatigue failure.");
  }
  for (const criterionName of computable) {
    if ((factors.get(criterionName) as number) < 1) {
      warnings.push(`The ${FACTOR_LABELS[criterionName]} is below 1. Fatigue failure is predicted.`);
    }
  }
  if (life < LOW_CYCLE_LIMIT) {
    warnings.push("The predicted life is below 10^3 cycles. This lies outside the fitted S-N range.");
  }

  const quantities: Quantity[] = [
    {
      key: "baseEnduranceLimit",
      label: "Base endurance limit",
      value: baseEnduranceLimit,
      unit: "Pa",
      description:
        input.enduranceLimit !== undefined
          ? "The rotating-beam endurance limit supplied to the analysis."
          : "Estimated as 0.5 x ultimate strength for steel. The value applies before any Marin factors.",
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
      key: "stressRatio",
      label: "Stress ratio",
      value: stressRatio,
      unit: "",
      description: "Ratio R of the minimum stress to the maximum stress. A fully reversed load gives -1.",
    },
    {
      key: "peakStress",
      label: "Peak stress",
      value: peakStress,
      unit: "Pa",
      description: "Maximum stress of the cycle, equal to the mean stress plus the amplitude.",
    },
    {
      key: "fatigueStrengthAt1000Cycles",
      label: "Fatigue strength at 10^3 cycles",
      value: S_N_STRENGTH_AT_1E3_FRACTION * input.ultimateStrength,
      unit: "Pa",
      description: "S-N curve strength at the low-cycle knee, estimated as 0.9 x ultimate strength.",
    },
    {
      key: "equivalentAmplitude",
      label: "Equivalent fully reversed amplitude",
      value: equivalent,
      unit: "Pa",
      description: "Fully reversed stress amplitude with the same fatigue damage as the real cycle.",
    },
    {
      key: "fatigueLifeCycles",
      label: "Predicted fatigue life",
      value: life,
      unit: "cycles",
      description:
        equivalent <= correctedEnduranceLimit
          ? "The equivalent amplitude is at or below the corrected endurance limit. The design has infinite life."
          : "Predicted cycles to failure from the fitted S-N curve for the equivalent amplitude.",
    },
    ...computable.map((criterionName) => factorQuantity(criterionName, factors.get(criterionName) as number)),
  ];

  return {
    method: FATIGUE_METHOD,
    inputs: {
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      stressAmplitude: input.stressAmplitude,
      meanStress,
      criterion,
      baseEnduranceLimit,
      surfaceFactor,
      loadFactor,
      sizeFactor,
      temperatureFactor,
      reliabilityFactor,
      miscellaneousFactor,
      correctedEnduranceLimit,
      equivalentAmplitude: equivalent,
      peakStress,
    },
    quantities,
    safetyFactor: factorQuantity(criterion, factors.get(criterion) as number),
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
