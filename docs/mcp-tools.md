# Tool reference

Every tool returns the same result envelope. The envelope holds the method, the formula, the inputs, the quantities, the references, and any warnings.

The envelope has this shape:

```json
{
  "tool": "beam_bending",
  "method": { "id": "beam-bending", "name": "Euler-Bernoulli beam theory", "formula": "...", "notes": "...", "referenceIds": [...] },
  "inputs": {},
  "quantities": [ { "key": "maxBendingMoment", "label": "Maximum bending moment", "value": 15000, "unit": "N·m", "description": "..." } ],
  "safetyFactor": { "key": "bendingSafetyFactor", "label": "Bending safety factor", "value": 14, "unit": "" },
  "references": [ { "id": "roark-2011", "title": "...", "source": "...", "edition": "...", "section": "..." } ],
  "warnings": []
}
```

Set `outputUnits` on any tool to convert its quantities. The tool rejects a unit of the wrong dimension.

## beam_bending

Compute the bending stress, deflection, and safety factor of a beam.

Inputs:

- `support`: `simply_supported` or `cantilever`.
- `load`: `point` or `uniform`.
- `loadMagnitude`: newtons for a point load, newtons per metre for a uniform load.
- `length`: beam length in metres.
- `material`: material name from the database.
- `elasticModulus`: Young's modulus in pascals.
- `yieldStrength`: tensile yield strength in pascals.
- `section`: cross-section shape and dimensions in metres.
- `secondMomentOfArea` and `sectionModulus`: use these when you have no section.
- `outputUnits`: optional unit overrides.

Example:

```json
{
  "support": "simply_supported",
  "load": "point",
  "loadMagnitude": 20000,
  "length": 3,
  "material": "Structural steel S355",
  "section": { "shape": "i_beam", "height": 0.3, "flangeWidth": 0.15, "flangeThickness": 0.012, "webThickness": 0.008 }
}
```

## section_properties

Compute the area, moments of inertia, section moduli, and radius of gyration of a cross-section.

Inputs:

- `section`: shape and dimensions in metres.

Supported shapes:

- `rectangle` with `width` and `height`.
- `circle` with `diameter`.
- `hollow_circle` with `outerDiameter` and `innerDiameter`.
- `i_beam` with `height`, `flangeWidth`, `flangeThickness`, and `webThickness`.
- `box` with `width`, `height`, and `thickness`.

## bolt_strength

Compute the tensile design of a metric bolt to ISO 898.

Inputs:

- `nominalDiameterMm`: bolt diameter in millimetres.
- `propertyClass`: one of `4.8`, `5.8`, `8.8`, `10.9`, `12.9`.
- `axialLoad`: applied axial load in newtons.
- `preloadFraction`: preload as a fraction of proof load. The default is `0.75`.
- `pitchMm`: thread pitch. The default comes from the database.

## spring_design

Compute the geometry, spring rate, shear stress, and safety factor of a helical compression spring.

The tool uses the Wahl factor for the shear stress. It follows Shigley for the coil counts and the solid height.

Inputs:

- `wireDiameter`: wire diameter in metres.
- `meanDiameter`: mean coil diameter in metres.
- `activeCoils`: number of active coils.
- `endType`: `plain`, `plain_ground`, `squared`, or `squared_ground`. The default is `squared_ground`.
- `freeLength`: free length in metres.
- `load`: applied axial load in newtons. Zero checks the geometry only.
- `shearModulus`: shear modulus in pascals.
- `shearYieldStrength`: torsional yield strength in pascals. Enables the safety factor.

Example:

```json
{
  "wireDiameter": 0.008,
  "meanDiameter": 0.04,
  "activeCoils": 4,
  "endType": "squared_ground",
  "freeLength": 0.09,
  "load": 2000,
  "shearModulus": 79300000000,
  "shearYieldStrength": 700000000
}
```

The tool warns on a spring index below 4 or above 12. It warns when the free-length ratio risks buckling. It warns when the load compresses the spring to solid height.

## shaft_analysis

Compute the torsion stress, angle of twist, and first lateral critical speed of a shaft.

Inputs:

- `outerDiameter` and optional `innerDiameter` in metres.
- `length` in metres.
- `torque` in newton metres.
- `material`, or `elasticModulus`, `shearModulus`, and `density`.
- `shearYieldStrength`: enables the torsion safety factor.

## bearing_life

Compute the ISO 281 rating life of a rolling bearing.

Inputs:

- `bearingType`: `ball` or `roller`.
- `dynamicLoadRating`: basic dynamic load rating C in newtons.
- `equivalentLoad`: equivalent dynamic radial load P in newtons.
- `radialLoad` and `axialLoad`: use these to derive P for a deep-groove ball bearing.
- `speedRpm`: enables life in hours.
- `requiredLifeHours`: enables the life margin.

## von_mises

Compute the von Mises equivalent stress and yield safety factor of a stress state.

Inputs:

- `mode`: `principal` or `cartesian`.
- Principal mode uses `sigma1`, `sigma2`, `sigma3`.
- Cartesian mode uses `sigmaX`, `sigmaY`, `sigmaZ`, `tauXY`, `tauXZ`, `tauYZ`.
- `yieldStrength`: enables the safety factor.

## fatigue_analysis

Compute fatigue safety factors for a cyclic stress state.

The tool applies the Marin endurance-limit modifiers. It reports four fatigue criteria and the static yield check.

Inputs:

- `alternatingStress`: stress amplitude in pascals. For torsion, the shear amplitude.
- `meanStress`: mean stress in pascals. Use zero for fully reversed loading.
- `loading`: `bending`, `axial`, or `torsion`.
- `material`: material name from the database. Provides the ultimate and yield strength.
- `ultimateStrength` and `yieldStrength`: use these when you have no material.
- `surfaceCondition`: `ground`, `machined`, `cold_drawn`, `hot_rolled`, or `as_forged`. The default is `machined`.
- `diameterMm`: section diameter in millimetres. Sets the size factor.
- `reliabilityPct`: one of `50`, `90`, `95`, `99`, `99.9`, `99.99`, `99.999`, `99.9999`.
- `temperatureC`: operating temperature in degrees Celsius.
- `surfaceFactor`, `sizeFactor`, `loadFactor`, `temperatureFactor`, `reliabilityFactor`, `miscellaneousFactor`: explicit Marin factor overrides.

Example:

```json
{
  "material": "Structural steel S355",
  "alternatingStress": 80000000,
  "meanStress": 120000000,
  "loading": "bending",
  "diameterMm": 20,
  "reliabilityPct": 99
}
```

The tool reports the Soderberg, modified Goodman, Gerber, and ASME-elliptic safety factors. It also reports the yield safety factor. The governing factor is the minimum of all five. Torsion uses the von Mises equivalent stresses. A compressive mean stress is treated as zero, which is the conservative choice.

## unit_convert

Convert a value between two units.

Inputs:

- `value`: the numeric value.
- `from`: source unit symbol.
- `to`: target unit symbol.

The converter rejects mismatched dimensions and mismatched quantity categories. For example, it rejects a torque-to-energy conversion.

The registry covers length, mass, time, angle, temperature, force, pressure, torque, energy, power, velocity, acceleration, area, volume, density, stiffness, frequency, dynamic viscosity, and thermal conductivity.

## material_lookup

Look up mechanical properties of common engineering materials.

Inputs:

- `query`: a material name or category.
- `limit`: the maximum number of rows. The default is 10.
