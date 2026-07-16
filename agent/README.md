# The xTool agent

A portable "xTool laser assistant" you can drop into any MCP-capable AI client.
It pairs the system prompt in [`system-prompt.md`](./system-prompt.md) with the
`xtool-mcp` server (tools + resources + prompts).

## 1. Connect the MCP server

### Remote (hosted on Cloudflare Workers)

Add the Streamable HTTP endpoint to your client:

```
https://xtool-mcp.doublexl.workers.dev/mcp
```

### Local (stdio, via npx)

```json
{
  "mcpServers": {
    "xtool": {
      "command": "npx",
      "args": ["-y", "xtool-mcp"]
    }
  }
}
```

Client-specific config files are in [`clients/`](./clients/):
- `clients/claude_desktop_config.json` — Claude Desktop (stdio)
- `clients/cursor.mcp.json` — Cursor (remote or stdio)

## 2. Apply the system prompt

Paste [`system-prompt.md`](./system-prompt.md) into your client's custom-instructions
/ system-prompt field (Claude Projects, a Cursor rule, a ChatGPT custom GPT, etc.).

## 3. Try a prompt

The server ships MCP prompts you can invoke directly, e.g. **dial_in_settings**,
**design_finger_joint_box**, **convert_svg_to_project**, **troubleshoot_issue**,
**plan_beginner_project**, **material_safety_check**. Or just ask naturally:

> "I'm on an xTool P2 cutting 3mm cast acrylic — what settings should I start with,
> and is it safe?"

> "Design me a 120×80×40mm finger-joint box for 3mm plywood."
