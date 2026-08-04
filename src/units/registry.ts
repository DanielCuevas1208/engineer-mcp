import {
  DIM_ACCELERATION,
  DIM_ANGLE,
  DIM_AREA,
  DIM_DENSITY,
  DIM_DYNAMIC_VISCOSITY,
  DIM_ENERGY,
  DIM_FORCE,
  DIM_FREQUENCY,
  DIM_KINEMATIC_VISCOSITY,
  DIM_LENGTH,
  DIM_MASS,
  DIM_POWER,
  DIM_PRESSURE,
  DIM_STIFFNESS,
  DIM_TEMPERATURE,
  DIM_THERMAL_CONDUCTIVITY,
  DIM_TIME,
  DIM_TORQUE,
  DIM_VELOCITY,
  DIM_VOLUME,
  type Dimension,
} from "./dimensions.js";

export type UnitDef = {
  canonical: string;
  aliases: string[];
  name: string;
  category: string;
  dim: Dimension;
  factor: number;
  offset?: number;
};

function unit(def: Omit<UnitDef, "aliases"> & { aliases?: string[] }): UnitDef {
  return {
    ...def,
    aliases: [def.canonical, ...(def.aliases ?? [])],
  };
}

export const UNITS: UnitDef[] = [
  unit({ canonical: "m", name: "metre", category: "length", dim: DIM_LENGTH, factor: 1 }),
  unit({ canonical: "mm", aliases: ["millimeter"], name: "millimetre", category: "length", dim: DIM_LENGTH, factor: 1e-3 }),
  unit({ canonical: "cm", name: "centimetre", category: "length", dim: DIM_LENGTH, factor: 1e-2 }),
  unit({ canonical: "km", name: "kilometre", category: "length", dim: DIM_LENGTH, factor: 1e3 }),
  unit({ canonical: "um", aliases: ["micron"], name: "micrometre", category: "length", dim: DIM_LENGTH, factor: 1e-6 }),
  unit({ canonical: "in", name: "inch", category: "length", dim: DIM_LENGTH, factor: 0.0254 }),
  unit({ canonical: "ft", name: "foot", category: "length", dim: DIM_LENGTH, factor: 0.3048 }),
  unit({ canonical: "yd", name: "yard", category: "length", dim: DIM_LENGTH, factor: 0.9144 }),
  unit({ canonical: "mi", name: "mile", category: "length", dim: DIM_LENGTH, factor: 1609.344 }),

  unit({ canonical: "kg", name: "kilogram", category: "mass", dim: DIM_MASS, factor: 1 }),
  unit({ canonical: "g", name: "gram", category: "mass", dim: DIM_MASS, factor: 1e-3 }),
  unit({ canonical: "mg", name: "milligram", category: "mass", dim: DIM_MASS, factor: 1e-6 }),
  unit({ canonical: "t", name: "tonne", category: "mass", dim: DIM_MASS, factor: 1e3 }),
  unit({ canonical: "lb", name: "pound", category: "mass", dim: DIM_MASS, factor: 0.45359237 }),
  unit({ canonical: "oz", name: "ounce", category: "mass", dim: DIM_MASS, factor: 0.028349523125 }),

  unit({ canonical: "s", name: "second", category: "time", dim: DIM_TIME, factor: 1 }),
  unit({ canonical: "ms", name: "millisecond", category: "time", dim: DIM_TIME, factor: 1e-3 }),
  unit({ canonical: "min", name: "minute", category: "time", dim: DIM_TIME, factor: 60 }),
  unit({ canonical: "h", name: "hour", category: "time", dim: DIM_TIME, factor: 3600 }),
  unit({ canonical: "day", name: "day", category: "time", dim: DIM_TIME, factor: 86400 }),

  unit({ canonical: "rad", name: "radian", category: "angle", dim: DIM_ANGLE, factor: 1 }),
  unit({ canonical: "deg", name: "degree", category: "angle", dim: DIM_ANGLE, factor: Math.PI / 180 }),
  unit({ canonical: "rev", name: "revolution", category: "angle", dim: DIM_ANGLE, factor: 2 * Math.PI }),

  unit({ canonical: "K", name: "kelvin", category: "temperature", dim: DIM_TEMPERATURE, factor: 1 }),
  unit({ canonical: "degC", aliases: ["C"], name: "degree Celsius", category: "temperature", dim: DIM_TEMPERATURE, factor: 1, offset: 273.15 }),
  unit({ canonical: "degF", aliases: ["F"], name: "degree Fahrenheit", category: "temperature", dim: DIM_TEMPERATURE, factor: 5 / 9, offset: 459.67 }),
  unit({ canonical: "degR", name: "degree Rankine", category: "temperature", dim: DIM_TEMPERATURE, factor: 5 / 9 }),

  unit({ canonical: "N", name: "newton", category: "force", dim: DIM_FORCE, factor: 1 }),
  unit({ canonical: "kN", name: "kilonewton", category: "force", dim: DIM_FORCE, factor: 1e3 }),
  unit({ canonical: "MN", name: "meganewton", category: "force", dim: DIM_FORCE, factor: 1e6 }),
  unit({ canonical: "lbf", name: "pound-force", category: "force", dim: DIM_FORCE, factor: 4.4482216152605 }),
  unit({ canonical: "kgf", name: "kilogram-force", category: "force", dim: DIM_FORCE, factor: 9.80665 }),
  unit({ canonical: "dyn", name: "dyne", category: "force", dim: DIM_FORCE, factor: 1e-5 }),

  unit({ canonical: "Pa", name: "pascal", category: "pressure", dim: DIM_PRESSURE, factor: 1 }),
  unit({ canonical: "kPa", name: "kilopascal", category: "pressure", dim: DIM_PRESSURE, factor: 1e3 }),
  unit({ canonical: "MPa", name: "megapascal", category: "pressure", dim: DIM_PRESSURE, factor: 1e6 }),
  unit({ canonical: "GPa", name: "gigapascal", category: "pressure", dim: DIM_PRESSURE, factor: 1e9 }),
  unit({ canonical: "bar", name: "bar", category: "pressure", dim: DIM_PRESSURE, factor: 1e5 }),
  unit({ canonical: "psi", name: "pound per square inch", category: "pressure", dim: DIM_PRESSURE, factor: 6894.757293168 }),
  unit({ canonical: "ksi", name: "kip per square inch", category: "pressure", dim: DIM_PRESSURE, factor: 6894757.293168 }),
  unit({ canonical: "atm", name: "standard atmosphere", category: "pressure", dim: DIM_PRESSURE, factor: 101325 }),

  unit({ canonical: "N·m", aliases: ["Nm", "N.m"], name: "newton metre", category: "torque", dim: DIM_TORQUE, factor: 1 }),
  unit({ canonical: "kN·m", aliases: ["kNm", "kN.m"], name: "kilonewton metre", category: "torque", dim: DIM_TORQUE, factor: 1e3 }),
  unit({ canonical: "lbf·ft", aliases: ["lbfft", "lbf.ft", "ft·lbf", "ftlbf"], name: "pound-force foot", category: "torque", dim: DIM_TORQUE, factor: 1.3558179483314 }),
  unit({ canonical: "lbf·in", aliases: ["lbfin", "lbf.in", "in·lbf", "inlbf"], name: "pound-force inch", category: "torque", dim: DIM_TORQUE, factor: 0.11298482902762 }),
  unit({ canonical: "kgf·m", aliases: ["kgfm", "kgf.m"], name: "kilogram-force metre", category: "torque", dim: DIM_TORQUE, factor: 9.80665 }),

  unit({ canonical: "J", name: "joule", category: "energy", dim: DIM_ENERGY, factor: 1 }),
  unit({ canonical: "kJ", name: "kilojoule", category: "energy", dim: DIM_ENERGY, factor: 1e3 }),
  unit({ canonical: "MJ", name: "megajoule", category: "energy", dim: DIM_ENERGY, factor: 1e6 }),
  unit({ canonical: "kWh", name: "kilowatt hour", category: "energy", dim: DIM_ENERGY, factor: 3.6e6 }),
  unit({ canonical: "cal", name: "calorie", category: "energy", dim: DIM_ENERGY, factor: 4.184 }),
  unit({ canonical: "kcal", name: "kilocalorie", category: "energy", dim: DIM_ENERGY, factor: 4184 }),
  unit({ canonical: "BTU", name: "British thermal unit", category: "energy", dim: DIM_ENERGY, factor: 1055.05585262 }),

  unit({ canonical: "W", name: "watt", category: "power", dim: DIM_POWER, factor: 1 }),
  unit({ canonical: "kW", name: "kilowatt", category: "power", dim: DIM_POWER, factor: 1e3 }),
  unit({ canonical: "MW", name: "megawatt", category: "power", dim: DIM_POWER, factor: 1e6 }),
  unit({ canonical: "hp", name: "mechanical horsepower", category: "power", dim: DIM_POWER, factor: 745.699872 }),

  unit({ canonical: "m/s", name: "metre per second", category: "velocity", dim: DIM_VELOCITY, factor: 1 }),
  unit({ canonical: "km/h", name: "kilometre per hour", category: "velocity", dim: DIM_VELOCITY, factor: 1 / 3.6 }),
  unit({ canonical: "ft/s", name: "foot per second", category: "velocity", dim: DIM_VELOCITY, factor: 0.3048 }),
  unit({ canonical: "mph", name: "mile per hour", category: "velocity", dim: DIM_VELOCITY, factor: 0.44704 }),
  unit({ canonical: "kn", name: "knot", category: "velocity", dim: DIM_VELOCITY, factor: 0.514444 }),

  unit({ canonical: "m/s2", name: "metre per second squared", category: "acceleration", dim: DIM_ACCELERATION, factor: 1 }),
  unit({ canonical: "g0", name: "standard gravity", category: "acceleration", dim: DIM_ACCELERATION, factor: 9.80665 }),
  unit({ canonical: "ft/s2", name: "foot per second squared", category: "acceleration", dim: DIM_ACCELERATION, factor: 0.3048 }),

  unit({ canonical: "m2", name: "square metre", category: "area", dim: DIM_AREA, factor: 1 }),
  unit({ canonical: "mm2", name: "square millimetre", category: "area", dim: DIM_AREA, factor: 1e-6 }),
  unit({ canonical: "cm2", name: "square centimetre", category: "area", dim: DIM_AREA, factor: 1e-4 }),
  unit({ canonical: "in2", name: "square inch", category: "area", dim: DIM_AREA, factor: 0.00064516 }),
  unit({ canonical: "ft2", name: "square foot", category: "area", dim: DIM_AREA, factor: 0.09290304 }),

  unit({ canonical: "m3", name: "cubic metre", category: "volume", dim: DIM_VOLUME, factor: 1 }),
  unit({ canonical: "L", name: "litre", category: "volume", dim: DIM_VOLUME, factor: 1e-3 }),
  unit({ canonical: "mL", name: "millilitre", category: "volume", dim: DIM_VOLUME, factor: 1e-6 }),
  unit({ canonical: "cm3", name: "cubic centimetre", category: "volume", dim: DIM_VOLUME, factor: 1e-6 }),
  unit({ canonical: "in3", name: "cubic inch", category: "volume", dim: DIM_VOLUME, factor: 1.6387064e-5 }),
  unit({ canonical: "ft3", name: "cubic foot", category: "volume", dim: DIM_VOLUME, factor: 0.028316846592 }),
  unit({ canonical: "gal", name: "US gallon", category: "volume", dim: DIM_VOLUME, factor: 0.003785411784 }),

  unit({ canonical: "kg/m3", name: "kilogram per cubic metre", category: "density", dim: DIM_DENSITY, factor: 1 }),
  unit({ canonical: "g/cm3", name: "gram per cubic centimetre", category: "density", dim: DIM_DENSITY, factor: 1e3 }),
  unit({ canonical: "lb/ft3", name: "pound per cubic foot", category: "density", dim: DIM_DENSITY, factor: 16.01846337 }),

  unit({ canonical: "N/m", name: "newton per metre", category: "stiffness", dim: DIM_STIFFNESS, factor: 1 }),
  unit({ canonical: "N/mm", name: "newton per millimetre", category: "stiffness", dim: DIM_STIFFNESS, factor: 1e3 }),
  unit({ canonical: "kN/m", name: "kilonewton per metre", category: "stiffness", dim: DIM_STIFFNESS, factor: 1e3 }),
  unit({ canonical: "lbf/in", name: "pound-force per inch", category: "stiffness", dim: DIM_STIFFNESS, factor: 175.126835 }),

  unit({ canonical: "Hz", name: "hertz", category: "frequency", dim: DIM_FREQUENCY, factor: 1 }),
  unit({ canonical: "rpm", name: "revolution per minute", category: "frequency", dim: DIM_FREQUENCY, factor: 1 / 60 }),
  unit({ canonical: "kHz", name: "kilohertz", category: "frequency", dim: DIM_FREQUENCY, factor: 1e3 }),

  unit({ canonical: "Pa·s", name: "pascal second", category: "dynamic viscosity", dim: DIM_DYNAMIC_VISCOSITY, factor: 1 }),
  unit({ canonical: "mPa·s", name: "millipascal second", category: "dynamic viscosity", dim: DIM_DYNAMIC_VISCOSITY, factor: 1e-3 }),
  unit({ canonical: "P", name: "poise", category: "dynamic viscosity", dim: DIM_DYNAMIC_VISCOSITY, factor: 0.1 }),
  unit({ canonical: "cP", name: "centipoise", category: "dynamic viscosity", dim: DIM_DYNAMIC_VISCOSITY, factor: 1e-3 }),
  unit({ canonical: "lbf·s/ft2", aliases: ["reyn"], name: "pound-force second per square foot", category: "dynamic viscosity", dim: DIM_DYNAMIC_VISCOSITY, factor: 47.88025898 }),

  unit({ canonical: "m2/s", name: "square metre per second", category: "kinematic viscosity", dim: DIM_KINEMATIC_VISCOSITY, factor: 1 }),
  unit({ canonical: "mm2/s", name: "square millimetre per second", category: "kinematic viscosity", dim: DIM_KINEMATIC_VISCOSITY, factor: 1e-6 }),
  unit({ canonical: "St", name: "stokes", category: "kinematic viscosity", dim: DIM_KINEMATIC_VISCOSITY, factor: 1e-4 }),
  unit({ canonical: "cSt", name: "centistokes", category: "kinematic viscosity", dim: DIM_KINEMATIC_VISCOSITY, factor: 1e-6 }),
  unit({ canonical: "ft2/s", name: "square foot per second", category: "kinematic viscosity", dim: DIM_KINEMATIC_VISCOSITY, factor: 0.09290304 }),

  unit({ canonical: "W/(m·K)", aliases: ["W/mK", "W/(m·degC)"], name: "watt per metre kelvin", category: "thermal conductivity", dim: DIM_THERMAL_CONDUCTIVITY, factor: 1 }),
  unit({ canonical: "BTU/(ft·h·degF)", aliases: ["BTU/(ft.h.degF)"], name: "BTU per foot hour degree Fahrenheit", category: "thermal conductivity", dim: DIM_THERMAL_CONDUCTIVITY, factor: 1.730734666 }),
];

export function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[\s·.]/g, "").replace(/\u00B7/g, "").trim();
}

const BY_ALIAS = new Map<string, UnitDef>();
for (const def of UNITS) {
  for (const alias of def.aliases) {
    BY_ALIAS.set(normalizeSymbol(alias), def);
  }
}

export function findUnit(symbol: string): UnitDef | undefined {
  return BY_ALIAS.get(normalizeSymbol(symbol));
}

export function findSiUnit(category: string): UnitDef | undefined {
  return UNITS.find((def) => def.category === category && def.factor === 1 && def.offset === undefined);
}

export function listUnits(): UnitDef[] {
  return [...UNITS];
}
