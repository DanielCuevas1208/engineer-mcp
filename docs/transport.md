# HTTP transport

Engineer MCP runs over standard input and output by default.
It also runs over HTTP with the Streamable HTTP transport.
Use HTTP when your MCP client does not support stdio.
A browser-based client or a remote client is a typical case.

## Start the server

Build the server first.

```sh
npm run build
```

Then start the HTTP transport.

```sh
node dist/index.js --transport http
```

The server listens on `http://127.0.0.1:3000/mcp`.

Set these options to change the bind address.

| Option | Default | Purpose |
| --- | --- | --- |
| `--host` | `127.0.0.1` | Bind address. |
| `--port` | `3000` | Listen port. |
| `--response-mode` | `json` | Return JSON or Server-Sent Events. |
| `--allowed-origin <origin>` | None | Allow one browser origin. |

Use a port of `0` to let the operating system choose a free port.

```sh
node dist/index.js --transport http --host 127.0.0.1 --port 0
```

The server prints the real port to standard error.
Read it from the log line.

You can set the same values with environment variables.

| Environment variable | Purpose |
| --- | --- |
| `ENGINEER_MCP_TRANSPORT` | Transport mode: `stdio` or `http`. |
| `ENGINEER_MCP_HOST` | HTTP bind address. |
| `ENGINEER_MCP_PORT` | HTTP listen port. |
| `ENGINEER_MCP_HTTP_RESPONSE_MODE` | HTTP response mode: `json` or `sse`. |
| `ENGINEER_MCP_DB` | SQLite database path. |
| `ENGINEER_MCP_AUTH_TOKEN` | Bearer token for HTTP requests. |
| `ENGINEER_MCP_ALLOWED_ORIGINS` | Comma-separated browser origins. |

The server exits on `SIGINT` or `SIGTERM`.
It closes all active sessions during shutdown.

## Response modes

The server supports JSON and Server-Sent Events responses.
JSON is the default mode.
It returns one JSON-RPC response for each HTTP request.

Use SSE when your MCP client requires `text/event-stream`.

```sh
node dist/index.js --transport http --response-mode sse
```

The SSE response contains one `message` event.
Its `data` field contains the JSON-RPC response.

```text
event: message
data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

The environment variable provides the same setting.

```sh
ENGINEER_MCP_HTTP_RESPONSE_MODE=sse node dist/index.js --transport http
```

## Security

Set `ENGINEER_MCP_AUTH_TOKEN` to require a bearer token.
Send `Authorization: Bearer <token>` with every non-preflight request.

Set `ENGINEER_MCP_ALLOWED_ORIGINS` to allow browser origins.
Separate multiple origins with commas.

You can repeat `--allowed-origin <origin>` instead.
The server accepts requests without an Origin header.
It rejects browser requests outside the allow-list.
Approved browser requests receive CORS headers.
The response exposes `Mcp-Session-Id` for browser clients.

The health endpoint uses the same authentication and origin rules.

## Configure an MCP client

Point the client at the endpoint URL.

```json
{
  "mcpServers": {
    "engineer-mcp": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

See `examples/mcp-config.http.example.json` for a complete example.

## Sessions

The HTTP transport uses stateful sessions.
The server creates a session during the initialize request.
It returns the session id in the `Mcp-Session-Id` header.
The client must send this header on every later request.

The server keeps the session state in memory.
It removes a session on `DELETE` or on shutdown.

## Check the server with curl

Use the health endpoint to confirm the server is up.

```sh
curl http://127.0.0.1:3000/health
```

The server returns a JSON status.

```json
{ "ok": true, "name": "engineer-mcp", "version": "0.9.0" }
```

Start a session with an initialize request.

```sh
curl -s -D - http://127.0.0.1:3000/mcp \
  -H "accept: application/json, text/event-stream" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

Read the session id from the `Mcp-Session-Id` response header.
List the tools with that session id.

```sh
curl -s http://127.0.0.1:3000/mcp \
  -H "content-type: application/json" \
  -H "mcp-session-id: <session id>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Limitations

- The server binds to `127.0.0.1` by default.
  The transport does not provide TLS.
  Use a reverse proxy for public deployment.
- The server stores session state in memory.
  A restart clears every active session.
- SSE responses are not stored for reconnect.
  The server does not configure an event store.
