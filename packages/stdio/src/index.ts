/**
 * xtool-mcp — local stdio entry point.
 *
 * Runs the xTool MCP server over stdio for Claude Desktop, Cursor, and any
 * other MCP client. Uses the keyword search backend (no network inference).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAll, SERVER_INFO, defaultKeywordBackend } from "@xtool-mcp/core";

async function main(): Promise<void> {
  const server = new McpServer(SERVER_INFO);
  registerAll(server, { search: defaultKeywordBackend() });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is the MCP transport.
  console.error(`xtool-mcp (stdio) ${SERVER_INFO.version} ready`);
}

main().catch((err) => {
  console.error("xtool-mcp failed to start:", err);
  process.exit(1);
});
