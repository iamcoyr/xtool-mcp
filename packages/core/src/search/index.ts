export { createKeywordBackend } from "./keyword.js";
export { createVectorBackend, type EmbedFn, type VectorBackendOptions } from "./vector.js";

import { knowledgeChunks } from "../knowledge.js";
import { createKeywordBackend } from "./keyword.js";
import type { SearchBackend } from "../types.js";

/** Convenience: a keyword backend over the full bundled knowledge base. */
export function defaultKeywordBackend(): SearchBackend {
  return createKeywordBackend(knowledgeChunks());
}
