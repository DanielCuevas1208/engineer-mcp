#!/usr/bin/env node
import "./warnings.js";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContext } from "./context.js";
import { buildServer, listTools } from "./server.js";
import { SERVER_NAME, VERSION } from "./version.js";

const HELP = `${SERVER_NAME} v${VERSION}

Model Context Protocol server for mechanical-engineering calculations.

Usage:
  engineer-mcp [options]

Options:
  --db <path>    SQLite database path. Defaults to ENGINEER_MCP_DB or engineer-mcp.sqlite.
  --list         List available tools and exit.
  -v, --version  Print the version and exit.
  -h, --help     Show this help and exit.
`;

function writeOut(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeErr(message: string): void {
  process.stderr.write(`${message}\n`);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      db: { type: "string" },
      list: { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    writeOut(HELP);
    return;
  }
  if (values.version) {
    writeOut(`${SERVER_NAME} v${VERSION}`);
    return;
  }
  if (values.list) {
    writeOut("Available tools:");
    for (const tool of listTools()) {
      writeOut(`  - ${tool}`);
    }
    return;
  }

  const dbPath = values.db ?? process.env.ENGINEER_MCP_DB ?? "engineer-mcp.sqlite";
  const ctx = createContext(dbPath);
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();

  server.connect(transport).catch((error: unknown) => {
    writeErr(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

main();
