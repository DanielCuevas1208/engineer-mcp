# Shaft load cases

The `shaft_load_cases` tool compares round shaft sections under bending and torque load cases.

## Model

Each section is a solid or hollow round cross-section.
Each load case supplies a bending moment and a torque in newton-metres.
The tool evaluates every section and load case pair.

Bending stress uses the outer fibre of the round section:

```text
sigma = 32 M D / (pi (D^4 - d^4))
```

Torsional shear uses the outer radius:

```text
tau = 16 T D / (pi (D^4 - d^4))
```

Combined stress uses plane-stress von Mises with zero axial stress:

```text
sigma_vm = sqrt(sigma^2 + 3 tau^2)
```

The yield safety factor is tensile yield strength divided by the governing von Mises stress.

## Report rows

Each row lists one section and load case pair.
Rows include bending stress, torsional shear, von Mises stress, yield safety factor, and a `referenceId`.
The governing row carries `isGoverning: true`.

Top-level quantities name the governing section index, load case index, and von Mises stress.
The result meta block repeats the governing section name, load case name, and criterion.

## Supported inputs

- Round sections only.
- Non-negative bending moment and torque.
- At least one non-zero moment or torque per load case.
- Optional diameter units on each section.
- Optional moment units on each load case.
- `yieldStrength` in pascals or a known `material` name.

## Unsupported inputs

- Axial loads.
- Fatigue or alternating loads.
- Keyways, fillets, and stress concentrations.
- Non-round cross-sections.

## Example

```json
{
  "sections": [
    { "name": "shoulder", "outerDiameter": 0.05 }
  ],
  "loadCases": [
    { "name": "bending_only", "bendingMoment": 500, "torque": 0 },
    { "name": "combined_peak", "bendingMoment": 500, "torque": 300 }
  ],
  "yieldStrength": 300000000,
  "outputUnits": { "governingVonMisesStress": "MPa" }
}
```

The combined case governs when both loads act together on the same section.

## References

The method cites Shigley's Mechanical Engineering Design and Roark's Formulas for Stress and Strain.
See [mcp-tools.md](mcp-tools.md) for the MCP field list.
