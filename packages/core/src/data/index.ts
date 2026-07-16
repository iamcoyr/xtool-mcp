/**
 * Typed accessors for the bundled xTool knowledge data.
 *
 * The JSON files are the source of truth and are inlined into the build by the
 * bundler, so this module works unchanged in Node and in Cloudflare Workers.
 */
import machinesData from "./machines.json";
import materialsData from "./materials.json";
import troubleshootingData from "./troubleshooting.json";
import guidesData from "./guides.json";
import embeddingsData from "./embeddings.json";
import type {
  Machine,
  MaterialSetting,
  TroubleshootingItem,
  Guide,
  EmbeddingIndex
} from "../types.js";

export const machines = machinesData as unknown as Machine[];
export const materials = materialsData as unknown as MaterialSetting[];
export const troubleshooting = troubleshootingData as unknown as TroubleshootingItem[];
export const guides = guidesData as unknown as Guide[];
export const embeddings = embeddingsData as unknown as EmbeddingIndex;

export const dataVersion = "0.1.0";
