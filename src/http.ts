import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "./context.js";
import { buildServer } from "./server.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_PATH = "/mcp";
const MAX_BODY_BYTES = 1_048_576;

export type HttpServerOptions = {
  host?: string;
  port?: number;
  path?: string;
};

type HttpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

type HttpState = {
  context: AppContext;
  endpoint: string;
  sessions: Map<string, HttpSession>;
};

const states = new WeakMap<Server, HttpState>();

export function createHttpServer(context: AppContext, options: HttpServerOptions = {}): Server {
  const state: HttpState = {
    context,
    endpoint: normalizePath(options.path ?? DEFAULT_PATH),
    sessions: new Map(),
  };

  const server = createServer((request, response) => {
    void handleRequest(state, request, response).catch((error: unknown) => {
      sendError(response, 500, error instanceof Error ? error.message : String(error));
    });
  });
  states.set(server, state);

  server.once("close", () => {
    void closeSessions(state);
  });

  return server;
}

export async function startHttpServer(context: AppContext, options: HttpServerOptions = {}): Promise<Server> {
  const server = createHttpServer(context, options);
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  return server;
}

export async function closeHttpServer(server: Server): Promise<void> {
  const state = states.get(server);
  if (state) {
    await closeSessions(state);
  }
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function httpServerAddress(server: Server): { host: string; port: number } {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("HTTP server is not listening.");
  }
  return { host: address.address, port: address.port };
}

async function handleRequest(state: HttpState, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname !== state.endpoint) {
    sendError(response, 404, "MCP endpoint not found.");
    return;
  }

  let body: unknown;
  if (request.method === "POST") {
    try {
      body = await readJsonBody(request);
    } catch (error: unknown) {
      sendError(response, 400, error instanceof Error ? error.message : String(error));
      return;
    }
  }

  const sessionId = headerValue(request.headers["mcp-session-id"]);
  let session = sessionId ? state.sessions.get(sessionId) : undefined;

  if (!session) {
    if (sessionId) {
      sendError(response, 404, "MCP session not found.");
      return;
    }
    if (request.method !== "POST" || !isInitializeRequest(body)) {
      sendError(response, 400, "Start an MCP session with an initialize request.");
      return;
    }
    session = await createSession(state);
  }

  try {
    await session.transport.handleRequest(request, response, body);
  } catch (error: unknown) {
    sendError(response, 500, error instanceof Error ? error.message : String(error));
    await closeSession(state, session);
  }
}

async function createSession(state: HttpState): Promise<HttpSession> {
  const server = buildServer(state.context);
  let session!: HttpSession;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (sessionId) => {
      state.sessions.set(sessionId, session);
    },
  });

  session = { server, transport };
  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) {
      state.sessions.delete(sessionId);
    }
    void server.close();
  };

  await server.connect(transport);
  return session;
}

async function closeSessions(state: HttpState): Promise<void> {
  await Promise.all([...state.sessions.values()].map((session) => closeSession(state, session)));
}

async function closeSession(state: HttpState, session: HttpSession): Promise<void> {
  const sessionId = session.transport.sessionId;
  if (sessionId) {
    state.sessions.delete(sessionId);
  }
  await session.transport.close().catch(() => undefined);
  await session.server.close().catch(() => undefined);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body exceeds the 1 MiB limit.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new Error("Request body is required.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must contain valid JSON.");
  }
}

function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("HTTP path must start with '/'.");
  }
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sendError(response: ServerResponse, status: number, message: string): void {
  if (response.headersSent || response.writableEnded) {
    return;
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

export const HTTP_DEFAULTS = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  path: DEFAULT_PATH,
} as const;
