import type { Computation, MethodRecord, Quantity } from "../types.js";
import { goodmanEquivalentAlternatingStress } from "./fatigue.js";

export type FatigueDamageCriterion = "goodman" | "none";

export type FatigueDamageBlock = {
  meanStress: number;
  alternatingStress: number;
  cycles: number;
};

export type SNCurvePoint = {
  cycles: number;
  alternatingStress: number;
};

export type FatigueDamageInput = {
  blocks: FatigueDamageBlock[];
  snCurve: SNCurvePoint[];
  ultimateStrength: number;
  yieldStrength?: number;
  meanStressCorrection?: FatigueDamageCriterion;
};

export type AllowableCycles = {
  cycles: number;
  infinite: boolean;
  extrapolated: boolean;
};

export const FATIGUE_DAMAGE_METHOD: MethodRecord = {
  id: "fatigue-damage",
  name: "Variable-amplitude fatigue damage analysis",
  formula:
    "Goodman: sa,c = sa/(1-sm/Sut). S-N: log(N) interpolated against log(sa). Miner: D = sum(ni/Ni)",
  notes:
    "Linear Miner damage uses supplied S-N data. Goodman correction treats compression as zero mean stress. Values below the last S-N point have infinite life.",
  referenceIds: ["shigley-2015"],
};

export function allowableCycles(alternatingStress: number, snCurve: SNCurvePoint[]): AllowableCycles {
  if (!Number.isFinite(alternatingStress) || alternatingStress < 0) {
    throw new Error("alternatingStress must be zero or positive.");
  }
  validateSNCurve(snCurve);

  const last = snCurve[snCurve.length - 1] as SNCurvePoint;
  if (alternatingStress < last.alternatingStress || alternatingStress === 0) {
    return { cycles: Number.POSITIVE_INFINITY, infinite: true, extrapolated: false };
  }
  const exactPoint = snCurve.find((point) => point.alternatingStress === alternatingStress);
  if (exactPoint) {
    return { cycles: exactPoint.cycles, infinite: false, extrapolated: false };
  }

  let segmentIndex = 0;
  if (alternatingStress <= (snCurve[0] as SNCurvePoint).alternatingStress) {
    segmentIndex = snCurve.findIndex((point, index) => {
      const next = snCurve[index + 1];
      return next !== undefined && alternatingStress >= next.alternatingStress;
    });
    if (segmentIndex < 0) {
      segmentIndex = snCurve.length - 2;
    }
  }

  const first = snCurve[segmentIndex] as SNCurvePoint;
  const second = snCurve[segmentIndex + 1] as SNCurvePoint;
  const logCycles = interpolateLogLog(alternatingStress, first, second);
  return {
    cycles: Math.max(1, Math.exp(logCycles)),
    infinite: false,
    extrapolated: alternatingStress > (snCurve[0] as SNCurvePoint).alternatingStress,
  };
}

export function analyzeFatigueDamage(input: FatigueDamageInput): Computation {
  const criterion = input.meanStressCorrection ?? "goodman";
  validateInput(input, criterion);

  let totalCycles = 0;
  let cumulativeDamage = 0;
  let maximumCycleStress = Number.NEGATIVE_INFINITY;
  let maximumCorrectedAlternatingStress = 0;
  let minimumYieldSafetyFactor = Number.POSITIVE_INFINITY;
  let finiteDamageBlocks = 0;
  let infiniteLifeBlocks = 0;
  let extrapolatedBlocks = 0;
  let hasCompressiveMeanStress = false;
  let governingBlock = 0;
  let largestBlockDamage = 0;
  const rows: Record<string, unknown>[] = [];

  for (const [index, block] of input.blocks.entries()) {
    const correctedAlternatingStress =
      criterion === "goodman"
        ? goodmanEquivalentAlternatingStress(block.meanStress, block.alternatingStress, input.ultimateStrength)
        : block.alternatingStress;
    const allowable = allowableCycles(correctedAlternatingStress, input.snCurve);
    const damage = allowable.infinite ? 0 : block.cycles / allowable.cycles;
    const maximumStress = block.meanStress + block.alternatingStress;
    const minimumStress = block.meanStress - block.alternatingStress;
    const peakStressMagnitude = Math.max(Math.abs(maximumStress), Math.abs(minimumStress));
    const yieldSafetyFactor =
      input.yieldStrength !== undefined && peakStressMagnitude > 0
        ? input.yieldStrength / peakStressMagnitude
        : undefined;

    totalCycles += block.cycles;
    cumulativeDamage += damage;
    maximumCycleStress = Math.max(maximumCycleStress, peakStressMagnitude);
    maximumCorrectedAlternatingStress = Math.max(maximumCorrectedAlternatingStress, correctedAlternatingStress);
    if (damage > 0) {
      finiteDamageBlocks += 1;
    }
    if (allowable.infinite) {
      infiniteLifeBlocks += 1;
    }
    if (allowable.extrapolated) {
      extrapolatedBlocks += 1;
    }
    if (block.meanStress < 0) {
      hasCompressiveMeanStress = true;
    }
    if (yieldSafetyFactor !== undefined) {
      minimumYieldSafetyFactor = Math.min(minimumYieldSafetyFactor, yieldSafetyFactor);
    }
    if (damage > largestBlockDamage) {
      largestBlockDamage = damage;
      governingBlock = index + 1;
    }

    rows.push({
      block: index + 1,
      cycles: block.cycles,
      meanStressPa: block.meanStress,
      alternatingStressPa: block.alternatingStress,
      maximumStressPa: maximumStress,
      minimumStressPa: minimumStress,
      correctedAlternatingStressPa: correctedAlternatingStress,
      allowableCycles: allowable.infinite ? null : allowable.cycles,
      infiniteLife: allowable.infinite,
      extrapolated: allowable.extrapolated,
      damage,
    });
  }

  if (!Number.isFinite(totalCycles) || !Number.isFinite(cumulativeDamage)) {
    throw new Error("The stress spectrum totals must be finite.");
  }

  const minerLifeFactor = cumulativeDamage > 0 ? 1 / cumulativeDamage : Number.POSITIVE_INFINITY;
  const cyclesToFailure = cumulativeDamage > 0 ? totalCycles / cumulativeDamage : Number.POSITIVE_INFINITY;
  const warnings: string[] = [
    "Miner's rule is a linear damage approximation. It does not model load sequence or interaction effects.",
  ];
  if (criterion === "none") {
    warnings.push("Mean-stress correction is disabled. Supply an S-N curve that matches the stress ratio.");
  }
  if (hasCompressiveMeanStress && criterion === "goodman") {
    warnings.push("A compressive mean stress is treated as zero for Goodman correction.");
  }
  if (infiniteLifeBlocks > 0) {
    warnings.push(String(infiniteLifeBlocks) + " block(s) fall below the last S-N point and contribute zero damage.");
  }
  if (extrapolatedBlocks > 0) {
    warnings.push(String(extrapolatedBlocks) + " block(s) exceed the highest S-N point. Their life uses end-segment extrapolation.");
  }
  if (cumulativeDamage > 1) {
    warnings.push("Cumulative Miner damage exceeds one. The repeated spectrum exceeds the damage limit.");
  }
  if (minimumYieldSafetyFactor < 1) {
    warnings.push("The peak cycle stress exceeds the yield strength in at least one block.");
  }

  const quantities: Quantity[] = [
    {
      key: "totalCycles",
      label: "Spectrum cycles",
      value: totalCycles,
      unit: "",
      description: "Total cycles represented by the supplied stress blocks.",
    },
    {
      key: "finiteDamageBlocks",
      label: "Finite-life blocks",
      value: finiteDamageBlocks,
      unit: "",
      description: "Blocks that contribute non-zero Miner damage.",
    },
    {
      key: "cumulativeDamage",
      label: "Cumulative Miner damage",
      value: cumulativeDamage,
      unit: "",
      description: "Sum of block cycles divided by their allowable cycles.",
    },
    {
      key: "cyclesToFailureEstimate",
      label: "Repeated-spectrum life",
      value: cyclesToFailure,
      unit: "",
      description: "Estimated cycles to failure when this spectrum repeats without change.",
    },
    {
      key: "maximumCycleStress",
      label: "Maximum cycle stress",
      value: maximumCycleStress,
      unit: "Pa",
      description: "Largest absolute peak stress in the supplied blocks.",
    },
    {
      key: "maximumCorrectedAlternatingStress",
      label: "Maximum corrected alternating stress",
      value: maximumCorrectedAlternatingStress,
      unit: "Pa",
      description: "Highest alternating stress after the selected mean-stress correction.",
    },
  ];

  if (governingBlock > 0) {
    quantities.push({
      key: "governingBlock",
      label: "Governing damage block",
      value: governingBlock,
      unit: "",
      description: "One-based block number with the largest Miner damage contribution.",
    });
  }

  if (input.yieldStrength !== undefined && minimumYieldSafetyFactor < Number.POSITIVE_INFINITY) {
    quantities.push({
      key: "yieldSafetyFactor",
      label: "Minimum yield safety factor",
      value: minimumYieldSafetyFactor,
      unit: "",
      description: "Yield strength divided by the largest absolute peak stress.",
    });
  }

  const fatigueSafetyFactor = {
    key: "fatigueDamageSafetyFactor",
    label: "Governing fatigue safety factor",
    value: Math.min(minerLifeFactor, minimumYieldSafetyFactor),
    unit: "",
    description: "The lower of the reciprocal Miner damage and the minimum yield safety factor.",
  };

  return {
    method: FATIGUE_DAMAGE_METHOD,
    inputs: {
      blocks: input.blocks,
      snCurve: input.snCurve,
      ultimateStrength: input.ultimateStrength,
      yieldStrength: input.yieldStrength,
      meanStressCorrection: criterion,
    },
    quantities,
    safetyFactor: fatigueSafetyFactor,
    rows,
    referenceIds: FATIGUE_DAMAGE_METHOD.referenceIds,
    warnings,
  };
}

function validateInput(input: FatigueDamageInput, criterion: FatigueDamageCriterion): void {
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
    throw new Error("Provide at least one fatigue damage block.");
  }
  if (input.blocks.length > 100) {
    throw new Error("Provide no more than 100 fatigue damage blocks.");
  }
  validateSNCurve(input.snCurve);
  assertPositiveFinite(input.ultimateStrength, "ultimateStrength");
  if (input.yieldStrength !== undefined) {
    assertPositiveFinite(input.yieldStrength, "yieldStrength");
  }
  for (const [index, block] of input.blocks.entries()) {
    assertFinite(block.meanStress, "blocks[" + index + "].meanStress");
    assertFiniteNonNegative(block.alternatingStress, "blocks[" + index + "].alternatingStress");
    if (!Number.isInteger(block.cycles) || block.cycles <= 0) {
      throw new Error("blocks[" + index + "].cycles must be a positive integer.");
    }
  }
  if (criterion !== "goodman" && criterion !== "none") {
    throw new Error("meanStressCorrection must be goodman or none.");
  }
}

function validateSNCurve(snCurve: SNCurvePoint[]): void {
  if (!Array.isArray(snCurve) || snCurve.length < 2) {
    throw new Error("Provide at least two S-N curve points.");
  }
  if (snCurve.length > 50) {
    throw new Error("Provide no more than 50 S-N curve points.");
  }
  for (const [index, point] of snCurve.entries()) {
    if (!Number.isInteger(point.cycles) || point.cycles <= 0) {
      throw new Error("snCurve[" + index + "].cycles must be a positive integer.");
    }
    assertPositiveFinite(point.alternatingStress, "snCurve[" + index + "].alternatingStress");
    const previous = snCurve[index - 1];
    if (previous && point.cycles <= previous.cycles) {
      throw new Error("snCurve cycles must increase strictly.");
    }
    if (previous && point.alternatingStress >= previous.alternatingStress) {
      throw new Error("snCurve alternatingStress must decrease strictly as cycles increase.");
    }
  }
}

function interpolateLogLog(stress: number, first: SNCurvePoint, second: SNCurvePoint): number {
  const logStress = Math.log(stress);
  const logStress1 = Math.log(first.alternatingStress);
  const logStress2 = Math.log(second.alternatingStress);
  const logCycles1 = Math.log(first.cycles);
  const logCycles2 = Math.log(second.cycles);
  return logCycles1 + ((logStress - logStress1) * (logCycles2 - logCycles1)) / (logStress2 - logStress1);
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(name + " must be finite.");
  }
}

function assertFiniteNonNegative(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) {
    throw new Error(name + " must be zero or positive.");
  }
}

function assertPositiveFinite(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) {
    throw new Error(name + " must be positive.");
  }
}
