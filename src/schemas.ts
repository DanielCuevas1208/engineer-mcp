import { z } from "zod";

export const sectionSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("rectangle"),
    width: z.number().positive().describe("Width in metres."),
    height: z.number().positive().describe("Height in metres."),
  }),
  z.object({
    shape: z.literal("circle"),
    diameter: z.number().positive().describe("Diameter in metres."),
  }),
  z.object({
    shape: z.literal("hollow_circle"),
    outerDiameter: z.number().positive().describe("Outer diameter in metres."),
    innerDiameter: z.number().positive().describe("Inner diameter in metres."),
  }),
  z.object({
    shape: z.literal("i_beam"),
    height: z.number().positive().describe("Overall height in metres."),
    flangeWidth: z.number().positive().describe("Flange width in metres."),
    flangeThickness: z.number().positive().describe("Flange thickness in metres."),
    webThickness: z.number().positive().describe("Web thickness in metres."),
  }),
  z.object({
    shape: z.literal("box"),
    width: z.number().positive().describe("Outer width in metres."),
    height: z.number().positive().describe("Outer height in metres."),
    thickness: z.number().positive().describe("Wall thickness in metres."),
  }),
]);

const outputUnits = z.record(z.string()).optional().describe(
  "Optional map of quantity key to requested output unit. Example: { maxBendingStress: \"MPa\", maxDeflection: \"mm\" }.",
);

export const beamSchema = z.object({
  support: z.enum(["simply_supported", "cantilever"]).describe("Support type of the beam."),
  load: z.enum(["point", "uniform"]).describe("Load type. Point is a concentrated force, uniform is a distributed load."),
  loadMagnitude: z.number().positive().describe(
    "Load magnitude. Newtons for a point load, newtons per metre for a uniform load.",
  ),
  length: z.number().positive().describe("Beam length in metres."),
  material: z.string().optional().describe("Material name from the database. Provides the elastic modulus and yield strength."),
  elasticModulus: z.number().positive().optional().describe("Young's modulus in pascals. Optional when material is set."),
  yieldStrength: z.number().positive().optional().describe("Tensile yield strength in pascals. Enables the safety factor."),
  section: sectionSchema.optional().describe("Cross-section shape. Provides the moment of inertia and section modulus."),
  secondMomentOfArea: z.number().positive().optional().describe("Second moment of area in m^4. Used when no section is given."),
  sectionModulus: z.number().positive().optional().describe("Section modulus in m^3. Used when no section is given."),
  outputUnits,
});

export const sectionPropsSchema = z.object({
  section: sectionSchema.describe("Cross-section shape and dimensions in metres."),
});

export const boltSchema = z.object({
  nominalDiameterMm: z.number().positive().describe("Nominal bolt diameter in millimetres."),
  pitchMm: z.number().positive().optional().describe("Thread pitch in millimetres. Defaults to the coarse pitch from the database."),
  propertyClass: z.string().describe("ISO 898 property class, for example 8.8 or 10.9."),
  axialLoad: z.number().positive().describe("Applied axial load in newtons."),
  preloadFraction: z.number().min(0).max(1).optional().describe("Preload as a fraction of proof load. Defaults to 0.75."),
  outputUnits,
});

export const shaftSchema = z.object({
  outerDiameter: z.number().positive().describe("Outer diameter in metres."),
  innerDiameter: z.number().positive().optional().describe("Inner diameter in metres for a hollow shaft."),
  length: z.number().positive().describe("Shaft length in metres."),
  torque: z.number().describe("Applied torque in newton metres. May be negative for direction."),
  material: z.string().optional().describe("Material name from the database. Provides stiffness and density."),
  elasticModulus: z.number().positive().optional().describe("Young's modulus in pascals."),
  shearModulus: z.number().positive().optional().describe("Shear modulus in pascals."),
  density: z.number().positive().optional().describe("Density in kilograms per cubic metre."),
  shearYieldStrength: z.number().positive().optional().describe("Shear yield strength in pascals. Enables the safety factor."),
  outputUnits,
});

export const bearingSchema = z.object({
  bearingType: z.enum(["ball", "roller"]).describe("Bearing type. Ball uses a life exponent of 3, roller uses 10/3."),
  dynamicLoadRating: z.number().positive().describe("Basic dynamic load rating C in newtons."),
  equivalentLoad: z.number().positive().optional().describe("Equivalent dynamic radial load P in newtons."),
  radialLoad: z.number().positive().optional().describe("Applied radial load in newtons. Used to derive P."),
  axialLoad: z.number().positive().optional().describe("Applied axial load in newtons. Used to derive P."),
  speedRpm: z.number().positive().optional().describe("Operating speed in revolutions per minute. Enables life in hours."),
  requiredLifeHours: z.number().positive().optional().describe("Required service life in hours. Enables the life margin."),
  outputUnits,
});

export const stressSchema = z.object({
  mode: z.enum(["principal", "cartesian"]).describe("Stress input mode. Principal uses sigma1-3. Cartesian uses sigmaX, sigmaY, and shear terms."),
  sigma1: z.number().optional().describe("First principal stress in pascals. Required in principal mode."),
  sigma2: z.number().optional().describe("Second principal stress in pascals. Required in principal mode."),
  sigma3: z.number().optional().describe("Third principal stress in pascals. Required in principal mode."),
  sigmaX: z.number().optional().describe("Normal stress in the x direction, pascals. Required in cartesian mode."),
  sigmaY: z.number().optional().describe("Normal stress in the y direction, pascals. Required in cartesian mode."),
  sigmaZ: z.number().optional().describe("Normal stress in the z direction, pascals."),
  tauXY: z.number().optional().describe("Shear stress in the xy plane, pascals."),
  tauXZ: z.number().optional().describe("Shear stress in the xz plane, pascals."),
  tauYZ: z.number().optional().describe("Shear stress in the yz plane, pascals."),
  yieldStrength: z.number().positive().optional().describe("Tensile yield strength in pascals. Enables the safety factor."),
});

export const unitConvertSchema = z.object({
  value: z.number().describe("Numeric value to convert."),
  from: z.string().describe("Source unit symbol. Examples: MPa, mm, lbf, degC."),
  to: z.string().describe("Target unit symbol. Examples: psi, m, N, degF."),
});

export const fatigueSchema = z.object({
  ultimateStrength: z.number().positive().describe("Ultimate tensile strength Sut in pascals."),
  yieldStrength: z
    .number()
    .positive()
    .optional()
    .describe("Tensile yield strength in pascals. Enables the yield check and the Soderberg criterion."),
  stressAmplitude: z
    .number()
    .min(0)
    .describe("Stress amplitude of the cycle in pascals. Zero means a purely static mean stress."),
  meanStress: z
    .number()
    .optional()
    .describe("Mean stress of the cycle in pascals. Defaults to zero for a fully reversed cycle."),
  enduranceLimit: z
    .number()
    .positive()
    .optional()
    .describe("Corrected endurance limit Se in pascals. When omitted, the tool estimates it with the Marin factors."),
  surfaceFinish: z
    .enum(["ground", "machined", "hot_rolled", "as_forged"])
    .optional()
    .describe("Surface finish. Sets the surface factor ka. Defaults to machined."),
  loading: z.enum(["bending", "axial", "torsion"]).optional().describe("Loading mode. Sets the load factor kc. Defaults to bending."),
  sizeFactor: z.number().positive().optional().describe("Size factor kb. Defaults to 1."),
  criterion: z
    .enum(["goodman", "soderberg", "gerber"])
    .optional()
    .describe("Mean stress failure criterion. Defaults to goodman."),
  targetSafetyFactor: z
    .number()
    .positive()
    .optional()
    .describe("Design safety factor. When set, the tool returns the allowable stress amplitude."),
  outputUnits,
});

export const materialSchema = z.object({
  query: z.string().min(1).describe("Material name or category to search. Matches are case-insensitive."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum number of rows to return. Defaults to 10."),
});

export type BeamInput = z.infer<typeof beamSchema>;
export type BoltInput = z.infer<typeof boltSchema>;
export type ShaftInput = z.infer<typeof shaftSchema>;
export type BearingInput = z.infer<typeof bearingSchema>;
export type SectionPropsInput = z.infer<typeof sectionPropsSchema>;
export type StressInput = z.infer<typeof stressSchema>;
export type UnitConvertInput = z.infer<typeof unitConvertSchema>;
export type MaterialInput = z.infer<typeof materialSchema>;
export type FatigueInput = z.infer<typeof fatigueSchema>;
