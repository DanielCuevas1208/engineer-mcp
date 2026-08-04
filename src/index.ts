#!/usr/bin/env node
import "./warnings.js";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpServer } from "./http.js";
import { buildServer, listTools } from "./server.js";
import { SERVER_NAME, VERSION } from "./version.js";

const HELP = `${SERVER_NAME} v${VERSION}

Model Context Protocol server for mechanical-engineering calculations.

Usage:
  engineer-mcp [options]

Options:
  --db <path>          SQLite database path. Defaults to ENGINEER_MCP_DB or engineer-mcp.sqlite.
  --transport <mode>   Transport mode: stdio (default) or http.
  --host <host>        HTTP bind host. Defaults to 127.0.0.1.
  --port <port>        HTTP listen port. Defaults to 3000. Use 0 for a free port.
  --allowed-origin <origin> Allow browser origin. Repeat for multiple origins.
  --list               List available tools and exit.
  -v, --version        Print the version and exit.
  -h, --help           Show this help and exit.
`;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

function out(message: string): void {
  process.stdout.write(`${message}\n`);
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}. Use an integer between 0 and 65535.`);
  }
  return parsed;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  return value ? value.split(",").map((origin) => origin.trim()).filter(Boolean) : [];
}

async function runStdio(dbPath: string): Promise<void> {
  const { createContext } = await import("./context.js");
  const ctx = createContext(dbPath);
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttp(
  dbPath: string,
  host: string,
  port: number,
  authToken: string | undefined,
  allowedOrigins: readonly string[],
): Promise<void> {
  const { createContext } = await import("./context.js");
  const ctx = createContext(dbPath);
  const handle = await createHttpServer(ctx, { host, port, authToken, allowedOrigins });
  info(`${SERVER_NAME} v${VERSION} listening on http://${handle.host}:${handle.port}/mcp`);
  const shutdown = () => {
    void handle.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      db: { type: "string" },
      transport: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      "allowed-origin": { type: "string", multiple: true },
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
  const transportMode = values.transport ?? process.env.ENGINEER_MCP_TRANSPORT ?? "stdio";
  try {
    if (transportMode === "http") {
      const host = values.host ?? process.env.ENGINEER_MCP_HOST ?? DEFAULT_HOST;
      const port = parsePort(values.port ?? process.env.ENGINEER_MCP_PORT);
      const allowedOrigins = values["allowed-origin"] ?? parseAllowedOrigins(process.env.ENGINEER_MCP_ALLOWED_ORIGINS);
      await runHttp(dbPath, host, port, process.env.ENGINEER_MCP_AUTH_TOKEN, allowedOrigins);
      return;
    }
    if (transportMode === "stdio") {
      await runStdio(dbPath);
      return;
    }
    info(`Unknown transport: ${transportMode}. Use stdio or http.`);
    process.exit(1);
  } catch (error: unknown) {
    info(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
