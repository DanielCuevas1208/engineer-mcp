# Contributing

Thanks for helping Engineer MCP. Read the boundary rules in `docs/integration.md` before you start. They keep the project focused and compatible.

## Project layout

| Path | Role |
| --- | --- |
| `src/engine/` | Pure calculation functions. |
| `src/units/` | Dimension-safe unit conversion. |
| `src/db/` | SQLite schema and seeding. |
| `src/handlers.ts` | Tool orchestration and result envelopes. |
| `data/` | Material, fastener, section, and reference data. |
| `tests/` | Deterministic test suite. |

## Setup

Install Node.js 22.13 or newer.

Run `npm install` to install dependencies.

## Checks

Run these checks before you submit a change:

1. Run `npm run typecheck`.
2. Run `npm test`.
3. Run `npm run build`.
4. Run `npm run demo`.

The test suite is deterministic and offline.
It needs no API keys and no network access.

## Conventions

Use SI base units inside calculations.
Express every quantity with a unit string.
Keep the calculator logic separate from the MCP binding.
Return source references with every computed result.
Never invent references. Use only cited standards and texts.
Do not add comments unless they explain a non-obvious decision.

## Data changes

The data files in `data/` are the single source of truth.
The database seeds from these files on first start.
Do not edit the generated SQLite file directly.
Audit any new catalog values against a cited source.
Add a deterministic test that covers the new values.

## Releases

This server follows semantic versioning.
Adding a tool or a unit is a minor version bump.
Breaking a tool signature or the result envelope requires a major version bump.
Update the roadmap when you complete a planned item.
