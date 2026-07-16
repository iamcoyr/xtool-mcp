import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SearchBackend } from "../types.js";
import {
  getMachine,
  listMachines,
  recommendSettings,
  searchTroubleshooting
} from "../knowledge.js";
import {
  buildXcs,
  designToSvg,
  generateBox,
  generateTestGrid,
  svgToDesign,
  validateXcs,
  type OpType
} from "../xcs/index.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const asText = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }
  ]
});

const asError = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true
});

export interface ToolDeps {
  search: SearchBackend;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "list_machines",
    {
      title: "List xTool machines",
      description:
        "List the xTool laser machines in the knowledge base with their category, laser power options, and work area."
    },
    async () =>
      asText(
        listMachines().map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          laser_power_w: m.laser_power_w,
          work_area_mm: m.work_area_mm,
          software: m.supported_software
        }))
      )
  );

  server.registerTool(
    "get_machine_specs",
    {
      title: "Get xTool machine specs",
      description: "Get the full specification for one xTool machine by id or name (e.g. 'P2', 'd1-pro').",
      inputSchema: { machine: z.string().describe("Machine id or name, e.g. 'P2' or 'xTool D1 Pro'.") }
    },
    async ({ machine }) => {
      const m = getMachine(machine);
      if (!m) return asError(`No machine matching "${machine}". Use list_machines to see options.`);
      return asText(m);
    }
  );

  server.registerTool(
    "recommend_settings",
    {
      title: "Recommend laser settings",
      description:
        "Recommend power/speed/passes/DPI for a material on an xTool machine. Results are STARTING POINTS, " +
        "not guarantees — every result includes provenance, a confidence level, and safety caveats. " +
        "Always test on scrap. If no data matches, it tells you to run a test grid.",
      inputSchema: {
        machine: z.string().describe("Machine id or name, e.g. 'D1 Pro'."),
        material: z.string().describe("Material, e.g. 'basswood plywood', 'cast acrylic', 'leather'."),
        thickness_mm: z.number().optional().describe("Material thickness in mm."),
        operation: z.enum(["cut", "engrave", "score"]).optional(),
        laser_power_w: z.number().optional().describe("Installed laser module wattage.")
      }
    },
    async (args) => asText(recommendSettings(args))
  );

  server.registerTool(
    "search_knowledge",
    {
      title: "Search xTool knowledge",
      description:
        "Semantic/keyword search across xTool machine specs, software guides, troubleshooting, safety, and material notes.",
      inputSchema: {
        query: z.string().describe("What you want to know."),
        limit: z.number().int().min(1).max(20).optional()
      }
    },
    async ({ query, limit }) => {
      const hits = await deps.search.search(query, limit ?? 5);
      if (hits.length === 0) return asText(`No results for "${query}".`);
      return asText({ backend: deps.search.kind, results: hits });
    }
  );

  server.registerTool(
    "troubleshoot",
    {
      title: "Troubleshoot an xTool issue",
      description:
        "Find likely causes and fixes for a symptom (e.g. 'not cutting through', 'engraving too light', 'won't connect').",
      inputSchema: {
        symptom: z.string().describe("Describe what is going wrong."),
        machine: z.string().optional().describe("Machine id or name, if relevant.")
      }
    },
    async ({ symptom, machine }) => {
      const items = searchTroubleshooting(`${symptom} ${machine ?? ""}`.trim());
      if (items.length === 0) {
        return asText(`No troubleshooting entries matched "${symptom}". Try search_knowledge.`);
      }
      return asText(items);
    }
  );

  server.registerTool(
    "generate_test_grid",
    {
      title: "Generate a material test grid",
      description:
        "Generate a .xcs (and/or SVG) parameter test grid that varies two parameters (e.g. power vs speed). " +
        "Burn it on scrap and read the best cell to dial in settings for a new material.",
      inputSchema: {
        machine: z.string().optional(),
        material: z.string().optional(),
        operation: z.enum(["cut", "engrave", "score"]).optional(),
        xParam: z.enum(["power", "speed"]),
        xValues: z.array(z.number()).min(1),
        yParam: z.enum(["power", "speed"]),
        yValues: z.array(z.number()).min(1),
        cellSizeMm: z.number().optional(),
        gapMm: z.number().optional(),
        passes: z.number().int().optional(),
        dpi: z.number().int().optional(),
        fixedPowerPct: z.number().optional(),
        fixedSpeedMmS: z.number().optional(),
        format: z.enum(["xcs", "svg", "both"]).optional()
      }
    },
    async (args) => {
      try {
        const { design, legend, summary } = generateTestGrid(args);
        return asText(renderDesignResult(design, args.machine, summary, args.format ?? "xcs", { legend }));
      } catch (e) {
        return asError(`Could not generate test grid: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "create_box",
    {
      title: "Generate a finger-joint box",
      description:
        "Generate the flat cut panels for a finger-joint box/tray as a .xcs (and/or SVG). " +
        "Dimensions are outer size in mm. Cut a test corner first — fit depends on real kerf.",
      inputSchema: {
        width: z.number().positive(),
        depth: z.number().positive(),
        height: z.number().positive(),
        thickness: z.number().positive().describe("Material thickness in mm."),
        finger: z.number().positive().optional(),
        kerf: z.number().min(0).optional(),
        openTop: z.boolean().optional(),
        machine: z.string().optional(),
        power_pct: z.number().optional(),
        speed_mm_s: z.number().optional(),
        passes: z.number().int().optional(),
        format: z.enum(["xcs", "svg", "both"]).optional()
      }
    },
    async (args) => {
      try {
        const op = {
          type: "cut" as OpType,
          power_pct: args.power_pct ?? 100,
          speed_mm_s: args.speed_mm_s ?? 10,
          passes: args.passes ?? 1
        };
        const { design, summary } = generateBox({ ...args, op });
        return asText(renderDesignResult(design, args.machine, summary, args.format ?? "xcs"));
      } catch (e) {
        return asError(`Could not generate box: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "svg_to_xcs",
    {
      title: "Convert SVG to a cut-ready .xcs",
      description:
        "Convert an SVG document into an xTool .xcs project, applying one laser operation to all shapes. " +
        "Best for line art / vector cut or score jobs.",
      inputSchema: {
        svg: z.string().describe("The SVG document as a string."),
        machine: z.string().optional(),
        operation: z.enum(["cut", "engrave", "score"]).optional(),
        power_pct: z.number().optional(),
        speed_mm_s: z.number().optional(),
        passes: z.number().int().optional(),
        dpi: z.number().int().optional(),
        materialThicknessMm: z.number().optional()
      }
    },
    async (args) => {
      try {
        const op = {
          type: (args.operation ?? "cut") as OpType,
          power_pct: args.power_pct ?? (args.operation === "engrave" ? 40 : 100),
          speed_mm_s: args.speed_mm_s ?? (args.operation === "engrave" ? 200 : 10),
          passes: args.passes ?? 1,
          ...(args.dpi != null ? { dpi: args.dpi } : {})
        };
        const design = svgToDesign(args.svg, { defaultOp: op });
        if (design.shapes.length === 0) return asError("No shapes found in the SVG.");
        const built = buildXcs(design, {
          machine: args.machine,
          ...(args.materialThicknessMm != null ? { materialThicknessMm: args.materialThicknessMm } : {})
        });
        return asText(
          [
            `Converted ${design.shapes.length} shape(s) to .xcs for ${built.extName} (${built.extId}).`,
            built.warnings.length ? `Warnings: ${built.warnings.join(" ")}` : "",
            "Save the JSON below as a .xcs file and open it in xTool Studio/XCS. Verify before running.",
            "```json",
            built.json,
            "```"
          ]
            .filter(Boolean)
            .join("\n")
        );
      } catch (e) {
        return asError(`Could not convert SVG: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "validate_xcs",
    {
      title: "Validate a .xcs file",
      description:
        "Check a .xcs document for common structural problems (missing Map markers, display/processing id mismatch, CIRCLE scale invariant).",
      inputSchema: { xcs: z.string().describe("The .xcs file contents (JSON).") }
    },
    async ({ xcs }) => asText(validateXcs(xcs))
  );
}

function renderDesignResult(
  design: Parameters<typeof designToSvg>[0],
  machine: string | undefined,
  summary: string,
  format: "xcs" | "svg" | "both",
  extra?: { legend?: unknown }
): string {
  const parts: string[] = [summary];
  if (extra?.legend) {
    parts.push("Legend (row/col → power/speed):");
    parts.push("```json\n" + JSON.stringify(extra.legend, null, 2) + "\n```");
  }
  if (format === "xcs" || format === "both") {
    const built = buildXcs(design, { machine });
    if (built.warnings.length) parts.push(`Warnings: ${built.warnings.join(" ")}`);
    parts.push("Save as a `.xcs` file and open in xTool Studio/XCS (verify before running):");
    parts.push("```json\n" + built.json + "\n```");
  }
  if (format === "svg" || format === "both") {
    parts.push("SVG (import into XCS/Studio or any vector editor):");
    parts.push("```svg\n" + designToSvg(design) + "\n```");
  }
  return parts.join("\n\n");
}
