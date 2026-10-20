# Dimensional tolerance stacks

## Value

The `tolerance_stack` tool evaluates a signed linear chain of dimensions.
It reports nominal, worst-case, and independent RSS bounds in one result.

Use `sign: 1` for an additive dimension.
Use `sign: -1` for a subtractive dimension.
Give each dimension a name, nominal value, two tolerance limits, and an optional length unit.

Input values may use different length units.
The handler converts every value to metres before calculation.
Use `outputUnits` to request another length unit.

## Methods

The nominal stack is the signed sum of nominal dimensions.

The worst-case lower bound combines every lower limit.
The worst-case upper bound combines every upper limit.
This method assumes every dimension reaches its limit together.

The RSS bounds use the square root of summed squared one-sided tolerances.
This method assumes independent, zero-mean variation.
RSS is not a guaranteed production limit.

Asymmetric tolerances produce separate lower and upper RSS values.
The result rows show each signed nominal value and signed deviation.

## Example input

```json
{
  "dimensions": [
    { "name": "housing", "nominal": 10, "tolerancePlus": 0.1, "toleranceMinus": 0.1, "sign": 1, "unit": "mm" },
    { "name": "shaft", "nominal": 0.9, "tolerancePlus": 0.01, "toleranceMinus": 0.01, "sign": -1, "unit": "cm" }
  ],
  "outputUnits": {
    "nominalStack": "mm",
    "worstCaseLower": "mm",
    "worstCaseUpper": "mm",
    "rssLowerBound": "mm",
    "rssUpperBound": "mm"
  }
}
```

## Assumptions and limits

The tool models a linear one-dimensional stack.
It does not model geometric tolerancing, datum shifts, angular errors, correlation, or Monte Carlo distributions.
Nominal dimensions must exceed their lower tolerance.
The tool accepts at most 100 uniquely named dimensions.

The result cites ASME Y14.5-2018 for dimension and tolerance notation.
The result states the RSS independence assumption in its method and warnings.
