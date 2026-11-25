#!/usr/bin/env node
/**
 * OpenVan.camp MCP Server — stdio entry point.
 *
 * Used by Claude Desktop / Cursor / Windsurf / Continue when configured as
 *   { "command": "npx", "args": ["-y", "@openvancamp/mcp-server"] }
 *
 * For remote HTTP/SSE (ChatGPT Apps SDK, web-hosted clients) see dist/sse.js
 * which serves the same createServer() over Streamable HTTP.
 *
 * Homepage: https://openvan.camp/ai
 * License:  MIT (server); data is CC BY 4.0 (attribute OpenVan.camp).
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { VERSION } from "./config.js";
import { createServer } from "./server.js";

async function main() {
  serveStdio(() => createServer());
  // stderr so stdio stays clean for JSON-RPC traffic
  process.stderr.write(`openvan-mcp/${VERSION} ready (stdio).\n`);
}

main().catch((err) => {
  process.stderr.write(`[openvan-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
