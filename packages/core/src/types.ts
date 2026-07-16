/**
 * Shared domain types for xtool-mcp.
 *
 * These mirror the JSON data files in `src/data/`. Everything here is plain data
 * so it can be bundled into both the Node (stdio) and Cloudflare Worker builds.
 */

export type LaserCategory = "diode" | "co2" | "fiber" | "infrared" | "hybrid";

export type SoftwareApp = "XCS" | "Studio";

export type MachineDriver = "CH340" | "GD32" | "RNDIS";

export interface Machine {
  /** kebab-case stable id, e.g. "d1-pro". */
  id: string;
  /** Display name, e.g. "xTool D1 Pro". */
  name: string;
  category: LaserCategory;
  /** Available laser module wattages (optical watts). */
  laser_power_w: number[];
  /** Null for machines with no fixed engraving bed (e.g. handheld welders). */
  work_area_mm: { width: number; height: number } | null;
  max_pass_through_thickness_mm: number | null;
  supported_software: SoftwareApp[];
  connectivity: string[];
  driver: MachineDriver | null;
  key_features: string[];
  release_era: string | null;
  product_url: string | null;
  /** xTool internal model code written to .xcs `extId`, when known (else derived + flagged). */
  xcs_ext_id?: string;
  /** xTool model display name written to .xcs `extName`, when known. */
  xcs_ext_name?: string;
  notes?: string;
  sources?: string[];
}

export type Operation = "cut" | "engrave" | "score";

/** How trustworthy a settings row is. */
export type Confidence = "high" | "medium" | "low" | "community";

export interface MaterialSetting {
  /** Machine name or id this applies to, e.g. "D1 Pro" or "d1-pro". */
  machine: string;
  /** Laser module wattage the numbers were captured for, if known. */
  laser_power_w: number | null;
  /** Human material name, e.g. "Basswood Plywood". */
  material: string;
  thickness_mm: number | null;
  operation: Operation;
  /** Laser power as a percentage (0-100). */
  power_pct: number | null;
  /** Head speed in mm/s. */
  speed_mm_s: number | null;
  passes: number | null;
  /** Engrave resolution, dots per inch (raster/fill engraving only). */
  dpi: number | null;
  source_url?: string | null;
  confidence: Confidence;
  notes?: string;
}

export interface TroubleshootingItem {
  id: string;
  symptom: string;
  /** Applicable machine ids/names or laser categories. Empty/undefined = general. */
  machines?: string[];
  causes: string[];
  fixes: string[];
  source_url?: string | null;
  tags?: string[];
}

export type GuideScope = "XCS" | "Studio" | "general";

export interface Guide {
  id: string;
  title: string;
  software: GuideScope;
  url?: string | null;
  summary?: string;
  /** Markdown body. */
  content: string;
}

export interface EmbeddingVector {
  id: string;
  vector: number[];
}

export interface EmbeddingIndex {
  model: string;
  dims: number;
  vectors: EmbeddingVector[];
}

/** A unit of searchable knowledge, derived from the data files. */
export interface KnowledgeChunk {
  id: string;
  type: "machine" | "material" | "guide" | "troubleshooting" | "safety";
  title: string;
  text: string;
  url?: string | null;
}

export interface SearchHit {
  id: string;
  type: KnowledgeChunk["type"];
  title: string;
  snippet: string;
  score: number;
  url?: string | null;
}

export interface SearchBackend {
  readonly kind: "keyword" | "vector";
  search(query: string, k?: number): Promise<SearchHit[]>;
}
