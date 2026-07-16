# xtool-mcp v0.1.0

First public release — an **unofficial** Model Context Protocol (MCP) server, agent, and `llms.txt` for [xTool](https://www.xtool.com) laser machines. **Not affiliated with, endorsed by, or sponsored by xTool.**

## Highlights
- **MCP server for xTool**, usable from any MCP client (Claude Desktop, Cursor, ChatGPT, …) via two entry points that share one core:
  - **Local (stdio):** `npx xtool-mcp`
  - **Remote (Cloudflare Worker):** Streamable HTTP at `/mcp` (+ legacy `/sse`)
- **Knowledge base:** 14 machines, 58 material-settings rows (each with provenance, confidence, and safety caveats), 15 troubleshooting entries, and XCS-vs-Studio + laser-safety guides.
- **Design generation:** material **test grids**, **finger-joint boxes**, and **SVG → .xcs**, built on the community-reverse-engineered `.xcs` format (documented in `docs/xcs-format.md`).
- **Safety-first:** hard refusal for prohibited materials (PVC/vinyl/ABS/polycarbonate/PTFE/fiberglass/HDPE/foam) and a safety caveat on every recommendation.
- **Hosted `llms.txt` / `llms-full.txt`**, generated from the knowledge base.
- **Portable agent:** system prompt + Claude Desktop / Cursor configs in `agent/`.

## MCP surface
- **Tools:** `list_machines`, `get_machine_specs`, `recommend_settings`, `search_knowledge`, `troubleshoot`, `generate_test_grid`, `create_box`, `svg_to_xcs`, `validate_xcs`.
- **Resources:** `xtool://machines`, `xtool://machines/{id}`, `xtool://materials`, `xtool://troubleshooting`, `xtool://guides/{id}`, `xtool://safety`, `xtool://xcs-format`.
- **Prompts:** `dial_in_settings`, `design_finger_joint_box`, `convert_svg_to_project`, `troubleshoot_issue`, `plan_beginner_project`, `material_safety_check`.

## Install
- **Local:** add `{ "command": "npx", "args": ["-y", "xtool-mcp"] }` to your MCP client (`agent/clients/`).
- **Remote:** add `https://xtool-mcp.<your-workers-subdomain>.workers.dev/mcp`.

## Known limitations
- Material settings are **starting points** (community/official-sourced) — always test on scrap.
- `.xcs` output targets the single-file JSON format used by D1/F1-class machines; **open in Studio/XCS and verify before running**. Per-machine `extId` model codes are best-effort.
- **No machine control** — xTool has no official public API.
- The Workers AI embedding index for semantic search is optional; keyword search is the default and fallback.

## Safety
Never cut PVC/vinyl or chlorine-containing materials; ventilate; never run the laser unattended; use proper eye protection. When this project and xTool's official documentation disagree, follow xTool.

---
🤖 Built with Claude.
