# Engineer MCP roadmap

This roadmap keeps releases small, deterministic, and useful to engineering workflows.

Status values are `complete`, `in progress`, `planned`, and `blocked`.

## Complete milestones

### Existing calculation releases — complete

The server includes beams, sections, bolts, springs, shafts, bearings, stress, fatigue, fits, units, materials, and HTTP transport.

Completed commitments include viscosity and thermal-conductivity units, constant-amplitude fatigue, spring design, press fits, HTTP security, and SSE response mode.

Verification: `npm run typecheck`, `npm test`, `npm run build`, and `npm run demo`.

### Standard steel section catalog — complete

The catalog covers IPE, HEA, HEB, and UPN sections with separate dimension and property references.

Verification: `npm test -- tests/standard-sections.test.ts tests/section-data-audit.test.ts`.

### Variable-amplitude fatigue damage — complete

The `fatigue_damage` tool reports Miner damage, repeated-spectrum life, and per-block trace rows.

Verification: `npm test -- tests/fatigue-damage.test.ts tests/tools.test.ts`.

### milestone-tolerance-stack — complete

The `tolerance_stack` tool compares signed linear stacks with worst-case and independent RSS bounds.

Acceptance criteria:

- Explain dimensional tolerance stacks.
- Calculate worst-case and independent RSS bounds.
- Preserve signed dimensions and asymmetric limits.
- Cite assumptions through the MCP result envelope.
- Test hand-calculated fixtures, mixed length units, and invalid distributions.

Verification: `npm test -- tests/tolerance-stack.test.ts tests/tools.test.ts`, `npm run typecheck`, `npm run build`, and `npm run demo`.

## Future milestones

### milestone-shaft-load-cases — planned

User-visible outcome: compare bounded combined bending and torque cases for a shaft.

Bounded deliverable: add one `shaft_load_cases` engine function, MCP tool, source-linked report rows, and deterministic fixtures.

Acceptance criteria:

- Evaluate published-formula bending and torque cases.
- Identify the governing section and criterion.
- Reject unsupported load cases with clear errors.
- Provide a source-linked demonstration report.

Verification: `npm test -- tests/shaft-load-cases.test.ts tests/tools.test.ts`, `npm run typecheck`, and `npm run build`.

### milestone-uncertainty-sweep — planned

User-visible outcome: rank how uncertain design inputs affect an existing calculation.

Bounded deliverable: add one deterministic sweep over selected inputs and return endpoint comparisons with units and assumptions.

Acceptance criteria:

- Sweep a bounded range through one existing calculation.
- Rank input effects deterministically.
- Preserve units and assumptions in every row.
- Match sweep endpoints against individual tool calls.

Verification: `npm test -- tests/uncertainty-sweep.test.ts tests/tools.test.ts`, `npm run typecheck`, and `npm run build`.

## Release evidence

The local CI workflow runs typechecking, tests, builds, the demo, HTTP smoke checks, CLI checks, and package checks.

This release also passed the built core tolerance-stack smoke check, typecheck, build, and CLI tool-list check.
The repaired in-process HTTP smoke check also passed.

GitHub Actions run history was unavailable during this release because the local proxy could not reach GitHub.
Vitest and the child-process HTTP smoke check were unavailable because this Windows sandbox rejects child-process creation.
