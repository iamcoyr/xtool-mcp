# xtool-mcp

**An unofficial [Model Context Protocol](https://modelcontextprotocol.io) server, agent, and `llms.txt` for [xTool](https://www.xtool.com) laser machines** — so you can bring an xTool-savvy assistant into your design studio and the AI client of your choice.

> ⚠️ **Unofficial & safety notice.** Not affiliated with, endorsed by, or sponsored by xTool. Everything here — settings, generated `.xcs` files, project designs — is **guidance, not a guarantee**. Always test on scrap. **Never cut PVC/vinyl or chlorine-containing materials.** Never run a laser unattended. See [DISCLAIMER.md](./DISCLAIMER.md).

## What it does

- **Machine knowledge** — specs, work area, laser type, and supported software for the current xTool lineup (D1 family, S1, M1/M1 Ultra, F1/F1 Ultra/F2 series, P2/P3, MetalFab).
- **Material settings** — power/speed/passes/DPI starting points with **provenance, confidence, and safety caveats** — plus a "run a test grid" path when there's no good data.
- **Software & troubleshooting** — XCS vs Studio workflow help and symptom → cause → fix guidance.
- **Design generation** — produce cut-ready `.xcs` (and SVG): material **test grids**, **finger-joint boxes**, and **SVG → .xcs** conversion.
- **Runs anywhere** — one shared core, two entry points: a local **stdio** server (`npx xtool-mcp`) and a remote **Cloudflare Worker** (Streamable HTTP).

## Quick start

### Use the hosted remote server

Add this Streamable HTTP endpoint to any MCP client:

```
https://xtool-mcp.doublexl.workers.dev/mcp
```

### Run locally (stdio)

```json
{
  "mcpServers": {
    "xtool": { "command": "npx", "args": ["-y", "xtool-mcp"] }
  }
}
```

Drop that into Claude Desktop's `claude_desktop_config.json` or Cursor's `mcp.json`
(see [`agent/clients/`](./agent/clients/)), and paste [`agent/system-prompt.md`](./agent/system-prompt.md)
into your client's system-prompt field for the full "xTool laser assistant" persona.

## What's inside

### Tools
| Tool | Purpose |
|---|---|
| `list_machines` / `get_machine_specs` | Browse the machine catalog |
| `recommend_settings` | Power/speed/passes/DPI for a machine + material + thickness (with confidence + safety) |
| `search_knowledge` | Semantic/keyword search across machines, guides, troubleshooting, safety |
| `troubleshoot` | Likely causes and ordered fixes for a symptom |
| `generate_test_grid` | A `.xcs`/SVG grid varying two parameters (power vs speed) |
| `create_box` | Finger-joint box/tray panels as `.xcs`/SVG |
| `svg_to_xcs` | Convert an SVG into a cut-ready `.xcs` |
| `validate_xcs` | Check a `.xcs` for common structural problems |

### Resources
`xtool://machines`, `xtool://machines/{id}`, `xtool://materials`,
`xtool://troubleshooting`, `xtool://guides/{id}`, `xtool://safety`, `xtool://xcs-format`.

### Prompts
`dial_in_settings`, `design_finger_joint_box`, `convert_svg_to_project`,
`troubleshoot_issue`, `plan_beginner_project`, `material_safety_check`.

## The `.xcs` format

`.xcs` is xTool's project file. It's **community-reverse-engineered** (plain JSON;
shapes in `canvas[0].displays`; laser parameters in a parallel `device.data` Map keyed
by shape id). This project generates the well-trodden single-file JSON used by D1/F1-class
machines. **Open generated files in Studio/XCS and verify before running.** Full writeup:
[`docs/xcs-format.md`](./docs/xcs-format.md).

## Development

Requires Node ≥ 18 and pnpm.

```bash
pnpm install
pnpm build            # build core + stdio
pnpm typecheck
pnpm test
pnpm start:stdio      # run the local MCP server
pnpm dev:worker       # run the Cloudflare Worker locally
pnpm build:llms       # regenerate llms.txt / llms-full.txt
pnpm build:embeddings # (optional) precompute the Workers AI search index
```

Architecture: [`docs/architecture.md`](./docs/architecture.md) ·
Data model & how to contribute settings: [`docs/data-model.md`](./docs/data-model.md),
[CONTRIBUTING.md](./CONTRIBUTING.md).

### Deploy the Worker

```bash
cd packages/worker
pnpm dlx wrangler deploy   # deploys to xtool-mcp.<account>.workers.dev with an AI binding
```

The Worker also serves [`/llms.txt`](https://xtool-mcp.doublexl.workers.dev/llms.txt)
and `/llms-full.txt`, generated live from the knowledge base.

## Contributing

Material settings especially benefit from real-world data — see
[CONTRIBUTING.md](./CONTRIBUTING.md). Every settings row needs a source and an honest
confidence level.

## License

[MIT](./LICENSE). "xTool", "xTool Creative Space", and "xTool Studio" are trademarks of
their respective owners, used here only to describe compatibility.
