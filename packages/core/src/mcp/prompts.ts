import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function userPrompt(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "dial_in_settings",
    {
      title: "Dial in laser settings for a material",
      description: "Guided workflow to find safe cut/engrave settings for a material, using data + a test grid.",
      argsSchema: {
        machine: z.string().describe("Machine id or name, e.g. 'P2'."),
        material: z.string().describe("Material, e.g. '3mm baltic birch plywood'."),
        thickness_mm: z.string().optional().describe("Thickness in mm.")
      }
    },
    async ({ machine, material, thickness_mm }) =>
      userPrompt(
        `I'm using an xTool ${machine} and want to dial in settings for ${material}` +
          `${thickness_mm ? ` (${thickness_mm} mm)` : ""}.\n\n` +
          `1. Call recommend_settings for this machine/material/thickness and report the starting point with its confidence and safety caveats.\n` +
          `2. If confidence is low or there's no match, call generate_test_grid (power on one axis, speed on the other) sized for this machine, and explain how to burn it on scrap and read the best cell.\n` +
          `3. Remind me of the key safety rules for this material before I run anything.`
      )
  );

  server.registerPrompt(
    "design_finger_joint_box",
    {
      title: "Design a finger-joint box",
      description: "Generate cut-ready panels for a finger-joint box/tray sized to your material.",
      argsSchema: {
        machine: z.string().optional(),
        width_mm: z.string().describe("Outer width in mm."),
        depth_mm: z.string().describe("Outer depth in mm."),
        height_mm: z.string().describe("Outer height in mm."),
        thickness_mm: z.string().describe("Material thickness in mm.")
      }
    },
    async ({ machine, width_mm, depth_mm, height_mm, thickness_mm }) =>
      userPrompt(
        `Design a finger-joint box, outer ${width_mm}x${depth_mm}x${height_mm} mm, ` +
          `in ${thickness_mm} mm material${machine ? ` for my xTool ${machine}` : ""}.\n\n` +
          `Call create_box with those dimensions. Then recommend cut settings for the material via recommend_settings, ` +
          `and remind me to cut a single test corner before committing.`
      )
  );

  server.registerPrompt(
    "convert_svg_to_project",
    {
      title: "Convert an SVG to a cut-ready project",
      description: "Turn an SVG into an .xcs, assigning a laser operation and settings.",
      argsSchema: {
        machine: z.string().optional(),
        operation: z.string().optional().describe("cut, score, or engrave.")
      }
    },
    async ({ machine, operation }) =>
      userPrompt(
        `I'll paste an SVG. Convert it to an xTool .xcs${machine ? ` for my ${machine}` : ""} ` +
          `as a ${operation ?? "cut"} job using svg_to_xcs. First recommend appropriate power/speed/passes ` +
          `for my material, then generate the .xcs with those values and tell me to verify it in Studio before running.`
      )
  );

  server.registerPrompt(
    "troubleshoot_issue",
    {
      title: "Troubleshoot a laser problem",
      description: "Diagnose a cutting/engraving/connection problem and get fixes.",
      argsSchema: {
        symptom: z.string().describe("What's going wrong."),
        machine: z.string().optional()
      }
    },
    async ({ symptom, machine }) =>
      userPrompt(
        `My xTool${machine ? ` ${machine}` : ""} has this problem: ${symptom}.\n\n` +
          `Call troubleshoot (and search_knowledge if needed), then give me the most likely causes and a concrete, ordered set of fixes to try, safest first.`
      )
  );

  server.registerPrompt(
    "plan_beginner_project",
    {
      title: "Plan a beginner project",
      description: "Get a beginner-friendly first project for your machine and material.",
      argsSchema: {
        machine: z.string().describe("Machine id or name."),
        material: z.string().optional()
      }
    },
    async ({ machine, material }) =>
      userPrompt(
        `Suggest a good beginner project for my xTool ${machine}${material ? ` using ${material}` : ""}. ` +
          `Check the machine's specs and work area (get_machine_specs), recommend settings (recommend_settings), ` +
          `and if it's a simple cut, offer to generate the design (create_box or svg_to_xcs). Include the safety basics.`
      )
  );

  server.registerPrompt(
    "material_safety_check",
    {
      title: "Material safety check",
      description: "Check whether a material is safe to laser and how to do it safely.",
      argsSchema: { material: z.string().describe("The material you want to laser.") }
    },
    async ({ material }) =>
      userPrompt(
        `Is it safe to laser "${material}" on an xTool? Check the safety guidance (xtool://safety and search_knowledge). ` +
          `Explicitly warn me if it contains PVC/vinyl/chlorine or other hazards, and if it's safe, list ventilation, ` +
          `fire, and eye-protection precautions plus a note to test on scrap.`
      )
  );
}
