import { analyzeFatigue, type FatigueInput } from "./fatigue.js";

export type ShaftFatigueScreenInput = FatigueInput;

export type ShaftFatigueScreenResult = {
  meanStressPa: number;
  alternatingStressPa: number;
  enduranceLimitPa: number;
  fatigueSafetyFactor: number;
  staticYieldSafetyFactor?: number;
  criterion: string;
  warnings: string[];
};

export function analyzeShaftFatigueScreen(input: ShaftFatigueScreenInput): ShaftFatigueScreenResult {
  const computation = analyzeFatigue(input);
  const enduranceLimit = computation.quantities.find((quantity) => quantity.key === "enduranceLimit")?.value;
  const fatigueSafetyFactor = computation.safetyFactor?.value;
  if (enduranceLimit === undefined || fatigueSafetyFactor === undefined) {
    throw new Error("The fatigue analysis did not return its required safety quantities.");
  }

  return {
    meanStressPa: input.meanStress,
    alternatingStressPa: input.alternatingStress,
    enduranceLimitPa: enduranceLimit,
    fatigueSafetyFactor,
    staticYieldSafetyFactor: computation.quantities.find((quantity) => quantity.key === "staticYieldSafetyFactor")?.value,
    criterion: String(computation.inputs.criterion),
    warnings: computation.warnings,
  };
}
