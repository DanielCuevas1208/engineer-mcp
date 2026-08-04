#!/usr/bin/env node
// HTTP transport smoke check.
// Build first (npm run build), then run: node examples/http-smoke.mjs
// The script starts the built server through its CLI, completes an MCP
// handshake over HTTP, and exits non-zero when any step fails.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROTOCOL_VERSION = "2025-11-25";
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ENTRY = path.join(PROJECT_ROOT, "dist", "index.js");

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        return true;
      }
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function rpc(url, method, params, sessionId) {
  const headers = {
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
  const body = await res.json();
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), body };
}

function pickPort() {
  return 20000 + Math.floor(Math.random() * 40000);
}

async function run() {
  const port = pickPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const healthUrl = `${baseUrl}/health`;
  const mcpUrl = `${baseUrl}/mcp`;

  const child = spawn(process.execPath, [SERVER_ENTRY, "--transport", "http", "--host", "127.0.0.1", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const healthy = await waitForHealth(healthUrl, 10000);
    if (!healthy) {
      throw new Error(`Server did not become healthy. stderr:\n${stderr}`);
    }

    const init = await rpc(mcpUrl, "initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "engineer-mcp-http-smoke", version: "1.0.0" },
    });
    if (init.status !== 200 || !init.sessionId) {
      throw new Error(`Initialize failed with status ${init.status}.`);
    }

    const list = await rpc(mcpUrl, "tools/list", {}, init.sessionId);
    if (list.status !== 200) {
      throw new Error(`tools/list failed with status ${list.status}.`);
    }
    const tools = list.body.result?.tools ?? [];
    if (tools.length !== 12) {
      throw new Error(`Expected 12 tools, received ${tools.length}.`);
    }
    if (!tools.some((tool) => tool.name === "beam_bending")) {
      throw new Error("Expected beam_bending in the tool list.");
    }

    const call = await rpc(mcpUrl, "tools/call", {
      name: "beam_bending",
      arguments: {
        support: "simply_supported",
        load: "point",
        loadMagnitude: 20000,
        length: 3,
        material: "Structural steel S355",
        section: { shape: "i_beam", height: 0.3, flangeWidth: 0.15, flangeThickness: 0.012, webThickness: 0.008 },
      },
    }, init.sessionId);
    if (call.status !== 200 || call.body.result?.structuredContent?.tool !== "beam_bending") {
      throw new Error("tools/call did not return the beam_bending result.");
    }

    console.log(`HTTP smoke check passed on port ${port}.`);
    console.log("  initialize: ok");
    console.log(`  tools/list: ${tools.length} tools`);
    console.log("  tools/call beam_bending: ok");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
}

run().catch((error) => {
  console.error(`HTTP smoke check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
