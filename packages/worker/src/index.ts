/**
 * xtool-mcp — remote Cloudflare Worker entry point.
 *
 * Exposes the xTool MCP server over Streamable HTTP (/mcp) and legacy SSE (/sse),
 * plus hosted llms.txt / llms-full.txt and a small info/health surface. Search
 * uses Workers AI (@cf/baai/bge-large-en-v1.5) to embed the query and cosine-
 * ranks it against the shipped embedding index; it falls back to keyword search
 * when the index is empty or embedding fails.
 */
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAll,
  SERVER_INFO,
  createVectorBackend,
  knowledgeChunks,
  llmsTxt,
  llmsFullTxt,
  data
} from "@xtool-mcp/core";

export interface Env {
  AI: {
    run: (model: string, inputs: { text: string | string[] }) => Promise<{ data?: number[][] }>;
  };
}

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";

export class XToolMcpAgent extends McpAgent<Env> {
  server = new McpServer(SERVER_INFO);

  async init(): Promise<void> {
    const embed = async (text: string): Promise<number[]> => {
      const res = await this.env.AI.run(EMBED_MODEL, { text: [text] });
      return res.data?.[0] ?? [];
    };
    const search = createVectorBackend({
      chunks: knowledgeChunks(),
      index: data.embeddings,
      embed
    });
    registerAll(this.server, { search });
  }
}

function text(body: string, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, { headers: { "content-type": contentType } });
}

const INFO_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>xtool-mcp</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0B0F14;color:#E6EDF3;font:16px/1.6 system-ui,Segoe UI,Inter,sans-serif}
  main{max-width:720px;margin:0 auto;padding:48px 24px}
  h1{font-size:34px;margin:0 0 4px} .accent{color:#00D1FF}
  code{background:#11161C;border:1px solid #1F2933;border-radius:6px;padding:2px 6px}
  a{color:#00D1FF} .muted{color:#9AA4AE}
  .card{background:#11161C;border:1px solid #1F2933;border-radius:12px;padding:16px 20px;margin:16px 0}
</style></head><body><main>
<h1>xtool-mcp <span class="accent">·</span> remote MCP</h1>
<p class="muted">Unofficial MCP server + knowledge base for xTool laser machines. Not affiliated with xTool.</p>
<div class="card">
<p>Add to an MCP client (Streamable HTTP):</p>
<p><code>${"$"}{origin}/mcp</code></p>
<p class="muted">Legacy SSE endpoint: <code>/sse</code></p>
</div>
<div class="card">
<p>Also available:</p>
<ul>
<li><a href="/llms.txt">/llms.txt</a> — model-readable index</li>
<li><a href="/llms-full.txt">/llms-full.txt</a> — full knowledge dump</li>
<li><a href="/health">/health</a></li>
</ul>
</div>
<p class="muted">Local install: <code>npx xtool-mcp</code>. Source &amp; docs on GitHub.</p>
<p class="muted">⚠ Settings are starting points — test on scrap, never cut PVC/vinyl, never run a laser unattended.</p>
</main></body></html>`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/mcp") {
      return XToolMcpAgent.serve("/mcp").fetch(request, env, ctx);
    }
    if (path === "/sse" || path === "/sse/message") {
      return XToolMcpAgent.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (path === "/llms.txt") {
      return text(llmsTxt(url.origin));
    }
    if (path === "/llms-full.txt") {
      return text(llmsFullTxt(url.origin));
    }
    if (path === "/health") {
      return Response.json({ ok: true, name: SERVER_INFO.name, version: SERVER_INFO.version });
    }
    if (path === "/") {
      return text(INFO_HTML.replace(/\$\{origin\}/g, url.origin), "text/html; charset=utf-8");
    }
    return new Response("Not found", { status: 404 });
  }
};
