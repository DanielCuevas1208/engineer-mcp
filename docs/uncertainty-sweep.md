# Fatigue uncertainty sweep

The `uncertainty_sweep` tool ranks selected fatigue inputs by endpoint effect.
It reuses the existing `fatigue_analysis` calculation.

## Value

Use the tool to find which input needs better design evidence.
Each row varies one input.
All other baseline inputs stay fixed.

The tool reports the baseline safety factor.
It reports low and high endpoint safety factors.
It reports a deterministic rank.

## Supported inputs

Set `calculation` to `fatigue_analysis`.
Provide a complete `baseline` object for that tool.

Sweep these numeric parameters:

- `ultimateStrength`
- `yieldStrength`
- `meanStress`
- `alternatingStress`
- `enduranceLimit`
- `sizeFactor`
- `loadFactor`
- `temperatureFactor`
- `reliabilityFactor`
- `reliability`
- `miscellaneousFactor`

Use `Pa`, `MPa`, or another pressure unit for stress values.
Use `1` for dimensionless factors.
Use `%` for reliability.

The tool accepts one to five sweeps.
Each sweep needs a lower and upper endpoint.
The lower endpoint must be smaller.

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
  "sweeps": [
    { "parameter": "meanStress", "low": 60, "high": 100, "unit": "MPa" },
    { "parameter": "alternatingStress", "low": 100, "high": 140, "unit": "MPa" }
  ]
}
```

## Assumptions

The ranking uses the absolute safety-factor difference between endpoints.
It is not a probability estimate.
It does not model interactions between inputs.
It does not sample values between endpoints.

Each row records the input unit and calculation unit.
Each row records the fixed-input assumption.
The result cites Shigley's fatigue method.

## Verification

Run `npm test -- tests/uncertainty-sweep.test.ts tests/tools.test.ts`.
Run `npm run typecheck`.
Run `npm run build`.

## Limits

This release supports `fatigue_analysis` only.
It does not sweep string choices such as criteria or surface finish.
