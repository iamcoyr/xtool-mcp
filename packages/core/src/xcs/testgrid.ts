/**
 * Material test-grid generator.
 *
 * Produces a grid of cells that vary two laser parameters (typically power vs
 * speed). Burn it on scrap, then read the cell that gives the result you want.
 * This is the safe way to dial in settings for a material we have no data for.
 */
import { emptyDesign, type Design, type OpType, type Shape } from "./design.js";

export type GridParam = "power" | "speed";

export interface TestGridOptions {
  machine?: string;
  material?: string;
  operation?: OpType;
  /** Parameter varied left→right across columns. */
  xParam: GridParam;
  xValues: number[];
  /** Parameter varied top→bottom across rows. */
  yParam: GridParam;
  yValues: number[];
  cellSizeMm?: number;
  gapMm?: number;
  passes?: number;
  dpi?: number;
  /** Value for whichever of power/speed is not being varied. */
  fixedPowerPct?: number;
  fixedSpeedMmS?: number;
}

export interface TestGridCell {
  row: number;
  col: number;
  power_pct: number;
  speed_mm_s: number;
}

export interface TestGridResult {
  design: Design;
  legend: TestGridCell[];
  summary: string;
}

export function generateTestGrid(opts: TestGridOptions): TestGridResult {
  if (opts.xParam === opts.yParam) {
    throw new Error("xParam and yParam must differ (e.g. power vs speed).");
  }
  if (opts.xValues.length === 0 || opts.yValues.length === 0) {
    throw new Error("xValues and yValues must each have at least one entry.");
  }

  const cell = opts.cellSizeMm ?? 8;
  const gap = opts.gapMm ?? 4;
  const operation: OpType = opts.operation ?? "engrave";
  const passes = opts.passes ?? 1;
  const dpi = operation === "engrave" ? (opts.dpi ?? 300) : undefined;
  const labelPad = 14;
  const fontSize = 4;

  const cols = opts.xValues.length;
  const rows = opts.yValues.length;
  const step = cell + gap;

  const widthMm = labelPad + cols * step - gap + 6;
  const heightMm = labelPad + rows * step - gap + 6;

  const design = emptyDesign(widthMm, heightMm, {
    title: `Test grid: ${opts.material ?? "material"} (${operation})`,
    machine: opts.machine,
    material: opts.material,
    generator: "generateTestGrid",
    notes: `X=${opts.xParam}, Y=${opts.yParam}. Burn on scrap; read the best cell.`
  });

  const legend: TestGridCell[] = [];

  const resolve = (xv: number, yv: number): { power_pct: number; speed_mm_s: number } => {
    let power_pct = opts.fixedPowerPct ?? 100;
    let speed_mm_s = opts.fixedSpeedMmS ?? 100;
    if (opts.xParam === "power") power_pct = xv;
    if (opts.xParam === "speed") speed_mm_s = xv;
    if (opts.yParam === "power") power_pct = yv;
    if (opts.yParam === "speed") speed_mm_s = yv;
    return { power_pct, speed_mm_s };
  };

  // Axis title labels (engraved text).
  design.shapes.push(textShape(`x-title`, labelPad, fontSize + 1, `${opts.xParam} →`, fontSize));
  design.shapes.push(textShape(`y-title`, 1, labelPad + fontSize, `${opts.yParam}`, fontSize));

  opts.xValues.forEach((xv, col) => {
    design.shapes.push(
      textShape(`col-${col}`, labelPad + col * step + 1, labelPad - 3, String(xv), fontSize)
    );
  });
  opts.yValues.forEach((yv, row) => {
    design.shapes.push(
      textShape(`row-${row}`, 1, labelPad + row * step + cell / 2, String(yv), fontSize)
    );
  });

  opts.yValues.forEach((yv, row) => {
    opts.xValues.forEach((xv, col) => {
      const { power_pct, speed_mm_s } = resolve(xv, yv);
      legend.push({ row, col, power_pct, speed_mm_s });
      const shape: Shape = {
        kind: "rect",
        id: `cell-${row}-${col}`,
        x: labelPad + col * step,
        y: labelPad + row * step,
        width: cell,
        height: cell,
        op: { type: operation, power_pct, speed_mm_s, passes, ...(dpi != null ? { dpi } : {}) }
      };
      design.shapes.push(shape);
    });
  });

  const summary =
    `${rows}x${cols} test grid (${rows * cols} cells). ` +
    `X axis = ${opts.xParam} [${opts.xValues.join(", ")}], ` +
    `Y axis = ${opts.yParam} [${opts.yValues.join(", ")}], ` +
    `operation=${operation}, passes=${passes}${dpi != null ? `, dpi=${dpi}` : ""}. ` +
    `Cut/engrave on scrap and pick the best cell.`;

  return { design, legend, summary };
}

function textShape(id: string, x: number, y: number, text: string, fontSize: number): Shape {
  return {
    kind: "text",
    id,
    x,
    y,
    text,
    fontSize,
    op: { type: "engrave", power_pct: 30, speed_mm_s: 200, passes: 1, dpi: 300 }
  };
}
