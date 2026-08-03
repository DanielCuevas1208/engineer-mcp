# Contributing

Thanks for contributing to Engineer MCP.
This guide explains how to work on the project.

## Development setup

1. Install Node.js 22.13 or newer.
2. Run `npm install` in the repository root.
3. Run `npm test` to run the test suite.

Use these commands while you work:

- `npm run typecheck` checks the types.
- `npm test` runs the tests.
- `npm run build` compiles the server.
- `npm run demo` runs the demo.

## Code conventions

Write TypeScript with strict types.
Keep the calculation engines free of database access.
Return provenance with every computed result.
Use SI base units inside calculations.

Write a test for every new behavior.
Put engine tests in `tests/`.
Update the tool reference in `docs/mcp-tools.md`.
Update the README when a tool changes.

## Documentation style

Write public documentation with ASD-STE100 Issue 9 principles.
Use active voice.
Use short paragraphs.
Keep instructions under 20 words.
Keep descriptive sentences under 25 words.
Do not use emojis.

## Submitting changes

Open a pull request with your changes.
Run the full test suite before you open it.
Keep each release small and deterministic.
Follow the roadmap in `docs/integration.md`.
