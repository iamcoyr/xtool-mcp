/**
 * @xtool-mcp/core — transport-agnostic core for xtool-mcp.
 *
 * Exposes the xTool knowledge base, the material-settings recommendation engine,
 * .xcs / SVG design generation, search backends, and the MCP registrar used by
 * both the stdio and Cloudflare Worker entry points.
 */
export * from "./types.js";
export * from "./knowledge.js";
export * from "./search/index.js";
export * from "./xcs/index.js";
export * from "./mcp/register.js";
export { registerTools, type ToolDeps } from "./mcp/tools.js";
export { registerResources, XCS_FORMAT_REFERENCE } from "./mcp/resources.js";
export { registerPrompts } from "./mcp/prompts.js";
export { llmsTxt, llmsFullTxt } from "./llms.js";

export * as data from "./data/index.js";
