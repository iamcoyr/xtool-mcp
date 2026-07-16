import { describe, it, expect } from "vitest";
import {
  recommendSettings,
  listMachines,
  getMachine,
  generateTestGrid,
  generateBox,
  buildXcs,
  validateXcs,
  svgToDesign,
  emptyDesign,
  defaultKeywordBackend
} from "../src/index.js";

describe("machines", () => {
  it("loads the catalog and resolves by id/name", () => {
    expect(listMachines().length).toBeGreaterThan(5);
    expect(getMachine("P2")?.category).toBe("co2");
    expect(getMachine("xTool D1 Pro")?.id).toBe("d1-pro");
  });
});

describe("recommendSettings", () => {
  it("matches a wattage-labelled row to the catalog machine", () => {
    const r = recommendSettings({
      machine: "D1 Pro",
      material: "Basswood Plywood",
      thickness_mm: 3,
      operation: "cut"
    });
    expect(r.best).not.toBeNull();
    expect(r.best?.power_pct).toBeGreaterThan(0);
    expect(r.safety.some((s) => /scrap/i.test(s))).toBe(true);
    expect(r.safety.some((s) => /PVC/i.test(s))).toBe(true);
  });

  it("falls back to test-grid guidance when there's no data", () => {
    const r = recommendSettings({ machine: "D1 Pro", material: "unobtainium", operation: "cut" });
    expect(r.best).toBeNull();
    expect(r.guidance).toMatch(/test grid/i);
  });
});

describe("test grid", () => {
  it("produces the right number of cells and a legend", () => {
    const { design, legend } = generateTestGrid({
      xParam: "power",
      xValues: [100, 80, 60],
      yParam: "speed",
      yValues: [10, 20],
      operation: "engrave"
    });
    expect(legend.length).toBe(6);
    const rects = design.shapes.filter((s) => s.kind === "rect");
    expect(rects.length).toBe(6);
  });

  it("rejects identical axes", () => {
    expect(() =>
      generateTestGrid({ xParam: "power", xValues: [1], yParam: "power", yValues: [1] })
    ).toThrow();
  });
});

describe("finger-joint box", () => {
  it("emits five panels as polygons for an open tray", () => {
    const { design, panels } = generateBox({ width: 120, depth: 80, height: 40, thickness: 3 });
    expect(panels.length).toBe(5);
    expect(design.shapes.every((s) => s.kind === "polygon")).toBe(true);
    expect(design.widthMm).toBeGreaterThan(0);
  });
});

describe(".xcs build + validate", () => {
  it("builds a valid .xcs from a test grid", () => {
    const { design } = generateTestGrid({
      xParam: "power",
      xValues: [100, 80],
      yParam: "speed",
      yValues: [10, 20],
      operation: "engrave"
    });
    const built = buildXcs(design, { machine: "D1 Pro" });
    const v = validateXcs(built.json);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it("applies the CIRCLE scale=width/5900 invariant", () => {
    const d = emptyDesign(50, 50);
    d.shapes.push({
      kind: "ellipse",
      id: "c1",
      cx: 25,
      cy: 25,
      rx: 10,
      ry: 10,
      op: { type: "cut", power_pct: 100, speed_mm_s: 10, passes: 1 }
    });
    const built = buildXcs(d, { machine: "P2" });
    const canvas = (built.doc.canvas as Array<{ displays: Array<Record<string, unknown>> }>)[0];
    const disp = canvas!.displays[0]!;
    expect(disp.type).toBe("CIRCLE");
    const scale = disp.scale as { x: number };
    expect(scale.x).toBeCloseTo(20 / 5900, 6);
    expect(validateXcs(built.json).valid).toBe(true);
  });
});

describe("SVG import", () => {
  it("parses a rect from an SVG", () => {
    const design = svgToDesign(
      `<svg width="50mm" height="50mm" viewBox="0 0 50 50"><rect x="5" y="5" width="20" height="10"/></svg>`
    );
    expect(design.shapes.length).toBe(1);
    expect(design.shapes[0]?.kind).toBe("rect");
    expect(design.widthMm).toBe(50);
  });
});

describe("keyword search", () => {
  it("finds troubleshooting content", async () => {
    const kb = defaultKeywordBackend();
    const hits = await kb.search("laser not cutting through", 3);
    expect(hits.length).toBeGreaterThan(0);
  });
});
