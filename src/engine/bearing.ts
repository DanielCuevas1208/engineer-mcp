import type { Computation, MethodRecord, Quantity } from "../types.js";

export type BearingType = "ball" | "roller";

export type BearingInput = {
  bearingType: BearingType;
  dynamicLoadRating: number;
  equivalentLoad?: number;
  radialLoad?: number;
  axialLoad?: number;
  speedRpm?: number;
  requiredLifeHours?: number;
};

export const BEARING_METHOD: MethodRecord = {
  id: "bearing-life",
  name: "ISO 281 rating life",
  formula: "L10 = (C/P)^p x 10^6 revolutions, L10h = L10 / (60 n)",
  notes:
    "The load exponent is 3 for ball bearings and 10/3 for roller bearings. The equivalent load uses X and Y factors for a single-row deep-groove ball bearing. Use manufacturer data for exact factors.",
  referenceIds: ["iso-281", "shigley-2015"],
};

export function equivalentLoad(type: BearingType, radial: number, axial: number): { load: number; warning?: string } {
  if (type === "roller") {
    if (axial > 0) {
      return {
        load: radial,
        warning: "Cylindrical roller bearings carry little axial load. Use manufacturer data when axial load exists.",
      };
    }
    return { load: radial };
  }

  const ratio = radial === 0 ? Number.POSITIVE_INFINITY : axial / radial;
  if (ratio <= 0.44) {
    return { load: radial };
  }
  return {
    load: 0.56 * radial + 1.4 * axial,
    warning: "The X and Y factors are typical values for a single-row deep-groove ball bearing.",
  };
}

export function analyzeBearing(input: BearingInput): Computation {
  if (input.equivalentLoad === undefined && input.radialLoad === undefined) {
    throw new Error("Provide equivalentLoad or radialLoad.");
  }
  if (input.equivalentLoad !== undefined && input.radialLoad !== undefined) {
    throw new Error("Provide either equivalentLoad or radialLoad, not both.");
  }

  let load = input.equivalentLoad ?? 0;
  const warnings: string[] = [];
  if (input.equivalentLoad !== undefined) {
    load = input.equivalentLoad;
  } else {
    const combined = equivalentLoad(input.bearingType, input.radialLoad ?? 0, input.axialLoad ?? 0);
    load = combined.load;
    if (combined.warning) {
      warnings.push(combined.warning);
    }
  }

  if (load <= 0) {
    throw new Error("The equivalent load must be positive.");
  }

  const exponent = input.bearingType === "ball" ? 3 : 10 / 3;
  const l10Revolutions = (input.dynamicLoadRating / load) ** exponent * 1e6;
  const l10Hours = input.speedRpm ? l10Revolutions / (60 * input.speedRpm) : undefined;

  const quantities: Quantity[] = [
    {
      key: "l10Revolutions",
      label: "Basic rating life (revolutions)",
      value: l10Revolutions,
      unit: "rev",
      description: "Life at which 90% of an identical bearing population survives, in revolutions.",
    },
    {
      key: "equivalentLoad",
      label: "Equivalent dynamic load",
      value: load,
      unit: "N",
      description: "Constant radial load that gives the same bearing life as the real load.",
    },
  ];

  if (l10Hours !== undefined) {
    quantities.push({
      key: "l10Hours",
      label: "Basic rating life (hours)",
      value: l10Hours,
      unit: "h",
      description: "Rating life expressed in hours at the given operating speed.",
    });
  }

  let safetyFactor: Quantity | undefined;
  if (input.requiredLifeHours !== undefined && l10Hours !== undefined) {
    safetyFactor = {
      key: "lifeMargin",
      label: "Life margin",
      value: l10Hours / input.requiredLifeHours,
      unit: "",
      description: "Rating life divided by the required service life.",
    };
  }

  return {
    method: BEARING_METHOD,
    inputs: {
      bearingType: input.bearingType,
      dynamicLoadRating: input.dynamicLoadRating,
      equivalentLoad: input.equivalentLoad,
      radialLoad: input.radialLoad,
      axialLoad: input.axialLoad,
      speedRpm: input.speedRpm,
      requiredLifeHours: input.requiredLifeHours,
      loadExponent: exponent,
    },
    quantities,
    safetyFactor,
    referenceIds: BEARING_METHOD.referenceIds,
    warnings,
  };
}
