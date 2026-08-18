import { afterEach, describe, expect, it } from "vitest";
import { createContext, type AppContext } from "../src/context.js";
import { createHttpServer, type HttpServerHandle, type HttpServerOptions } from "../src/http.js";
import { VERSION } from "../src/version.js";

const PROTOCOL_VERSION = "2025-11-25";

type RpcResponse = {
  status: number;
  sessionId?: string;
  allowOrigin?: string;
  contentType?: string;
  body: {
    jsonrpc?: string;
    id?: number;
    result?: Record<string, unknown> | { [key: string]: unknown };
    error?: { code?: number; message?: string } | string;
  };
};

function parseSseBody(raw: string): RpcResponse['body'] {
  const dataLine = raw.split(/\r?\n/).find((line) => line.startsWith('data: '));
  if (!dataLine) {
    throw new Error('SSE response has no data event: ' + raw);
  }
  return JSON.parse(dataLine.slice('data: '.length)) as RpcResponse['body'];
}

type RequestOptions = {
  authorization?: string;
  origin?: string;
};

let ctx: AppContext;
let handle: HttpServerHandle | undefined;

async function startServer(options: Partial<HttpServerOptions> = {}): Promise<HttpServerHandle> {
  ctx = createContext(":memory:");
  handle = await createHttpServer(ctx, { host: "127.0.0.1", port: 0, ...options });
  return handle;
}

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function rpc(
  url: string,
  method: string,
  params: unknown,
  sessionId?: string,
  options: RequestOptions = {},
): Promise<RpcResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  if (options.authorization) {
    headers.authorization = options.authorization;
  }
  if (options.origin) {
    headers.origin = options.origin;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const contentType = res.headers.get('content-type') ?? undefined;
  const raw = await res.text();
  const body = contentType?.includes('text/event-stream')
    ? parseSseBody(raw)
    : (JSON.parse(raw) as RpcResponse['body']);
  return {
    contentType,
    status: res.status,
    sessionId: res.headers.get("mcp-session-id") ?? undefined,
    allowOrigin: res.headers.get("access-control-allow-origin") ?? undefined,
    body,
  };
}

async function initialize(url: string): Promise<RpcResponse> {
  return rpc(url, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "engineer-mcp-tests", version: "1.0.0" },
  });
}

async function initializeWithOptions(url: string, options: RequestOptions): Promise<RpcResponse> {
  return rpc(
    url,
    "initialize",
    {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "engineer-mcp-tests", version: "1.0.0" },
    },
    undefined,
    options,
  );
}

describe("HTTP transport", () => {
  it("serves a health endpoint", async () => {
    const server = await startServer();
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    const body = (await res.json()) as { ok?: boolean; name?: string; version?: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("engineer-mcp");
    expect(body.version).toBe(VERSION);
  });

  it("requires a bearer token when authentication is configured", async () => {
    const server = await startServer({ authToken: "test-token" });
    const url = `http://127.0.0.1:${server.port}/health`;

    const rejected = await fetch(url);
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toBe("Bearer");

    const accepted = await fetch(url, { headers: { authorization: "Bearer test-token" } });
    expect(accepted.status).toBe(200);
  });

  it("rejects unlisted browser origins", async () => {
    const server = await startServer({ allowedOrigins: ["https://client.example"] });
    const url = `http://127.0.0.1:${server.port}/mcp`;

    const response = await initializeWithOptions(url, { origin: "https://untrusted.example" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Origin not allowed");
  });

  it("answers an approved CORS preflight and exposes the session header", async () => {
    const server = await startServer({ authToken: "test-token", allowedOrigins: ["https://client.example"] });
    const url = `http://127.0.0.1:${server.port}/mcp`;
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: {
        origin: "https://client.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type, mcp-session-id",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://client.example");
    expect(response.headers.get("access-control-expose-headers")).toBe("Mcp-Session-Id");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");

    const initialized = await initializeWithOptions(url, {
      authorization: "Bearer test-token",
      origin: "https://client.example",
    });
    expect(initialized.status).toBe(200);
    expect(initialized.sessionId).toBeDefined();
    expect(initialized.allowOrigin).toBe("https://client.example");
  });

  it("completes the initialize handshake and returns a session id", async () => {
    const server = await startServer();
    const response = await initialize(`http://127.0.0.1:${server.port}/mcp`);

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("application/json");
    expect(response.sessionId).toBeDefined();
    expect(response.body.result?.serverInfo).toMatchObject({ name: "engineer-mcp", version: VERSION });
  });

  it("lists the registered tools on a session", async () => {
    const server = await startServer();
    const url = `http://127.0.0.1:${server.port}/mcp`;
    const init = await initialize(url);
    expect(init.sessionId).toBeDefined();

    const tools = await rpc(url, "tools/list", {}, init.sessionId);
    expect(tools.status).toBe(200);
    const result = tools.body.result as { tools?: Array<{ name: string }> };
    expect(result.tools?.map((tool) => tool.name)).toContain("beam_bending");
    expect(result.tools?.map((tool) => tool.name)).toContain("section_catalog");
    expect(result.tools?.length).toBe(12);
  });

  it("calls a tool and returns the result envelope", async () => {
    const server = await startServer();
    const url = `http://127.0.0.1:${server.port}/mcp`;
    const init = await initialize(url);
    expect(init.sessionId).toBeDefined();

    const call = await rpc(
      url,
      "tools/call",
      {
        name: "beam_bending",
        arguments: {
          support: "simply_supported",
          load: "point",
          loadMagnitude: 20000,
          length: 3,
          material: "Structural steel S355",
          section: { shape: "i_beam", height: 0.3, flangeWidth: 0.15, flangeThickness: 0.012, webThickness: 0.008 },
        },
      },
      init.sessionId,
    );
    expect(call.status).toBe(200);
    const result = call.body.result as {
      structuredContent?: { tool?: string; quantities?: Array<{ key: string }> };
    };
    expect(result.structuredContent?.tool).toBe("beam_bending");
    const keys = result.structuredContent?.quantities?.map((q) => q.key) ?? [];
    expect(keys).toContain("maxBendingStress");
    expect(keys).toContain("maxBendingMoment");
  });

  it("reports a tool failure as an error result", async () => {
    const server = await startServer();
    const url = `http://127.0.0.1:${server.port}/mcp`;
    const init = await initialize(url);
    expect(init.sessionId).toBeDefined();

    const call = await rpc(
      url,
      "tools/call",
      { name: "unit_convert", arguments: { value: 10, from: "N·m", to: "J" } },
      init.sessionId,
    );
    const result = call.body.result as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Category mismatch");
  });

  it("rejects a non-initialization request without a session id", async () => {
    const server = await startServer();
    const response = await rpc(`http://127.0.0.1:${server.port}/mcp`, "tools/list", {});
    expect(response.status).toBe(400);
  });

  it("rejects an unknown session id", async () => {
    const server = await startServer();
    const response = await rpc(`http://127.0.0.1:${server.port}/mcp`, "tools/list", {}, "does-not-exist");
    expect(response.status).toBe(404);
  });

  it("removes a session on DELETE", async () => {
    const server = await startServer();
    const url = `http://127.0.0.1:${server.port}/mcp`;
    const init = await initialize(url);
    expect(init.sessionId).toBeDefined();

    const del = await fetch(url, {
      method: "DELETE",
      headers: {
        "mcp-session-id": init.sessionId ?? "",
        "mcp-protocol-version": PROTOCOL_VERSION,
      },
    });
    expect(del.status).toBe(200);

    const after = await rpc(url, "tools/list", {}, init.sessionId);
    expect(after.status).toBe(404);
  });

  it('returns Server-Sent Events when the response mode is configured', async () => {
    const server = await startServer({ responseMode: 'sse' });
    const response = await initialize('http://127.0.0.1:' + server.port + '/mcp');

    expect(response.status).toBe(200);
    expect(response.contentType).toContain('text/event-stream');
    expect(response.body.result?.serverInfo).toMatchObject({ name: 'engineer-mcp', version: VERSION });
  });
});
