import type { Computation, MethodRecord } from "../types.js";

export type ToleranceSign = 1 | -1;

export type ToleranceDimension = {
  name: string;
  nominal: number;
  tolerancePlus: number;
  toleranceMinus: number;
  sign: ToleranceSign;
};

export type ToleranceStackInput = {
  dimensions: ToleranceDimension[];
};

export const TOLERANCE_STACK_METHOD: MethodRecord = {
  id: "tolerance-stack",
  name: "Linear dimensional tolerance stack",
  formula:
    "Nominal = sum(si ni); worst-case bounds use each limit; RSS tolerance = sqrt(sum(ti^2))",
  notes:
    "Worst-case bounds assume simultaneous limits. Independent RSS assumes zero-mean, independent variation and is not a guaranteed limit.",
  referenceIds: ["asme-y14-5"],
};

export function analyzeToleranceStack(input: ToleranceStackInput): Computation {
  validateInput(input);

  let nominalStack = 0;
  let worstCaseLowerDeviation = 0;
  let worstCaseUpperDeviation = 0;
  let rssLowerSquared = 0;
  let rssUpperSquared = 0;
  const rows: Record<string, unknown>[] = [];

  for (const [index, dimension] of input.dimensions.entries()) {
    const signedNominal = dimension.sign * dimension.nominal;
    const signedLowerDeviation = dimension.sign === 1 ? -dimension.toleranceMinus : -dimension.tolerancePlus;
    const signedUpperDeviation = dimension.sign === 1 ? dimension.tolerancePlus : dimension.toleranceMinus;

    nominalStack += signedNominal;
    worstCaseLowerDeviation += signedLowerDeviation;
    worstCaseUpperDeviation += signedUpperDeviation;
    rssLowerSquared += signedLowerDeviation ** 2;
    rssUpperSquared += signedUpperDeviation ** 2;

    rows.push({
      dimension: index + 1,
      name: dimension.name,
      sign: dimension.sign,
      nominalM: dimension.nominal,
      signedNominalM: signedNominal,
      toleranceMinusM: dimension.toleranceMinus,
      tolerancePlusM: dimension.tolerancePlus,
      signedLowerDeviationM: signedLowerDeviation,
      signedUpperDeviationM: signedUpperDeviation,
    });
  }

  const rssToleranceMinus = Math.sqrt(rssLowerSquared);
  const rssTolerancePlus = Math.sqrt(rssUpperSquared);
  const worstCaseLower = nominalStack + worstCaseLowerDeviation;
  const worstCaseUpper = nominalStack + worstCaseUpperDeviation;
  const rssLowerBound = nominalStack - rssToleranceMinus;
  const rssUpperBound = nominalStack + rssTolerancePlus;

  const warnings = [
    "Worst-case bounds assume every dimension reaches its limiting value at the same time.",
    "Independent RSS bounds assume zero-mean, independent variation. They are not guaranteed limits.",
  ];
  if (input.dimensions.some((dimension) => dimension.tolerancePlus !== dimension.toleranceMinus)) {
    warnings.push("Asymmetric tolerances use separate one-sided RSS magnitudes.");
  }

  return {
    method: TOLERANCE_STACK_METHOD,
    inputs: { dimensions: input.dimensions, calculationUnit: "m" },
    quantities: [
      {
        key: "nominalStack",
        label: "Nominal stack",
        value: nominalStack,
        unit: "m",
        description: "Signed sum of the nominal dimensions.",
      },
      {
        key: "worstCaseLower",
        label: "Worst-case lower bound",
        value: worstCaseLower,
        unit: "m",
        description: "Lowest stack when every dimension reaches its limiting value.",
      },
      {
        key: "worstCaseUpper",
        label: "Worst-case upper bound",
        value: worstCaseUpper,
        unit: "m",
        description: "Highest stack when every dimension reaches its limiting value.",
      },
      {
        key: "worstCaseToleranceMinus",
        label: "Worst-case minus tolerance",
        value: -worstCaseLowerDeviation,
        unit: "m",
        description: "Nominal stack minus the worst-case lower bound.",
      },
      {
        key: "worstCaseTolerancePlus",
        label: "Worst-case plus tolerance",
        value: worstCaseUpperDeviation,
        unit: "m",
        description: "Worst-case upper bound minus the nominal stack.",
      },
      {
        key: "worstCaseRange",
        label: "Worst-case range",
        value: worstCaseUpper - worstCaseLower,
        unit: "m",
        description: "Full distance between the worst-case bounds.",
      },
      {
        key: "rssLowerBound",
        label: "RSS lower bound",
        value: rssLowerBound,
        unit: "m",
        description: "Nominal stack minus the independent lower RSS tolerance.",
      },
      {
        key: "rssUpperBound",
        label: "RSS upper bound",
        value: rssUpperBound,
        unit: "m",
        description: "Nominal stack plus the independent upper RSS tolerance.",
      },
      {
        key: "rssToleranceMinus",
        label: "RSS minus tolerance",
        value: rssToleranceMinus,
        unit: "m",
        description: "Root-sum-square of the lower one-sided tolerances.",
      },
      {
        key: "rssTolerancePlus",
        label: "RSS plus tolerance",
        value: rssTolerancePlus,
        unit: "m",
        description: "Root-sum-square of the upper one-sided tolerances.",
      },
    ],
    rows,
    referenceIds: TOLERANCE_STACK_METHOD.referenceIds,
    warnings,
  };
}

function validateInput(input: ToleranceStackInput): void {
  if (!Array.isArray(input.dimensions) || input.dimensions.length === 0) {
    throw new Error("Provide at least one tolerance-stack dimension.");
  }
  if (input.dimensions.length > 100) {
    throw new Error("Provide no more than 100 tolerance-stack dimensions.");
  }

  const names = new Set<string>();
  for (const [index, dimension] of input.dimensions.entries()) {
    const prefix = `dimensions[${index}]`;
    if (typeof dimension.name !== "string" || dimension.name.trim().length === 0) {
      throw new Error(`${prefix}.name must be a non-empty string.`);
    }
    const name = dimension.name.trim();
    if (names.has(name)) {
      throw new Error(`Dimension names must be unique: ${dimension.name}.`);
    }
    names.add(name);
    assertPositiveFinite(dimension.nominal, `${prefix}.nominal`);
    assertFiniteNonNegative(dimension.tolerancePlus, `${prefix}.tolerancePlus`);
    assertFiniteNonNegative(dimension.toleranceMinus, `${prefix}.toleranceMinus`);
    if (dimension.nominal <= dimension.toleranceMinus) {
      throw new Error(`${prefix}.toleranceMinus must leave a positive lower dimension limit.`);
    }
    if (dimension.sign !== 1 && dimension.sign !== -1) {
      throw new Error(`${prefix}.sign must be 1 or -1.`);
    }
  }
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and zero or positive.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive.`);
  }
}
