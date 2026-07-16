/**
 * Parametric finger-joint (box) generator.
 *
 * Produces the flat panels for a tray/box with interlocking finger joints,
 * laid out on the canvas ready to cut. Uses a tab-and-slot model so mating
 * edges interlock and all corners stay flush.
 *
 * NOTE: fit depends on real kerf and material. Treat output as a starting
 * point and cut a test corner first.
 */
import { emptyDesign, type Design, type OpParams, type PolyShape } from "./design.js";

export interface BoxOptions {
  /** Outer dimensions in mm. */
  width: number;
  depth: number;
  height: number;
  /** Material thickness in mm. */
  thickness: number;
  /** Target finger width in mm (default = max(3 * thickness, 8)). */
  finger?: number;
  /** Kerf in mm; each cut edge is offset outward by kerf/2 for a snug fit (default 0). */
  kerf?: number;
  /** Omit the lid (open tray). Default true. */
  openTop?: boolean;
  /** Gap between laid-out panels in mm (default 8). */
  gapMm?: number;
  op?: OpParams;
}

export interface BoxResult {
  design: Design;
  panels: string[];
  summary: string;
}

type Role = "tab" | "slot" | "flat";
interface EdgeSpec {
  role: Role;
}

const DEFAULT_OP: OpParams = { type: "cut", power_pct: 100, speed_mm_s: 10, passes: 1 };

export function generateBox(opts: BoxOptions): BoxResult {
  const { width: W, depth: D, height: H, thickness: t } = opts;
  if ([W, D, H, t].some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new Error("width, depth, height, thickness must all be positive numbers.");
  }
  const finger = opts.finger ?? Math.max(3 * t, 8);
  const kerf = opts.kerf ?? 0;
  const openTop = opts.openTop ?? true;
  const gap = opts.gapMm ?? 8;
  const op = opts.op ?? DEFAULT_OP;

  const fingersFor = (len: number): number =>
    Math.max(1, Math.round((len / finger - 1) / 2));

  // Panels, each as a local polygon (origin ~0,0 after normalization).
  // Edge order for panel(): bottom, right, top, left (CCW rectangle).
  const panels: Array<{ name: string; points: Array<[number, number]> }> = [];

  // Base (W x D): all edges = tab.
  panels.push({
    name: "base",
    points: panel(W, D, t, kerf, {
      bottom: { role: "tab" },
      right: { role: "tab" },
      top: { role: "tab" },
      left: { role: "tab" }
    }, fingersFor)
  });

  // Front & Back (W x H): bottom edge = slot; left/right = tab; top = flat.
  for (const name of ["front", "back"]) {
    panels.push({
      name,
      points: panel(W, H, t, kerf, {
        bottom: { role: "slot" },
        right: { role: "tab" },
        top: { role: "flat" },
        left: { role: "tab" }
      }, fingersFor)
    });
  }

  // Left & Right (D x H): bottom edge = slot; left/right = slot (mate front/back tabs); top = flat.
  for (const name of ["left", "right"]) {
    panels.push({
      name,
      points: panel(D, H, t, kerf, {
        bottom: { role: "slot" },
        right: { role: "slot" },
        top: { role: "flat" },
        left: { role: "slot" }
      }, fingersFor)
    });
  }

  if (!openTop) {
    // Lid (W x D): all edges = slot to drop over the wall tops (simple captive lid).
    panels.push({
      name: "lid",
      points: panel(W, D, t, kerf, {
        bottom: { role: "slot" },
        right: { role: "slot" },
        top: { role: "slot" },
        left: { role: "slot" }
      }, fingersFor)
    });
  }

  // Lay panels out in a column, normalized so each starts at (0,0).
  const shapes: PolyShape[] = [];
  let cursorY = gap;
  let maxW = 0;
  for (const p of panels) {
    const { pts, w, h } = normalize(p.points);
    const translated = pts.map(([x, y]) => [x + gap, y + cursorY] as [number, number]);
    shapes.push({ kind: "polygon", id: p.name, op, points: translated });
    cursorY += h + gap;
    maxW = Math.max(maxW, w);
  }

  const design: Design = {
    widthMm: Math.ceil(maxW + gap * 2),
    heightMm: Math.ceil(cursorY),
    units: "mm",
    shapes,
    meta: {
      title: `Finger-joint box ${W}x${D}x${H}mm (t=${t})`,
      generator: "generateBox",
      notes: `finger=${finger}mm kerf=${kerf}mm openTop=${openTop}. Cut a test corner first.`
    }
  };

  const summary =
    `Finger-joint ${openTop ? "tray (open top)" : "box with lid"}: ` +
    `${panels.length} panels for ${W}x${D}x${H}mm in ${t}mm material ` +
    `(finger width ~${finger}mm, kerf ${kerf}mm).`;

  return { design, panels: panels.map((p) => p.name), summary };
}

/** Build a rectangular panel (w x h) with combed edges as a closed polygon. */
function panel(
  w: number,
  h: number,
  t: number,
  kerf: number,
  edges: { bottom: EdgeSpec; right: EdgeSpec; top: EdgeSpec; left: EdgeSpec },
  fingersFor: (len: number) => number
): Array<[number, number]> {
  const k = kerf / 2;
  // Corners of the nominal rectangle (kerf-expanded).
  const x0 = -k;
  const y0 = -k;
  const x1 = w + k;
  const y1 = h + k;

  const pts: Array<[number, number]> = [[x0, y0]];
  // bottom edge: (x0,y0)->(x1,y0), outward normal (0,-1)
  pushEdge(pts, x0, y0, x1, y0, 0, -1, t, edges.bottom, fingersFor(w));
  // right edge: (x1,y0)->(x1,y1), outward normal (1,0)
  pushEdge(pts, x1, y0, x1, y1, 1, 0, t, edges.right, fingersFor(h));
  // top edge: (x1,y1)->(x0,y1), outward normal (0,1)
  pushEdge(pts, x1, y1, x0, y1, 0, 1, t, edges.top, fingersFor(w));
  // left edge: (x0,y1)->(x0,y0), outward normal (-1,0)
  pushEdge(pts, x0, y1, x0, y0, -1, 0, t, edges.left, fingersFor(h));
  // Drop the duplicated closing point if present.
  if (pts.length > 1) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (first[0] === last[0] && first[1] === last[1]) pts.pop();
  }
  return pts;
}

function pushEdge(
  pts: Array<[number, number]>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  nx: number,
  ny: number,
  t: number,
  spec: EdgeSpec,
  fingers: number
): void {
  if (spec.role === "flat") {
    pts.push([bx, by]);
    return;
  }
  const depth = spec.role === "tab" ? t : -t;
  const segs = 2 * fingers + 1;
  const stepx = (bx - ax) / segs;
  const stepy = (by - ay) / segs;
  let cx = ax;
  let cy = ay;
  for (let i = 0; i < segs; i++) {
    const nX = cx + stepx;
    const nY = cy + stepy;
    if (i % 2 === 1) {
      // raised segment: out along normal, across, back to baseline
      pts.push([cx + nx * depth, cy + ny * depth]);
      pts.push([nX + nx * depth, nY + ny * depth]);
      pts.push([nX, nY]);
    } else {
      pts.push([nX, nY]);
    }
    cx = nX;
    cy = nY;
  }
}

function normalize(points: Array<[number, number]>): {
  pts: Array<[number, number]>;
  w: number;
  h: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pts = points.map(([x, y]) => [x - minX, y - minY] as [number, number]);
  return { pts, w: maxX - minX, h: maxY - minY };
}
