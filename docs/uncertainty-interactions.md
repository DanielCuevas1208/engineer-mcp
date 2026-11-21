# Fatigue uncertainty interactions

The `uncertainty_interactions` tool compares two uncertain fatigue inputs.
It reuses the existing `fatigue_analysis` calculation.

## Value

Use the tool to see whether two inputs amplify each other.
The tool reports one-factor spans beside four corner results.
It reports a signed interaction effect.

## Supported inputs

Set `calculation` to `fatigue_analysis`.
Provide a complete `baseline` object for that tool.
Provide exactly one `pair` object.

Each pair lists two sweepable parameters.
Each parameter needs a lower and upper endpoint.
The lower endpoint must be smaller.

Parameter names match `uncertainty_sweep`.
Stress endpoints accept pressure units.
Factor endpoints use unit `1`.
Reliability endpoints use `%`.

## Example

```json
{
  "calculation": "fatigue_analysis",
  "baseline": {
    "ultimateStrength": 690000000,
    "yieldStrength": 580000000,
    "meanStress": 80000000,
    "alternatingStress": 120000000,
    "surfaceFinish": "ground",
    "reliability": 90
  },
  "pair": {
    "parameterA": "meanStress",
    "lowA": 60,
    "highA": 100,
    "unitA": "MPa",
    "parameterB": "alternatingStress",
    "lowB": 100,
    "highB": 140,
    "unitB": "MPa"
  }
}
```

## Assumptions

The interaction uses the low-low corner as reference.
The signed effect is the standard two-way contrast.
A zero effect means additive endpoint combination.

Corner rows change both parameters at once.
One-factor rows change only one parameter.
Each row records units, assumptions, and the fatigue source.

## Verification

Run `npm test -- tests/uncertainty-interactions.test.ts tests/tools.test.ts`.
Run `npm run typecheck`.
Run `npm run build`.

## Limits

This release supports `fatigue_analysis` only.
It evaluates one parameter pair per call.
It does not sample values between endpoints.