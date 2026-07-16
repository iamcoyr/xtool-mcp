/**
 * Structural validator for `.xcs` documents. Not a Studio-grade schema check —
 * it catches the mistakes that most commonly make a hand-built `.xcs` fail to
 * open or render (missing Map markers, display/processing id mismatch, the
 * CIRCLE scale invariant).
 */

export interface XcsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}

const KNOWN_TYPES = new Set(["RECT", "LINE", "CIRCLE", "PATH", "PEN", "TEXT", "BITMAP"]);

export function validateXcs(input: string | Record<string, unknown>): XcsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let doc: Record<string, unknown>;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input) as Record<string, unknown>;
    } catch (e) {
      return {
        valid: false,
        errors: [`Not valid JSON: ${(e as Error).message}`],
        warnings: [],
        summary: "Invalid JSON"
      };
    }
  } else {
    doc = input;
  }

  const canvasId = doc.canvasId;
  if (typeof canvasId !== "string") errors.push("Missing top-level string `canvasId`.");
  if (typeof doc.extId !== "string") warnings.push("Missing `extId` (machine model code).");

  const canvas = doc.canvas;
  const displayIds = new Set<string>();
  if (!Array.isArray(canvas) || canvas.length === 0) {
    errors.push("`canvas` must be a non-empty array.");
  } else {
    const c0 = canvas[0] as Record<string, unknown>;
    if (c0?.id !== canvasId) warnings.push("`canvas[0].id` does not match top-level `canvasId`.");
    const displays = c0?.displays;
    if (!Array.isArray(displays)) {
      errors.push("`canvas[0].displays` must be an array.");
    } else {
      displays.forEach((d, i) => {
        const disp = d as Record<string, unknown>;
        if (typeof disp.id !== "string") errors.push(`Display[${i}] missing string \`id\`.`);
        else displayIds.add(disp.id);
        if (typeof disp.type !== "string" || !KNOWN_TYPES.has(disp.type)) {
          warnings.push(`Display[${i}] has unknown type "${String(disp.type)}".`);
        }
        if (disp.type === "CIRCLE") {
          const scale = disp.scale as { x?: number } | undefined;
          const width = disp.width as number | undefined;
          if (scale?.x != null && width != null) {
            const expected = width / 5900;
            if (Math.abs(scale.x - expected) > 1e-4) {
              warnings.push(
                `CIRCLE display[${i}] scale.x=${scale.x} should equal width/5900=${expected.toFixed(6)} or it renders invisible.`
              );
            }
          }
        }
      });
    }
  }

  // device.data Map structure + id cross-check.
  const device = doc.device as Record<string, unknown> | undefined;
  const processedIds = new Set<string>();
  if (!device || typeof device !== "object") {
    errors.push("Missing `device` object.");
  } else {
    const data = device.data as Record<string, unknown> | undefined;
    if (!data || data.dataType !== "Map" || !Array.isArray(data.value)) {
      errors.push('`device.data` must be `{ "dataType": "Map", "value": [...] }`.');
    } else {
      for (const pair of data.value as unknown[]) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const canvasProc = pair[1] as Record<string, unknown>;
        const nested = canvasProc?.displays as Record<string, unknown> | undefined;
        if (!nested || nested.dataType !== "Map" || !Array.isArray(nested.value)) {
          errors.push("Nested `displays` Map missing or malformed inside `device.data`.");
          continue;
        }
        for (const inner of nested.value as unknown[]) {
          if (Array.isArray(inner) && typeof inner[0] === "string") processedIds.add(inner[0]);
        }
      }
    }
  }

  for (const id of displayIds) {
    if (!processedIds.has(id)) {
      warnings.push(`Display "${id}" has no processing entry in device.data (it will not be lasered).`);
    }
  }
  for (const id of processedIds) {
    if (!displayIds.has(id)) {
      warnings.push(`Processing entry references unknown display id "${id}".`);
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    summary: valid
      ? `Valid .xcs structure: ${displayIds.size} shape(s), ${processedIds.size} with processing.`
      : `Invalid .xcs: ${errors.length} error(s).`
  };
}
