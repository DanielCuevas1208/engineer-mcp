export const DIMENSION_AXES = ["length", "mass", "time", "temperature", "angle"] as const;

export type Dimension = [number, number, number, number, number];

export const DIM_LENGTH: Dimension = [1, 0, 0, 0, 0];
export const DIM_MASS: Dimension = [0, 1, 0, 0, 0];
export const DIM_TIME: Dimension = [0, 0, 1, 0, 0];
export const DIM_TEMPERATURE: Dimension = [0, 0, 0, 1, 0];
export const DIM_ANGLE: Dimension = [0, 0, 0, 0, 1];
export const DIM_FORCE: Dimension = [1, 1, -2, 0, 0];
export const DIM_PRESSURE: Dimension = [-1, 1, -2, 0, 0];
export const DIM_TORQUE: Dimension = [2, 1, -2, 0, 0];
export const DIM_ENERGY: Dimension = [2, 1, -2, 0, 0];
export const DIM_POWER: Dimension = [2, 1, -3, 0, 0];
export const DIM_VELOCITY: Dimension = [1, 0, -1, 0, 0];
export const DIM_ACCELERATION: Dimension = [1, 0, -2, 0, 0];
export const DIM_AREA: Dimension = [2, 0, 0, 0, 0];
export const DIM_VOLUME: Dimension = [3, 0, 0, 0, 0];
export const DIM_DENSITY: Dimension = [-3, 1, 0, 0, 0];
export const DIM_FREQUENCY: Dimension = [0, 0, -1, 0, 0];

export function dimensionsEqual(a: Dimension, b: Dimension): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function dimensionLabel(dim: Dimension): string {
  const parts: string[] = [];
  const exponents: Record<string, number | undefined> = {};
  DIMENSION_AXES.forEach((axis, index) => {
    exponents[axis] = dim[index];
  });
  for (const axis of DIMENSION_AXES) {
    const exponent = exponents[axis];
    if (exponent === undefined || exponent === 0) {
      continue;
    }
    parts.push(exponent === 1 ? axis : `${axis}^${exponent}`);
  }
  return parts.length === 0 ? "dimensionless" : parts.join(" ");
}
