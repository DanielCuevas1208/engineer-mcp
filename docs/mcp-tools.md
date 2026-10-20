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
Some tools also return `rows` with tabular detail.

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
- `section`: cross-section shape and dimensions in metres. Use `{ "shape": "standard", "designation": "IPE 300" }` to use a catalog section.
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
- `standard` with `designation`. Use a catalog designation such as `IPE 300`.

The `standard` shape returns the published values from the section catalog. It uses the strong axis for the second moment of area and the section modulus.

Example:

```json
{
  "section": { "shape": "standard", "designation": "IPE 300" }
}
```

## section_catalog

Search the catalog of standard rolled steel sections.

Inputs:

- `query`: a designation, series, or standard to match.
- `limit`: the maximum number of rows. The default is 10.

The tool returns the published dimensions, mass, second moment of area, and section modulus of each match.
Each row includes the source ID for its dimensions and its section properties.
Use the result to find a designation, then pass that designation to `beam_bending` or `section_properties`.

The catalog covers IPE 80 to IPE 500, HEA 100 to HEA 300, HEB 100 to HEB 300, and UPN 80 to UPN 300.
See [section-catalog.md](section-catalog.md) for the full range, the value provenance, and the data audit.

Example:

```json
{
  "query": "HEB",
  "limit": 5
}
```

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

Compute the endurance limit and the fatigue safety factor for cyclic loading.

The tool follows the modified Marin method for steel. It estimates the endurance limit from the ultimate strength and the surface, size, load, temperature, reliability, and miscellaneous correction factors. Pass `enduranceLimit` to skip the estimate and use a measured or known value.

The safety factor follows one of four mean-stress criteria:

- `modified_goodman`: uses the ultimate strength.
- `soderberg`: uses the yield strength.
- `gerber`: uses the ultimate strength.
- `asme_elliptic`: uses the yield strength.

Inputs:

- `ultimateStrength`: ultimate tensile strength in pascals.
- `yieldStrength`: tensile yield strength in pascals. Required for the `soderberg` and `asme_elliptic` criteria.
- `meanStress`: mean stress in pascals.
- `alternatingStress`: alternating stress amplitude in pascals.
- `criterion`: one of the four criteria. The default is `modified_goodman`.
- `enduranceLimit`: fully corrected endurance limit in pascals. Optional.
- `surfaceFinish`: `ground`, `machined`, `cold_drawn`, `hot_rolled`, or `as_forged`. The default is `machined`.
- `sizeFactor`, `loadFactor`, `temperatureFactor`, `miscellaneousFactor`: Marin correction factors. Each defaults to `1`.
- `reliabilityFactor`: reliability factor. The default is `1`.
- `reliability`: reliability in percent from 50 to 99.99. Sets the reliability factor from the standard table.
- `outputUnits`: optional unit overrides.

The tool warns when the static yield check governs the design. It warns when the fatigue safety factor falls below unity.

Example:

```json
{
  "ultimateStrength": 690000000,
  "yieldStrength": 580000000,
  "meanStress": 80000000,
  "alternatingStress": 120000000,
  "surfaceFinish": "ground",
  "reliability": 90
}
```

## unit_convert

Convert a value between two units.

Inputs:

- `value`: the numeric value.
- `from`: source unit symbol.
- `to`: target unit symbol.

The converter rejects mismatched dimensions and mismatched quantity categories. For example, it rejects a torque-to-energy conversion.

The registry covers length, mass, time, angle, temperature, force, pressure, torque, energy, power, velocity, acceleration, area, volume, second moment of area, density, linear mass, stiffness, frequency, dynamic viscosity, kinematic viscosity, and thermal conductivity.

Viscosity examples:

- `100 cP` to `Pa·s` gives `0.1`.
- `40 cSt` to `m2/s` gives `0.00004`.
- `1 P` to `Pa·s` gives `0.1`.

Thermal conductivity examples:

- `401 W/(m·K)` to `BTU/(ft·h·°F)` gives about `231.7`.
- `1 kcal/(m·h·°C)` to `W/(m·K)` gives about `1.162`.

See [units.md](units.md) for the dimension model and the full category list.

## interference_fit

Compute the interface pressure, hoop stresses, and friction capacity of a press or shrink fit.

The tool uses the Lamé solution for thick-walled cylinders.
The diametral interference drives a uniform contact pressure at the interface.
The fit can be a press fit or a shrink fit. The math is the same.

Inputs:

- `interfaceRadius`: interface radius in metres.
- `hubOuterRadius`: outer radius of the hub in metres.
- `shaftInnerRadius`: inner radius of the shaft in metres. The default is zero for a solid shaft.
- `interference`: diametral interference in metres.
- `length`: axial length of the joint in metres.
- `frictionCoefficient`: friction of the interface. The default is `0.15`.
- `shaftElasticModulus` and `shaftPoissonRatio`: shaft material. Poisson ratio defaults to `0.3`.
- `shaftYieldStrength`: shaft yield strength in pascals. It enables the shaft safety factor.
- `hubElasticModulus` and `hubPoissonRatio`: hub material. Poisson ratio defaults to `0.3`.
- `hubYieldStrength`: hub yield strength in pascals. It enables the hub safety factor.
- `requiredTorque`: required torque in newton metres. It enables the torque safety factor.

Outputs:

- `interfacePressure`: contact pressure at the interface.
- `hubTangentialStress`: hoop stress at the hub bore.
- `shaftTangentialStress`: hoop stress in the shaft. A hollow shaft peaks at its bore.
- `axialForceCapacity` and `torqueCapacity`: friction limits of the joint.
- `shaftSafetyFactor`, `hubSafetyFactor`, and `torqueSafetyFactor`: available margins.
- The envelope `safetyFactor` is the governing margin. It is the lowest of the three.

The tool warns when a member exceeds its yield strength.
It warns when the torque capacity is below the required torque.

Example:

```json
{
  "interfaceRadius": 0.025,
  "hubOuterRadius": 0.05,
  "interference": 0.00005,
  "length": 0.05,
  "shaftElasticModulus": 207000000000,
  "shaftYieldStrength": 300000000,
  "hubElasticModulus": 207000000000,
  "hubYieldStrength": 300000000,
  "requiredTorque": 1000
}
```

## fatigue_analysis

Compute the fatigue safety factor of a constant-amplitude cyclic stress.

The tool supports three failure criteria:
The modified Goodman line, the Soderberg line, and the Gerber parabola.
The Goodman criterion is the default.

Inputs:

- `meanStress`: mean stress in pascals. Negative means compression.
- `alternatingStress`: alternating stress amplitude in pascals.
- `ultimateStrength`: ultimate tensile strength in pascals.
- `yieldStrength`: tensile yield strength in pascals. It enables the yield safety factor.
- `enduranceLimit`: fully corrected endurance limit in pascals.
  The default is an uncorrected estimate from the ultimate strength.
- `materialType`: `steel`, `aluminium`, or `aluminum`. It drives the estimate.
  The default is `steel`.
- `criterion`: `goodman`, `soderberg`, or `gerber`. The default is `goodman`.

Outputs:

- `stressRatio`: ratio of the minimum to the maximum stress of the cycle.
- `maximumStress` and `minimumStress`: peak and trough of the cycle.
- `enduranceLimit`: the endurance limit used by the criterion.
- `fatigueSafetyFactor`: safety factor of the selected criterion.
- `yieldSafetyFactor`: yield strength divided by the peak cycle stress.
  It appears only when you provide `yieldStrength`.
- The envelope `safetyFactor` is the governing margin.
  It is the lower of the fatigue and yield margins.

A compressive mean stress is treated as zero, which is conservative.
The tool warns when it estimates the endurance limit.
It warns when the alternating stress reaches the endurance limit.
It warns when the governing safety factor is below one.

Example:

```json
{
  "meanStress": 100000000,
  "alternatingStress": 60000000,
  "ultimateStrength": 1000000000,
  "yieldStrength": 700000000,
  "enduranceLimit": 500000000
}
```

## fatigue_damage

Compute cumulative fatigue damage for a variable-amplitude stress spectrum.

Use an S-N curve for fully reversed stress.
Give points in increasing cycles and decreasing stress.
Goodman correction handles tensile mean stress.
It treats compressive mean stress as zero.
Use `none` when the S-N curve already matches each block stress ratio.

Inputs:

- `blocks`: stress blocks with `meanStress`, `alternatingStress`, and `cycles`.
- `snCurve`: points with `cycles` and `alternatingStress`.
- `ultimateStrength`: ultimate tensile strength in pascals.
- `yieldStrength`: optional yield strength in pascals.
- `meanStressCorrection`: `goodman` or `none`. The default is `goodman`.

Outputs:

- `totalCycles`: total cycles in the supplied blocks.
- `finiteDamageBlocks`: blocks with non-zero damage.
- `cumulativeDamage`: sum of block damage fractions.
- `cyclesToFailureEstimate`: repeated-spectrum life in cycles.
- `maximumCycleStress`: largest absolute peak stress in pascals.
- `maximumCorrectedAlternatingStress`: highest corrected stress in pascals.
- `governingBlock`: block with the largest damage contribution.
- `safetyFactor`: reciprocal Miner damage, limited by yield when provided.
- `rows`: block trace with corrected stress and damage.

The last S-N point defines the infinite-life threshold.
Stress above the first point uses end-segment extrapolation.
The result warns when either rule applies.

Example:

```json
{
  "blocks": [
    { "meanStress": 100000000, "alternatingStress": 350000000, "cycles": 10000 },
    { "meanStress": 50000000, "alternatingStress": 300000000, "cycles": 100000 }
  ],
  "snCurve": [
    { "cycles": 1000, "alternatingStress": 600000000 },
    { "cycles": 100000, "alternatingStress": 400000000 },
    { "cycles": 1000000, "alternatingStress": 300000000 }
  ],
  "ultimateStrength": 800000000
}
```

## material_lookup

Look up mechanical properties of common engineering materials.

Inputs:

- `query`: a material name or category.
- `limit`: the maximum number of rows. The default is 10.

## tolerance_stack

Compute signed linear dimensional tolerance bounds.

Inputs:

- `dimensions`: one to 100 uniquely named dimensions.
- `dimensions[].nominal`: positive nominal dimension magnitude.
- `dimensions[].tolerancePlus`: positive upper deviation magnitude.
- `dimensions[].toleranceMinus`: positive lower deviation magnitude.
- `dimensions[].sign`: `1` adds the dimension; `-1` subtracts it.
- `dimensions[].unit`: optional length unit. The default is `m`.
- `outputUnits`: optional quantity-to-length-unit map.

Outputs:

- `nominalStack`: signed nominal sum.
- `worstCaseLower` and `worstCaseUpper`: simultaneous-limit bounds.
- `worstCaseToleranceMinus` and `worstCaseTolerancePlus`: one-sided worst-case limits.
- `rssLowerBound` and `rssUpperBound`: independent RSS bounds.
- `rssToleranceMinus` and `rssTolerancePlus`: one-sided RSS magnitudes.
- `rows`: signed dimension values and deviations in SI metres.

Worst-case results assume simultaneous limits.
RSS results assume independent, zero-mean variation.
The result cites ASME Y14.5-2018 and repeats these assumptions in warnings.

Example:

```json
{
  "dimensions": [
    { "name": "housing", "nominal": 10, "tolerancePlus": 0.1, "toleranceMinus": 0.1, "sign": 1, "unit": "mm" },
    { "name": "shaft", "nominal": 0.9, "tolerancePlus": 0.01, "toleranceMinus": 0.01, "sign": -1, "unit": "cm" }
  ],
  "outputUnits": { "nominalStack": "mm", "worstCaseLower": "mm", "worstCaseUpper": "mm" }
}
```
