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

export const springSchema = z.object({
  wireDiameter: z.number().positive().describe("Wire diameter d in metres."),
  meanDiameter: z.number().positive().describe("Mean coil diameter D in metres."),
  activeCoils: z.number().positive().describe("Number of active coils Na."),
  endType: z
    .enum(["plain", "plain_ground", "squared", "squared_ground"])
    .optional()
    .describe("End condition. Sets the total coil count and solid height. Defaults to squared_ground."),
  freeLength: z.number().positive().describe("Free length L0 in metres."),
  load: z.number().min(0).describe("Applied axial load F in newtons. Zero checks the geometry only."),
  shearModulus: z.number().positive().describe("Shear modulus G in pascals."),
  shearYieldStrength: z
    .number()
    .positive()
    .optional()
    .describe("Torsional yield strength Sys in pascals. Enables the safety factor."),
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

export const materialSchema = z.object({
  query: z.string().min(1).describe("Material name or category to search. Matches are case-insensitive."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum number of rows to return. Defaults to 10."),
});

export const fatigueSchema = z.object({
  alternatingStress: z.number().positive().describe(
    "Alternating stress amplitude in pascals. For torsion loading, this is the shear stress amplitude.",
  ),
  meanStress: z.number().describe(
    "Mean stress in pascals. Use zero for fully reversed loading. For torsion loading, this is the shear mean stress.",
  ),
  loading: z.enum(["bending", "axial", "torsion"]).describe("Loading type. Sets the load factor and the stress transformation."),
  material: z.string().optional().describe("Material name from the database. Provides the ultimate and yield strength."),
  ultimateStrength: z.number().positive().optional().describe("Ultimate tensile strength in pascals. Required when material is not set."),
  yieldStrength: z.number().positive().optional().describe("Tensile yield strength in pascals. Required for the Soderberg, ASME-elliptic, and yield checks."),
  surfaceCondition: z
    .enum(["ground", "machined", "cold_drawn", "hot_rolled", "as_forged"])
    .optional()
    .describe("Surface finish of the part. Sets the surface factor. Defaults to machined."),
  diameterMm: z.number().positive().optional().describe("Section diameter in millimetres. Sets the size factor for bending and torsion."),
  reliabilityPct: z
    .union([z.literal(50), z.literal(90), z.literal(95), z.literal(99), z.literal(99.9), z.literal(99.99), z.literal(99.999), z.literal(99.9999)])
    .optional()
    .describe("Desired reliability as a percentage. Sets the reliability factor. Defaults to 50."),
  temperatureC: z.number().optional().describe("Operating temperature in degrees Celsius. Sets the temperature factor."),
  surfaceFactor: z.number().positive().optional().describe("Override the surface factor k_a."),
  sizeFactor: z.number().positive().optional().describe("Override the size factor k_b."),
  loadFactor: z.number().positive().optional().describe("Override the load factor k_c."),
  temperatureFactor: z.number().positive().optional().describe("Override the temperature factor k_d."),
  reliabilityFactor: z.number().positive().optional().describe("Override the reliability factor k_e."),
  miscellaneousFactor: z
    .number()
    .positive()
    .optional()
    .describe("Miscellaneous factor k_f for stress concentrations and other effects. Defaults to 1."),
  outputUnits,
});

export type BeamInput = z.infer<typeof beamSchema>;
export type BoltInput = z.infer<typeof boltSchema>;
export type ShaftInput = z.infer<typeof shaftSchema>;
export type SpringInput = z.infer<typeof springSchema>;
export type BearingInput = z.infer<typeof bearingSchema>;
export type SectionPropsInput = z.infer<typeof sectionPropsSchema>;
export type StressInput = z.infer<typeof stressSchema>;
export type UnitConvertInput = z.infer<typeof unitConvertSchema>;
export type MaterialInput = z.infer<typeof materialSchema>;
export type FatigueInput = z.infer<typeof fatigueSchema>;
