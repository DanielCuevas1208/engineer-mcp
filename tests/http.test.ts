import { afterEach, describe, expect, it } from "vitest";
import { createContext, type AppContext } from "../src/context.js";
import { createHttpServer, type HttpServerHandle } from "../src/http.js";
import { VERSION } from "../src/version.js";

const PROTOCOL_VERSION = "2025-11-25";

type RpcResponse = {
  status: number;
  sessionId?: string;
  body: {
    jsonrpc?: string;
    id?: number;
    result?: Record<string, unknown> | { [key: string]: unknown };
    error?: { code?: number; message?: string };
  };
};

let ctx: AppContext;
let handle: HttpServerHandle | undefined;

async function startServer(): Promise<HttpServerHandle> {
  ctx = createContext(":memory:");
  handle = await createHttpServer(ctx, { host: "127.0.0.1", port: 0 });
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
): Promise<RpcResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as RpcResponse["body"];
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id") ?? undefined,
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

  it("completes the initialize handshake and returns a session id", async () => {
    const server = await startServer();
    const response = await initialize(`http://127.0.0.1:${server.port}/mcp`);

    expect(response.status).toBe(200);
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
});
