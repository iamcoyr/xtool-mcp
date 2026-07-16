/**
 * Dependency-free BM25-lite keyword search over knowledge chunks.
 * This is the default backend and the fallback for the vector backend.
 */
import type { KnowledgeChunk, SearchBackend, SearchHit } from "../types.js";
import { tokenize } from "../knowledge.js";

interface IndexedDoc {
  chunk: KnowledgeChunk;
  tf: Map<string, number>;
  len: number;
}

export function createKeywordBackend(chunks: KnowledgeChunk[]): SearchBackend {
  const docs: IndexedDoc[] = chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.title} ${chunk.text}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { chunk, tf, len: tokens.length || 1 };
  });

  const N = docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const term of d.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / N;
  const k1 = 1.5;
  const b = 0.75;

  return {
    kind: "keyword",
    async search(query: string, k = 5): Promise<SearchHit[]> {
      const qterms = tokenize(query);
      if (qterms.length === 0) return [];
      const scored = docs
        .map((d) => {
          let score = 0;
          for (const term of qterms) {
            const f = d.tf.get(term);
            if (!f) continue;
            const n = df.get(term) ?? 0;
            const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
            score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / avgdl));
          }
          return { d, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      return scored.map(({ d, score }) => makeHit(d.chunk, score, qterms));
    }
  };
}

function makeHit(chunk: KnowledgeChunk, score: number, qterms: string[]): SearchHit {
  return {
    id: chunk.id,
    type: chunk.type,
    title: chunk.title,
    url: chunk.url ?? null,
    score: Number(score.toFixed(4)),
    snippet: makeSnippet(chunk.text, qterms)
  };
}

function makeSnippet(text: string, qterms: string[], window = 220): string {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of qterms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return text.slice(0, window).trim();
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + window).trim() + "…";
}
