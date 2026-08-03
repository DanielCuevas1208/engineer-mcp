import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueLoading = "bending" | "axial" | "torsion";

export type SurfaceFinish = "ground" | "machined" | "cold_drawn" | "hot_rolled" | "as_forged";

export type FatigueInput = {
  meanStress: number;
  stressAmplitude: number;
  ultimateStrength: number;
  yieldStrength?: number;
  loading?: FatigueLoading;
  surfaceFinish?: SurfaceFinish;
  sizeFactor?: number;
  temperatureFactor?: number;
  reliabilityFactor?: number;
  enduranceLimit?: number;
};

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Fatigue life estimation for cyclic loading",
  formula:
    "Se' = 0.5 Sut (Sut <= 1400 MPa), ka = a Sut^b, Se = ka kb kc kd ke Se', n = 1/(Sa/Se + Sm/Sut), n = 1/(Sa/Se + Sm/Sy)",
  notes:
    "The endurance limit follows the rotating-beam estimate for steel. The Marin factors correct it for surface finish, size, loading, temperature, and reliability. The Goodman, Gerber, and Soderberg criteria turn the mean and alternating stress into a fatigue safety factor. Use test data for exact values.",
  referenceIds: ["shigley-2015"],
};

const ENDURANCE_LIMIT_CAP_MPA = 700;
const ENDURANCE_LIMIT_STEP_MPA = 1400;
const SURFACE_FORMULA_LOW_SUT_MPA = 400;

const LOAD_FACTOR: Record<FatigueLoading, number> = {
  bending: 1,
  axial: 0.85,
  torsion: 0.59,
};

const SURFACE_FACTOR: Record<SurfaceFinish, { a: number; b: number }> = {
  ground: { a: 1.58, b: -0.085 },
  machined: { a: 4.51, b: -0.265 },
  cold_drawn: { a: 4.51, b: -0.265 },
  hot_rolled: { a: 57.7, b: -0.718 },
  as_forged: { a: 272, b: -0.995 },
};

export function enduranceLimitEstimate(ultimateStrength: number): number {
  const sutMpa = ultimateStrength / 1e6;
  return sutMpa <= ENDURANCE_LIMIT_STEP_MPA ? 0.5 * ultimateStrength : ENDURANCE_LIMIT_CAP_MPA * 1e6;
}

export function surfaceFactor(finish: SurfaceFinish, ultimateStrength: number): number {
  const constants = SURFACE_FACTOR[finish]!;
  return constants.a * (ultimateStrength / 1e6) ** constants.b;
}

function goodmanFactor(stressAmplitude: number, meanStress: number, enduranceLimit: number, ultimateStrength: number): number {
  return 1 / (stressAmplitude / enduranceLimit + meanStress / ultimateStrength);
}

function gerberFactor(stressAmplitude: number, meanStress: number, enduranceLimit: number, ultimateStrength: number): number {
  const a = stressAmplitude / enduranceLimit;
  const b = meanStress / ultimateStrength;
  if (b === 0) {
    return enduranceLimit / stressAmplitude;
  }
  return (-a + Math.sqrt(a * a + 4 * b * b)) / (2 * b * b);
}

function soderbergFactor(stressAmplitude: number, meanStress: number, enduranceLimit: number, yieldStrength: number): number {
  return 1 / (stressAmplitude / enduranceLimit + meanStress / yieldStrength);
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.stressAmplitude > 0)) {
    throw new Error("stressAmplitude must be positive.");
  }
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (input.yieldStrength !== undefined && !(input.yieldStrength > 0)) {
    throw new Error("yieldStrength must be positive.");
  }

  const loading = input.loading ?? "bending";
  const surfaceFinish = input.surfaceFinish ?? "machined";
  const sizeFactor = input.sizeFactor ?? 1;
  const temperatureFactor = input.temperatureFactor ?? 1;
  const reliabilityFactor = input.reliabilityFactor ?? 1;

  const warnings: string[] = [];
  if (input.ultimateStrength / 1e6 < SURFACE_FORMULA_LOW_SUT_MPA) {
    warnings.push(
      "The surface factor formula targets steel above about 400 MPa ultimate strength. Treat the result as approximate below this value.",
    );
  }
  if (input.ultimateStrength / 1e6 > ENDURANCE_LIMIT_STEP_MPA) {
    warnings.push(
      "The endurance limit estimate is capped at 700 MPa for high-strength steel. Use a measured value for exact results.",
    );
  }

  const baseEnduranceLimit = input.enduranceLimit ?? enduranceLimitEstimate(input.ultimateStrength);
  const ka = surfaceFactor(surfaceFinish, input.ultimateStrength);
  const kc = LOAD_FACTOR[loading]!;
  const enduranceLimit = baseEnduranceLimit * ka * sizeFactor * kc * temperatureFactor * reliabilityFactor;

  const { meanStress, stressAmplitude } = input;
  const peakStress = meanStress + stressAmplitude;
  const stressRatio = peakStress === 0 ? undefined : (meanStress - stressAmplitude) / peakStress;

  const goodman = goodmanFactor(stressAmplitude, meanStress, enduranceLimit, input.ultimateStrength);
  const gerber = gerberFactor(stressAmplitude, meanStress, enduranceLimit, input.ultimateStrength);

  const quantities: Quantity[] = [
    {
      key: "stressAmplitude",
      label: "Stress amplitude",
      value: stressAmplitude,
      unit: "Pa",
      description: "Alternating stress amplitude of the cycle.",
    },
    {
      key: "meanStress",
      label: "Mean stress",
      value: meanStress,
      unit: "Pa",
      description: "Average stress of the cycle. A negative value means a compressive mean.",
    },
    {
      key: "goodmanSafetyFactor",
      label: "Goodman safety factor",
      value: goodman,
      unit: "",
      description: "Fatigue safety factor by the modified Goodman criterion: Sa/Se + Sm/Sut = 1.",
    },
    {
      key: "gerberSafetyFactor",
      label: "Gerber safety factor",
      value: gerber,
      unit: "",
      description: "Fatigue safety factor by the Gerber criterion: Sa/Se + (Sm/Sut)^2 = 1.",
    },
  ];

  if (stressRatio !== undefined) {
    quantities.splice(1, 0, {
      key: "stressRatio",
      label: "Stress ratio",
      value: stressRatio,
      unit: "",
      description: "Ratio of the minimum to the maximum stress of the cycle.",
    });
  }

  quantities.push({
    key: "enduranceLimit",
    label: "Endurance limit",
    value: enduranceLimit,
    unit: "Pa",
    description: "Modified endurance limit for the loading, surface, size, temperature, and reliability factors.",
  });

  let soderberg: number | undefined;
  let yieldFactor: number | undefined;
  if (input.yieldStrength) {
    soderberg = soderbergFactor(stressAmplitude, meanStress, enduranceLimit, input.yieldStrength);
    quantities.push({
      key: "soderbergSafetyFactor",
      label: "Soderberg safety factor",
      value: soderberg,
      unit: "",
      description: "Fatigue safety factor by the Soderberg criterion: Sa/Se + Sm/Sy = 1.",
    });
    if (peakStress > 0) {
      yieldFactor = input.yieldStrength / peakStress;
      quantities.push({
        key: "yieldSafetyFactor",
        label: "First-cycle yield safety factor",
        value: yieldFactor,
        unit: "",
        description: "First-cycle yield check: yield strength divided by the peak cycle stress.",
      });
    }
    if (peakStress > input.yieldStrength) {
      warnings.push(
        "The peak cycle stress exceeds the yield strength. Plastic flow occurs on the first cycle. Yield governs over fatigue.",
      );
    }
  }

  const candidates: Array<{ label: string; value: number }> = [
    { label: "Goodman safety factor", value: goodman },
    { label: "Gerber safety factor", value: gerber },
  ];
  if (soderberg !== undefined) {
    candidates.push({ label: "Soderberg safety factor", value: soderberg });
  }
  if (yieldFactor !== undefined) {
    candidates.push({ label: "First-cycle yield safety factor", value: yieldFactor });
  }
  const governing = candidates.reduce((min, candidate) => (candidate.value < min.value ? candidate : min));

  const safetyFactor: Quantity = {
    key: "governingSafetyFactor",
    label: `${governing.label} (governing)`,
    value: governing.value,
    unit: "",
    description: "Smallest reported safety factor for this cycle. It governs the fatigue check.",
  };

  return {
    method: FATIGUE_METHOD,
    inputs: {
      meanStress,
      stressAmplitude,
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      loading,
      surfaceFinish,
      sizeFactor,
      temperatureFactor,
      reliabilityFactor,
      enduranceLimit: input.enduranceLimit,
      baseEnduranceLimit,
      surfaceFactor: ka,
      loadFactor: kc,
      peakStress,
    },
    quantities,
    safetyFactor,
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
