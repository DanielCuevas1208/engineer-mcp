import type { Computation, MethodRecord, Quantity } from "../types.js";
import { analyzeFatigue, type FatigueInput } from "./fatigue.js";
import {
  FATIGUE_SWEEP_PARAMETERS,
  type FatigueSweepParameter,
} from "./uncertainty-sweep.js";

export type UncertaintyInteractionEndpoint = {
  parameter: FatigueSweepParameter;
  low: number;
  high: number;
  inputUnit: string;
  calculationUnit: string;
  baselineDisplayValue: number;
  lowDisplayValue: number;
  highDisplayValue: number;
};

export type UncertaintyInteractionsInput = {
  calculation: "fatigue_analysis";
  baseline: FatigueInput;
  parameterA: UncertaintyInteractionEndpoint;
  parameterB: UncertaintyInteractionEndpoint;
};

export const UNCERTAINTY_INTERACTIONS_METHOD: MethodRecord = {
  id: "uncertainty-interactions",
  name: "Two-factor fatigue endpoint interaction",
  formula:
    "interaction = SF(high A, high B) - SF(high A, low B) - SF(low A, high B) + SF(low A, low B); compare beside one-factor endpoint spans",
  notes:
    "The tool evaluates four endpoint corners for one parameter pair. One-factor rows vary A or B alone. A non-zero interaction means the pair does not combine additively from the low-low corner.",
  referenceIds: ["shigley-2015"],
};

type CornerKey = "lowLow" | "lowHigh" | "highLow" | "highHigh";

export function analyzeUncertaintyInteractions(input: UncertaintyInteractionsInput): Computation {
  validateInput(input);

  const baselineResult = evaluate(input.baseline, "baseline");
  const baselineSafetyFactor = safetyFactorValue(baselineResult.safetyFactor, "baseline");

  const oneFactorRows = [
    buildOneFactorRow(input, input.parameterA, "parameterA", baselineSafetyFactor),
    buildOneFactorRow(input, input.parameterB, "parameterB", baselineSafetyFactor),
  ];

  const corners = evaluateCorners(input);
  const interactionEffect =
    corners.highHigh - corners.highLow - corners.lowHigh + corners.lowLow;
  const oneFactorSpanA = corners.highLow - corners.lowLow;
  const oneFactorSpanB = corners.lowHigh - corners.lowLow;
  const pairedCornerSpan = corners.highHigh - corners.lowLow;

  const cornerRows = (["lowLow", "lowHigh", "highLow", "highHigh"] as const).map((key) =>
    buildCornerRow(input, key, corners[key], baselineSafetyFactor),
  );

  const rows = [...oneFactorRows, ...cornerRows];

  const quantities: Quantity[] = [
    {
      key: "baselineFatigueSafetyFactor",
      label: "Baseline fatigue safety factor",
      value: baselineSafetyFactor,
      unit: "",
      description: "Fatigue safety factor for the unchanged baseline inputs.",
    },
    {
      key: "interactionEffect",
      label: "Interaction effect",
      value: interactionEffect,
      unit: "",
      description:
        "Signed deviation from additive corner combination using the low-low reference. Zero means the endpoints combine additively.",
    },
    {
      key: "pairedCornerSpan",
      label: "Paired corner span",
      value: pairedCornerSpan,
      unit: "",
      description: "Fatigue safety factor change from low-low to high-high on both parameters.",
    },
    {
      key: "oneFactorSpanA",
      label: "One-factor span for parameter A",
      value: oneFactorSpanA,
      unit: "",
      description: "Safety factor change for parameter A when parameter B stays at its low endpoint.",
    },
    {
      key: "oneFactorSpanB",
      label: "One-factor span for parameter B",
      value: oneFactorSpanB,
      unit: "",
      description: "Safety factor change for parameter B when parameter A stays at its low endpoint.",
    },
  ];

  const amplifies = Math.sign(interactionEffect) !== 0 && Math.abs(interactionEffect) > 1e-9;

  return {
    method: UNCERTAINTY_INTERACTIONS_METHOD,
    inputs: {
      calculation: input.calculation,
      baseline: input.baseline,
      parameterA: input.parameterA,
      parameterB: input.parameterB,
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
    referenceIds: UNCERTAINTY_INTERACTIONS_METHOD.referenceIds,
    warnings: [
      "Each one-factor row varies one input while every other baseline input stays fixed.",
      "Corner rows change both parameters at once from the stated endpoints.",
      "The interaction effect is not a probability estimate.",
    ],
    meta: {
      calculation: input.calculation,
      metric: "fatigueSafetyFactor",
      parameterA: input.parameterA.parameter,
      parameterB: input.parameterB.parameter,
      interactionAmplifies: amplifies ? 1 : 0,
      interactionAdditive: Math.abs(interactionEffect) <= 1e-9 ? 1 : 0,
    },
  };
}

function buildOneFactorRow(
  input: UncertaintyInteractionsInput,
  endpoint: UncertaintyInteractionEndpoint,
  role: "parameterA" | "parameterB",
  baselineSafetyFactor: number,
): Record<string, unknown> {
  const lowResult = evaluate({ ...input.baseline, [endpoint.parameter]: endpoint.low }, `${role}.low`);
  const highResult = evaluate({ ...input.baseline, [endpoint.parameter]: endpoint.high }, `${role}.high`);
  const lowSafetyFactor = safetyFactorValue(lowResult.safetyFactor, `${role}.low`);
  const highSafetyFactor = safetyFactorValue(highResult.safetyFactor, `${role}.high`);
  const signedEffect = highSafetyFactor - lowSafetyFactor;

  return {
    rowKind: "one_factor",
    role,
    parameter: endpoint.parameter,
    inputUnit: endpoint.inputUnit,
    calculationUnit: endpoint.calculationUnit,
    baselineValue: endpoint.baselineDisplayValue,
    lowValue: endpoint.lowDisplayValue,
    highValue: endpoint.highDisplayValue,
    baselineCalculationValue: input.baseline[endpoint.parameter],
    lowCalculationValue: endpoint.low,
    highCalculationValue: endpoint.high,
    baselineFatigueSafetyFactor: baselineSafetyFactor,
    lowFatigueSafetyFactor: lowSafetyFactor,
    highFatigueSafetyFactor: highSafetyFactor,
    signedEffect,
    absoluteEffect: Math.abs(signedEffect),
    assumption: "Only this parameter changes. All other baseline inputs remain fixed.",
    referenceId: "shigley-2015",
  };
}

function evaluateCorners(input: UncertaintyInteractionsInput): Record<CornerKey, number> {
  const a = input.parameterA;
  const b = input.parameterB;
  return {
    lowLow: safetyFactorValue(
      evaluate(
        { ...input.baseline, [a.parameter]: a.low, [b.parameter]: b.low },
        "corners.lowLow",
      ).safetyFactor,
      "corners.lowLow",
    ),
    lowHigh: safetyFactorValue(
      evaluate(
        { ...input.baseline, [a.parameter]: a.low, [b.parameter]: b.high },
        "corners.lowHigh",
      ).safetyFactor,
      "corners.lowHigh",
    ),
    highLow: safetyFactorValue(
      evaluate(
        { ...input.baseline, [a.parameter]: a.high, [b.parameter]: b.low },
        "corners.highLow",
      ).safetyFactor,
      "corners.highLow",
    ),
    highHigh: safetyFactorValue(
      evaluate(
        { ...input.baseline, [a.parameter]: a.high, [b.parameter]: b.high },
        "corners.highHigh",
      ).safetyFactor,
      "corners.highHigh",
    ),
  };
}

function buildCornerRow(
  input: UncertaintyInteractionsInput,
  corner: CornerKey,
  fatigueSafetyFactor: number,
  baselineSafetyFactor: number,
): Record<string, unknown> {
  const a = input.parameterA;
  const b = input.parameterB;
  const aValue = corner === "highLow" || corner === "highHigh" ? a.high : a.low;
  const bValue = corner === "lowHigh" || corner === "highHigh" ? b.high : b.low;
  const aDisplay = corner === "highLow" || corner === "highHigh" ? a.highDisplayValue : a.lowDisplayValue;
  const bDisplay = corner === "lowHigh" || corner === "highHigh" ? b.highDisplayValue : b.lowDisplayValue;

  return {
    rowKind: "corner",
    corner,
    parameterA: a.parameter,
    parameterB: b.parameter,
    parameterAValue: aDisplay,
    parameterBValue: bDisplay,
    parameterAInputUnit: a.inputUnit,
    parameterBInputUnit: b.inputUnit,
    parameterACalculationValue: aValue,
    parameterBCalculationValue: bValue,
    baselineFatigueSafetyFactor: baselineSafetyFactor,
    fatigueSafetyFactor,
    assumption: "Both parameters use the stated endpoints. All other baseline inputs remain fixed.",
    referenceId: "shigley-2015",
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

function validateInput(input: UncertaintyInteractionsInput): void {
  if (input.calculation !== "fatigue_analysis") {
    throw new Error("Only the fatigue_analysis calculation is supported.");
  }
  const a = input.parameterA;
  const b = input.parameterB;
  if (a.parameter === b.parameter) {
    throw new Error("Interaction parameters must differ.");
  }
  for (const [role, endpoint] of [
    ["parameterA", a],
    ["parameterB", b],
  ] as const) {
    if (!FATIGUE_SWEEP_PARAMETERS.includes(endpoint.parameter)) {
      throw new Error(`${role}.parameter is not sweepable.`);
    }
    if (!Number.isFinite(endpoint.low) || !Number.isFinite(endpoint.high)) {
      throw new Error(`${role} endpoints must be finite numbers.`);
    }
    if (!(endpoint.low < endpoint.high)) {
      throw new Error(`${role}.low must be smaller than high.`);
    }
    const baselineValue = input.baseline[endpoint.parameter];
    if (typeof baselineValue !== "number" || !Number.isFinite(baselineValue)) {
      throw new Error(`baseline.${endpoint.parameter} must be provided as a finite number.`);
    }
  }
}