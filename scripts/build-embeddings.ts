/**
 * Precompute the knowledge-base embedding index via Cloudflare Workers AI
 * (@cf/baai/bge-large-en-v1.5, 1024-dim) and write it to
 * packages/core/src/data/embeddings.json.
 *
 * Requires env CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (a token with the
 * "Workers AI: Read" permission). Safe no-op if they're missing — the server
 * falls back to keyword search without an index.
 *
 * Run: pnpm build:embeddings   (after `pnpm --filter @xtool-mcp/core build`)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { knowledgeChunks } from "@xtool-mcp/core";

const MODEL = process.env.XTOOL_EMBEDDING_MODEL ?? "@cf/baai/bge-large-en-v1.5";
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "core",
  "src",
  "data",
  "embeddings.json"
);

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: texts })
    }
  );
  if (!res.ok) throw new Error(`Workers AI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: { data?: number[][] }; success?: boolean };
  if (!json.success || !json.result?.data) throw new Error(`Unexpected response: ${JSON.stringify(json).slice(0, 200)}`);
  return json.result.data;
}

async function main(): Promise<void> {
  if (!account || !token) {
    console.warn(
      "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set — skipping embedding build. " +
        "The server will use keyword search until an index is generated."
    );
    return;
  }

  const chunks = knowledgeChunks();
  const vectors: Array<{ id: string; vector: number[] }> = [];
  const batchSize = 50;
  let dims = 1024;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embeddings = await embedBatch(batch.map((c) => c.text.slice(0, 2000)));
    embeddings.forEach((vector, j) => {
      const chunk = batch[j];
      if (!chunk) return;
      dims = vector.length || dims;
      // Round to 6 dp — plenty for cosine ranking, and keeps the shipped index small.
      vectors.push({ id: chunk.id, vector: vector.map((x) => Math.round(x * 1e6) / 1e6) });
    });
    console.log(`Embedded ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
  }

  writeFileSync(outPath, JSON.stringify({ model: MODEL, dims, vectors }, null, 2) + "\n");
  console.log(`Wrote ${vectors.length} vectors (${dims}-dim) to embeddings.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
