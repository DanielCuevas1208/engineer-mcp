# Streamable HTTP

Engineer MCP serves MCP over Streamable HTTP at `/mcp`.
The transport supports standard MCP clients and keeps sessions in memory.

## Start the server

Build the project first.

```sh
npm run build
npm run start:http
```

The default endpoint is `http://127.0.0.1:3000/mcp`.
The default bind address limits access to the local machine.

Set environment variables when you need a different bind address:

```sh
ENGINEER_MCP_HOST=127.0.0.1 ENGINEER_MCP_PORT=3010 npm run start:http
```

You can also pass `--host` and `--port` to `node dist/index.js --http`.
Port `0` selects an available port for embedded use.

## Request rules

Send an MCP `initialize` request without a session header.
The server returns `Mcp-Session-Id` for the new session.
Send later requests with that header.

Include both response types in the `Accept` header:

```http
Accept: application/json, text/event-stream
Content-Type: application/json
```

The server accepts `POST`, `GET`, and `DELETE` on `/mcp`.
The SDK uses `GET` for server-sent events and `DELETE` for session termination.

## Security boundary

HTTP has no authentication layer.
HTTP has no TLS layer.
Bind to loopback for local use.
Use a trusted gateway for shared deployments.
The server limits request bodies to 1 MiB.

Sessions use process memory.
Restarting the process ends every session.
The transport does not provide persistence or horizontal session sharing.

## Test the endpoint

Run the deterministic built smoke test:

```sh
npm run verify:http
```

The smoke test initializes a session and calls `unit_convert`.
The integration test uses the official MCP client transport in memory.
