/**
 * Neutral, format-independent design model.
 *
 * Tools build a `Design` (shapes + per-shape laser operation), then serialize it
 * to `.xcs` (see builder.ts) or `.svg` (see svg.ts). Keeping generation logic in
 * this neutral model means the fragile, reverse-engineered `.xcs` serialization
 * is isolated in one place.
 */

export type OpType = "cut" | "score" | "engrave";

export interface OpParams {
  type: OpType;
  /** Laser power percentage 0-100. */
  power_pct: number;
  /** Head speed mm/s. */
  speed_mm_s: number;
  passes: number;
  /** Engrave resolution (fill/raster only). */
  dpi?: number;
}

export interface ShapeBase {
  id: string;
  op: OpParams;
}

export interface RectShape extends ShapeBase {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}

export interface EllipseShape extends ShapeBase {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineShape extends ShapeBase {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PolyShape extends ShapeBase {
  kind: "polyline" | "polygon";
  points: Array<[number, number]>;
}

export interface PathShape extends ShapeBase {
  kind: "path";
  /** SVG path data. */
  d: string;
}

export interface TextShape extends ShapeBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | PolyShape
  | PathShape
  | TextShape;

export interface DesignMeta {
  title?: string;
  machine?: string;
  material?: string;
  notes?: string;
  generator?: string;
}

export interface Design {
  /** Canvas width in millimetres. */
  widthMm: number;
  /** Canvas height in millimetres. */
  heightMm: number;
  units: "mm";
  shapes: Shape[];
  meta?: DesignMeta;
}

export function emptyDesign(widthMm: number, heightMm: number, meta?: DesignMeta): Design {
  return { widthMm, heightMm, units: "mm", shapes: [], meta };
}

const n = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Convert any shape to an SVG path `d` string (used by both SVG and .xcs output). */
export function shapeToPathD(shape: Shape): string {
  switch (shape.kind) {
    case "rect": {
      const { x, y, width: w, height: h } = shape;
      return `M ${n(x)} ${n(y)} H ${n(x + w)} V ${n(y + h)} H ${n(x)} Z`;
    }
    case "ellipse": {
      const { cx, cy, rx, ry } = shape;
      return (
        `M ${n(cx - rx)} ${n(cy)} ` +
        `a ${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0 ` +
        `a ${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0 Z`
      );
    }
    case "line":
      return `M ${n(shape.x1)} ${n(shape.y1)} L ${n(shape.x2)} ${n(shape.y2)}`;
    case "polyline":
    case "polygon": {
      const pts = shape.points;
      if (pts.length === 0) return "";
      const [first, ...rest] = pts;
      let d = `M ${n(first![0])} ${n(first![1])}`;
      for (const p of rest) d += ` L ${n(p[0])} ${n(p[1])}`;
      if (shape.kind === "polygon") d += " Z";
      return d;
    }
    case "path":
      return shape.d;
    case "text":
      // Text is not a path; callers that need geometry should handle text separately.
      return "";
  }
}
