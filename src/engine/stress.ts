import type { Computation, MethodRecord, Quantity } from "../types.js";

export type StressMode = "principal" | "cartesian";

export type StressInput =
  | {
      mode: "principal";
      sigma1: number;
      sigma2: number;
      sigma3: number;
      yieldStrength?: number;
    }
  | {
      mode: "cartesian";
      sigmaX: number;
      sigmaY: number;
      sigmaZ?: number;
      tauXY?: number;
      tauXZ?: number;
      tauYZ?: number;
      yieldStrength?: number;
    };

export const VON_MISES_METHOD: MethodRecord = {
  id: "von-mises",
  name: "von Mises equivalent stress",
  formula: "vm = sqrt(0.5[(s1-s2)^2 + (s2-s3)^2 + (s3-s1)^2])",
  notes:
    "The safety factor uses von Mises stress against tensile yield strength. Maximum shear follows the Tresca criterion.",
  referenceIds: ["shigley-2015"],
};

export function vonMises(input: StressInput): Computation {
  let vm: number;
  let maxShear: number;
  let description: string;

  if (input.mode === "principal") {
    const { sigma1, sigma2, sigma3 } = input;
    vm = Math.sqrt(0.5 * ((sigma1 - sigma2) ** 2 + (sigma2 - sigma3) ** 2 + (sigma3 - sigma1) ** 2));
    maxShear = (Math.max(sigma1, sigma2, sigma3) - Math.min(sigma1, sigma2, sigma3)) / 2;
    description = "Computed from the three principal stresses.";
  } else {
    const sigmaX = input.sigmaX;
    const sigmaY = input.sigmaY;
    const sigmaZ = input.sigmaZ ?? 0;
    const tauXY = input.tauXY ?? 0;
    const tauXZ = input.tauXZ ?? 0;
    const tauYZ = input.tauYZ ?? 0;
    vm = Math.sqrt(
      0.5 * ((sigmaX - sigmaY) ** 2 + (sigmaY - sigmaZ) ** 2 + (sigmaZ - sigmaX) ** 2) +
        3 * (tauXY ** 2 + tauXZ ** 2 + tauYZ ** 2),
    );
    const sigmaMax = Math.max(sigmaX, sigmaY, sigmaZ);
    const sigmaMin = Math.min(sigmaX, sigmaY, sigmaZ);
    maxShear = (sigmaMax - sigmaMin) / 2;
    description = "Computed from the orthogonal stress components.";
  }

  const quantities: Quantity[] = [
    {
      key: "vonMisesStress",
      label: "von Mises equivalent stress",
      value: vm,
      unit: "Pa",
      description,
    },
    {
      key: "maxShearStress",
      label: "Maximum shear stress",
      value: maxShear,
      unit: "Pa",
      description: "Tresca maximum shear stress for the same stress state.",
    },
  ];

  let safetyFactor: Quantity | undefined;
  if (input.yieldStrength) {
    safetyFactor = {
      key: "yieldSafetyFactor",
      label: "Yield safety factor",
      value: input.yieldStrength / vm,
      unit: "",
      description: "Tensile yield strength divided by von Mises stress.",
    };
  }

  return {
    method: VON_MISES_METHOD,
    inputs: input,
    quantities,
    safetyFactor,
    referenceIds: VON_MISES_METHOD.referenceIds,
    warnings: [],
  };
}
