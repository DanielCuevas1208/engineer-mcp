import type { Computation, MethodRecord, Quantity } from "../types.js";
import { analyzeFatigue, type FatigueInput } from "./fatigue.js";

export const FATIGUE_SWEEP_PARAMETERS = [
  "ultimateStrength",
  "yieldStrength",
  "meanStress",
  "alternatingStress",
  "enduranceLimit",
  "sizeFactor",
  "loadFactor",
  "temperatureFactor",
  "reliabilityFactor",
  "reliability",
  "miscellaneousFactor",
] as const;

export type FatigueSweepParameter = (typeof FATIGUE_SWEEP_PARAMETERS)[number];

export type UncertaintySweepCase = {
  parameter: FatigueSweepParameter;
  low: number;
  high: number;
  inputUnit: string;
  calculationUnit: string;
  baselineDisplayValue: number;
  lowDisplayValue: number;
  highDisplayValue: number;
};

export type UncertaintySweepInput = {
  calculation: "fatigue_analysis";
  baseline: FatigueInput;
  sweeps: UncertaintySweepCase[];
};

export const UNCERTAINTY_SWEEP_METHOD: MethodRecord = {
  id: "uncertainty-sweep",
  name: "One-factor fatigue sensitivity sweep",
  formula: "effect = |fatigue safety factor at high endpoint - low endpoint|; rank by descending effect",
  notes:
    "Each endpoint changes one fatigue input while every other baseline input stays fixed. The ranking is deterministic and is not a probability estimate.",
  referenceIds: ["shigley-2015"],
};

export function analyzeUncertaintySweep(input: UncertaintySweepInput): Computation {
  validateInput(input);

  const baselineResult = evaluate(input.baseline, "baseline");
  const baselineSafetyFactor = safetyFactorValue(baselineResult.safetyFactor, "baseline");
  const rows = input.sweeps.map((sweep, index) => {
    const lowResult = evaluate({ ...input.baseline, [sweep.parameter]: sweep.low }, `sweeps[${index}].low`);
    const highResult = evaluate({ ...input.baseline, [sweep.parameter]: sweep.high }, `sweeps[${index}].high`);
    const lowSafetyFactor = safetyFactorValue(lowResult.safetyFactor, `sweeps[${index}].low`);
    const highSafetyFactor = safetyFactorValue(highResult.safetyFactor, `sweeps[${index}].high`);
    const signedEffect = highSafetyFactor - lowSafetyFactor;

    return {
      parameter: sweep.parameter,
      inputUnit: sweep.inputUnit,
      calculationUnit: sweep.calculationUnit,
      baselineValue: sweep.baselineDisplayValue,
      lowValue: sweep.lowDisplayValue,
      highValue: sweep.highDisplayValue,
      baselineCalculationValue: input.baseline[sweep.parameter],
      lowCalculationValue: sweep.low,
      highCalculationValue: sweep.high,
      baselineFatigueSafetyFactor: baselineSafetyFactor,
      lowFatigueSafetyFactor: lowSafetyFactor,
      highFatigueSafetyFactor: highSafetyFactor,
      signedEffect,
      absoluteEffect: Math.abs(signedEffect),
      assumption: "Only this parameter changes. All other baseline inputs remain fixed.",
      referenceId: "shigley-2015",
    } satisfies Record<string, unknown>;
  });

  rows.sort((left, right) => {
    const effectOrder = Number(right.absoluteEffect) - Number(left.absoluteEffect);
    return effectOrder === 0 ? String(left.parameter).localeCompare(String(right.parameter)) : effectOrder;
  });
  rows.forEach((row, index) => {
    (row as Record<string, unknown>).rank = index + 1;
  });

  const quantities: Quantity[] = [
    {
      key: "baselineFatigueSafetyFactor",
      label: "Baseline fatigue safety factor",
      value: baselineSafetyFactor,
      unit: "",
      description: "Fatigue safety factor for the unchanged baseline inputs.",
    },
    {
      key: "largestAbsoluteEffect",
      label: "Largest absolute endpoint effect",
      value: Number(rows[0]?.absoluteEffect ?? 0),
      unit: "",
      description: "Largest absolute change in fatigue safety factor between a sweep's endpoints.",
    },
    {
      key: "sweptParameterCount",
      label: "Swept parameter count",
      value: rows.length,
      unit: "",
      description: "Number of independent fatigue inputs evaluated.",
    },
  ];

  return {
    method: UNCERTAINTY_SWEEP_METHOD,
    inputs: {
      calculation: input.calculation,
      baseline: input.baseline,
      sweeps: input.sweeps,
    },
    quantities,
    safetyFactor: {
      key: "baselineFatigueSafetyFactor",
      label: "Baseline fatigue safety factor",
      value: baselineSafetyFactor,
      unit: "",
      description: "Fatigue safety factor for the unchanged baseline inputs.",
    },
    rows,
    referenceIds: UNCERTAINTY_SWEEP_METHOD.referenceIds,
    warnings: [
      "Each row varies one input while all other baseline inputs remain fixed.",
      "The rank measures endpoint change in fatigue safety factor. It is not a probability or a statistical sensitivity estimate.",
      "The sweep does not model interactions between uncertain inputs.",
    ],
    meta: {
      calculation: input.calculation,
      metric: "fatigueSafetyFactor",
      ranking: "absolute endpoint effect descending",
      mostSensitiveParameter: String(rows[0]?.parameter ?? ""),
    },
  };
}

function evaluate(input: FatigueInput, label: string): Computation {
  try {
    return analyzeFatigue(input);
  } catch (error) {
    throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function safetyFactorValue(quantity: Quantity | undefined, label: string): number {
  if (!quantity || quantity.key !== "fatigueSafetyFactor" || !Number.isFinite(quantity.value)) {
    throw new Error(`${label} did not produce a finite fatigue safety factor.`);
  }
  return quantity.value;
}

function validateInput(input: UncertaintySweepInput): void {
  if (input.calculation !== "fatigue_analysis") {
    throw new Error("Only the fatigue_analysis calculation is supported.");
  }
  if (!Array.isArray(input.sweeps) || input.sweeps.length === 0) {
    throw new Error("Provide at least one uncertainty sweep.");
  }
  if (input.sweeps.length > 5) {
    throw new Error("Provide no more than 5 uncertainty sweeps.");
  }

  const seen = new Set<string>();
  for (const [index, sweep] of input.sweeps.entries()) {
    if (!FATIGUE_SWEEP_PARAMETERS.includes(sweep.parameter)) {
      throw new Error(`sweeps[${index}].parameter is not sweepable.`);
    }
    if (seen.has(sweep.parameter)) {
      throw new Error(`Sweep parameters must be unique: ${sweep.parameter}.`);
    }
    seen.add(sweep.parameter);
    if (!Number.isFinite(sweep.low) || !Number.isFinite(sweep.high)) {
      throw new Error(`sweeps[${index}] endpoints must be finite numbers.`);
    }
    if (!(sweep.low < sweep.high)) {
      throw new Error(`sweeps[${index}].low must be smaller than high.`);
    }
    if (!Number.isFinite(sweep.baselineDisplayValue) || !Number.isFinite(sweep.lowDisplayValue) || !Number.isFinite(sweep.highDisplayValue)) {
      throw new Error(`sweeps[${index}] display values must be finite numbers.`);
    }
    const baselineValue = input.baseline[sweep.parameter];
    if (typeof baselineValue !== "number" || !Number.isFinite(baselineValue)) {
      throw new Error(`baseline.${sweep.parameter} must be provided as a finite number.`);
    }
  }
}
