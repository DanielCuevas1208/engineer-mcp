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

### milestone-uncertainty-sweep — complete

User-visible outcome: rank how selected fatigue inputs affect a fatigue safety factor.

Bounded deliverable: add `uncertainty_sweep` for one-factor endpoint sweeps through `fatigue_analysis`.

Acceptance criteria:

- Sweep one to five numeric fatigue inputs with deterministic endpoints.
- Rank input effects by absolute safety-factor change.
- Preserve input and calculation units in every report row.
- State fixed-input assumptions and cite the fatigue method.
- Match every endpoint against an individual `fatigue_analysis` call.

Verification: `npm test -- tests/uncertainty-sweep.test.ts tests/tools.test.ts`, `npm run typecheck`, `npm run build`, and `npm run smoke:http`.

### milestone-shaft-fatigue-screen — complete

User-visible outcome: screen a shaft load case against a simplified fatigue limit without leaving the MCP envelope.

Bounded deliverable: extend `shaft_load_cases` with an optional governing-row fatigue screen.

Acceptance criteria:

- Accept exactly one alternating stress or derive it from a stated load fraction.
- Apply the existing steel Marin factors from `fatigue_analysis`.
- Report fatigue and yield margins on the governing row.
- Test hand-calculated fixtures against `fatigue_analysis` alone.

Verification: `npm test -- tests/shaft-fatigue-screen.test.ts tests/tools.test.ts`, `npm run typecheck`, `npm run build`, and `npm run demo`.

### milestone-uncertainty-interactions — complete

User-visible outcome: identify whether two uncertain fatigue inputs amplify each other.

Bounded deliverable: add `uncertainty_interactions` for one paired-endpoint comparison through `fatigue_analysis`.

Acceptance criteria:

- Evaluate the four low/high endpoint combinations for two inputs.
- Report interaction effect beside the one-factor results.
- Preserve units, fixed-input assumptions, and fatigue provenance.
- Reject duplicate parameters and more than one input pair.

Verification: `npm test -- tests/uncertainty-interactions.test.ts tests/tools.test.ts`, `npm run typecheck`, `npm run build`, and `npm run demo`.

## Future milestones

### milestone-finite-life-fatigue — planned

User-visible outcome: estimate finite-life fatigue margin when infinite-life design does not pass.

Bounded deliverable: add a documented finite-life S-N estimate beside the existing endurance-limit check.

Acceptance criteria:

- Accept a bounded S-N curve with monotonic validation.
- Report estimated cycles and the source-linked interpolation rule.
- Preserve the existing infinite-life result and API.
- Test interpolation endpoints and unsupported curve shapes.

Verification: `npm test -- tests/finite-life-fatigue.test.ts tests/tools.test.ts`, `npm run typecheck`, and `npm run build`.

### milestone-sweep-batch — planned

User-visible outcome: compare several one-factor sweeps in one agent call with less overhead.

Bounded deliverable: add a bounded multi-calculation batch wrapper that reuses existing sweep engines.

Acceptance criteria:

- Accept up to three independent sweep definitions in one request.
- Return separate ranked rows per definition with shared provenance policy.
- Reject mixed calculation types and duplicate parameter sets.
- Test batch endpoints against individual tool calls.

Verification: `npm test -- tests/sweep-batch.test.ts tests/tools.test.ts`, `npm run typecheck`, and `npm run build`.

## Release evidence

The local CI workflow runs typechecking, tests, builds, the demo, HTTP smoke checks, CLI checks, and package checks.

Release 0.14 adds paired fatigue uncertainty interactions with corner endpoint checks.
Release 0.13 adds the governing-row shaft fatigue screen.
The HTTP tool-count contract now expects 17 registered tools.
The latest GitHub Actions run on `main` completed successfully for commit `43201570130`.
Local verification should run `npm run typecheck`, `npm test`, `npm run build`, `npm run demo`, and `npm run smoke:http`.
