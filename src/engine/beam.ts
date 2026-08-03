import type { Computation, MethodRecord, Quantity } from "../types.js";
import { computeSection, type SectionDef } from "./sections.js";

export type BeamSupport = "simply_supported" | "cantilever";
export type BeamLoad = "point" | "uniform";

export type BeamInput = {
  support: BeamSupport;
  load: BeamLoad;
  loadMagnitude: number;
  length: number;
  elasticModulus: number;
  yieldStrength?: number;
  section?: SectionDef;
  secondMomentOfArea?: number;
  sectionModulus?: number;
};

export const BEAM_METHOD: MethodRecord = {
  id: "beam-bending",
  name: "Euler-Bernoulli beam theory",
  formula:
    "simply supported, point: M = FL/4, delta = FL^3/(48EI). Uniform: M = wL^2/8, delta = 5wL^4/(384EI). Cantilever, point: M = FL, delta = FL^3/(3EI). Uniform: M = wL^2/2, delta = wL^4/(8EI)",
  notes:
    "Small deflections with elastic material behavior. Load points down. The bending stress uses sigma = M/Z. The safety factor compares yield strength to the maximum bending stress.",
  referenceIds: ["roark-2011", "euler-bernoulli"],
};

export function analyzeBeam(input: BeamInput): Computation {
  let secondMomentOfArea = input.secondMomentOfArea;
  let sectionModulus = input.sectionModulus;
  if (input.section) {
    const props = computeSection(input.section);
    secondMomentOfArea = props.secondMomentOfArea;
    sectionModulus = props.sectionModulus;
  }
  if (secondMomentOfArea === undefined || sectionModulus === undefined) {
    throw new Error("Provide a section, or both secondMomentOfArea and sectionModulus.");
  }

  const { support, load, loadMagnitude, length, elasticModulus } = input;

  let maxMoment: number;
  let maxDeflection: number;
  if (support === "simply_supported" && load === "point") {
    maxMoment = (loadMagnitude * length) / 4;
    maxDeflection = (loadMagnitude * length ** 3) / (48 * elasticModulus * secondMomentOfArea);
  } else if (support === "simply_supported" && load === "uniform") {
    maxMoment = (loadMagnitude * length ** 2) / 8;
    maxDeflection = (5 * loadMagnitude * length ** 4) / (384 * elasticModulus * secondMomentOfArea);
  } else if (support === "cantilever" && load === "point") {
    maxMoment = loadMagnitude * length;
    maxDeflection = (loadMagnitude * length ** 3) / (3 * elasticModulus * secondMomentOfArea);
  } else {
    maxMoment = (loadMagnitude * length ** 2) / 2;
    maxDeflection = (loadMagnitude * length ** 4) / (8 * elasticModulus * secondMomentOfArea);
  }

  const maxStress = maxMoment / sectionModulus;

  const quantities: Quantity[] = [
    {
      key: "maxBendingMoment",
      label: "Maximum bending moment",
      value: maxMoment,
      unit: "N·m",
      description: "Maximum internal bending moment for the selected support and load case.",
    },
    {
      key: "maxBendingStress",
      label: "Maximum bending stress",
      value: maxStress,
      unit: "Pa",
      description: "Peak bending stress at the extreme fibre, computed as M divided by the section modulus.",
    },
    {
      key: "maxDeflection",
      label: "Maximum deflection",
      value: maxDeflection,
      unit: "m",
      description: "Peak elastic deflection at the point of maximum moment.",
    },
  ];

  let safetyFactor: Quantity | undefined;
  if (input.yieldStrength) {
    safetyFactor = {
      key: "bendingSafetyFactor",
      label: "Bending safety factor",
      value: input.yieldStrength / maxStress,
      unit: "",
      description: "Yield strength divided by the maximum bending stress.",
    };
  }

  return {
    method: BEAM_METHOD,
    inputs: {
      support,
      load,
      loadMagnitude,
      length,
      elasticModulus,
      yieldStrength: input.yieldStrength,
      section: input.section,
      secondMomentOfArea,
      sectionModulus,
    },
    quantities,
    safetyFactor,
    referenceIds: BEAM_METHOD.referenceIds,
    warnings: [],
  };
}
