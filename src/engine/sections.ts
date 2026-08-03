import type { MethodRecord, SectionShape } from "../types.js";

export type SectionDef =
  | { shape: "rectangle"; width: number; height: number }
  | { shape: "circle"; diameter: number }
  | { shape: "hollow_circle"; outerDiameter: number; innerDiameter: number }
  | { shape: "i_beam"; height: number; flangeWidth: number; flangeThickness: number; webThickness: number }
  | { shape: "box"; width: number; height: number; thickness: number };

export type SectionProperties = {
  shape: SectionShape;
  area: number;
  secondMomentOfArea: number;
  secondMomentOfAreaY: number;
  sectionModulus: number;
  sectionModulusY: number;
  radiusOfGyration: number;
  centroidX: number;
  centroidY: number;
};

export const SECTION_METHOD: MethodRecord = {
  id: "section-properties",
  name: "Standard cross-section geometry",
  formula: "A, I, Z, and r from closed-form section formulas",
  notes: "Moments of inertia use the section centroid axes. The section modulus uses the extreme fibre at half the depth.",
  referenceIds: ["roark-2011", "machinery-handbook"],
};

function requirePositive(def: SectionDef): void {
  const values = Object.entries(def).filter(([key]) => key !== "shape");
  for (const [key, value] of values) {
    if (typeof value === "number" && !(value > 0)) {
      throw new Error(`Section dimension ${key} must be positive.`);
    }
  }
}

export function computeSection(def: SectionDef): SectionProperties {
  requirePositive(def);

  switch (def.shape) {
    case "rectangle": {
      const { width, height } = def;
      const area = width * height;
      const secondMomentOfArea = (width * height ** 3) / 12;
      const secondMomentOfAreaY = (height * width ** 3) / 12;
      return {
        shape: def.shape,
        area,
        secondMomentOfArea,
        secondMomentOfAreaY,
        sectionModulus: secondMomentOfArea / (height / 2),
        sectionModulusY: secondMomentOfAreaY / (width / 2),
        radiusOfGyration: Math.sqrt(secondMomentOfArea / area),
        centroidX: width / 2,
        centroidY: height / 2,
      };
    }
    case "circle": {
      const { diameter } = def;
      const area = (Math.PI * diameter ** 2) / 4;
      const secondMomentOfArea = (Math.PI * diameter ** 4) / 64;
      return {
        shape: def.shape,
        area,
        secondMomentOfArea,
        secondMomentOfAreaY: secondMomentOfArea,
        sectionModulus: (Math.PI * diameter ** 3) / 32,
        sectionModulusY: (Math.PI * diameter ** 3) / 32,
        radiusOfGyration: diameter / 4,
        centroidX: diameter / 2,
        centroidY: diameter / 2,
      };
    }
    case "hollow_circle": {
      const { outerDiameter, innerDiameter } = def;
      if (innerDiameter >= outerDiameter) {
        throw new Error("Inner diameter must be smaller than outer diameter.");
      }
      const area = (Math.PI * (outerDiameter ** 2 - innerDiameter ** 2)) / 4;
      const secondMomentOfArea = (Math.PI * (outerDiameter ** 4 - innerDiameter ** 4)) / 64;
      return {
        shape: def.shape,
        area,
        secondMomentOfArea,
        secondMomentOfAreaY: secondMomentOfArea,
        sectionModulus: secondMomentOfArea / (outerDiameter / 2),
        sectionModulusY: secondMomentOfArea / (outerDiameter / 2),
        radiusOfGyration: Math.sqrt((outerDiameter ** 2 + innerDiameter ** 2) / 16),
        centroidX: outerDiameter / 2,
        centroidY: outerDiameter / 2,
      };
    }
    case "i_beam": {
      const { height, flangeWidth, flangeThickness, webThickness } = def;
      const webHeight = height - 2 * flangeThickness;
      if (webHeight <= 0) {
        throw new Error("Flange thickness must be less than half the beam height.");
      }
      const area = 2 * flangeWidth * flangeThickness + webHeight * webThickness;
      const secondMomentOfArea = (flangeWidth * height ** 3 - (flangeWidth - webThickness) * webHeight ** 3) / 12;
      const secondMomentOfAreaY = (2 * flangeThickness * flangeWidth ** 3 + webHeight * webThickness ** 3) / 12;
      return {
        shape: def.shape,
        area,
        secondMomentOfArea,
        secondMomentOfAreaY,
        sectionModulus: secondMomentOfArea / (height / 2),
        sectionModulusY: secondMomentOfAreaY / (flangeWidth / 2),
        radiusOfGyration: Math.sqrt(secondMomentOfArea / area),
        centroidX: flangeWidth / 2,
        centroidY: height / 2,
      };
    }
    case "box": {
      const { width, height, thickness } = def;
      const innerWidth = width - 2 * thickness;
      const innerHeight = height - 2 * thickness;
      if (innerWidth <= 0 || innerHeight <= 0) {
        throw new Error("Wall thickness must be less than half of each outer dimension.");
      }
      const area = width * height - innerWidth * innerHeight;
      const secondMomentOfArea = (width * height ** 3 - innerWidth * innerHeight ** 3) / 12;
      const secondMomentOfAreaY = (height * width ** 3 - innerHeight * innerWidth ** 3) / 12;
      return {
        shape: def.shape,
        area,
        secondMomentOfArea,
        secondMomentOfAreaY,
        sectionModulus: secondMomentOfArea / (height / 2),
        sectionModulusY: secondMomentOfAreaY / (width / 2),
        radiusOfGyration: Math.sqrt(secondMomentOfArea / area),
        centroidX: width / 2,
        centroidY: height / 2,
      };
    }
  }
}
