import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { machines, materials, troubleshooting, guides } from "../data/index.js";
import { getMachine, getGuide } from "../knowledge.js";

/** A trimmed, LLM-facing reference for the reverse-engineered .xcs format. */
export const XCS_FORMAT_REFERENCE = `# xTool .xcs format (reverse-engineered, community)

- \`.xcs\` is plain, uncompressed JSON (the newer \`.xs\` is a different zip bundle).
- Coordinates are millimeters; origin is the top-left of each shape's bounding box.
- Shapes ("displays") live in \`canvas[0].displays\`. Types: RECT, LINE, CIRCLE, PATH, PEN, TEXT, BITMAP. Vector geometry uses an SVG-\`d\`-style \`dPath\` string.
- CIRCLE must set \`scale = width / 5900\` or Studio renders it invisible.
- Laser parameters are NOT on the shape. They live in \`device.data\`, a JS Map serialized as \`{ "dataType": "Map", "value": [[canvasId, {...}]] }\` whose per-canvas object holds a nested \`displays\` Map keyed by shape id.
- processingType = the mode: VECTOR_CUTTING (cut), VECTOR_ENGRAVING (score/line engrave), COLOR_FILL_ENGRAVE / FILL_VECTOR_ENGRAVING (raster fill), INTAGLIO (relief), COLOR_ENGRAVE (bitmap).
- Parameter keys (under data.<TYPE>.parameter.customize): power, speed, repeat (= passes, NOT "passes"), processingLightSource ("blue"=diode, "red"=fiber/MOPA), pulseWidth (ns, fixed set), mopaFrequency (kHz); raster adds density + dpi.
- The machine is identified by top-level \`extId\` (model code, e.g. "D1") and \`extName\`.

This tool's \`build_xcs\` output targets the single-file JSON on the well-trodden D1/F1-class path. Always open the result in Studio/XCS and verify before running.`;

export function registerResources(server: McpServer): void {
  server.registerResource(
    "machines",
    "xtool://machines",
    {
      title: "xTool machine catalog",
      description: "All xTool machines in the knowledge base.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(machines, null, 2) }]
    })
  );

  server.registerResource(
    "machine",
    new ResourceTemplate("xtool://machines/{id}", { list: undefined }),
    {
      title: "xTool machine spec",
      description: "Full specification for a single xTool machine by id.",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const m = getMachine(id);
      if (!m) throw new Error(`No machine "${id}".`);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(m, null, 2) }] };
    }
  );

  server.registerResource(
    "materials",
    "xtool://materials",
    {
      title: "xTool material settings",
      description: "Community/official material settings rows with provenance and confidence.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(materials, null, 2) }]
    })
  );

  server.registerResource(
    "troubleshooting",
    "xtool://troubleshooting",
    {
      title: "xTool troubleshooting",
      description: "Symptom → cause → fix entries.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(troubleshooting, null, 2) }
      ]
    })
  );

  server.registerResource(
    "guide",
    new ResourceTemplate("xtool://guides/{id}", {
      list: async () => ({
        resources: guides.map((g) => ({
          uri: `xtool://guides/${g.id}`,
          name: g.title,
          mimeType: "text/markdown"
        }))
      })
    }),
    {
      title: "xTool guide",
      description: "A software/workflow/safety guide by id (e.g. 'xcs-vs-studio', 'laser-safety').",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const id = String(variables.id);
      const g = getGuide(id);
      if (!g) throw new Error(`No guide "${id}".`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: g.content }] };
    }
  );

  server.registerResource(
    "safety",
    "xtool://safety",
    {
      title: "Laser safety essentials",
      description: "Non-negotiable safety rules for operating an xTool laser.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      const g = getGuide("laser-safety");
      return {
        contents: [
          { uri: uri.href, mimeType: "text/markdown", text: g?.content ?? "Safety guide unavailable." }
        ]
      };
    }
  );

  server.registerResource(
    "xcs-format",
    "xtool://xcs-format",
    {
      title: ".xcs file format reference",
      description: "Reverse-engineered reference for the xTool .xcs project file format.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: XCS_FORMAT_REFERENCE }]
    })
  );
}
