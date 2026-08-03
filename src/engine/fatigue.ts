import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FatigueLoading = "bending" | "axial" | "torsion";

export type FatigueSurface = "ground" | "machined" | "cold_drawn" | "hot_rolled" | "as_forged";

export type FatigueInput = {
  alternatingStress: number;
  meanStress: number;
  loading: FatigueLoading;
  ultimateStrength: number;
  yieldStrength: number;
  surfaceCondition?: FatigueSurface;
  diameterMm?: number;
  reliabilityPct?: number;
  temperatureC?: number;
  surfaceFactor?: number;
  sizeFactor?: number;
  loadFactor?: number;
  temperatureFactor?: number;
  reliabilityFactor?: number;
  miscellaneousFactor?: number;
};

export type FatigueCriterion = "soderberg" | "goodman" | "gerber" | "asmeElliptic";

export const FATIGUE_METHOD: MethodRecord = {
  id: "fatigue-analysis",
  name: "Stress-life fatigue analysis",
  formula:
    "Se' = 0.5 Sut, Se = ka kb kc kd ke kf Se', Soderberg: sa/Se + sm/Sy = 1/n, Goodman: sa/Se + sm/Sut = 1/n, Gerber: n sa/Se + (n sm/Sut)^2 = 1, ASME-elliptic: (n sa/Se)^2 + (n sm/Sy)^2 = 1",
  notes:
    "The unmodified endurance limit assumes steel with a tensile strength up to 1400 MPa. The Marin factors cover surface, size, load, temperature, reliability, and miscellaneous effects. Torsion uses the von Mises equivalent stresses. The tool reports the governing criterion. Verify the result with testing for a production part.",
  referenceIds: ["shigley-2015"],
};

const SURFACE_SPECS: Record<FatigueSurface, { label: string; a: number; b: number }> = {
  ground: { label: "Ground finish", a: 1.58, b: -0.085 },
  machined: { label: "Machined or cold-drawn finish", a: 4.51, b: -0.265 },
  cold_drawn: { label: "Cold-drawn finish", a: 4.51, b: -0.265 },
  hot_rolled: { label: "Hot-rolled finish", a: 57.7, b: -0.718 },
  as_forged: { label: "As-forged finish", a: 272, b: -0.995 },
};

const TEMPERATURE_FACTORS: ReadonlyArray<readonly [number, number]> = [
  [20, 1.0],
  [50, 1.01],
  [100, 1.02],
  [150, 1.025],
  [200, 1.02],
  [250, 1.0],
  [300, 0.975],
  [350, 0.943],
  [400, 0.9],
  [450, 0.843],
  [500, 0.768],
  [550, 0.672],
  [600, 0.549],
];

const RELIABILITY_FACTORS: Record<number, number> = {
  50: 1.0,
  90: 0.897,
  95: 0.868,
  99: 0.814,
  99.9: 0.753,
  99.99: 0.702,
  99.999: 0.659,
  99.9999: 0.62,
};

export function surfaceFactor(condition: FatigueSurface, ultimateStrengthPa: number): number {
  const spec = SURFACE_SPECS[condition];
  const sutMpa = ultimateStrengthPa / 1e6;
  return spec.a * sutMpa ** spec.b;
}

export function sizeFactor(
  loading: FatigueLoading,
  diameterMm?: number,
): { value: number; note?: string } {
  if (loading === "axial") {
    return {
      value: 1,
      note: "The size factor is 1 for axial loading because there is no stress gradient.",
    };
  }
  if (diameterMm === undefined) {
    return {
      value: 1,
      note: "No diameter was provided. The size factor is 1, which assumes a small section. Provide diameterMm for a larger section.",
    };
  }
  if (diameterMm <= 7.62) {
    return { value: 1 };
  }
  if (diameterMm > 250) {
    return {
      value: 0.75,
      note: "The diameter exceeds 250 mm. The size factor is capped at 0.75.",
    };
  }
  return { value: 1.24 * diameterMm ** -0.107 };
}

export function loadFactor(loading: FatigueLoading): number {
  return loading === "axial" ? 0.85 : 1;
}

export function temperatureFactor(
  temperatureC: number,
): { value: number; note?: string } {
  if (temperatureC <= 20) {
    return { value: 1, note: "The temperature is at or below 20 C. The factor is 1." };
  }
  if (temperatureC >= 600) {
    return {
      value: 0.549,
      note: "The temperature is at or above 600 C. The factor is clamped to the table limit.",
    };
  }
  for (let i = 0; i < TEMPERATURE_FACTORS.length - 1; i += 1) {
    const current = TEMPERATURE_FACTORS[i];
    const next = TEMPERATURE_FACTORS[i + 1];
    if (current && next && temperatureC <= next[0]) {
      const ratio = (temperatureC - current[0]) / (next[0] - current[0]);
      return { value: current[1] + ratio * (next[1] - current[1]) };
    }
  }
  return { value: 0.549 };
}

export function reliabilityFactor(percent: number): number | undefined {
  return RELIABILITY_FACTORS[percent];
}

export function unmodifiedEnduranceLimit(
  ultimateStrengthPa: number,
): { value: number; capped: boolean } {
  const half = 0.5 * ultimateStrengthPa;
  if (half > 700e6) {
    return { value: 700e6, capped: true };
  }
  return { value: half, capped: false };
}

export function fatigueSafetyFactor(
  criterion: FatigueCriterion,
  sigmaA: number,
  sigmaM: number,
  enduranceLimit: number,
  ultimateStrength: number,
  yieldStrength: number,
): number {
  switch (criterion) {
    case "soderberg":
      return 1 / (sigmaA / enduranceLimit + sigmaM / yieldStrength);
    case "goodman":
      return 1 / (sigmaA / enduranceLimit + sigmaM / ultimateStrength);
    case "gerber": {
      const x = sigmaA / enduranceLimit;
      const y = sigmaM / ultimateStrength;
      if (y === 0) {
        return 1 / x;
      }
      return (Math.sqrt(x ** 2 + 4 * y ** 2) - x) / (2 * y ** 2);
    }
    case "asmeElliptic":
      return 1 / Math.sqrt((sigmaA / enduranceLimit) ** 2 + (sigmaM / yieldStrength) ** 2);
  }
}

export function analyzeFatigue(input: FatigueInput): Computation {
  if (!(input.alternatingStress > 0)) {
    throw new Error("alternatingStress must be positive.");
  }
  if (!(input.ultimateStrength > 0)) {
    throw new Error("ultimateStrength must be positive.");
  }
  if (!(input.yieldStrength > 0)) {
    throw new Error("yieldStrength must be positive.");
  }

  const warnings: string[] = [];
  const loading = input.loading;
  const surfaceCondition = input.surfaceCondition ?? "machined";

  const base = unmodifiedEnduranceLimit(input.ultimateStrength);
  if (base.capped) {
    warnings.push(
      "The ultimate strength exceeds 1400 MPa. The unmodified endurance limit is capped at 700 MPa.",
    );
  }

  const ka = input.surfaceFactor ?? surfaceFactor(surfaceCondition, input.ultimateStrength);

  const size = input.sizeFactor !== undefined ? { value: input.sizeFactor } : sizeFactor(loading, input.diameterMm);
  const kc = input.loadFactor ?? loadFactor(loading);

  const temperature =
    input.temperatureFactor !== undefined
      ? { value: input.temperatureFactor }
      : input.temperatureC === undefined
        ? { value: 1 }
        : temperatureFactor(input.temperatureC);

  let reliability: { value: number };
  if (input.reliabilityFactor !== undefined) {
    reliability = { value: input.reliabilityFactor };
  } else if (input.reliabilityPct === undefined) {
    reliability = { value: 1 };
  } else {
    const factor = reliabilityFactor(input.reliabilityPct);
    if (factor === undefined) {
      throw new Error(
        `Unsupported reliability percentage: ${input.reliabilityPct}. Use 50, 90, 95, 99, 99.9, 99.99, 99.999, or 99.9999.`,
      );
    }
    reliability = { value: factor };
  }

  const kf = input.miscellaneousFactor ?? 1;

  if (size.note) {
    warnings.push(size.note);
  }
  if (temperature.note) {
    warnings.push(temperature.note);
  }
  if (loading === "axial") {
    warnings.push(
      "Axial loading uses a load factor of 0.85. Without a stress gradient, axial loading lowers the endurance limit.",
    );
  }
  if (loading === "torsion") {
    warnings.push(
      "Torsion uses the von Mises equivalent stresses. The load factor is 1 because the transformation includes the shear effect.",
    );
  }

  const enduranceLimit = ka * size.value * kc * temperature.value * reliability.value * kf * base.value;

  const shearFactor = loading === "torsion" ? Math.sqrt(3) : 1;
  const actualMean = shearFactor * input.meanStress;
  const equivalentMean = shearFactor * Math.max(input.meanStress, 0);
  const equivalentAlternating = shearFactor * input.alternatingStress;

  if (input.meanStress < 0) {
    warnings.push(
      "The mean stress is compressive. The fatigue criteria use a mean of zero, which is the conservative choice.",
    );
  }

  const soderberg = fatigueSafetyFactor(
    "soderberg",
    equivalentAlternating,
    equivalentMean,
    enduranceLimit,
    input.ultimateStrength,
    input.yieldStrength,
  );
  const goodman = fatigueSafetyFactor(
    "goodman",
    equivalentAlternating,
    equivalentMean,
    enduranceLimit,
    input.ultimateStrength,
    input.yieldStrength,
  );
  const gerber = fatigueSafetyFactor(
    "gerber",
    equivalentAlternating,
    equivalentMean,
    enduranceLimit,
    input.ultimateStrength,
    input.yieldStrength,
  );
  const asmeElliptic = fatigueSafetyFactor(
    "asmeElliptic",
    equivalentAlternating,
    equivalentMean,
    enduranceLimit,
    input.ultimateStrength,
    input.yieldStrength,
  );

  const maxCycleStress = equivalentAlternating + actualMean;
  const yieldFactor = maxCycleStress > 0 ? input.yieldStrength / maxCycleStress : Number.POSITIVE_INFINITY;

  const governing = Math.min(soderberg, goodman, gerber, asmeElliptic, yieldFactor);

  const quantities: Quantity[] = [
    {
      key: "unmodifiedEnduranceLimit",
      label: "Unmodified endurance limit",
      value: base.value,
      unit: "Pa",
      description: "Fully reversed endurance limit of a polished rotating-beam specimen, before the Marin factors.",
    },
    {
      key: "surfaceFactor",
      label: "Surface factor",
      value: ka,
      unit: "",
      description: `Surface finish factor k_a for a ${SURFACE_SPECS[surfaceCondition].label.toLowerCase()}.`,
    },
    {
      key: "sizeFactor",
      label: "Size factor",
      value: size.value,
      unit: "",
      description: "Size factor k_b for the section geometry.",
    },
    {
      key: "loadFactor",
      label: "Load factor",
      value: kc,
      unit: "",
      description: "Load factor k_c for the loading type.",
    },
    {
      key: "temperatureFactor",
      label: "Temperature factor",
      value: temperature.value,
      unit: "",
      description: "Temperature factor k_d for the operating temperature.",
    },
    {
      key: "reliabilityFactor",
      label: "Reliability factor",
      value: reliability.value,
      unit: "",
      description: "Reliability factor k_e for the chosen survival probability.",
    },
    {
      key: "miscellaneousFactor",
      label: "Miscellaneous factor",
      value: kf,
      unit: "",
      description: "Miscellaneous factor k_f for stress concentrations and other effects.",
    },
    {
      key: "enduranceLimit",
      label: "Modified endurance limit",
      value: enduranceLimit,
      unit: "Pa",
      description: "Endurance limit of the part after all Marin factors.",
    },
    {
      key: "equivalentAlternatingStress",
      label: "Equivalent alternating stress",
      value: equivalentAlternating,
      unit: "Pa",
      description: loading === "torsion"
        ? "von Mises equivalent of the shear stress amplitude."
        : "Alternating stress amplitude for the fatigue cycle.",
    },
    {
      key: "equivalentMeanStress",
      label: "Equivalent mean stress",
      value: equivalentMean,
      unit: "Pa",
      description: loading === "torsion"
        ? "von Mises equivalent of the shear mean stress."
        : "Mean stress for the fatigue cycle.",
    },
    {
      key: "soderbergSafetyFactor",
      label: "Soderberg safety factor",
      value: soderberg,
      unit: "",
      description: "Fatigue safety factor using the Soderberg line.",
    },
    {
      key: "goodmanSafetyFactor",
      label: "Modified Goodman safety factor",
      value: goodman,
      unit: "",
      description: "Fatigue safety factor using the modified Goodman line.",
    },
    {
      key: "gerberSafetyFactor",
      label: "Gerber safety factor",
      value: gerber,
      unit: "",
      description: "Fatigue safety factor using the Gerber parabola.",
    },
    {
      key: "asmeEllipticSafetyFactor",
      label: "ASME-elliptic safety factor",
      value: asmeElliptic,
      unit: "",
      description: "Fatigue safety factor using the ASME-elliptic line.",
    },
  ];

  if (Number.isFinite(yieldFactor)) {
    quantities.push({
      key: "yieldSafetyFactor",
      label: "Yield safety factor",
      value: yieldFactor,
      unit: "",
      description: "Yield strength divided by the maximum stress of the cycle.",
    });
  } else {
    warnings.push("The maximum stress of the cycle is compressive. The static yield check is skipped.");
  }

  return {
    method: FATIGUE_METHOD,
    inputs: {
      alternatingStress: input.alternatingStress,
      meanStress: input.meanStress,
      loading,
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      surfaceCondition,
      surfaceFactor: ka,
      sizeFactor: size.value,
      loadFactor: kc,
      temperatureFactor: temperature.value,
      reliabilityFactor: reliability.value,
      miscellaneousFactor: kf,
      diameterMm: input.diameterMm,
      reliabilityPct: input.reliabilityPct,
      temperatureC: input.temperatureC,
      enduranceLimit,
      governingCriterion: "minimum of all criteria",
    },
    quantities,
    safetyFactor: {
      key: "fatigueSafetyFactor",
      label: "Governing fatigue safety factor",
      value: governing,
      unit: "",
      description: "Minimum of the Soderberg, Goodman, Gerber, ASME-elliptic, and yield factors.",
    },
    referenceIds: FATIGUE_METHOD.referenceIds,
    warnings,
  };
}
