import type { Computation, MethodRecord, Quantity } from "../types.js";

export type FitInput = {
  interfaceRadius: number;
  hubOuterRadius: number;
  shaftInnerRadius?: number;
  interference: number;
  length: number;
  frictionCoefficient?: number;
  shaftElasticModulus: number;
  shaftPoissonRatio?: number;
  shaftYieldStrength?: number;
  hubElasticModulus: number;
  hubPoissonRatio?: number;
  hubYieldStrength?: number;
  requiredTorque?: number;
};

export const PRESS_FIT_METHOD: MethodRecord = {
  id: "press-fit",
  name: "Interference fit by Lamé thick-cylinder theory",
  formula:
    "p = delta / (d K); K = (1/Eh)((Ro^2+r^2)/(Ro^2-r^2)+nu_h) + (1/Ei)((r^2+ri^2)/(r^2-ri^2)-nu_i); F = 2 pi r L p mu; T = F r",
  notes:
    "The diametral interference drives a uniform contact pressure. Hoop stress peaks at the hub bore and, for a hollow shaft, at the shaft bore. The axial and torque capacities use Coulomb friction over the full interface area. The equivalent stress uses the plane-stress von Mises rule from the hoop and radial components.",
  referenceIds: ["shigley-2015", "machinery-handbook", "lame-cylinders"],
};

function equivalentStress(hoop: number, radial: number): number {
  return Math.sqrt(hoop ** 2 + radial ** 2 - hoop * radial);
}

export function analyzePressFit(input: FitInput): Computation {
  const interfaceRadius = input.interfaceRadius;
  const hubOuterRadius = input.hubOuterRadius;
  const shaftInnerRadius = input.shaftInnerRadius ?? 0;
  const friction = input.frictionCoefficient ?? 0.15;

  if (!(interfaceRadius > 0)) {
    throw new Error("interfaceRadius must be positive.");
  }
  if (!(hubOuterRadius > interfaceRadius)) {
    throw new Error("hubOuterRadius must exceed interfaceRadius.");
  }
  if (!(shaftInnerRadius >= 0 && shaftInnerRadius < interfaceRadius)) {
    throw new Error("shaftInnerRadius must be zero or less than interfaceRadius.");
  }
  if (!(input.interference > 0)) {
    throw new Error("interference must be positive. A clearance or line fit produces no pressure.");
  }
  if (!(input.length > 0)) {
    throw new Error("length must be positive.");
  }
  if (!(input.shaftElasticModulus > 0)) {
    throw new Error("shaftElasticModulus must be positive.");
  }
  if (!(input.hubElasticModulus > 0)) {
    throw new Error("hubElasticModulus must be positive.");
  }
  if (!(friction > 0 && friction < 1)) {
    throw new Error("frictionCoefficient must be between zero and one.");
  }

  const nuShaft = input.shaftPoissonRatio ?? 0.3;
  const nuHub = input.hubPoissonRatio ?? 0.3;

  const r = interfaceRadius;
  const ro = hubOuterRadius;
  const ri = shaftInnerRadius;
  const d = 2 * r;

  const shaftTerm = (r ** 2 + ri ** 2) / (r ** 2 - ri ** 2) - nuShaft;
  const hubTerm = (ro ** 2 + r ** 2) / (ro ** 2 - r ** 2) + nuHub;
  const compliance = shaftTerm / input.shaftElasticModulus + hubTerm / input.hubElasticModulus;
  const pressure = input.interference / (d * compliance);

  const hubHoop = (pressure * (ro ** 2 + r ** 2)) / (ro ** 2 - r ** 2);
  const hubRadial = -pressure;
  const shaftHoop = ri === 0 ? -pressure : -(2 * pressure * r ** 2) / (r ** 2 - ri ** 2);
  const shaftRadial = ri === 0 ? -pressure : 0;

  const hubTangential = Math.abs(hubHoop);
  const shaftTangential = Math.abs(shaftHoop);
  const hubEquivalent = equivalentStress(hubHoop, hubRadial);
  const shaftEquivalent = equivalentStress(shaftHoop, shaftRadial);

  const axialForce = 2 * Math.PI * r * input.length * pressure * friction;
  const torque = axialForce * r;

  const quantities: Quantity[] = [
    {
      key: "interfacePressure",
      label: "Interface pressure",
      value: pressure,
      unit: "Pa",
      description: "Contact pressure at the fit interface from the diametral interference.",
    },
    {
      key: "hubTangentialStress",
      label: "Hub tangential stress",
      value: hubTangential,
      unit: "Pa",
      description: "Hoop stress at the hub bore. This is the highest stress in the hub.",
    },
    {
      key: "shaftTangentialStress",
      label: "Shaft tangential stress",
      value: shaftTangential,
      unit: "Pa",
      description:
        ri === 0
          ? "Uniform compressive hoop stress in the solid shaft."
          : "Hoop stress at the shaft bore, the highest stress in a hollow shaft.",
    },
    {
      key: "axialForceCapacity",
      label: "Axial force capacity",
      value: axialForce,
      unit: "N",
      description: "Friction force that the fit resists along the axis of the joint.",
    },
    {
      key: "torqueCapacity",
      label: "Torque capacity",
      value: torque,
      unit: "N·m",
      description: "Friction torque that the fit transmits without slipping.",
    },
  ];

  const safetyCandidates: Quantity[] = [];
  if (input.shaftYieldStrength) {
    safetyCandidates.push({
      key: "shaftSafetyFactor",
      label: "Shaft safety factor",
      value: input.shaftYieldStrength / shaftEquivalent,
      unit: "",
      description: "Shaft yield strength divided by the shaft equivalent stress.",
    });
  }
  if (input.hubYieldStrength) {
    safetyCandidates.push({
      key: "hubSafetyFactor",
      label: "Hub safety factor",
      value: input.hubYieldStrength / hubEquivalent,
      unit: "",
      description: "Hub yield strength divided by the hub equivalent stress.",
    });
  }
  if (input.requiredTorque) {
    safetyCandidates.push({
      key: "torqueSafetyFactor",
      label: "Torque safety factor",
      value: torque / input.requiredTorque,
      unit: "",
      description: "Torque capacity divided by the required torque.",
    });
  }

  const allQuantities: Quantity[] = [...quantities, ...safetyCandidates];

  const warnings: string[] = [];
  if (input.shaftYieldStrength && shaftEquivalent > input.shaftYieldStrength) {
    warnings.push("The shaft equivalent stress exceeds the shaft yield strength. The fit may yield and relax.");
  }
  if (input.hubYieldStrength && hubEquivalent > input.hubYieldStrength) {
    warnings.push("The hub equivalent stress exceeds the hub yield strength. The fit may yield and relax.");
  }
  if (input.requiredTorque && torque < input.requiredTorque) {
    warnings.push("The torque capacity is below the required torque. The fit may slip under load.");
  }

  let safetyFactor: Quantity | undefined;
  if (safetyCandidates.length > 0) {
    safetyFactor = safetyCandidates.reduce((lowest, candidate) =>
      candidate.value < lowest.value ? candidate : lowest,
    );
  }

  return {
    method: PRESS_FIT_METHOD,
    inputs: {
      interfaceRadius: r,
      hubOuterRadius: ro,
      shaftInnerRadius: ri === 0 ? undefined : ri,
      interference: input.interference,
      length: input.length,
      frictionCoefficient: friction,
      shaftElasticModulus: input.shaftElasticModulus,
      shaftPoissonRatio: nuShaft,
      shaftYieldStrength: input.shaftYieldStrength,
      hubElasticModulus: input.hubElasticModulus,
      hubPoissonRatio: nuHub,
      hubYieldStrength: input.hubYieldStrength,
      requiredTorque: input.requiredTorque,
    },
    quantities: allQuantities,
    safetyFactor,
    referenceIds: PRESS_FIT_METHOD.referenceIds,
    warnings,
  };
}
