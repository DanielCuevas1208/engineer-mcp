#!/usr/bin/env node
import "./warnings.js";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, listTools } from "./server.js";
import { SERVER_NAME, VERSION } from "./version.js";
import { closeHttpServer, httpServerAddress, startHttpServer } from "./http.js";

const HELP = `${SERVER_NAME} v${VERSION}

Model Context Protocol server for mechanical-engineering calculations.

Usage:
  engineer-mcp [options]

Options:
  --db <path>    SQLite database path. Defaults to ENGINEER_MCP_DB or engineer-mcp.sqlite.
  --http         Start the Streamable HTTP transport instead of stdio.
  --host <name>  HTTP bind host. Defaults to ENGINEER_MCP_HOST or 127.0.0.1.
  --port <n>     HTTP bind port. Defaults to ENGINEER_MCP_PORT or 3000.
  --list         List available tools and exit.
  -v, --version  Print the version and exit.
  -h, --help     Show this help and exit.
`;

function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

function out(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      db: { type: "string" },
      http: { type: "boolean" },
      host: { type: "string" },
      port: { type: "string" },
      list: { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    out(HELP);
    return;
  }
  if (values.version) {
    out(`${SERVER_NAME} v${VERSION}`);
    return;
  }
  if (values.list) {
    out("Available tools:");
    for (const tool of listTools()) {
      out(`  - ${tool}`);
    }
    return;
  }

  const dbPath = values.db ?? process.env.ENGINEER_MCP_DB ?? "engineer-mcp.sqlite";
  try {
    const { createContext } = await import("./context.js");
    const ctx = createContext(dbPath);

    if (values.http) {
      const port = parsePort(values.port ?? process.env.ENGINEER_MCP_PORT);
      const host = values.host ?? process.env.ENGINEER_MCP_HOST ?? "127.0.0.1";
      const httpServer = await startHttpServer(ctx, { host, port });
      const address = httpServerAddress(httpServer);
      info(`HTTP transport listening at http://${address.host}:${address.port}/mcp`);
      const shutdown = () => {
        void closeHttpServer(httpServer).then(() => {
          ctx.db.close();
          process.exit(0);
        });
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      return;
    }

    const server = buildServer(ctx);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error: unknown) {
    info(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("HTTP port must be an integer from 0 to 65535.");
  }
  return port;
}
