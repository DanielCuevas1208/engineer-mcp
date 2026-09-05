# Unit catalog

Engineer MCP uses SI units inside every calculation.
This catalog lists the viscosity and thermal units in the current release.

Unit symbols are case-sensitive.
Aliases accept common engineering notation.

## Dynamic viscosity

| Symbol | Meaning | Factor to Pa.s |
| --- | --- | ---: |
| Pa.s | pascal second | 1 |
| mPa.s | millipascal second | 0.001 |
| cP | centipoise | 0.001 |
| P | poise | 0.1 |
| lbm/fts | pound mass per foot second | 1.48816394357 |

Pa.s, Pa·s, and Pas identify the same unit.

## Kinematic viscosity

| Symbol | Meaning | Factor to m2/s |
| --- | --- | ---: |
| m2/s | square metre per second | 1 |
| mm2/s | square millimetre per second | 0.000001 |
| cSt | centistokes | 0.000001 |
| cm2/s | square centimetre per second | 0.0001 |
| St | stokes | 0.0001 |
| ft2/s | square foot per second | 0.09290304 |

Dynamic and kinematic viscosity use different dimensions.
The converter rejects a conversion between them.

## Thermal conductivity

| Symbol | Meaning | Factor to W/mK |
| --- | --- | ---: |
| W/mK | watt per metre kelvin | 1 |
| mW/mK | milliwatt per metre kelvin | 0.001 |
| kW/mK | kilowatt per metre kelvin | 1000 |
| W/cmK | watt per centimetre kelvin | 100 |
| W/mmK | watt per millimetre kelvin | 1000 |

The converter accepts W/m·K and W/(mK) as aliases for W/mK.

## Conversion behavior

The unit layer checks dimensions and quantity categories.
The unit_convert tool returns the converted value, SI value, factor, and category.
Calculation tools accept outputUnits for supported quantity keys.

See [the tool reference](mcp-tools.md) for request examples.
