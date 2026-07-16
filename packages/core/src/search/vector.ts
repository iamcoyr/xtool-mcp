/**
 * Semantic search backend: cosine similarity over a precomputed embedding
 * index. The query is embedded at call time via an injected `embed` function
 * (on Cloudflare Workers this is Workers AI, @cf/baai/bge-large-en-v1.5).
 *
 * If the shipped index is empty or embedding fails, it transparently falls
 * back to keyword search so the tool always returns something useful.
 */
import type { EmbeddingIndex, KnowledgeChunk, SearchBackend, SearchHit } from "../types.js";
import { createKeywordBackend } from "./keyword.js";

export type EmbedFn = (text: string) => Promise<number[]>;

export interface VectorBackendOptions {
  chunks: KnowledgeChunk[];
  index: EmbeddingIndex;
  embed: EmbedFn;
}

export function createVectorBackend(opts: VectorBackendOptions): SearchBackend {
  const { chunks, index, embed } = opts;
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const keyword = createKeywordBackend(chunks);
  const hasIndex = index.vectors.length > 0;

  return {
    kind: "vector",
    async search(query: string, k = 5): Promise<SearchHit[]> {
      if (!hasIndex) return keyword.search(query, k);
      let q: number[];
      try {
        q = await embed(query);
      } catch {
        return keyword.search(query, k);
      }
      if (!q || q.length === 0) return keyword.search(query, k);

      const scored = index.vectors
        .map((v) => ({ id: v.id, score: cosine(q, v.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

      const hits: SearchHit[] = [];
      for (const s of scored) {
        const c = byId.get(s.id);
        if (!c) continue;
        hits.push({
          id: c.id,
          type: c.type,
          title: c.title,
          url: c.url ?? null,
          score: Number(s.score.toFixed(4)),
          snippet: c.text.slice(0, 220).trim()
        });
      }
      return hits;
    }
  };
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
