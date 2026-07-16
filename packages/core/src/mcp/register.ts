import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SearchBackend } from "../types.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export const SERVER_INFO = { name: "xtool-mcp", version: "0.1.0" } as const;

export interface XToolServerDeps {
  /** Search backend: keyword (stdio) or vector (Worker/Workers AI). */
  search: SearchBackend;
}

/** Register all xTool tools, resources, and prompts onto an McpServer. */
export function registerAll(server: McpServer, deps: XToolServerDeps): void {
  registerTools(server, deps);
  registerResources(server);
  registerPrompts(server);
}
