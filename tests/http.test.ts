import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { createContext } from "../src/context.js";
import { closeHttpServer, httpServerAddress, startHttpServer } from "../src/http.js";

describe("Streamable HTTP transport", () => {
  it("serves the MCP tool registry and a calculation over HTTP", async () => {
    const context = createContext(":memory:");
    const server = await startHttpServer(context, { port: 0 });
    const { host, port } = httpServerAddress(server);
    const transport = new StreamableHTTPClientTransport(new URL(`http://${host}:${port}/mcp`));
    const client = new Client({ name: "http-test-client", version: "1.0.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("unit_convert");

      const result = await client.callTool({
        name: "unit_convert",
        arguments: { value: 1, from: "Pa.s", to: "cP" },
      });
      const structured = result.structuredContent as { tool: string; quantities: Array<{ value: number }> };
      expect(structured.tool).toBe("unit_convert");
      expect(structured.quantities[0]?.value).toBe(1000);
    } finally {
      await client.close();
      await closeHttpServer(server);
      context.db.close();
    }
  });

  it("rejects a request without an initialization session", async () => {
    const context = createContext(":memory:");
    const server = await startHttpServer(context, { port: 0 });
    const { host, port } = httpServerAddress(server);

    try {
      const response = await fetch(`http://${host}:${port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      expect(response.status).toBe(400);
    } finally {
      await closeHttpServer(server);
      context.db.close();
    }
  });
});
