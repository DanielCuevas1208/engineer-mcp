# Unit conversion layer

The unit layer converts values between compatible units.
It rejects conversions that mix different quantities.
It is read-only and has no state.

## The dimension model

Every unit carries a dimension vector.
The vector has five axes: length, mass, time, temperature, and angle.
Each axis holds an integer exponent.
For example, pressure is length to minus one, mass to one, and time to minus two.

A conversion is valid only when the two units have the same dimension vector.
It is valid only when the two units belong to the same quantity category.
The category check blocks a torque-to-energy conversion.
Torque and energy share the same dimension vector but are different quantities.

## Unit categories

The registry covers these categories:

| Category | Example units | SI unit |
| --- | --- | --- |
| length | m, mm, in, ft | m |
| mass | kg, g, lb, t | kg |
| time | s, min, h, day | s |
| angle | rad, deg, rev | rad |
| temperature | K, degC, degF | K |
| force | N, kN, lbf, kgf | N |
| pressure | Pa, MPa, psi, bar | Pa |
| torque | N·m, kN·m, lbf·ft | N·m |
| energy | J, kJ, kWh, cal | J |
| power | W, kW, hp | W |
| velocity | m/s, km/h, mph | m/s |
| acceleration | m/s2, g0 | m/s2 |
| area | m2, mm2, cm2 | m2 |
| volume | m3, L, gal | m3 |
| second moment of area | m4, cm4, mm4 | m4 |
| density | kg/m3, g/cm3 | kg/m3 |
| linear mass | kg/m, g/m, lb/ft | kg/m |
| stiffness | N/m, N/mm, lbf/in | N/m |
| frequency | Hz, rpm, kHz | Hz |
| dynamic viscosity | Pa·s, cP, P | Pa·s |
| kinematic viscosity | m2/s, cSt, St | m2/s |
| thermal conductivity | W/(m·K), BTU/(ft·h·°F) | W/(m·K) |

## Viscosity and thermal conductivity

Dynamic viscosity measures a fluid's resistance to shear.
The SI unit is the pascal second.
One centipoise equals one millipascal second.
Water at room temperature is about one centipoise.

Kinematic viscosity is the ratio of dynamic viscosity to density.
The SI unit is the square metre per second.
One centistoke equals one square millimetre per second.
Lubricating oils are usually quoted in centistokes.

Thermal conductivity measures the rate of heat flow through a material.
The SI unit is the watt per metre kelvin.
Copper conducts at about 401 watts per metre kelvin.
Mild steel conducts at about 50 watts per metre kelvin.

The temperature intervals cancel in these units.
A change of one degree Celsius equals a change of one kelvin.
A change of one degree Fahrenheit equals five ninths of a kelvin.

## Conversion factors

Each unit stores a factor to its SI unit.
The factor is exact for SI-derived units.
It is exact for definitions such as the inch and the pound.
It is a fixed published constant for old customary units.

The registry stores the conversion factors directly.
It does not compute them from other units.
A contributor checks each factor against a published source.
Add a comment or a test that cites the source.

## How to add a unit

Add the unit to the array in `src/units/registry.ts`.
Give it a canonical symbol, a category, a dimension, and a factor.
Add aliases for common alternate spellings.
The alias list must normalize to distinct keys.

Add deterministic tests in `tests/units.test.ts`.
Test a forward conversion and a rejection.
Test against a value you can verify by hand.
Run `npm test` to reproduce the checks.
