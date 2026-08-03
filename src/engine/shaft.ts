import type { Computation, MethodRecord, Quantity } from "../types.js";

export type ShaftInput = {
  outerDiameter: number;
  innerDiameter?: number;
  length: number;
  torque: number;
  elasticModulus: number;
  shearModulus: number;
  density: number;
  shearYieldStrength?: number;
};

export const SHAFT_METHOD: MethodRecord = {
  id: "shaft-torsion",
  name: "Shaft torsion and lateral critical speed",
  formula:
    "J = pi(D^4 - d^4)/32, tau = T r/J, theta = TL/(JG), omega_c = (pi/L)^2 sqrt(EI/(rho A))",
  notes:
    "Torsion stress uses the outer radius. The angle of twist is in radians. The critical speed is the first lateral mode of a uniform simply supported shaft by the Rayleigh method.",
  referenceIds: ["roark-2011", "rayleigh-shaft"],
};

export function analyzeShaft(input: ShaftInput): Computation {
  const inner = input.innerDiameter ?? 0;
  if (inner >= input.outerDiameter) {
    throw new Error("Inner diameter must be smaller than outer diameter.");
  }

  const polarSecondMoment = (Math.PI * (input.outerDiameter ** 4 - inner ** 4)) / 32;
  const outerRadius = input.outerDiameter / 2;
  const maxShearStress = (input.torque * outerRadius) / polarSecondMoment;
  const angleOfTwist = (input.torque * input.length) / (polarSecondMoment * input.shearModulus);

  const area = (Math.PI * (input.outerDiameter ** 2 - inner ** 2)) / 4;
  const areaMoment = (Math.PI * (input.outerDiameter ** 4 - inner ** 4)) / 64;
  const omega = (Math.PI / input.length) ** 2 * Math.sqrt((input.elasticModulus * areaMoment) / (input.density * area));
  const criticalSpeedRpm = (omega * 60) / (2 * Math.PI);

  const quantities: Quantity[] = [
    {
      key: "polarSecondMoment",
      label: "Polar second moment of area",
      value: polarSecondMoment,
      unit: "m4",
      description: "Torsional section property J for the shaft cross-section.",
    },
    {
      key: "maxShearStress",
      label: "Maximum shear stress",
      value: maxShearStress,
      unit: "Pa",
      description: "Shear stress at the outer surface from applied torque.",
    },
    {
      key: "angleOfTwist",
      label: "Angle of twist",
      value: angleOfTwist,
      unit: "rad",
      description: "Total twist across the shaft length due to torque.",
    },
    {
      key: "criticalSpeed",
      label: "First lateral critical speed",
      value: criticalSpeedRpm,
      unit: "rpm",
      description: "First bending natural speed for a uniform simply supported shaft.",
    },
  ];

  let safetyFactor: Quantity | undefined;
  if (input.shearYieldStrength) {
    safetyFactor = {
      key: "torsionSafetyFactor",
      label: "Torsion safety factor",
      value: input.shearYieldStrength / maxShearStress,
      unit: "",
      description: "Shear yield strength divided by the maximum shear stress.",
    };
  }

  return {
    method: SHAFT_METHOD,
    inputs: {
      outerDiameter: input.outerDiameter,
      innerDiameter: inner === 0 ? undefined : inner,
      length: input.length,
      torque: input.torque,
      elasticModulus: input.elasticModulus,
      shearModulus: input.shearModulus,
      density: input.density,
      shearYieldStrength: input.shearYieldStrength,
    },
    quantities,
    safetyFactor,
    referenceIds: SHAFT_METHOD.referenceIds,
    warnings: [],
  };
}
