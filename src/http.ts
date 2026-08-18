import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppContext } from "./context.js";
import { createHttpSecurity, type HttpSecurityOptions } from "./http-security.js";
import { buildServer } from "./server.js";
import { SERVER_NAME, VERSION } from "./version.js";

export type HttpServerOptions = HttpSecurityOptions & {
  host: string;
  port: number;
  responseMode?: HttpResponseMode;
};

export type HttpResponseMode = 'json' | 'sse';

export type HttpServerHandle = {
  host: string;
  port: number;
  close(): Promise<void>;
};

type Session = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

const SESSION_HEADER = "mcp-session-id";
const HEALTH_PATH = "/health";

function readSessionId(req: IncomingMessage): string | undefined {
  const value = req.headers[SESSION_HEADER];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createHttpServer(ctx: AppContext, options: HttpServerOptions): Promise<HttpServerHandle> {
  const sessions = new Map<string, Session>();
  const security = createHttpSecurity(options);
  const responseMode = options.responseMode ?? 'json';

  const httpServer = createServer((req, res) => {
    void handleRequest(ctx, sessions, security, responseMode, req, res).catch(() => {
      writeJson(res, 500, { error: "Internal server error" });
    });
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.removeListener("error", onError);
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      resolve({
        host: options.host,
        port,
        close() {
          return new Promise<void>((resolveClose) => {
            httpServer.close(() => resolveClose());
            httpServer.closeAllConnections();
          });
        },
      });
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(options.port, options.host);
  });
}

async function handleRequest(
  ctx: AppContext,
  sessions: Map<string, Session>,
  security: ReturnType<typeof createHttpSecurity>,
  responseMode: HttpResponseMode,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const decision = security.check({
    authorization: readHeader(req, "authorization"),
    method: req.method,
    origin: readHeader(req, "origin"),
  });
  const corsHeaders = security.corsHeaders(decision.ok ? decision.origin : undefined);
  for (const [name, value] of Object.entries(corsHeaders)) {
    res.setHeader(name, value);
  }
  if (!decision.ok) {
    if (decision.status === 401) {
      res.setHeader("WWW-Authenticate", "Bearer");
    }
    writeJson(res, decision.status, { error: decision.error });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url && new URL(req.url, "http://127.0.0.1").pathname === HEALTH_PATH) {
    writeJson(res, 200, { ok: true, name: SERVER_NAME, version: VERSION });
    return;
  }

  const sessionId = readSessionId(req);
  let session: Session | undefined;
  if (sessionId) {
    session = sessions.get(sessionId);
    if (!session) {
      writeJson(res, 404, { error: "Session not found" });
      return;
    }
  }
  if (!session) {
    session = await createSession(ctx, sessions, responseMode);
  }
  await session.transport.handleRequest(req, res);
}

function readHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function createSession(ctx: AppContext, sessions: Map<string, Session>, responseMode: HttpResponseMode): Promise<Session> {
  const server = buildServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: responseMode === 'json',
    onsessioninitialized(id) {
      sessions.set(id, { server, transport });
    },
    onsessionclosed(id) {
      sessions.delete(id);
    },
  });
  await server.connect(transport);
  return { server, transport };
}
