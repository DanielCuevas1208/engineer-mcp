import { describe, expect, it } from "vitest";
import { convertUnit, findSiUnit } from "../src/units/index.js";

describe("dynamic viscosity units", () => {
  it("converts centipoise to pascal second", () => {
    const outcome = convertUnit(100, "cP", "Pa·s");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0.1, 9);
      expect(outcome.category).toBe("dynamic viscosity");
      expect(outcome.siSymbol).toBe("Pa·s");
    }
  });

  it("converts poise to millipascal second", () => {
    const outcome = convertUnit(1, "P", "mPa·s");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(100, 9);
    }
  });

  it("converts pound per foot second to pascal second", () => {
    const outcome = convertUnit(1, "lb/(ft·s)", "Pa·s");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1.4881639435696, 9);
    }
  });

  it("finds the SI unit for dynamic viscosity", () => {
    expect(findSiUnit("dynamic viscosity")?.canonical).toBe("Pa·s");
  });
});

describe("kinematic viscosity units", () => {
  it("converts centistokes to square metre per second", () => {
    const outcome = convertUnit(100, "cSt", "m2/s");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1e-4, 12);
      expect(outcome.category).toBe("kinematic viscosity");
      expect(outcome.siSymbol).toBe("m2/s");
    }
  });

  it("converts stokes to centistokes", () => {
    const outcome = convertUnit(1, "St", "cSt");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(100, 9);
    }
  });

  it("converts square foot per second to square metre per second", () => {
    const outcome = convertUnit(1, "ft2/s", "m2/s");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0.09290304, 9);
    }
  });
});

describe("thermal conductivity units", () => {
  it("treats per degree Celsius as per kelvin", () => {
    const outcome = convertUnit(1, "W/(m·degC)", "W/(m·K)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1, 12);
    }
  });

  it("converts watts per metre kelvin to BTU units", () => {
    const outcome = convertUnit(205, "W/(m·K)", "BTU/(ft·h·degF)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(118.4468, 3);
      expect(outcome.category).toBe("thermal conductivity");
      expect(outcome.siSymbol).toBe("W/(m·K)");
    }
  });

  it("converts BTU units to watts per metre kelvin", () => {
    const outcome = convertUnit(1, "BTU/(ft·h·degF)", "W/(m·K)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1.730735281812, 9);
    }
  });

  it("converts kilocalories per metre hour degree Celsius", () => {
    const outcome = convertUnit(1, "kcal/(m·h·degC)", "W/(m·K)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1.1622222, 5);
    }
  });
});

describe("heat flux units", () => {
  it("converts watts per square metre to BTU units", () => {
    const outcome = convertUnit(1, "W/m2", "BTU/(ft2·h)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0.316998, 5);
      expect(outcome.category).toBe("heat flux");
      expect(outcome.siSymbol).toBe("W/m2");
    }
  });

  it("converts kilowatts per square metre to watts per square centimetre", () => {
    const outcome = convertUnit(1, "kW/m2", "W/cm2");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0.1, 9);
    }
  });
});

describe("heat transfer coefficient units", () => {
  it("treats per degree Celsius as per kelvin", () => {
    const outcome = convertUnit(1, "W/(m2·degC)", "W/(m2·K)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(1, 12);
    }
  });

  it("converts watts per square metre kelvin to BTU units", () => {
    const outcome = convertUnit(1, "W/(m2·K)", "BTU/(ft2·h·degF)");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeCloseTo(0.1761103, 5);
      expect(outcome.category).toBe("heat transfer coefficient");
      expect(outcome.siSymbol).toBe("W/(m2·K)");
    }
  });
});

describe("category isolation across new units", () => {
  it("rejects a viscosity-to-stiffness conversion", () => {
    const outcome = convertUnit(1, "Pa·s", "N/m");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("Dimension mismatch");
    }
  });

  it("rejects a thermal conductivity-to-heat flux conversion", () => {
    const outcome = convertUnit(1, "W/(m·K)", "W/m2");
    expect(outcome.ok).toBe(false);
  });
});
