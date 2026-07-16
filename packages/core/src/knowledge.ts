/**
 * Knowledge access + the material-settings recommendation engine.
 *
 * All functions operate on the bundled data. The recommendation engine never
 * presents a number as authoritative: every result carries provenance,
 * confidence, and safety caveats, and falls back to "run a test grid" guidance
 * when data is thin.
 */
import { machines, materials, troubleshooting, guides } from "./data/index.js";
import type {
  Guide,
  KnowledgeChunk,
  Machine,
  MaterialSetting,
  Operation,
  TroubleshootingItem
} from "./types.js";

const norm = (s: string): string => s.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

export function listMachines(): Machine[] {
  return machines;
}

export function getMachine(idOrName: string): Machine | undefined {
  const q = machineKey(idOrName);
  if (!q) return undefined;
  // 1) Exact match on the wattage-stripped id or name key.
  const exact = machines.find((m) => idKey(m.id) === q || machineKey(m.name) === q);
  if (exact) return exact;
  // 2) Most-specific word-boundary match on the id key (so "D1 Pro" != "D1").
  const scored = machines
    .map((m) => ({ m, k: idKey(m.id) }))
    .filter(({ k }) => q === k || q.startsWith(`${k} `) || k.startsWith(`${q} `))
    .sort((a, b) => b.k.length - a.k.length);
  if (scored[0]) return scored[0].m;
  // 3) Loose fallback on the name.
  return machines.find((m) => machineKey(m.name).includes(q));
}

/** Normalize a machine label to a comparable key, stripping "xTool" and wattage. */
function machineKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/xtool/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*w\b/g, " ") // strip wattage tokens like "20W", "5.5w"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function idKey(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Does a settings row's `machine` field refer to this machine?
 * Settings rows are often labelled with a module wattage (e.g. "D1 Pro 20W"),
 * so compare on the wattage-stripped key against both the machine id and name.
 */
function settingMatchesMachine(setting: MaterialSetting, machine: Machine): boolean {
  const sk = machineKey(setting.machine);
  return sk === idKey(machine.id) || sk === machineKey(machine.name);
}

// ---------------------------------------------------------------------------
// Guides & troubleshooting
// ---------------------------------------------------------------------------

export function listGuides(): Guide[] {
  return guides;
}

export function getGuide(id: string): Guide | undefined {
  const q = norm(id);
  return guides.find((g) => norm(g.id) === q);
}

export function searchTroubleshooting(query: string, limit = 5): TroubleshootingItem[] {
  const terms = tokenize(query);
  if (terms.length === 0) return troubleshooting.slice(0, limit);
  const scored = troubleshooting.map((item) => {
    const hay = norm(
      [item.symptom, ...item.causes, ...item.fixes, ...(item.tags ?? [])].join(" ")
    );
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 1;
    return { item, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

// ---------------------------------------------------------------------------
// Settings recommendation
// ---------------------------------------------------------------------------

export interface RecommendQuery {
  machine: string;
  material: string;
  thickness_mm?: number;
  operation?: Operation;
  laser_power_w?: number;
}

export interface RecommendationResult {
  resolvedMachine: Machine | null;
  /** True when the material must not be lasered at all (e.g. PVC/vinyl). */
  prohibited: boolean;
  matches: MaterialSetting[];
  best: MaterialSetting | null;
  exact: boolean;
  safety: string[];
  caveats: string[];
  guidance: string;
}

const CONFIDENCE_WEIGHT: Record<MaterialSetting["confidence"], number> = {
  high: 2,
  medium: 1,
  community: 0.5,
  low: 0
};

function materialCloseness(candidate: string, query: string): number {
  const c = norm(candidate);
  const q = norm(query);
  if (c === q) return 4;
  if (c.includes(q) || q.includes(c)) return 3;
  const ct = new Set(tokenize(candidate));
  const qt = tokenize(query);
  if (qt.length === 0) return -5;
  const found = qt.filter((t) => ct.has(t)).length;
  if (found === 0) return -5;
  // Reward the fraction of query terms present so "cast acrylic" beats
  // "extruded acrylic" for a cast-acrylic query.
  return (found / qt.length) * 2;
}

export function recommendSettings(query: RecommendQuery): RecommendationResult {
  const machine = getMachine(query.machine) ?? null;

  const banned = prohibitedMaterial(query.material);
  if (banned) {
    return {
      resolvedMachine: machine,
      prohibited: true,
      matches: [],
      best: null,
      exact: false,
      safety: safetyNotesFor(query.material),
      caveats: [banned.reason],
      guidance:
        `DO NOT laser ${query.material}. Reason: ${banned.reason}. This is unsafe on any xTool ` +
        `machine — do not run a test grid to "find settings" either.` +
        (banned.alt ? ` ${banned.alt}` : "")
    };
  }

  const scored = materials
    .map((row) => {
      let score = 0;

      // Machine match (or same-family fallback).
      if (machine) {
        if (settingMatchesMachine(row, machine)) score += 3;
        else score -= 4;
      }

      // Material closeness.
      const mc = materialCloseness(row.material, query.material);
      if (mc < 0) return { row, score: -Infinity };
      score += mc;

      // Operation.
      if (query.operation) {
        if (row.operation === query.operation) score += 2;
        else score -= 3;
      }

      // Thickness closeness.
      if (query.thickness_mm != null && row.thickness_mm != null) {
        const diff = Math.abs(row.thickness_mm - query.thickness_mm);
        score += diff === 0 ? 2 : Math.max(-3, 1 - diff);
      }

      // Laser power closeness.
      if (query.laser_power_w != null && row.laser_power_w != null) {
        score += row.laser_power_w === query.laser_power_w ? 1 : -0.5;
      }

      score += CONFIDENCE_WEIGHT[row.confidence];
      return { row, score };
    })
    .filter((s) => Number.isFinite(s.score) && s.score > -Infinity)
    .sort((a, b) => b.score - a.score);

  const matches = scored.slice(0, 5).map((s) => s.row);
  const best = matches[0] ?? null;

  const exact =
    best != null &&
    (machine ? settingMatchesMachine(best, machine) : true) &&
    norm(best.material) === norm(query.material) &&
    (query.operation ? best.operation === query.operation : true) &&
    (query.thickness_mm != null && best.thickness_mm != null
      ? best.thickness_mm === query.thickness_mm
      : true);

  return {
    resolvedMachine: machine,
    prohibited: false,
    matches,
    best,
    exact,
    safety: safetyNotesFor(query.material),
    caveats: caveatsFor(query, machine, best, exact),
    guidance: guidanceFor(query, machine, best, exact)
  };
}

interface Prohibited {
  reason: string;
  alt?: string;
}

/** Materials that must never be lasered on any xTool machine. */
function prohibitedMaterial(material: string): Prohibited | null {
  const padded = ` ${norm(material)} `;
  const has = (...terms: string[]): boolean => terms.some((t) => padded.includes(` ${t} `));
  if (has("pvc", "vinyl", "polyvinyl", "pleather", "faux leather", "leatherette")) {
    return {
      reason: "it contains PVC/chlorine, which releases toxic chlorine gas and corrodes the machine",
      alt: "If you need to cut vinyl/PVC sheet, use a mechanical blade cutter (e.g. xTool M1 / M1 Ultra), not the laser."
    };
  }
  if (has("polycarbonate", "lexan")) {
    return { reason: "polycarbonate burns and yellows, is a fire hazard, and does not cut cleanly" };
  }
  if (has("abs")) {
    return { reason: "ABS melts and emits toxic fumes when lasered" };
  }
  if (has("ptfe", "teflon")) {
    return { reason: "PTFE/Teflon emits toxic fluorine compounds (including HF gas) when lasered" };
  }
  if (has("fiberglass", "fibreglass")) {
    return { reason: "fiberglass emits fine glass particles and resin fumes when lasered" };
  }
  if (has("hdpe")) {
    return { reason: "HDPE melts and can catch fire when lasered" };
  }
  if (has("styrofoam", "polystyrene foam")) {
    return { reason: "polystyrene foam catches fire extremely easily when lasered" };
  }
  return null;
}

function safetyNotesFor(material: string): string[] {
  const notes = [
    "Always run a test cut/engrave on scrap of the same material before a real job.",
    "Never cut PVC, vinyl, or chlorine-containing materials — toxic gas and machine damage.",
    "Never run the laser unattended; keep a fire extinguisher within reach.",
    "Use adequate ventilation / fume extraction and manufacturer-approved eye protection."
  ];
  const m = norm(material);
  if (m.includes("acrylic")) {
    notes.push("Use cast acrylic for clean engraving; extruded acrylic cuts but engraves poorly.");
  }
  if (m.includes("leather") || m.includes("pleather") || m.includes("faux")) {
    notes.push("Only genuine leather — faux/'pleather' is often PVC and must not be lasered.");
  }
  if (m.includes("mdf")) {
    notes.push("MDF produces heavy smoke and can flare; ensure strong extraction.");
  }
  return notes;
}

function caveatsFor(
  q: RecommendQuery,
  machine: Machine | null,
  best: MaterialSetting | null,
  exact: boolean
): string[] {
  const caveats: string[] = [];
  if (!machine) {
    caveats.push(
      `Machine "${q.machine}" was not found in the catalog; results are not machine-specific.`
    );
  }
  if (best && !exact) {
    caveats.push(
      `No exact match. Closest data is for ${best.machine} / ${best.material}` +
        `${best.thickness_mm != null ? ` @ ${best.thickness_mm}mm` : ""} (${best.operation}).`
    );
  }
  if (best) {
    caveats.push(`Confidence: ${best.confidence}. Source: ${best.source_url ?? "unattributed"}.`);
  }
  return caveats;
}

function guidanceFor(
  q: RecommendQuery,
  machine: Machine | null,
  best: MaterialSetting | null,
  exact: boolean
): string {
  if (!best) {
    return (
      `No settings data found for ${q.material}${
        machine ? ` on ${machine.name}` : ""
      }. Run a material test grid to find safe values — use the "generate_test_grid" tool ` +
      `(vary power on one axis and speed on the other), cut it on scrap, and read the best cell.`
    );
  }
  if (exact) {
    return (
      `Use these as a validated starting point, then fine-tune on scrap. If the cut doesn't ` +
      `go through, add a pass or lower speed in small steps.`
    );
  }
  return (
    `Treat this as an approximate starting point only — it is not an exact match for your ` +
    `machine/material/thickness. Verify on scrap and adjust. When in doubt, run a test grid.`
  );
}

// ---------------------------------------------------------------------------
// Search chunks (shared by keyword search and the embedding build script)
// ---------------------------------------------------------------------------

export function knowledgeChunks(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  for (const m of machines) {
    chunks.push({
      id: `machine:${m.id}`,
      type: "machine",
      title: m.name,
      url: m.product_url ?? null,
      text:
        `${m.name} — ${m.category} laser. Power options: ${m.laser_power_w.join(", ")}W. ` +
        `${m.work_area_mm ? `Work area ${m.work_area_mm.width}x${m.work_area_mm.height} mm. ` : ""}` +
        `Software: ${m.supported_software.join(", ")}. ` +
        `Connectivity: ${m.connectivity.join(", ")}. Features: ${m.key_features.join("; ")}.`
    });
  }

  for (const g of guides) {
    chunks.push({
      id: `guide:${g.id}`,
      type: g.id === "laser-safety" ? "safety" : "guide",
      title: g.title,
      url: g.url ?? null,
      text: `${g.title}\n${g.summary ?? ""}\n${g.content}`
    });
  }

  for (const t of troubleshooting) {
    chunks.push({
      id: `troubleshooting:${t.id}`,
      type: "troubleshooting",
      title: t.symptom,
      url: t.source_url ?? null,
      text: `${t.symptom}. Causes: ${t.causes.join("; ")}. Fixes: ${t.fixes.join("; ")}.`
    });
  }

  for (const s of materials) {
    const label = `${s.machine} — ${s.material}${
      s.thickness_mm != null ? ` ${s.thickness_mm}mm` : ""
    } (${s.operation})`;
    chunks.push({
      id: `material:${label}`,
      type: "material",
      title: label,
      url: s.source_url ?? null,
      text:
        `${label}: power ${s.power_pct ?? "?"}%, speed ${s.speed_mm_s ?? "?"} mm/s, ` +
        `passes ${s.passes ?? "?"}${s.dpi != null ? `, ${s.dpi} DPI` : ""}. ` +
        `Confidence ${s.confidence}. ${s.notes ?? ""}`
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Tokenizer (shared)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "it",
  "with", "my", "how", "do", "i", "can", "you", "at", "be", "this", "that"
]);

export function tokenize(s: string): string[] {
  return norm(s)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
