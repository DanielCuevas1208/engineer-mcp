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

The tool returns the published dimensions, mass, second moment of area, and section modulus of each match. Use it to find a designation, then pass that designation to `beam_bending` or `section_properties`.

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

## unit_convert

Convert a value between two units.

Inputs:

- `value`: the numeric value.
- `from`: source unit symbol.
- `to`: target unit symbol.

The converter rejects mismatched dimensions and mismatched quantity categories. For example, it rejects a torque-to-energy conversion.

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

## material_lookup

Look up mechanical properties of common engineering materials.

Inputs:

- `query`: a material name or category.
- `limit`: the maximum number of rows. The default is 10.
