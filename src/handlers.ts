import { analyzeFatigueDamage, type FatigueDamageInput, type FatigueDamageCriterion } from "./engine/fatigue-damage.js";
import type { AppContext } from "./context.js";
import {
  analyzeBeam,
  analyzeBearing,
  analyzeBolt,
  analyzeFatigue,
  analyzePressFit,
  analyzeShaft,
  analyzeShaftFatigueScreen,
  analyzeShaftLoadCases,
  analyzeSpring,
  analyzeToleranceStack,
  analyzeUncertaintySweep,
  FATIGUE_SWEEP_PARAMETERS,
  computeSection,
  vonMises,
  type FatigueCriterion,
  type FatigueInput,
  type SectionDef,
  type SpringEndType,
  type SurfaceFinish,
  type ToleranceDimension,
  type ToleranceSign,
  type ShaftLoadCase,
  type ShaftLoadCaseSection,
  type FatigueSweepParameter,
  type UncertaintySweepCase,
} from "./engine/index.js";
import type { Computation, MethodRecord, Quantity, ReferenceRecord, ToolFailure, ToolResponse, ToolResult } from "./types.js";
import type { UnitOutcome } from "./units/index.js";

export type Handler = (input: Record<string, unknown>) => ToolResponse;

export type ToolDefinition = {
  name: string;
  description: string;
  handler: Handler;
};

const MATERIAL_METHOD: MethodRecord = {
  id: "material-lookup",
  name: "Material property lookup",
  formula: "Database query of curated material data",
  notes: "Values are minimum or typical published figures for common grades. Check the cited source for exact values.",
  referenceIds: [],
};

const SECTION_CATALOG_METHOD: MethodRecord = {
  id: "section-catalog",
  name: "Standard section catalog lookup",
  formula: "Database query of published rolled-section dimensions and section properties",
  notes:
    "EN 10365 supplies nominal dimensions and masses. ArcelorMittal supplies the section-property columns. Fillets and root radii remain included.",
  referenceIds: ["en-10365", "arcelormittal-sections"],
};

const UNIT_METHOD: MethodRecord = {
  id: "unit-convert",
  name: "Dimension-safe unit conversion",
  formula: "converted = (value + offsetFrom) x factorFrom / factorTo - offsetTo",
  notes:
    "Every unit carries a dimension vector and a quantity category. Conversions reject mismatched dimensions and mismatched categories.",
  referenceIds: [],
};

function failure(tool: string, error: string, input: Record<string, unknown>): ToolFailure {
  return { ok: false, tool, error, input };
}

function resolveReferences(ctx: AppContext, ids: string[]): ReferenceRecord[] {
  const seen = new Set<string>();
  const records: ReferenceRecord[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const record = ctx.references.get(id);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function applyUnitOverrides(
  ctx: AppContext,
  quantities: Quantity[],
  overrides: Record<string, string> | undefined,
): { quantities: Quantity[]; warnings: string[] } {
  if (!overrides) {
    return { quantities, warnings: [] };
  }
  const warnings: string[] = [];
  const mapped = quantities.map((quantity) => {
    const requested = overrides[quantity.key];
    if (!requested) {
      return quantity;
    }
    const outcome: UnitOutcome = ctx.convertUnit(quantity.value, quantity.unit, requested);
    if (!outcome.ok) {
      warnings.push(`Could not convert ${quantity.key}: ${outcome.error}`);
      return quantity;
    }
    return { ...quantity, value: outcome.value, unit: requested };
  });
  return { quantities: mapped, warnings };
}

function buildResult(
  ctx: AppContext,
  tool: string,
  computation: Computation,
  overrides?: Record<string, string>,
): ToolResult {
  const { quantities, warnings } = applyUnitOverrides(ctx, computation.quantities, overrides);
  const result: ToolResult = {
    ok: true,
    tool,
    method: computation.method,
    inputs: computation.inputs,
    quantities,
    safetyFactor: computation.safetyFactor,
    references: resolveReferences(ctx, computation.referenceIds),
    warnings: [...computation.warnings, ...warnings],
  };
  if (computation.rows !== undefined) {
    result.rows = computation.rows;
  }
  if (computation.meta !== undefined) {
    result.meta = computation.meta;
  }
  return result;
}

type MaterialValues = {
  elasticModulusPa: number;
  shearModulusPa?: number;
  densityKgM3?: number;
  yieldStrengthPa?: number;
  ultimateStrengthPa?: number;
};

type SectionInput = SectionDef | { shape: "standard"; designation: string };

function resolveStandardSection(
  ctx: AppContext,
  section: SectionInput | undefined,
): { secondMomentOfArea: number; sectionModulus: number; referenceIds: string[] } | { error: string } {
  if (!section || section.shape !== "standard") {
    return { secondMomentOfArea: 0, sectionModulus: 0, referenceIds: [] };
  }
  const row = ctx.findSection(section.designation);
  if (!row) {
    const series = ctx.listSectionSeries().join(", ");
    return { error: `Unknown standard section: ${section.designation}. Available series: ${series}` };
  }
  return {
    secondMomentOfArea: row.secondMomentCm4 * 1e-8,
    sectionModulus: row.sectionModulusCm3 * 1e-6,
    referenceIds: [row.dimensionsReferenceId, row.propertiesReferenceId],
  };
}

function materialValues(ctx: AppContext, name: string): MaterialValues | undefined {
  const material = ctx.findMaterial(name);
  if (!material) {
    return undefined;
  }
  return {
    elasticModulusPa: material.elasticModulusGPa * 1e9,
    shearModulusPa: material.shearModulusGPa ? material.shearModulusGPa * 1e9 : undefined,
    densityKgM3: material.densityKgM3,
    yieldStrengthPa: material.yieldStrengthMPa ? material.yieldStrengthMPa * 1e6 : undefined,
    ultimateStrengthPa: material.ultimateStrengthMPa * 1e6,
  };
}

function beamHandler(ctx: AppContext): Handler {
  return (input) => {
    const materialName = input.material as string | undefined;
    const values = materialName ? materialValues(ctx, materialName) : undefined;
    if (materialName && !values) {
      return failure("beam_bending", `Unknown material: ${materialName}`, input);
    }

    const elasticModulus = (input.elasticModulus as number | undefined) ?? values?.elasticModulusPa;
    if (!elasticModulus) {
      return failure("beam_bending", "Provide elasticModulus or a known material.", input);
    }
    const yieldStrength = (input.yieldStrength as number | undefined) ?? values?.yieldStrengthPa;

    const section = input.section as SectionInput | undefined;
    const resolved = resolveStandardSection(ctx, section);
    if ("error" in resolved) {
      return failure("beam_bending", resolved.error, input);
    }
    const usesStandard = section?.shape === "standard";

    try {
      const computation = analyzeBeam({
        support: input.support as "simply_supported" | "cantilever",
        load: input.load as "point" | "uniform",
        loadMagnitude: input.loadMagnitude as number,
        length: input.length as number,
        elasticModulus,
        yieldStrength,
        section: section && section.shape !== "standard" ? (section as SectionDef) : undefined,
        secondMomentOfArea: usesStandard ? resolved.secondMomentOfArea : (input.secondMomentOfArea as number | undefined),
        sectionModulus: usesStandard ? resolved.sectionModulus : (input.sectionModulus as number | undefined),
      });
      if (usesStandard) {
        computation.referenceIds = [...computation.referenceIds, ...resolved.referenceIds];
      }
      return buildResult(ctx, "beam_bending", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("beam_bending", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function sectionPropsHandler(ctx: AppContext): Handler {
  return (input) => {
    const section = input.section as SectionInput;
    if (section.shape === "standard") {
      const row = ctx.findSection(section.designation);
      if (!row) {
        const series = ctx.listSectionSeries().join(", ");
        return failure("section_properties", `Unknown standard section: ${section.designation}. Available series: ${series}`, input);
      }
      const secondMomentOfArea = row.secondMomentCm4 * 1e-8;
      const area = row.areaCm2 * 1e-4;
      const computation: Computation = {
        method: SECTION_CATALOG_METHOD,
        inputs: { designation: row.designation, series: row.series, standard: row.standard },
        quantities: [
          {
            key: "height",
            label: "Section height",
            value: row.heightMm * 1e-3,
            unit: "m",
            description: "Overall height of the rolled section.",
          },
          {
            key: "flangeWidth",
            label: "Flange width",
            value: row.flangeWidthMm * 1e-3,
            unit: "m",
            description: "Width across the flanges.",
          },
          {
            key: "area",
            label: "Cross-section area",
            value: area,
            unit: "m2",
            description: "Nominal cross-section area from the standard tables.",
          },
          {
            key: "massPerMetre",
            label: "Mass per metre",
            value: row.massPerMetreKgM,
            unit: "kg/m",
            description: "Nominal mass per unit length from the standard tables.",
          },
          {
            key: "secondMomentOfArea",
            label: "Second moment of area (x-x)",
            value: secondMomentOfArea,
            unit: "m4",
            description: "Published second moment of area about the strong axis.",
          },
          {
            key: "sectionModulus",
            label: "Section modulus (x-x)",
            value: row.sectionModulusCm3 * 1e-6,
            unit: "m3",
            description: "Published elastic section modulus about the strong axis.",
          },
          {
            key: "radiusOfGyration",
            label: "Radius of gyration",
            value: Math.sqrt(secondMomentOfArea / area),
            unit: "m",
            description: "Radius of gyration about the strong axis, derived from the published values.",
          },
        ],
        referenceIds: [row.dimensionsReferenceId, row.propertiesReferenceId],
        warnings: [],
      };
      return buildResult(ctx, "section_properties", computation, input.outputUnits as Record<string, string> | undefined);
    }

    try {
      const props = computeSection(section as SectionDef);
      const computation: Computation = {
        method: {
          id: "section-properties",
          name: "Standard cross-section geometry",
          formula: "A, I, Z, and r from closed-form section formulas",
          notes: "Moments of inertia use the section centroid axes.",
          referenceIds: ["roark-2011", "machinery-handbook"],
        },
        inputs: { section: input.section },
        quantities: [
          { key: "area", label: "Cross-section area", value: props.area, unit: "m2", description: "Area of the cross-section." },
          {
            key: "secondMomentOfArea",
            label: "Second moment of area (x-x)",
            value: props.secondMomentOfArea,
            unit: "m4",
            description: "Moment of inertia about the horizontal centroidal axis.",
          },
          {
            key: "secondMomentOfAreaY",
            label: "Second moment of area (y-y)",
            value: props.secondMomentOfAreaY,
            unit: "m4",
            description: "Moment of inertia about the vertical centroidal axis.",
          },
          {
            key: "sectionModulus",
            label: "Section modulus (x-x)",
            value: props.sectionModulus,
            unit: "m3",
            description: "Section modulus for bending about the horizontal axis.",
          },
          {
            key: "sectionModulusY",
            label: "Section modulus (y-y)",
            value: props.sectionModulusY,
            unit: "m3",
            description: "Section modulus for bending about the vertical axis.",
          },
          {
            key: "radiusOfGyration",
            label: "Radius of gyration",
            value: props.radiusOfGyration,
            unit: "m",
            description: "Radius of gyration about the horizontal axis.",
          },
        ],
        referenceIds: ["roark-2011", "machinery-handbook"],
        warnings: [],
      };
      return buildResult(ctx, "section_properties", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("section_properties", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function boltHandler(ctx: AppContext): Handler {
  return (input) => {
    const nominalDiameterMm = input.nominalDiameterMm as number;
    const propertyClass = input.propertyClass as string;

    const fastener = ctx.findFastener(nominalDiameterMm);
    if (!fastener) {
      const sizes = ctx.db.prepare("SELECT nominal_diameter_mm FROM fasteners ORDER BY nominal_diameter_mm").all();
      const available = (sizes as Array<Record<string, unknown>>).map((row) => row.nominal_diameter_mm).join(", ");
      return failure("bolt_strength", `No thread data for M${nominalDiameterMm}. Available sizes: ${available}`, input);
    }
    const grade = ctx.findGrade(propertyClass);
    if (!grade) {
      return failure(
        "bolt_strength",
        `Unknown property class: ${propertyClass}. Available classes: 4.8, 5.8, 8.8, 10.9, 12.9`,
        input,
      );
    }

    try {
      const computation = analyzeBolt(
        {
          nominalDiameterMm,
          pitchMm: (input.pitchMm as number | undefined) ?? fastener.pitchMm,
          propertyClass,
          axialLoad: input.axialLoad as number,
          preloadFraction: (input.preloadFraction as number | undefined) ?? 0.75,
        },
        grade,
      );
      return buildResult(ctx, "bolt_strength", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("bolt_strength", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function shaftHandler(ctx: AppContext): Handler {
  return (input) => {
    const materialName = input.material as string | undefined;
    const values = materialName ? materialValues(ctx, materialName) : undefined;
    if (materialName && !values) {
      return failure("shaft_analysis", `Unknown material: ${materialName}`, input);
    }

    const elasticModulus = (input.elasticModulus as number | undefined) ?? values?.elasticModulusPa;
    const shearModulus = (input.shearModulus as number | undefined) ?? values?.shearModulusPa;
    const density = (input.density as number | undefined) ?? values?.densityKgM3;
    if (!elasticModulus || !shearModulus || !density) {
      return failure(
        "shaft_analysis",
        "Provide a material, or elasticModulus, shearModulus, and density together.",
        input,
      );
    }

    const shearYieldStrength =
      (input.shearYieldStrength as number | undefined) ?? (values?.yieldStrengthPa ? 0.577 * values.yieldStrengthPa : undefined);

    try {
      const computation = analyzeShaft({
        outerDiameter: input.outerDiameter as number,
        innerDiameter: input.innerDiameter as number | undefined,
        length: input.length as number,
        torque: input.torque as number,
        elasticModulus,
        shearModulus,
        density,
        shearYieldStrength,
      });
      return buildResult(ctx, "shaft_analysis", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("shaft_analysis", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function fatigueHandler(ctx: AppContext): Handler {
  return (input) => {
    try {
      const computation = analyzeFatigue({
        ultimateStrength: input.ultimateStrength as number,
        yieldStrength: input.yieldStrength as number | undefined,
        meanStress: input.meanStress as number,
        alternatingStress: input.alternatingStress as number,
        criterion: input.criterion as FatigueCriterion | undefined,
        enduranceLimit: input.enduranceLimit as number | undefined,
        surfaceFinish: input.surfaceFinish as SurfaceFinish | undefined,
        sizeFactor: input.sizeFactor as number | undefined,
        loadFactor: input.loadFactor as number | undefined,
        temperatureFactor: input.temperatureFactor as number | undefined,
        reliabilityFactor: input.reliabilityFactor as number | undefined,
        reliability: input.reliability as number | undefined,
        miscellaneousFactor: input.miscellaneousFactor as number | undefined,
      });
      return buildResult(ctx, "fatigue_analysis", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("fatigue_analysis", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function springHandler(ctx: AppContext): Handler {
  return (input) => {
    try {
      const computation = analyzeSpring({
        wireDiameter: input.wireDiameter as number,
        meanDiameter: input.meanDiameter as number,
        activeCoils: input.activeCoils as number,
        endType: input.endType as SpringEndType | undefined,
        freeLength: input.freeLength as number,
        load: input.load as number,
        shearModulus: input.shearModulus as number,
        shearYieldStrength: input.shearYieldStrength as number | undefined,
      });
      return buildResult(ctx, "spring_design", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("spring_design", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function fitHandler(ctx: AppContext): Handler {
  return (input) => {
    try {
      const computation = analyzePressFit({
        interfaceRadius: input.interfaceRadius as number,
        hubOuterRadius: input.hubOuterRadius as number,
        shaftInnerRadius: input.shaftInnerRadius as number | undefined,
        interference: input.interference as number,
        length: input.length as number,
        frictionCoefficient: input.frictionCoefficient as number | undefined,
        shaftElasticModulus: input.shaftElasticModulus as number,
        shaftPoissonRatio: input.shaftPoissonRatio as number | undefined,
        shaftYieldStrength: input.shaftYieldStrength as number | undefined,
        hubElasticModulus: input.hubElasticModulus as number,
        hubPoissonRatio: input.hubPoissonRatio as number | undefined,
        hubYieldStrength: input.hubYieldStrength as number | undefined,
        requiredTorque: input.requiredTorque as number | undefined,
      });
      return buildResult(ctx, "interference_fit", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("interference_fit", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function bearingHandler(ctx: AppContext): Handler {
  return (input) => {
    try {
      const computation = analyzeBearing({
        bearingType: input.bearingType as "ball" | "roller",
        dynamicLoadRating: input.dynamicLoadRating as number,
        equivalentLoad: input.equivalentLoad as number | undefined,
        radialLoad: input.radialLoad as number | undefined,
        axialLoad: input.axialLoad as number | undefined,
        speedRpm: input.speedRpm as number | undefined,
        requiredLifeHours: input.requiredLifeHours as number | undefined,
      });
      return buildResult(ctx, "bearing_life", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("bearing_life", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function stressHandler(ctx: AppContext): Handler {
  return (input) => {
    const mode = input.mode as "principal" | "cartesian";
    const yieldStrength = input.yieldStrength as number | undefined;

    if (mode === "principal") {
      const sigma1 = input.sigma1;
      const sigma2 = input.sigma2;
      const sigma3 = input.sigma3;
      if (typeof sigma1 !== "number" || typeof sigma2 !== "number" || typeof sigma3 !== "number") {
        return failure("von_mises", "Principal mode requires sigma1, sigma2, and sigma3.", input);
      }
      try {
        const computation = vonMises({ mode, sigma1, sigma2, sigma3, yieldStrength });
        return buildResult(ctx, "von_mises", computation, input.outputUnits as Record<string, string> | undefined);
      } catch (error) {
        return failure("von_mises", error instanceof Error ? error.message : String(error), input);
      }
    }

    const sigmaX = input.sigmaX;
    const sigmaY = input.sigmaY;
    if (typeof sigmaX !== "number" || typeof sigmaY !== "number") {
      return failure("von_mises", "Cartesian mode requires sigmaX and sigmaY.", input);
    }
    try {
      const computation = vonMises({
        mode: "cartesian",
        sigmaX,
        sigmaY,
        sigmaZ: input.sigmaZ as number | undefined,
        tauXY: input.tauXY as number | undefined,
        tauXZ: input.tauXZ as number | undefined,
        tauYZ: input.tauYZ as number | undefined,
        yieldStrength,
      });
      return buildResult(ctx, "von_mises", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("von_mises", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function fatigueDamageHandler(ctx: AppContext): Handler {
  return (input) => {
    try {
      const computation = analyzeFatigueDamage({
        blocks: input.blocks as FatigueDamageInput["blocks"],
        snCurve: input.snCurve as FatigueDamageInput["snCurve"],
        ultimateStrength: input.ultimateStrength as number,
        yieldStrength: input.yieldStrength as number | undefined,
        meanStressCorrection: input.meanStressCorrection as FatigueDamageCriterion | undefined,
      });
      return buildResult(ctx, "fatigue_damage", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("fatigue_damage", error instanceof Error ? error.message : String(error), input);
    }
  };
}

const STRESS_SWEEP_PARAMETERS = new Set<FatigueSweepParameter>([
  "ultimateStrength",
  "yieldStrength",
  "meanStress",
  "alternatingStress",
  "enduranceLimit",
]);

function uncertaintySweepHandler(ctx: AppContext): Handler {
  return (input) => {
    if (input.calculation !== "fatigue_analysis") {
      return failure("uncertainty_sweep", "Only the fatigue_analysis calculation is supported.", input);
    }
    if (!input.baseline || typeof input.baseline !== "object") {
      return failure("uncertainty_sweep", "Provide a baseline object.", input);
    }
    if (!Array.isArray(input.sweeps)) {
      return failure("uncertainty_sweep", "Provide a sweeps array.", input);
    }

    const baseline = input.baseline as FatigueInput;
    const sweeps: UncertaintySweepCase[] = [];
    const seen = new Set<string>();
    for (const [index, rawSweep] of (input.sweeps as unknown[]).entries()) {
      if (!rawSweep || typeof rawSweep !== "object") {
        return failure("uncertainty_sweep", `sweeps[${index}] must be an object.`, input);
      }
      const sweep = rawSweep as Record<string, unknown>;
      const parameter = sweep.parameter;
      if (typeof parameter !== "string" || !isFatigueSweepParameter(parameter)) {
        return failure("uncertainty_sweep", `sweeps[${index}].parameter is not sweepable.`, input);
      }
      if (seen.has(parameter)) {
        return failure("uncertainty_sweep", `Sweep parameters must be unique: ${parameter}.`, input);
      }
      seen.add(parameter);
      const low = sweep.low;
      const high = sweep.high;
      if (typeof low !== "number" || typeof high !== "number") {
        return failure("uncertainty_sweep", `sweeps[${index}] endpoints must be numbers.`, input);
      }
      if (!(low < high)) {
        return failure("uncertainty_sweep", `sweeps[${index}].low must be smaller than high.`, input);
      }

      const unit = sweep.unit === undefined ? defaultSweepUnit(parameter) : sweep.unit;
      if (typeof unit !== "string" || unit.length === 0) {
        return failure("uncertainty_sweep", `sweeps[${index}].unit must be a non-empty string.`, input);
      }
      const lowNormalized = normalizeSweepValue(ctx, parameter, low, unit, `sweeps[${index}].low`);
      if (!lowNormalized.ok) {
        return failure("uncertainty_sweep", lowNormalized.error, input);
      }
      const highNormalized = normalizeSweepValue(ctx, parameter, high, unit, `sweeps[${index}].high`);
      if (!highNormalized.ok) {
        return failure("uncertainty_sweep", highNormalized.error, input);
      }
      const baselineValue = baseline[parameter];
      if (typeof baselineValue !== "number" || !Number.isFinite(baselineValue)) {
        return failure("uncertainty_sweep", `baseline.${parameter} must be provided as a finite number.`, input);
      }
      const baselineDisplay = displaySweepValue(ctx, parameter, baselineValue, unit, `baseline.${parameter}`);
      if (!baselineDisplay.ok) {
        return failure("uncertainty_sweep", baselineDisplay.error, input);
      }

      sweeps.push({
        parameter,
        low: lowNormalized.value,
        high: highNormalized.value,
        inputUnit: unit,
        calculationUnit: lowNormalized.calculationUnit,
        baselineDisplayValue: baselineDisplay.value,
        lowDisplayValue: low,
        highDisplayValue: high,
      });
    }

    try {
      const computation = analyzeUncertaintySweep({ calculation: "fatigue_analysis", baseline, sweeps });
      computation.inputs = {
        calculation: input.calculation,
        baseline: input.baseline,
        sweeps: input.sweeps,
        calculationUnits: { stress: "Pa", factors: "1", reliability: "%" },
      };
      return buildResult(ctx, "uncertainty_sweep", computation);
    } catch (error) {
      return failure("uncertainty_sweep", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function isFatigueSweepParameter(value: string): value is FatigueSweepParameter {
  return FATIGUE_SWEEP_PARAMETERS.includes(value as FatigueSweepParameter);
}

function defaultSweepUnit(parameter: FatigueSweepParameter): string {
  if (STRESS_SWEEP_PARAMETERS.has(parameter)) {
    return "Pa";
  }
  return parameter === "reliability" ? "%" : "1";
}

type SweepValue = { ok: true; value: number; calculationUnit: string } | { ok: false; error: string };

function normalizeSweepValue(ctx: AppContext, parameter: FatigueSweepParameter, value: number, unit: string, label: string): SweepValue {
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label} must be finite.` };
  }
  if (STRESS_SWEEP_PARAMETERS.has(parameter)) {
    const outcome = ctx.convertUnit(value, unit, "Pa");
    return outcome.ok ? { ok: true, value: outcome.value, calculationUnit: "Pa" } : { ok: false, error: `Could not convert ${label}: ${outcome.error}` };
  }
  if (parameter === "reliability") {
    if (!(unit === "%" || unit === "percent" || unit === "pct")) {
      return { ok: false, error: `${label} must use % or percent.` };
    }
    return { ok: true, value, calculationUnit: "%" };
  }
  if (unit !== "1") {
    return { ok: false, error: `${label} must use unit 1 because it is dimensionless.` };
  }
  return { ok: true, value, calculationUnit: "1" };
}

function displaySweepValue(ctx: AppContext, parameter: FatigueSweepParameter, value: number, unit: string, label: string): SweepValue {
  if (STRESS_SWEEP_PARAMETERS.has(parameter)) {
    const outcome = ctx.convertUnit(value, "Pa", unit);
    return outcome.ok ? { ok: true, value: outcome.value, calculationUnit: "Pa" } : { ok: false, error: `Could not convert ${label}: ${outcome.error}` };
  }
  if (parameter === "reliability") {
    return unit === "%" || unit === "percent" || unit === "pct"
      ? { ok: true, value, calculationUnit: "%" }
      : { ok: false, error: `${label} must use % or percent.` };
  }
  return unit === "1"
    ? { ok: true, value, calculationUnit: "1" }
    : { ok: false, error: `${label} must use unit 1 because it is dimensionless.` };
}

function optionalFiniteFatigueNumber(config: Record<string, unknown>, key: string): number | undefined {
  const value = config[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`fatigue.${key} must be a finite number.`);
  }
  return value;
}

function convertFatigueStress(ctx: AppContext, value: number, unit: string, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  const outcome = ctx.convertUnit(value, unit, "Pa");
  if (!outcome.ok) {
    throw new Error(`Could not convert ${label}: ${outcome.error}`);
  }
  return outcome.value;
}

function isFatigueCriterion(value: unknown): value is FatigueCriterion {
  return value === "modified_goodman" || value === "soderberg" || value === "gerber" || value === "asme_elliptic";
}

function buildShaftFatigueInput(
  ctx: AppContext,
  rawConfig: unknown,
  material: MaterialValues | undefined,
  meanStress: number,
  yieldStrength: number,
): { input: FatigueInput; usesLoadFraction: boolean; loadFraction?: number } {
  if (!rawConfig || typeof rawConfig !== "object") {
    throw new Error("fatigue must be an object.");
  }
  const config = rawConfig as Record<string, unknown>;
  const hasAlternatingStress = config.alternatingStress !== undefined;
  const hasLoadFraction = config.loadFraction !== undefined;
  if (hasAlternatingStress === hasLoadFraction) {
    throw new Error("Provide exactly one of fatigue.alternatingStress or fatigue.loadFraction.");
  }

  const stressUnit = config.stressUnit ?? "Pa";
  if (typeof stressUnit !== "string" || stressUnit.length === 0) {
    throw new Error("fatigue.stressUnit must be a non-empty string.");
  }

  const rawUltimateStrength = config.ultimateStrength ?? material?.ultimateStrengthPa;
  if (typeof rawUltimateStrength !== "number") {
    throw new Error("Provide fatigue.ultimateStrength or a known material with ultimate-strength data.");
  }
  const ultimateStrength = config.ultimateStrength === undefined
    ? rawUltimateStrength
    : convertFatigueStress(ctx, rawUltimateStrength, stressUnit, "fatigue.ultimateStrength");

  let alternatingStress: number;
  let loadFraction: number | undefined;
  if (hasAlternatingStress) {
    const rawAlternatingStress = config.alternatingStress;
    if (typeof rawAlternatingStress !== "number") {
      throw new Error("fatigue.alternatingStress must be a number.");
    }
    alternatingStress = convertFatigueStress(ctx, rawAlternatingStress, stressUnit, "fatigue.alternatingStress");
  } else {
    loadFraction = optionalFiniteFatigueNumber(config, "loadFraction");
    if (loadFraction === undefined || loadFraction < 0 || loadFraction > 1) {
      throw new Error("fatigue.loadFraction must be between 0 and 1.");
    }
    alternatingStress = meanStress * loadFraction;
  }

  const rawEnduranceLimit = optionalFiniteFatigueNumber(config, "enduranceLimit");
  const enduranceLimit = rawEnduranceLimit === undefined
    ? undefined
    : convertFatigueStress(ctx, rawEnduranceLimit, stressUnit, "fatigue.enduranceLimit");
  const criterion = config.criterion;
  if (criterion !== undefined && !isFatigueCriterion(criterion)) {
    throw new Error(`Unsupported fatigue criterion: ${String(criterion)}.`);
  }

  return {
    input: {
      ultimateStrength,
      yieldStrength,
      meanStress,
      alternatingStress,
      criterion,
      enduranceLimit,
      surfaceFinish: config.surfaceFinish as SurfaceFinish | undefined,
      sizeFactor: optionalFiniteFatigueNumber(config, "sizeFactor"),
      loadFactor: optionalFiniteFatigueNumber(config, "loadFactor"),
      temperatureFactor: optionalFiniteFatigueNumber(config, "temperatureFactor"),
      reliabilityFactor: optionalFiniteFatigueNumber(config, "reliabilityFactor"),
      reliability: optionalFiniteFatigueNumber(config, "reliability"),
      miscellaneousFactor: optionalFiniteFatigueNumber(config, "miscellaneousFactor"),
    },
    usesLoadFraction: hasLoadFraction,
    loadFraction,
  };
}

function shaftLoadCasesHandler(ctx: AppContext): Handler {
  return (input) => {
    if (!Array.isArray(input.sections)) {
      return failure("shaft_load_cases", "Provide a sections array.", input);
    }
    if (!Array.isArray(input.loadCases)) {
      return failure("shaft_load_cases", "Provide a loadCases array.", input);
    }

    const materialName = input.material as string | undefined;
    const values = materialName ? materialValues(ctx, materialName) : undefined;
    if (materialName && !values) {
      return failure("shaft_load_cases", `Unknown material: ${materialName}`, input);
    }
    const yieldStrength = (input.yieldStrength as number | undefined) ?? values?.yieldStrengthPa;
    if (!yieldStrength) {
      return failure("shaft_load_cases", "Provide yieldStrength or a known material with yield data.", input);
    }

    const rawSections = input.sections as unknown[];
    const sections: ShaftLoadCaseSection[] = [];
    for (const [index, rawSection] of rawSections.entries()) {
      if (!rawSection || typeof rawSection !== "object") {
        return failure("shaft_load_cases", `sections[${index}] must be an object.`, input);
      }
      const section = rawSection as Record<string, unknown>;
      const name = section.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        return failure("shaft_load_cases", `sections[${index}].name must be a non-empty string.`, input);
      }
      const unit = section.unit === undefined ? "m" : section.unit;
      if (typeof unit !== "string" || unit.length === 0) {
        return failure("shaft_load_cases", `sections[${index}].unit must be a non-empty string.`, input);
      }
      const outerDiameter = section.outerDiameter;
      if (typeof outerDiameter !== "number") {
        return failure("shaft_load_cases", `sections[${index}].outerDiameter must be a number.`, input);
      }
      const outerOutcome = ctx.convertUnit(outerDiameter, unit, "m");
      if (!outerOutcome.ok) {
        return failure("shaft_load_cases", `Could not convert sections[${index}].outerDiameter: ${outerOutcome.error}`, input);
      }
      let innerDiameterM = 0;
      if (section.innerDiameter !== undefined) {
        if (typeof section.innerDiameter !== "number") {
          return failure("shaft_load_cases", `sections[${index}].innerDiameter must be a number.`, input);
        }
        const innerOutcome = ctx.convertUnit(section.innerDiameter as number, unit, "m");
        if (!innerOutcome.ok) {
          return failure("shaft_load_cases", `Could not convert sections[${index}].innerDiameter: ${innerOutcome.error}`, input);
        }
        innerDiameterM = innerOutcome.value;
      }
      sections.push({
        name,
        outerDiameter: outerOutcome.value,
        innerDiameter: innerDiameterM === 0 ? undefined : innerDiameterM,
      });
    }

    const rawLoadCases = input.loadCases as unknown[];
    const loadCases: ShaftLoadCase[] = [];
    for (const [index, rawCase] of rawLoadCases.entries()) {
      if (!rawCase || typeof rawCase !== "object") {
        return failure("shaft_load_cases", `loadCases[${index}] must be an object.`, input);
      }
      const loadCase = rawCase as Record<string, unknown>;
      const name = loadCase.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        return failure("shaft_load_cases", `loadCases[${index}].name must be a non-empty string.`, input);
      }
      const momentUnit = loadCase.momentUnit === undefined ? "N·m" : loadCase.momentUnit;
      if (typeof momentUnit !== "string" || momentUnit.length === 0) {
        return failure("shaft_load_cases", `loadCases[${index}].momentUnit must be a non-empty string.`, input);
      }
      const bendingMomentRaw = loadCase.bendingMoment ?? 0;
      const torqueRaw = loadCase.torque ?? 0;
      if (typeof bendingMomentRaw !== "number" || typeof torqueRaw !== "number") {
        return failure("shaft_load_cases", `loadCases[${index}] bendingMoment and torque must be numbers.`, input);
      }
      const bendingOutcome = ctx.convertUnit(bendingMomentRaw, momentUnit, "N·m");
      if (!bendingOutcome.ok) {
        return failure("shaft_load_cases", `Could not convert loadCases[${index}].bendingMoment: ${bendingOutcome.error}`, input);
      }
      const torqueOutcome = ctx.convertUnit(torqueRaw, momentUnit, "N·m");
      if (!torqueOutcome.ok) {
        return failure("shaft_load_cases", `Could not convert loadCases[${index}].torque: ${torqueOutcome.error}`, input);
      }
      loadCases.push({
        name,
        bendingMoment: bendingOutcome.value,
        torque: torqueOutcome.value,
      });
    }

    try {
      const computation = analyzeShaftLoadCases({ sections, loadCases, yieldStrength });
      if (input.fatigue !== undefined) {
        const governingRow = computation.rows?.find((row) => row.isGoverning);
        if (!governingRow) {
          throw new Error("The shaft load-case report did not produce a governing row.");
        }
        const governingVonMises = governingRow.vonMisesStressPa;
        if (typeof governingVonMises !== "number" || !Number.isFinite(governingVonMises)) {
          throw new Error("The governing row did not produce a finite von Mises stress.");
        }
        const fatigueConfig = buildShaftFatigueInput(ctx, input.fatigue, values, governingVonMises, yieldStrength);
        const fatigue = analyzeShaftFatigueScreen(fatigueConfig.input);
        governingRow.fatigueMeanStressPa = fatigue.meanStressPa;
        governingRow.fatigueAlternatingStressPa = fatigue.alternatingStressPa;
        governingRow.fatigueEnduranceLimitPa = fatigue.enduranceLimitPa;
        governingRow.fatigueSafetyFactor = fatigue.fatigueSafetyFactor;
        governingRow.fatigueStaticYieldSafetyFactor = fatigue.staticYieldSafetyFactor;
        governingRow.fatigueCriterion = fatigue.criterion;
        governingRow.fatigueReferenceId = "shigley-2015";
        computation.quantities.push({
          key: "fatigueEnduranceLimit",
          label: "Fatigue endurance limit",
          value: fatigue.enduranceLimitPa,
          unit: "Pa",
          description: "Fully corrected endurance limit from the existing modified Marin method.",
        });
        computation.quantities.push({
          key: "fatigueSafetyFactor",
          label: "Fatigue safety factor",
          value: fatigue.fatigueSafetyFactor,
          unit: "",
          description: "Fatigue safety factor for the governing shaft row.",
        });
        if (fatigue.staticYieldSafetyFactor !== undefined) {
          computation.quantities.push({
            key: "fatigueStaticYieldSafetyFactor",
            label: "Fatigue static yield safety factor",
            value: fatigue.staticYieldSafetyFactor,
            unit: "",
            description: "Yield strength divided by the governing mean plus alternating stress.",
          });
        }
        computation.warnings.push(
          "The fatigue screen treats the governing von Mises stress as mean stress.",
          fatigueConfig.usesLoadFraction
            ? `The alternating stress equals ${(fatigueConfig.loadFraction ?? 0) * 100}% of the governing von Mises stress.`
            : "The supplied alternating stress applies to the governing row.",
          ...fatigue.warnings,
        );
        computation.meta = {
          ...computation.meta,
          fatigueCriterion: fatigue.criterion,
          fatigueMeanStressSource: "governing von Mises stress",
          fatigueAlternatingStressSource: fatigueConfig.usesLoadFraction ? "load fraction" : "supplied input",
        };
      }
      computation.inputs = {
        sections: input.sections,
        loadCases: input.loadCases,
        yieldStrength: input.yieldStrength ?? materialName,
        fatigue: input.fatigue,
        calculationUnits: { length: "m", moment: "N·m" },
      };
      return buildResult(ctx, "shaft_load_cases", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("shaft_load_cases", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function toleranceStackHandler(ctx: AppContext): Handler {
  return (input) => {
    if (!Array.isArray(input.dimensions)) {
      return failure("tolerance_stack", "Provide a dimensions array.", input);
    }

    const rawDimensions = input.dimensions as unknown[];
    const dimensions: ToleranceDimension[] = [];
    const lengthKeys = ["nominal", "tolerancePlus", "toleranceMinus"] as const;

    for (const [index, rawDimension] of rawDimensions.entries()) {
      if (!rawDimension || typeof rawDimension !== "object") {
        return failure("tolerance_stack", `dimensions[${index}] must be an object.`, input);
      }
      const dimension = rawDimension as Record<string, unknown>;
      const name = dimension.name;
      const unit = dimension.unit === undefined ? "m" : dimension.unit;
      const sign = dimension.sign;
      if (typeof name !== "string" || name.trim().length === 0) {
        return failure("tolerance_stack", `dimensions[${index}].name must be a non-empty string.`, input);
      }
      if (typeof unit !== "string" || unit.length === 0) {
        return failure("tolerance_stack", `dimensions[${index}].unit must be a non-empty string.`, input);
      }
      if (sign !== 1 && sign !== -1) {
        return failure("tolerance_stack", `dimensions[${index}].sign must be 1 or -1.`, input);
      }

      const converted: Record<(typeof lengthKeys)[number], number> = {
        nominal: 0,
        tolerancePlus: 0,
        toleranceMinus: 0,
      };
      for (const key of lengthKeys) {
        const value = dimension[key];
        if (typeof value !== "number") {
          return failure("tolerance_stack", `dimensions[${index}].${key} must be a number.`, input);
        }
        const outcome = ctx.convertUnit(value, unit, "m");
        if (!outcome.ok) {
          return failure("tolerance_stack", `Could not convert dimensions[${index}].${key}: ${outcome.error}`, input);
        }
        converted[key] = outcome.value;
      }

      dimensions.push({
        name,
        nominal: converted.nominal,
        tolerancePlus: converted.tolerancePlus,
        toleranceMinus: converted.toleranceMinus,
        sign: sign as ToleranceSign,
      });
    }

    try {
      const computation = analyzeToleranceStack({ dimensions });
      computation.inputs = { dimensions: input.dimensions, calculationUnit: "m" };
      return buildResult(ctx, "tolerance_stack", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("tolerance_stack", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function unitConvertHandler(ctx: AppContext): Handler {
  return (input) => {
    const value = input.value as number;
    const from = input.from as string;
    const to = input.to as string;
    const outcome = ctx.convertUnit(value, from, to);
    if (!outcome.ok) {
      return failure("unit_convert", outcome.error, input);
    }
    const computation: Computation = {
      method: UNIT_METHOD,
      inputs: { value, from, to },
      quantities: [
        { key: "convertedValue", label: "Converted value", value: outcome.value, unit: to, description: `Value of ${value} ${from} expressed in ${to}.` },
        { key: "siValue", label: "Value in SI", value: outcome.toSI, unit: outcome.siSymbol, description: `Value of ${value} ${from} in the SI base unit ${outcome.siSymbol}.` },
      ],
      referenceIds: [],
      warnings: [],
    };
    const result = buildResult(ctx, "unit_convert", computation);
    return {
      ...result,
      meta: {
        factor: outcome.factor,
        category: outcome.category,
      },
    };
  };
}

function materialHandler(ctx: AppContext): Handler {
  return (input) => {
    const query = input.query as string;
    const limit = (input.limit as number | undefined) ?? 10;
    const rows = ctx.searchMaterials(query, limit);
    if (rows.length === 0) {
      return failure("material_lookup", `No material matches the query: ${query}`, input);
    }
    const ids = [...new Set(rows.map((row) => row.referenceId).filter((id): id is string => Boolean(id)))];
    return {
      ok: true,
      tool: "material_lookup",
      method: MATERIAL_METHOD,
      inputs: { query, limit },
      quantities: [],
      references: resolveReferences(ctx, ids),
      warnings: [],
      rows: rows.map((row) => ({
        name: row.name,
        category: row.category,
        densityKgM3: row.densityKgM3,
        elasticModulusGPa: row.elasticModulusGPa,
        shearModulusGPa: row.shearModulusGPa,
        yieldStrengthMPa: row.yieldStrengthMPa,
        ultimateStrengthMPa: row.ultimateStrengthMPa,
        elongationPct: row.elongationPct,
        note: row.note,
      })),
    };
  };
}

function sectionCatalogHandler(ctx: AppContext): Handler {
  return (input) => {
    const query = input.query as string;
    const limit = (input.limit as number | undefined) ?? 10;
    const rows = ctx.searchSections(query, limit);
    if (rows.length === 0) {
      return failure("section_catalog", `No standard section matches the query: ${query}`, input);
    }
    return {
      ok: true,
      tool: "section_catalog",
      method: SECTION_CATALOG_METHOD,
      inputs: { query, limit },
      quantities: [],
      references: resolveReferences(
        ctx,
        rows.flatMap((row) => [row.dimensionsReferenceId, row.propertiesReferenceId]),
      ),
      warnings: [],
      rows: rows.map((row) => ({
        designation: row.designation,
        series: row.series,
        standard: row.standard,
        dimensionsReferenceId: row.dimensionsReferenceId,
        propertiesReferenceId: row.propertiesReferenceId,
        heightMm: row.heightMm,
        flangeWidthMm: row.flangeWidthMm,
        webThicknessMm: row.webThicknessMm,
        flangeThicknessMm: row.flangeThicknessMm,
        areaCm2: row.areaCm2,
        massPerMetreKgM: row.massPerMetreKgM,
        secondMomentCm4: row.secondMomentCm4,
        sectionModulusCm3: row.sectionModulusCm3,
      })),
    };
  };
}

export function createHandlers(ctx: AppContext): Record<string, Handler> {
  return {
    beam_bending: beamHandler(ctx),
    section_properties: sectionPropsHandler(ctx),
    bolt_strength: boltHandler(ctx),
    interference_fit: fitHandler(ctx),
    shaft_analysis: shaftHandler(ctx),
    spring_design: springHandler(ctx),
    bearing_life: bearingHandler(ctx),
    von_mises: stressHandler(ctx),
    fatigue_analysis: fatigueHandler(ctx),
    fatigue_damage: fatigueDamageHandler(ctx),
    uncertainty_sweep: uncertaintySweepHandler(ctx),
    tolerance_stack: toleranceStackHandler(ctx),
    shaft_load_cases: shaftLoadCasesHandler(ctx),
    unit_convert: unitConvertHandler(ctx),
    material_lookup: materialHandler(ctx),
    section_catalog: sectionCatalogHandler(ctx),
  };
}
