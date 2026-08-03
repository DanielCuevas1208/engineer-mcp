import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FitInput = {
  hubOuterDiameter: number;
  interfaceDiameter: number;
  shaftInnerDiameter?: number;
  hubLength: number;
  diametralInterference: number;
  hubElasticModulus: number;
  hubPoissonRatio?: number;
  hubYieldStrength?: number;
  shaftElasticModulus: number;
  shaftPoissonRatio?: number;
  shaftYieldStrength?: number;
  frictionCoefficient?: number;
  appliedAxialForce?: number;
};

export const PRESS_FIT_METHOD: MethodRecord = {
  id: "press-fit",
  name: "Interference fit by Lamé thick-cylinder theory",
  formula:
    "p = u / (r ((1/Eh)((ro^2+r^2)/(ro^2-r^2)+nh) + (1/Es)((r^2+ri^2)/(r^2-ri^2)-ns))), u = I/2, sigma_t,h = p (ro^2+r^2)/(ro^2-r^2), F = mu p pi d L, T = F r",
  notes:
    "Plane-stress Lamé solution for two cylinders in interference. The hub carries tensile hoop stress, the shaft carries compressive hoop stress. A solid shaft sees biaxial compression equal to the contact pressure. The press-in force assumes a uniform friction coefficient over the full engagement length. The default coefficient of 0.15 suits dry steel-on-steel.",
  referenceIds: ["shigley-2015", "machinery-handbook", "roark-2011"],
};

const DEFAULT_POISSON_RATIO = 0.3;
const DEFAULT_FRICTION = 0.15;
const THIN_HUB_RATIO = 1.5;

export function planeStressVonMises(sigmaTangential: number, sigmaRadial: number): number {
  const [a, b, c] = [sigmaTangential, sigmaRadial, 0];
  return Math.sqrt(0.5 * ((a - b) ** 2 + (b - c) ** 2 + (c - a) ** 2));
}

export function analyzePressFit(input: FitInput): Computation {
  if (!(input.hubOuterDiameter > 0)) {
    throw new Error("hubOuterDiameter must be positive.");
  }
  if (!(input.interfaceDiameter > 0)) {
    throw new Error("interfaceDiameter must be positive.");
  }
  if (input.interfaceDiameter >= input.hubOuterDiameter) {
    throw new Error("hubOuterDiameter must exceed interfaceDiameter.");
  }
  const shaftInner = input.shaftInnerDiameter ?? 0;
  if (shaftInner < 0 || shaftInner >= input.interfaceDiameter) {
    throw new Error("shaftInnerDiameter must be smaller than interfaceDiameter.");
  }
  if (!(input.hubLength > 0)) {
    throw new Error("hubLength must be positive.");
  }
  if (!(input.diametralInterference > 0)) {
    throw new Error("diametralInterference must be positive.");
  }
  if (!(input.hubElasticModulus > 0)) {
    throw new Error("hubElasticModulus must be positive.");
  }
  if (!(input.shaftElasticModulus > 0)) {
    throw new Error("shaftElasticModulus must be positive.");
  }
  const hubPoisson = input.hubPoissonRatio ?? DEFAULT_POISSON_RATIO;
  const shaftPoisson = input.shaftPoissonRatio ?? DEFAULT_POISSON_RATIO;
  if (!(hubPoisson >= 0 && hubPoisson < 0.5)) {
    throw new Error("hubPoissonRatio must be below 0.5.");
  }
  if (!(shaftPoisson >= 0 && shaftPoisson < 0.5)) {
    throw new Error("shaftPoissonRatio must be below 0.5.");
  }
  const friction = input.frictionCoefficient ?? DEFAULT_FRICTION;
  if (!(friction >= 0)) {
    throw new Error("frictionCoefficient must be zero or positive.");
  }

  const innerRadius = shaftInner / 2;
  const interfaceRadius = input.interfaceDiameter / 2;
  const outerRadius = input.hubOuterDiameter / 2;
  const radialInterference = input.diametralInterference / 2;

  const hubTerm = (outerRadius ** 2 + interfaceRadius ** 2) / (outerRadius ** 2 - interfaceRadius ** 2) + hubPoisson;
  const shaftTerm = (interfaceRadius ** 2 + innerRadius ** 2) / (interfaceRadius ** 2 - innerRadius ** 2) - shaftPoisson;

  const contactPressure =
    radialInterference / (interfaceRadius * (hubTerm / input.hubElasticModulus + shaftTerm / input.shaftElasticModulus));

  const hubTangentialStress =
    (contactPressure * (outerRadius ** 2 + interfaceRadius ** 2)) / (outerRadius ** 2 - interfaceRadius ** 2);
  const shaftTangentialStress =
    (-contactPressure * (interfaceRadius ** 2 + innerRadius ** 2)) / (interfaceRadius ** 2 - innerRadius ** 2);
  const radialStress = -contactPressure;

  const hubVonMisesStress = planeStressVonMises(hubTangentialStress, radialStress);
  const shaftVonMisesStress = planeStressVonMises(shaftTangentialStress, radialStress);

  const contactArea = Math.PI * input.interfaceDiameter * input.hubLength;
  const pressForce = friction * contactPressure * contactArea;
  const torqueCapacity = pressForce * interfaceRadius;

  const quantities: Quantity[] = [
    {
      key: "contactPressure",
      label: "Interface contact pressure",
      value: contactPressure,
      unit: "Pa",
      description: "Uniform radial pressure at the interface caused by the interference.",
    },
    {
      key: "hubTangentialStress",
      label: "Hub tangential stress",
      value: hubTangentialStress,
      unit: "Pa",
      description: "Tensile hoop stress at the hub bore.",
    },
    {
      key: "shaftTangentialStress",
      label: "Shaft tangential stress",
      value: shaftTangentialStress,
      unit: "Pa",
      description: "Compressive hoop stress at the shaft surface.",
    },
    {
      key: "radialStress",
      label: "Radial stress at interface",
      value: radialStress,
      unit: "Pa",
      description: "Compressive radial stress equal to the negative of the contact pressure.",
    },
    {
      key: "hubVonMisesStress",
      label: "Hub von Mises stress",
      value: hubVonMisesStress,
      unit: "Pa",
      description: "Equivalent stress at the hub bore under plane stress.",
    },
    {
      key: "shaftVonMisesStress",
      label: "Shaft von Mises stress",
      value: shaftVonMisesStress,
      unit: "Pa",
      description: "Equivalent stress in the shaft under plane stress.",
    },
    {
      key: "pressForce",
      label: "Press-in force",
      value: pressForce,
      unit: "N",
      description: "Axial force needed to assemble the joint at the given friction coefficient.",
    },
    {
      key: "torqueCapacity",
      label: "Torque capacity",
      value: torqueCapacity,
      unit: "N·m",
      description: "Torque the joint can transmit before slipping at the interface.",
    },
  ];

  const warnings: string[] = [];
  if (outerRadius / interfaceRadius < THIN_HUB_RATIO) {
    warnings.push("The hub is thin. The solution stays valid but check local yielding near the bore.");
  }

  let safetyFactor: Quantity | undefined;
  if (input.hubYieldStrength) {
    safetyFactor = {
      key: "hubSafetyFactor",
      label: "Hub safety factor",
      value: input.hubYieldStrength / hubVonMisesStress,
      unit: "",
      description: "Hub yield strength divided by the hub von Mises stress.",
    };
  }

  if (input.shaftYieldStrength && shaftVonMisesStress > 0) {
    quantities.push({
      key: "shaftSafetyFactor",
      label: "Shaft safety factor",
      value: input.shaftYieldStrength / shaftVonMisesStress,
      unit: "",
      description: "Shaft yield strength divided by the shaft von Mises stress.",
    });
  }

  if (input.appliedAxialForce !== undefined) {
    quantities.push({
      key: "axialJointSafetyFactor",
      label: "Axial joint safety factor",
      value: pressForce / input.appliedAxialForce,
      unit: "",
      description: "Press-in force divided by the applied axial force.",
    });
    if (input.appliedAxialForce > pressForce) {
      warnings.push("The applied axial force exceeds the press-in force. The joint may separate or slip.");
    }
  }

  return {
    method: PRESS_FIT_METHOD,
    inputs: {
      hubOuterDiameter: input.hubOuterDiameter,
      interfaceDiameter: input.interfaceDiameter,
      shaftInnerDiameter: shaftInner,
      hubLength: input.hubLength,
      diametralInterference: input.diametralInterference,
      radialInterference,
      hubPoissonRatio: hubPoisson,
      shaftPoissonRatio: shaftPoisson,
      frictionCoefficient: friction,
      hubElasticModulus: input.hubElasticModulus,
      hubYieldStrength: input.hubYieldStrength,
      shaftElasticModulus: input.shaftElasticModulus,
      shaftYieldStrength: input.shaftYieldStrength,
      appliedAxialForce: input.appliedAxialForce,
    },
    quantities,
    safetyFactor,
    referenceIds: PRESS_FIT_METHOD.referenceIds,
    warnings,
  };
}
