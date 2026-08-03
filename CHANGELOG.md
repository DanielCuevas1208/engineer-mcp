# Changelog

This project follows semantic versioning. Adding a tool or a unit is a minor release. Breaking a tool signature is a major release.

## 0.3.0 - 2026-08-03

Added the fatigue analysis release.

- Added the `fatigue_analysis` tool.
- The tool reports infinite-life safety factors on four criteria.
- The criteria are modified Goodman, Soderberg, Gerber, and ASME-elliptic.
- The tool estimates the endurance limit for steel when you do not provide one.
- The tool reports warnings for estimated values and yield check failures.
- Added the `@engineerkit/engineer-mcp/engine` exports for the fatigue engine.
- The Shigley reference now covers the fatigue chapter.

## 0.2.0 - 2026-08-03

Added the helical spring release.

- Added the `spring_design` tool.
- The tool reports the spring rate, the shear stress, and the safety factor.
- The tool supports four end conditions and warns on buckling and solid height.
- Added stiffness units to the unit layer.

## 0.1.0 - 2026-08-03

Initial release.

- Added the MCP server over standard input and output.
- Added tools for beams, bolts, shafts, bearings, stress, sections, and materials.
- Added the dimension-safe unit layer.
- Added SQLite storage and provenance for every result.
