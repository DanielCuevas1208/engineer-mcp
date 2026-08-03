# Changelog

All notable changes to Engineer MCP are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/).
This project follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-08-03

### Added

- Fatigue analysis for constant-amplitude loads.
  The `fatigue_analysis` tool reports factors for the Soderberg, modified Goodman, Gerber, and ASME-elliptic criteria.
- Dynamic viscosity units: pascal second, poise, and centipoise.
- Kinematic viscosity units: square metre per second, stokes, and centistokes.
- Thermal conductivity units: watt per metre kelvin and related units.

## [0.2.0] - 2026-08-03

### Added

- Helical compression spring design (`spring_design`).
- Stiffness, frequency, and angle unit categories.
- Tool reference and integration documentation.

## [0.1.0] - 2026-08-03

### Added

- Initial MCP server.
- Beam bending, section properties, bolt strength, shaft analysis, and bearing life tools.
- von Mises stress, unit conversion, and material lookup tools.
- SQLite seed database and result provenance.
