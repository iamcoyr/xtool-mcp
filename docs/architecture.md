# Architecture

`xtool-mcp` is a pnpm monorepo with a transport-agnostic core and two thin entry points.

```
packages/
  core/     @xtool-mcp/core — knowledge base + .xcs/SVG generation + MCP tools/resources/prompts
  stdio/    xtool-mcp — local stdio server (npx)
  worker/   @xtool-mcp/worker — remote Cloudflare Worker (Streamable HTTP + SSE)
scripts/    build-llms-txt.ts, build-embeddings.ts
agent/      portable system prompt + client configs
docs/
```

## Core (`@xtool-mcp/core`)

All behavior lives here so both entry points are identical in capability:

- **`data/`** — the source-of-truth JSON: `machines.json`, `materials.json`,
  `troubleshooting.json`, `guides.json`, `embeddings.json`. Bundled into the build.
- **`knowledge.ts`** — accessors + the `recommendSettings` engine (provenance +
  confidence + safety caveats, with a "run a test grid" fallback when data is thin).
- **`search/`** — a `SearchBackend` interface with two implementations:
  - `keyword` (BM25-lite, no network) — used by stdio.
  - `vector` (cosine over a precomputed index; query embedded at call time) — used by
    the Worker via Workers AI. Falls back to keyword if the index is empty.
- **`xcs/`** — the neutral `Design` model, SVG import/export, test-grid and
  finger-joint-box generators, the `.xcs` serializer (`builder.ts`), and a validator.
- **`mcp/`** — `registerTools`, `registerResources`, `registerPrompts`, and
  `registerAll(server, { search })` which both entry points call.
- **`llms.ts`** — `llmsTxt()` / `llmsFullTxt()` generators.

## stdio (`xtool-mcp`)

`new McpServer(...)` → `registerAll(server, { search: defaultKeywordBackend() })` →
`StdioServerTransport`. Published to npm; run with `npx xtool-mcp`.

## worker (`@xtool-mcp/worker`)

An `McpAgent` (Cloudflare `agents` SDK, Durable Object-backed) exposing:
- `/mcp` — Streamable HTTP MCP endpoint
- `/sse` — legacy SSE endpoint
- `/llms.txt`, `/llms-full.txt` — hosted, generated live from the knowledge base
- `/health`, `/` — status + landing page

Search embeds the query with Workers AI `@cf/baai/bge-large-en-v1.5` and cosine-ranks
against the shipped index.

## Why this shape

- One place to add knowledge or tools; both runtimes get it for free.
- The fragile, reverse-engineered `.xcs` serialization is isolated in `xcs/builder.ts`.
- stdio needs no network inference; the Worker stays on the Cloudflare stack.
