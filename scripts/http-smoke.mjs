import assert from "node:assert/strict";
import { createContext } from "../dist/context.js";
import { createHttpServer } from "../dist/http.js";

const context = createContext(":memory:");
const server = await createHttpServer(context, { host: "127.0.0.1", port: 0 });

try {
  const endpoint = `http://${server.host}:${server.port}/mcp`;
  const initialize = await fetch(endpoint, {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "engineer-mcp-smoke", version: "1.0.0" },
      },
    }),
  });
  assert.equal(initialize.status, 200);
  const sessionId = initialize.headers.get("mcp-session-id");
  assert.ok(sessionId);

  const initialized = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal(initialized.status, 202);

  const call = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "unit_convert", arguments: { value: 1, from: "Pa.s", to: "cP" } },
    }),
  });
  assert.equal(call.status, 200);
  const result = await readMcpJson(call);
  assert.equal(result.result.structuredContent.tool, "unit_convert");
  assert.equal(result.result.structuredContent.quantities[0].value, 1000);

  const toleranceCall = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "tolerance_stack",
        arguments: {
          dimensions: [
            { name: "housing", nominal: 10, tolerancePlus: 0.1, toleranceMinus: 0.1, sign: 1, unit: "mm" },
            { name: "shaft", nominal: 0.9, tolerancePlus: 0.01, toleranceMinus: 0.01, sign: -1, unit: "cm" },
          ],
        },
      },
    }),
  });
  assert.equal(toleranceCall.status, 200);
  const toleranceResult = await readMcpJson(toleranceCall);
  assert.equal(toleranceResult.result.structuredContent.tool, "tolerance_stack");
  assert.equal(toleranceResult.result.structuredContent.references[0].id, "asme-y14-5");

  console.log("HTTP smoke test passed");
} finally {
  await server.close();
  context.db.close();
}

async function readMcpJson(response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).find((line) => line.startsWith("data: "));
    assert.ok(data);
    return JSON.parse(data.slice(6));
  }
  return JSON.parse(text);
}
