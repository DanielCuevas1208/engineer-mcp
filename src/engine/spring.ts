import type { Computation, MethodRecord, Quantity } from "../types.js";

export type SpringEndType = "plain" | "plain_ground" | "squared" | "squared_ground";

export type SpringInput = {
  wireDiameter: number;
  meanDiameter: number;
  activeCoils: number;
  endType?: SpringEndType;
  freeLength: number;
  load: number;
  shearModulus: number;
  shearYieldStrength?: number;
};

export const SPRING_METHOD: MethodRecord = {
  id: "spring-design",
  name: "Helical compression spring design",
  formula:
    "C = D/d, K_w = (4C-1)/(4C-4) + 0.615/C, tau = K_w 8FD/(pi d^3), k = G d^4/(8 D^3 Na), delta = F/k, Ls = d Nt",
  notes:
    "Round-wire closed-form geometry. The Wahl factor corrects the shear stress for curvature and direct shear. The total coil count and the solid height follow the end condition. Check fatigue life separately for cyclic loads.",
  referenceIds: ["shigley-2015", "machinery-handbook"],
};

const END_TYPE_COILS: Record<SpringEndType, number> = {
  plain: 0,
  plain_ground: 1,
  squared: 2,
  squared_ground: 2,
};

const SOLID_HEIGHT_EXTRA_COIL: Record<SpringEndType, boolean> = {
  plain: true,
  plain_ground: false,
  squared: true,
  squared_ground: false,
};

const LOW_INDEX_WARNING = 4;
const HIGH_INDEX_WARNING = 12;
const UNGUIDED_BUCKLING_RATIO = 2.63;
const GUIDED_BUCKLING_RATIO = 5.4;

export function wahlFactor(springIndex: number): number {
  return (4 * springIndex - 1) / (4 * springIndex - 4) + 0.615 / springIndex;
}

export function totalCoils(activeCoils: number, endType: SpringEndType): number {
  return activeCoils + END_TYPE_COILS[endType];
}

export function solidHeight(wireDiameter: number, coilCount: number, endType: SpringEndType): number {
  const extra = SOLID_HEIGHT_EXTRA_COIL[endType] ? 1 : 0;
  return wireDiameter * (coilCount + extra);
}

export function analyzeSpring(input: SpringInput): Computation {
  if (!(input.wireDiameter > 0)) {
    throw new Error("wireDiameter must be positive.");
  }
  if (!(input.meanDiameter > 0)) {
    throw new Error("meanDiameter must be positive.");
  }
  if (input.meanDiameter <= input.wireDiameter) {
    throw new Error("meanDiameter must exceed wireDiameter.");
  }
  if (!(input.activeCoils > 0)) {
    throw new Error("activeCoils must be positive.");
  }
  if (!(input.shearModulus > 0)) {
    throw new Error("shearModulus must be positive.");
  }
  if (!(input.freeLength > 0)) {
    throw new Error("freeLength must be positive.");
  }
  if (!(input.load >= 0)) {
    throw new Error("load must be zero or positive.");
  }

  const endType = input.endType ?? "squared_ground";
  const springIndex = input.meanDiameter / input.wireDiameter;
  const kFactor = wahlFactor(springIndex);
  const coilCount = totalCoils(input.activeCoils, endType);
  const solidLen = solidHeight(input.wireDiameter, coilCount, endType);

  if (input.freeLength <= solidLen) {
    throw new Error("freeLength must exceed the solid height.");
  }

  const springRate = (input.shearModulus * input.wireDiameter ** 4) / (8 * input.meanDiameter ** 3 * input.activeCoils);
  const deflection = input.load / springRate;
  const workingLength = input.freeLength - deflection;
  const shearStress = (kFactor * 8 * input.load * input.meanDiameter) / (Math.PI * input.wireDiameter ** 3);

  const warnings: string[] = [];
  if (springIndex < LOW_INDEX_WARNING) {
    warnings.push("The spring index is below 4. Small indices raise manufacturing difficulty.");
  } else if (springIndex > HIGH_INDEX_WARNING) {
    warnings.push("The spring index exceeds 12. Large indices make the spring prone to buckling.");
  }

  const slenderness = input.freeLength / input.meanDiameter;
  if (slenderness > GUIDED_BUCKLING_RATIO) {
    warnings.push("The free-length to mean-diameter ratio exceeds 5.4. The spring may buckle even when guided.");
  } else if (slenderness > UNGUIDED_BUCKLING_RATIO) {
    warnings.push(
      "The free-length to mean-diameter ratio exceeds 2.63. An unguided spring may buckle. Guide the spring or shorten it.",
    );
  }

  if (input.load > 0 && workingLength <= solidLen) {
    warnings.push("The applied load compresses the spring to solid height. Reduce the load or increase the free length.");
  }

  const quantities: Quantity[] = [
    {
      key: "springIndex",
      label: "Spring index",
      value: springIndex,
      unit: "",
      description: "Ratio of the mean coil diameter to the wire diameter.",
    },
    {
      key: "wahlFactor",
      label: "Wahl factor",
      value: kFactor,
      unit: "",
      description: "Shear stress correction for curvature and direct shear.",
    },
    {
      key: "totalCoils",
      label: "Total coils",
      value: coilCount,
      unit: "",
      description: "Active coils plus the inactive end coils.",
    },
    {
      key: "solidHeight",
      label: "Solid height",
      value: solidLen,
      unit: "m",
      description: "Spring length when every coil touches.",
    },
    {
      key: "springRate",
      label: "Spring rate",
      value: springRate,
      unit: "N/m",
      description: "Load required for one metre of deflection.",
    },
    {
      key: "deflection",
      label: "Deflection at load",
      value: deflection,
      unit: "m",
      description: "Compression from the free length under the applied load.",
    },
    {
      key: "workingLength",
      label: "Working length",
      value: workingLength,
      unit: "m",
      description: "Spring length under the applied load.",
    },
    {
      key: "maxShearStress",
      label: "Maximum shear stress",
      value: shearStress,
      unit: "Pa",
      description: "Wahl-corrected shear stress at the inner coil surface.",
    },
  ];

  let safetyFactor: Quantity | undefined;
  if (input.shearYieldStrength && shearStress > 0) {
    safetyFactor = {
      key: "springSafetyFactor",
      label: "Spring safety factor",
      value: input.shearYieldStrength / shearStress,
      unit: "",
      description: "Torsional yield strength divided by the maximum shear stress.",
    };
  }

  return {
    method: SPRING_METHOD,
    inputs: {
      wireDiameter: input.wireDiameter,
      meanDiameter: input.meanDiameter,
      activeCoils: input.activeCoils,
      endType,
      freeLength: input.freeLength,
      load: input.load,
      shearModulus: input.shearModulus,
      shearYieldStrength: input.shearYieldStrength,
      springIndex,
      slenderness,
    },
    quantities,
    safetyFactor,
    referenceIds: SPRING_METHOD.referenceIds,
    warnings,
  };
}
