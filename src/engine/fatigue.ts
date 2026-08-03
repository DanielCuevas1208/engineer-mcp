import type { Computation, MethodRecord, Quantity } from "../types.js";

export type SurfaceFinish = "ground" | "machined" | "hot_rolled" | "as_forged";
export type LoadingMode = "bending" | "axial" | "torsion";
export type FatigueCriterion = "goodman" | "soderberg" | "gerber";

export type FatigueInput = {
  ultimateStrength: number;
  yieldStrength?: number;
  stressAmplitude?: number;
  meanStress?: number;
  enduranceLimit?: number;
  surfaceFinish?: SurfaceFinish;
  loading?: LoadingMode;
  sizeFactor?: number;
  criterion?: FatigueCriterion;
  targetSafetyFactor?: number;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Stress-life fatigue analysis",
  formula:
    "Se = ka kb kc (0.5 Sut). Goodman: 1/n = Sa/Se + Sm/Sut. Soderberg: 1/n = Sa/Se + Sm/Sy. Gerber: 1/n = Sa/Se + (Sm/Sut)^2. Life: N = (Sar/a)^(1/b), a = (0.9 Sut)^2/Se",
  notes:
    "The endurance limit uses the Marin factors for surface finish, size, and loading on the rotating-beam endurance limit 0.5 x Sut, capped at 700 MPa for steel. The life estimate fits a power-law S-N curve through 0.9 x Sut at 10^3 cycles and the endurance limit at 10^6 cycles. Confirm critical designs with test data.",
  referenceIds: ["shigley-2015"],
};

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

const ROTATING_BEAM_CAP_PA = 700e6;
const S_N_FRACTION_F = 0.9;

export function surfaceFinishFactor(finish: SurfaceFinish, sutPa: number): number {
  const sutMpa = sutPa / 1e6;
  const { a, b } = SURFACE_FINISH_FACTORS[finish];
  return a * sutMpa ** b;
}

export function estimateEnduranceLimit(input: {
  ultimateStrength: number;
  surfaceFinish?: SurfaceFinish;
  loading?: LoadingMode;
  sizeFactor?: number;
}): { enduranceLimit: number; baseEnduranceLimit: number; ka: number; kb: number; kc: number } {
  const baseEnduranceLimit = Math.min(0.5 * input.ultimateStrength, ROTATING_BEAM_CAP_PA);
  const ka = surfaceFinishFactor(input.surfaceFinish ?? "machined", input.ultimateStrength);
  const kb = input.sizeFactor ?? 1;
  const kc = LOADING_FACTORS[input.loading ?? "bending"];
  return {
    enduranceLimit: ka * kb * kc * baseEnduranceLimit,
    baseEnduranceLimit,
    ka,
    kb,
    kc,
  };
}

export function fatigueSafetyFactor(
  amplitude: number,
  mean: number,
  enduranceLimit: number,
  criterion: FatigueCriterion,
  ultimateStrength: number,
  yieldStrength?: number,
): number {
  switch (criterion) {
    case "soderberg":
      if (!yieldStrength) {
        throw new Error("The Soderberg criterion requires yieldStrength.");
      }
      return 1 / (amplitude / enduranceLimit + mean / yieldStrength);
    case "gerber":
      return 1 / (amplitude / enduranceLimit + (mean / ultimateStrength) ** 2);
    case "goodman":
    default:
      return 1 / (amplitude / enduranceLimit + mean / ultimateStrength);
  }
}

export function equivalentStressAmplitude(amplitude: number, mean: number, ultimateStrength: number): number {
  return amplitude / (1 - mean / ultimateStrength);
}

export function estimateFatigueLife(equivalentAmplitude: number, enduranceLimit: number, ultimateStrength: number): number {
  const intercept = (S_N_FRACTION_F * ultimateStrength) ** 2 / enduranceLimit;
  const exponent = -(1 / 3) * Math.log10((S_N_FRACTION_F * ultimateStrength) / enduranceLimit);
  return (equivalentAmplitude / intercept) ** (1 / exponent);
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }

  const amplitude = input.stressAmplitude ?? 0;
  let mean = input.meanStress ?? 0;
  const warnings: string[] = [];

  if (amplitude <= 0 && mean <= 0) {
    throw new Error("Provide a positive stressAmplitude or meanStress.");
  }
  if (mean < 0) {
    warnings.push("Compressive mean stress is treated as zero. This follows the conservative Shigley convention.");
    mean = 0;
  }

  const criterion = input.criterion ?? "goodman";
  if (criterion === "soderberg" && !input.yieldStrength) {
    throw new Error("The Soderberg criterion requires yieldStrength.");
  }

  const estimation =
    input.enduranceLimit !== undefined
      ? undefined
      : estimateEnduranceLimit({
          ultimateStrength: input.ultimateStrength,
          surfaceFinish: input.surfaceFinish,
          loading: input.loading,
          sizeFactor: input.sizeFactor,
        });
  const enduranceLimit = input.enduranceLimit ?? estimation?.enduranceLimit ?? 0;

  const safetyFactor = fatigueSafetyFactor(
    amplitude,
    mean,
    enduranceLimit,
    criterion,
    input.ultimateStrength,
    input.yieldStrength,
  );

  const peakStress = amplitude + mean;
  if (input.yieldStrength && peakStress > input.yieldStrength) {
    warnings.push("The peak stress exceeds the yield strength. Yielding occurs before fatigue failure.");
  }
  if (safetyFactor < 1) {
    warnings.push("The fatigue safety factor is below 1. Fatigue failure is predicted.");
  }

  const quantities: Quantity[] = [
    {
      key: "enduranceLimit",
      label: "Corrected endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description:
        input.enduranceLimit !== undefined
          ? "The corrected endurance limit supplied to the analysis."
          : "Corrected endurance limit from the Marin surface, size, and loading factors.",
    },
    {
      key: "fatigueSafetyFactor",
      label: "Fatigue safety factor",
      value: safetyFactor,
      unit: "",
      description: `Safety factor on the ${criterion} mean stress failure line.`,
    },
  ];

  const equivalent = equivalentStressAmplitude(amplitude, mean, input.ultimateStrength);
  if (mean > 0) {
    quantities.push({
      key: "equivalentStressAmplitude",
      label: "Equivalent fully reversed amplitude",
      value: equivalent,
      unit: "Pa",
      description: "Fully reversed stress amplitude with the same fatigue damage as the real cycle.",
    });
  }

  if (input.yieldStrength) {
    quantities.push({
      key: "yieldSafetyFactor",
      label: "Yield safety factor",
      value: input.yieldStrength / peakStress,
      unit: "",
      description: "Yield strength divided by the peak stress of the cycle.",
    });
  }

  const intercept = (S_N_FRACTION_F * input.ultimateStrength) ** 2 / enduranceLimit;
  if (equivalent > enduranceLimit) {
    if (intercept > enduranceLimit) {
      const life = estimateFatigueLife(equivalent, enduranceLimit, input.ultimateStrength);
      quantities.push({
        key: "estimatedLifeCycles",
        label: "Estimated life to failure",
        value: life,
        unit: "cycles",
        description: "Predicted number of cycles to failure from the fitted S-N curve.",
      });
      if (life < 1e3) {
        warnings.push("The predicted life is below 10^3 cycles. This lies outside the fitted S-N range.");
      } else {
        warnings.push("The stress exceeds the endurance limit. The life estimate uses a fitted S-N curve; confirm with test data.");
      }
    } else {
      warnings.push("The endurance limit exceeds the fitted S-N intercept. The life cannot be estimated from this model.");
    }
  }

  if (input.targetSafetyFactor !== undefined) {
    const target = input.targetSafetyFactor;
    let allowable: number;
    if (criterion === "soderberg") {
      allowable = enduranceLimit * (1 / target - mean / (input.yieldStrength as number));
    } else if (criterion === "gerber") {
      allowable = enduranceLimit * (1 / target - (mean / input.ultimateStrength) ** 2);
    } else {
      allowable = enduranceLimit * (1 / target - mean / input.ultimateStrength);
    }
    quantities.push({
      key: "allowableAmplitude",
      label: "Allowable stress amplitude",
      value: allowable,
      unit: "Pa",
      description: `Maximum stress amplitude for a design safety factor of ${target} on the ${criterion} line.`,
    });
    if (allowable < 0) {
      warnings.push("The mean stress alone exceeds the design limit. No positive amplitude meets the target safety factor.");
    }
  }

  return {
    method: FATIGUE_METHOD,
    inputs: {
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      stressAmplitude: amplitude,
      meanStress: mean,
      criterion,
      peakStress,
      ...(estimation
        ? {
            surfaceFinish: input.surfaceFinish ?? "machined",
            loading: input.loading ?? "bending",
            baseEnduranceLimit: estimation.baseEnduranceLimit,
            surfaceFactor: estimation.ka,
            sizeFactor: estimation.kb,
            loadingFactor: estimation.kc,
          }
        : { enduranceLimit: input.enduranceLimit }),
    },
    quantities,
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
