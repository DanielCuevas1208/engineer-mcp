import type { AppContext } from "./context.js";
import {
  analyzeBeam,
  analyzeBearing,
  analyzeBolt,
  analyzeShaft,
  computeSection,
  vonMises,
  type SectionDef,
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
  return {
    ok: true,
    tool,
    method: computation.method,
    inputs: computation.inputs,
    quantities,
    safetyFactor: computation.safetyFactor,
    references: resolveReferences(ctx, computation.referenceIds),
    warnings: [...computation.warnings, ...warnings],
  };
}

type MaterialValues = {
  elasticModulusPa: number;
  shearModulusPa?: number;
  densityKgM3?: number;
  yieldStrengthPa?: number;
};

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

    try {
      const computation = analyzeBeam({
        support: input.support as "simply_supported" | "cantilever",
        load: input.load as "point" | "uniform",
        loadMagnitude: input.loadMagnitude as number,
        length: input.length as number,
        elasticModulus,
        yieldStrength,
        section: input.section as SectionDef | undefined,
        secondMomentOfArea: input.secondMomentOfArea as number | undefined,
        sectionModulus: input.sectionModulus as number | undefined,
      });
      return buildResult(ctx, "beam_bending", computation, input.outputUnits as Record<string, string> | undefined);
    } catch (error) {
      return failure("beam_bending", error instanceof Error ? error.message : String(error), input);
    }
  };
}

function sectionPropsHandler(ctx: AppContext): Handler {
  return (input) => {
    try {
      const props = computeSection(input.section as SectionDef);
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

export function createHandlers(ctx: AppContext): Record<string, Handler> {
  return {
    beam_bending: beamHandler(ctx),
    section_properties: sectionPropsHandler(ctx),
    bolt_strength: boltHandler(ctx),
    shaft_analysis: shaftHandler(ctx),
    bearing_life: bearingHandler(ctx),
    von_mises: stressHandler(ctx),
    unit_convert: unitConvertHandler(ctx),
    material_lookup: materialHandler(ctx),
  };
}
