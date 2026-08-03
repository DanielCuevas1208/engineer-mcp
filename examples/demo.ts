import "../src/warnings.js";
import { createContext, type AppContext } from "../src/context.js";
import { createHandlers, type Handler } from "../src/handlers.js";
import { formatNumber } from "../src/results.js";
import type { ToolResponse } from "../src/types.js";

const ctx: AppContext = createContext(":memory:");
const handlers = createHandlers(ctx);

type NamedHandler = [string, Handler];

function banner(title: string): void {
  console.log("");
  console.log("=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function show(name: string, handler: Handler, input: Record<string, unknown>): void {
  const response: ToolResponse = handler(input);
  banner(`Tool: ${name}`);

  if (!response.ok) {
    console.log(`Error: ${response.error}`);
    return;
  }

  for (const quantity of response.quantities) {
    const unit = quantity.unit ? ` ${quantity.unit}` : "";
    console.log(`${quantity.label.padEnd(28)} ${formatNumber(quantity.value).padStart(14)}${unit}`);
    console.log(`  ${quantity.description}`);
  }

  if (response.rows && response.rows.length > 0) {
    console.log("Rows:");
    for (const row of response.rows) {
      console.log(`  - ${String(row.name)} | yield ${row.yieldStrengthMPa} MPa | E ${row.elasticModulusGPa} GPa | density ${row.densityKgM3} kg/m3`);
    }
  }

  if (response.safetyFactor) {
    console.log(`${response.safetyFactor.label.padEnd(28)} ${formatNumber(response.safetyFactor.value).padStart(14)}`);
    console.log(`  ${response.safetyFactor.description}`);
  }

  if (response.meta) {
    console.log(`Factor: ${formatNumber(response.meta.factor as number)} (${response.meta.category})`);
  }

  if (response.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of response.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  console.log("Method:", response.method.name);
  console.log("Formula:", response.method.formula);
  if (response.references.length > 0) {
    console.log("References:");
    for (const ref of response.references) {
      const edition = ref.edition ? `, ${ref.edition}` : "";
      const section = ref.section ? ` [${ref.section}]` : "";
      console.log(`  - ${ref.title} (${ref.source}${edition})${section}`);
    }
  }
}

type ToolHandlers = {
  beam_bending: Handler;
  section_properties: Handler;
  bolt_strength: Handler;
  spring_design: Handler;
  shaft_analysis: Handler;
  bearing_life: Handler;
  von_mises: Handler;
  fatigue_analysis: Handler;
  unit_convert: Handler;
  material_lookup: Handler;
};

const toolHandlers = handlers as ToolHandlers;

const tools: NamedHandler[] = [
  ["beam_bending", toolHandlers.beam_bending],
  ["section_properties", toolHandlers.section_properties],
  ["bolt_strength", toolHandlers.bolt_strength],
  ["spring_design", toolHandlers.spring_design],
  ["shaft_analysis", toolHandlers.shaft_analysis],
  ["bearing_life", toolHandlers.bearing_life],
  ["von_mises", toolHandlers.von_mises],
  ["fatigue_analysis", toolHandlers.fatigue_analysis],
  ["unit_convert", toolHandlers.unit_convert],
  ["unit_convert (torque to energy)", toolHandlers.unit_convert],
  ["material_lookup", toolHandlers.material_lookup],
];

const inputs: Array<Record<string, unknown>> = [
  {
    support: "simply_supported",
    load: "point",
    loadMagnitude: 20000,
    length: 3,
    material: "Structural steel S355",
    section: { shape: "i_beam", height: 0.3, flangeWidth: 0.15, flangeThickness: 0.012, webThickness: 0.008 },
    outputUnits: { maxBendingStress: "MPa", maxDeflection: "mm", maxBendingMoment: "kN·m" },
  },
  {
    section: { shape: "i_beam", height: 0.3, flangeWidth: 0.15, flangeThickness: 0.012, webThickness: 0.008 },
  },
  {
    nominalDiameterMm: 12,
    propertyClass: "8.8",
    axialLoad: 30000,
    outputUnits: { recommendedPreload: "kN" },
  },
  {
    wireDiameter: 0.008,
    meanDiameter: 0.04,
    activeCoils: 4,
    endType: "squared_ground",
    freeLength: 0.09,
    load: 2000,
    shearModulus: 79.3e9,
    shearYieldStrength: 700e6,
    outputUnits: { maxShearStress: "MPa", springRate: "N/mm", deflection: "mm", solidHeight: "mm", workingLength: "mm" },
  },
  {
    outerDiameter: 0.05,
    length: 1.2,
    torque: 1500,
    material: "Structural steel S355",
    outputUnits: { maxShearStress: "MPa" },
  },
  {
    bearingType: "ball",
    dynamicLoadRating: 42300,
    equivalentLoad: 8500,
    speedRpm: 1500,
    requiredLifeHours: 20000,
  },
  {
    mode: "cartesian",
    sigmaX: 120e6,
    sigmaY: 40e6,
    tauXY: 25e6,
    yieldStrength: 355e6,
    outputUnits: { vonMisesStress: "MPa", maxShearStress: "MPa" },
  },
  {
    ultimateStrength: 1200e6,
    yieldStrength: 950e6,
    stressAmplitude: 200e6,
    meanStress: 400e6,
    surfaceFinish: "machined",
    outputUnits: {
      baseEnduranceLimit: "MPa",
      correctedEnduranceLimit: "MPa",
      peakStress: "MPa",
      fatigueStrengthAt1000Cycles: "MPa",
      equivalentAmplitude: "MPa",
    },
  },
  {
    value: 1000,
    from: "psi",
    to: "MPa",
  },
  {
    value: 10,
    from: "N·m",
    to: "J",
  },
  {
    query: "steel",
  },
];

console.log("Engineer MCP - demo run");
for (let i = 0; i < tools.length; i += 1) {
  const entry = tools[i];
  const input = inputs[i];
  if (!entry || !input) {
    continue;
  }
  const [name, handler] = entry;
  show(name, handler, input);
}
console.log("");
