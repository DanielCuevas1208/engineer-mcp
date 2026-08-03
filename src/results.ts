export function formatNumber(value: number, sigFigs = 4): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (value === 0) {
    return "0";
  }
  const order = Math.floor(Math.log10(Math.abs(value)));
  const places = Math.max(sigFigs - order - 1, 0);
  const rounded = Number(value.toFixed(Math.min(places, 12)));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
