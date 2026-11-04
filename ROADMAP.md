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

### milestone-shaft-load-cases — complete

The `shaft_load_cases` tool compares round shaft sections under bending and torque pairs.

Acceptance criteria:

- Evaluate published-formula bending and torque cases on round sections.
- Identify the governing section, load case, and stress criterion.
- Reject idle load cases and invalid geometry with clear errors.
- Provide a source-linked demonstration report with per-row provenance.

Verification: `npm test -- tests/shaft-load-cases.test.ts tests/tools.test.ts`, `npm run typecheck`, `npm run build`, and `npm run demo`.

## Future milestones

### milestone-uncertainty-sweep — planned

User-visible outcome: rank how uncertain design inputs affect an existing calculation.

Bounded deliverable: add one deterministic sweep over selected inputs and return endpoint comparisons with units and assumptions.

Acceptance criteria:

- Sweep a bounded range through one existing calculation.
- Rank input effects deterministically.
- Preserve units and assumptions in every row.
- Match sweep endpoints against individual tool calls.

Verification: `npm test -- tests/uncertainty-sweep.test.ts tests/tools.test.ts`, `npm run typecheck`, and `npm run build`.

### milestone-shaft-fatigue-screen — planned

User-visible outcome: screen a shaft load case against a simplified fatigue limit without leaving the MCP envelope.

Bounded deliverable: extend the shaft load-case report with an optional alternating-stress input and a Marin-adjusted endurance check.

Acceptance criteria:

- Accept one alternating stress or derive it from a stated load fraction.
- Apply the existing steel Marin factors from `fatigue_analysis`.
- Report fatigue and yield margins on the governing row.
- Test hand-calculated fixtures against `fatigue_analysis` alone.

Verification: `npm test -- tests/shaft-fatigue-screen.test.ts tests/tools.test.ts`, `npm run typecheck`, and `npm run build`.

## Release evidence

The local CI workflow runs typechecking, tests, builds, the demo, HTTP smoke checks, CLI checks, and package checks.

Release 0.11 passed `npm run typecheck`, `npm run build`, and `npm test -- tests/shaft-load-cases.test.ts tests/tools.test.ts` on the development host.
GitHub Actions run history was inspected before this release; the latest main workflow succeeded for release 0.10.
