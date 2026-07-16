/**
 * Generators for llms.txt and llms-full.txt from the knowledge base.
 * Served live by the Worker and written to disk by scripts/build-llms-txt.ts.
 */
import { machines, materials, guides, troubleshooting } from "./data/index.js";
import { XCS_FORMAT_REFERENCE } from "./mcp/resources.js";

const DEFAULT_BASE = "https://xtool-mcp.doublexl.workers.dev";

const TOOLS: Array<[string, string]> = [
  ["list_machines", "List xTool machines with category, power, and work area."],
  ["get_machine_specs", "Full spec for one machine by id/name."],
  ["recommend_settings", "Power/speed/passes/DPI starting point for a material (with confidence + safety caveats)."],
  ["search_knowledge", "Search machines, guides, troubleshooting, safety, and material notes."],
  ["troubleshoot", "Likely causes and fixes for a symptom."],
  ["generate_test_grid", "Generate a .xcs/SVG material test grid (power vs speed)."],
  ["create_box", "Generate finger-joint box panels as .xcs/SVG."],
  ["svg_to_xcs", "Convert an SVG into a cut-ready .xcs project."],
  ["validate_xcs", "Check a .xcs file for common structural problems."]
];

const PROMPTS: Array<[string, string]> = [
  ["dial_in_settings", "Find safe settings for a material via data + a test grid."],
  ["design_finger_joint_box", "Generate cut-ready panels for a box sized to your material."],
  ["convert_svg_to_project", "Turn an SVG into an .xcs with the right operation/settings."],
  ["troubleshoot_issue", "Diagnose a cutting/engraving/connection problem."],
  ["plan_beginner_project", "Get a beginner project for your machine and material."],
  ["material_safety_check", "Check whether a material is safe to laser."]
];

export function llmsTxt(base: string = DEFAULT_BASE): string {
  const lines: string[] = [];
  lines.push("# xtool-mcp");
  lines.push("");
  lines.push(
    "> Unofficial Model Context Protocol (MCP) server and knowledge base for xTool laser " +
      "cutters/engravers. Provides machine specs, material settings guidance, software help, " +
      "troubleshooting, and programmatic .xcs / SVG design generation for use with any AI client."
  );
  lines.push("");
  lines.push("Important: Not affiliated with or endorsed by xTool. All settings are starting points — test on scrap, never cut PVC/vinyl, never run a laser unattended. When this project and xTool's official docs disagree, follow xTool.");
  lines.push("");
  lines.push(`- Remote MCP endpoint (Streamable HTTP): ${base}/mcp`);
  lines.push(`- Local: \`npx xtool-mcp\` (stdio)`);
  lines.push("");

  lines.push("## Machines");
  for (const m of machines) {
    const power = m.laser_power_w.length ? `${m.laser_power_w.join("/")}W ` : "";
    lines.push(`- [${m.name}](${m.product_url ?? base}): ${power}${m.category} laser; software ${m.supported_software.join("/") || "n/a"}.`);
  }
  lines.push("");

  lines.push("## Guides");
  for (const g of guides) {
    lines.push(`- [${g.title}](${g.url ?? base}): ${g.summary ?? ""}`);
  }
  lines.push("");

  lines.push("## MCP tools");
  for (const [name, desc] of TOOLS) lines.push(`- \`${name}\`: ${desc}`);
  lines.push("");

  lines.push("## MCP prompts");
  for (const [name, desc] of PROMPTS) lines.push(`- \`${name}\`: ${desc}`);
  lines.push("");

  lines.push("## Data");
  lines.push(`- ${machines.length} machines, ${materials.length} material-settings rows, ${troubleshooting.length} troubleshooting entries.`);
  lines.push(`- Full detail: ${base}/llms-full.txt`);
  lines.push("");
  return lines.join("\n");
}

export function llmsFullTxt(base: string = DEFAULT_BASE): string {
  const lines: string[] = [llmsTxt(base), "", "---", ""];

  lines.push("## Machine details");
  for (const m of machines) {
    const wa = m.work_area_mm ? `${m.work_area_mm.width}x${m.work_area_mm.height} mm` : "n/a (no fixed bed)";
    lines.push(`### ${m.name} (\`${m.id}\`)`);
    lines.push(`- Category: ${m.category}; power ${m.laser_power_w.join("/") || "n/a"}W; work area ${wa}.`);
    lines.push(`- Software: ${m.supported_software.join(", ") || "n/a"}; connectivity ${m.connectivity.join(", ") || "n/a"}; driver ${m.driver ?? "n/a"}.`);
    if (m.key_features.length) lines.push(`- Features: ${m.key_features.join("; ")}`);
    lines.push("");
  }

  lines.push("## Material settings (starting points — verify on scrap)");
  lines.push("machine | laser | material | mm | op | power% | speed mm/s | passes | dpi | confidence");
  lines.push("--- | --- | --- | --- | --- | --- | --- | --- | --- | ---");
  for (const s of materials) {
    lines.push(
      `${s.machine} | ${s.laser_power_w ?? ""} | ${s.material} | ${s.thickness_mm ?? ""} | ${s.operation} | ` +
        `${s.power_pct ?? ""} | ${s.speed_mm_s ?? ""} | ${s.passes ?? ""} | ${s.dpi ?? ""} | ${s.confidence}`
    );
  }
  lines.push("");

  lines.push("## Troubleshooting");
  for (const t of troubleshooting) {
    lines.push(`### ${t.symptom}`);
    lines.push(`- Causes: ${t.causes.join("; ")}`);
    lines.push(`- Fixes: ${t.fixes.join("; ")}`);
    lines.push("");
  }

  for (const g of guides) {
    lines.push(`## ${g.title}`);
    lines.push(g.content);
    lines.push("");
  }

  lines.push("## .xcs format reference");
  lines.push(XCS_FORMAT_REFERENCE);
  lines.push("");
  return lines.join("\n");
}
