import { describe, expect, it } from "vitest";
import { convertUnit, dimensionLabel, findUnit, listUnits } from "../src/units/index.js";

describe("unit registry", () => {
  it("lists all registered units", () => {
    expect(listUnits().length).toBeGreaterThan(40);
  });

  it("finds units by alias", () => {
    expect(findUnit("Nm")?.canonical).toBe("N·m");
    expect(findUnit("N·m")?.canonical).toBe("N·m");
    expect(findUnit("degF")?.canonical).toBe("degF");
    expect(findUnit("not-a-unit")).toBeUndefined();
  });

  it("labels dimensions", () => {
    expect(dimensionLabel([1, 0, 0, 0, 0])).toBe("length");
    expect(dimensionLabel([0, 0, 0, 0, 0])).toBe("dimensionless");
    expect(dimensionLabel([1, 1, -2, 0, 0])).toBe("length mass time^-2");
  });
});

describe("unit conversion", () => {
  it("converts lengths", () => {
    expect(convertUnit(1, "m", "mm").ok).toBe(true);
    const outcome = convertUnit(1, "m", "mm");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1000, 9);
    }
  });

  it("converts stress units", () => {
    const outcome = convertUnit(1, "MPa", "psi");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(145.0377, 3);
    }
  });

  it("converts forces with the correct factor", () => {
    const outcome = convertUnit(1, "kN", "N");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1000, 9);
      expect(outcome.factor).toBeCloseTo(1000, 9);
    }
  });

  it("converts kilogram-force to newtons", () => {
    const outcome = convertUnit(1, "kgf", "N");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(9.80665, 5);
    }
  });

  it("converts angles", () => {
    const outcome = convertUnit(180, "deg", "rad");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(Math.PI, 9);
    }
  });

  it("converts Celsius to Fahrenheit", () => {
    const outcome = convertUnit(100, "degC", "degF");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(212, 9);
    }
  });

  it("converts Fahrenheit to Celsius", () => {
    const outcome = convertUnit(32, "degF", "degC");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0, 9);
    }
  });

  it("converts kelvin to Celsius", () => {
    const outcome = convertUnit(300, "K", "degC");
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(26.85, 2);
    }
  });

  it("rejects a torque to energy conversion", () => {
    const outcome = convertUnit(10, "N·m", "J");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("Category mismatch");
    }
  });

  it("rejects mismatched dimensions", () => {
    const outcome = convertUnit(10, "m", "s");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("Dimension mismatch");
    }
  });

  it("rejects unknown units", () => {
    expect(convertUnit(10, "furlong", "m").ok).toBe(false);
    expect(convertUnit(10, "m", "lightyear").ok).toBe(false);
  });

  it("reports the SI symbol on success", () => {
    const outcome = convertUnit(1, "psi", "MPa");
    if (outcome.ok) {
      expect(outcome.siSymbol).toBe("Pa");
    }
  });
});

describe("stiffness units", () => {
  it("converts newtons per millimetre to newtons per metre", () => {
    const outcome = convertUnit(1, "N/mm", "N/m");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1000, 9);
      expect(outcome.category).toBe("stiffness");
      expect(outcome.siSymbol).toBe("N/m");
    }
  });

  it("converts newtons per metre to pound-force per inch", () => {
    const outcome = convertUnit(1, "N/m", "lbf/in");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1 / 175.126835, 6);
    }
  });

  it("rejects a stiffness-to-pressure conversion", () => {
    const outcome = convertUnit(10, "N/m", "Pa");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("Dimension mismatch");
    }
  });
});

describe("viscosity units", () => {
  it("converts pascal seconds to centipoise", () => {
    const outcome = convertUnit(1, "Pa·s", "cP");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1000, 9);
      expect(outcome.category).toBe("dynamic viscosity");
      expect(outcome.siSymbol).toBe("Pa·s");
    }
  });

  it("converts poise to pascal seconds", () => {
    const outcome = convertUnit(1, "P", "Pa·s");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0.1, 9);
    }
  });

  it("converts stokes to centistokes", () => {
    const outcome = convertUnit(1, "St", "cSt");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(100, 9);
      expect(outcome.category).toBe("kinematic viscosity");
      expect(outcome.siSymbol).toBe("m2/s");
    }
  });

  it("rejects a dynamic-to-kinematic viscosity conversion", () => {
    const outcome = convertUnit(1, "Pa·s", "m2/s");
    expect(outcome.ok).toBe(false);
  });
});

describe("thermal conductivity units", () => {
  it("converts watts per metre kelvin to British thermal units", () => {
    const outcome = convertUnit(1, "W/(m·K)", "BTU/(ft·h·°F)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1 / 1.73073467, 6);
      expect(outcome.category).toBe("thermal conductivity");
      expect(outcome.siSymbol).toBe("W/(m·K)");
    }
  });

  it("rejects a thermal-conductivity to power conversion", () => {
    const outcome = convertUnit(1, "W/(m·K)", "W");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("Dimension mismatch");
    }
  });
});
