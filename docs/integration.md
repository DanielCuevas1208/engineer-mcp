# EngineerKit integration

Engineer MCP is one server in the EngineerKit family. EngineerKit is a set of MCP servers for engineering work. This document defines how Engineer MCP fits into that family.

## Scope boundary

Engineer MCP owns mechanical-engineering calculations and material data. It does not own CAD, simulation, FEA, or project data. Other EngineerKit servers cover those domains.

Keep Engineer MCP focused. Do not let it grow into a general compute engine. Do not let it store user projects or CAD files.

## Stable interfaces

Engineer MCP exposes two stable public surfaces.

First, the MCP tools. Each tool follows one result envelope. The envelope always includes the method, the inputs, the quantities, the references, and the warnings. Consumers must not depend on the exact ordering of quantities.

Second, the TypeScript packages `@engineerkit/engineer-mcp/engine` and `@engineerkit/engineer-mcp/units`. Other servers can import these directly for shared math. The engine functions take SI numbers and return plain objects. They never read the database. The unit layer is read-only and has no state.

## Conventions for other servers

Adopt these conventions to stay compatible.

- Use SI base units inside calculations.
- Express every quantity with a unit string.
- Keep the calculator logic separate from the MCP binding.
- Return source references with every computed result.
- Never invent references. Use only cited standards and texts.

## Data boundary

The material and fastener tables live in `data/`. The database seeds from these files on first start. Use the same JSON files as the single source of truth. Do not edit the generated SQLite file directly.

## Versioning

This server follows semantic versioning. Breaking a tool signature or the result envelope requires a major version bump. Adding a tool or a unit is a minor version bump.

## Roadmap beyond this release

Engineer MCP grows in independent releases. Each release stays useful on its own.

### Complete

- Viscosity and thermal-conductivity unit categories. The unit converter supports three added physical dimensions.
- Variable-amplitude fatigue damage assessment. The `fatigue_damage` tool reports block damage and repeated-spectrum life.
- Constant-amplitude fatigue assessment. The `fatigue_analysis` tool computes the stress ratio, the endurance limit, and the governing safety factor by the Goodman, Soderberg, or Gerber criterion.
- Helical compression spring design. The `spring_design` tool computes the spring rate, the shear stress, and the safety factor.
- Press and shrink fit analysis. The `interference_fit` tool computes the interface pressure, the hoop stresses, and the friction capacity.

### Remaining

- Add HTTP transport in addition to stdio.
- Add a catalog of ISO and DIN standard sections.

Keep each release small and deterministic. Run the full test suite before release.
