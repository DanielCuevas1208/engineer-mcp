import { dimensionsEqual, dimensionLabel, type Dimension } from "./dimensions.js";
import { findSiUnit, findUnit } from "./registry.js";

export type UnitOutcome =
  | {
      ok: true;
      value: number;
      toSI: number;
      siSymbol: string;
      factor: number;
      category: string;
      dim: Dimension;
    }
  | { ok: false; error: string };

export function convertUnit(value: number, fromSymbol: string, toSymbol: string): UnitOutcome {
  const from = findUnit(fromSymbol);
  const to = findUnit(toSymbol);

  if (!from) {
    return { ok: false, error: `Unknown unit: ${fromSymbol}` };
  }
  if (!to) {
    return { ok: false, error: `Unknown unit: ${toSymbol}` };
  }
  if (!dimensionsEqual(from.dim, to.dim)) {
    return {
      ok: false,
      error: `Dimension mismatch: ${fromSymbol} is ${dimensionLabel(from.dim)}, ${toSymbol} is ${dimensionLabel(to.dim)}`,
    };
  }
  if (from.category !== to.category) {
    return {
      ok: false,
      error: `Category mismatch: ${fromSymbol} is ${from.category}, ${toSymbol} is ${to.category}. Use a unit of the same quantity.`,
    };
  }

  const offsetFrom = from.offset ?? 0;
  const offsetTo = to.offset ?? 0;
  const si = (value + offsetFrom) * from.factor;
  const converted = si / to.factor - offsetTo;
  const factor = from.factor / to.factor;
  const siSymbol = findSiUnit(from.category)?.canonical ?? fromSymbol;

  return {
    ok: true,
    value: converted,
    toSI: value * from.factor,
    siSymbol,
    factor,
    category: from.category,
    dim: from.dim,
  };
}
