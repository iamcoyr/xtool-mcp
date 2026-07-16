# Contributing to xtool-mcp

Thanks for helping build a better AI companion for xTool machines. This project
thrives on community-contributed data — especially **material settings**, which are
the hardest thing to get right and the most valuable to share.

## Ways to contribute

- **Material settings** — add or correct rows in `packages/core/src/data/materials.json`.
  Every row needs a `source_url`, a `confidence` level, and honest `notes`. Numbers you
  measured yourself are welcome; mark them `confidence: "community"` and describe your
  setup (machine revision, laser module, lens, air assist).
- **Machine specs** — `packages/core/src/data/machines.json`. Cite `sources`.
- **Guides & troubleshooting** — `guides.json` and `troubleshooting.json`. Synthesize
  and **link** to official sources; do not paste copyrighted text wholesale.
- **`.xcs` format** — the format is reverse-engineered. Improvements to
  `packages/core/src/xcs/` with round-trip test fixtures are especially valuable.

## Ground rules

1. **Safety first.** Never add settings for prohibited materials (PVC/vinyl, etc.)
   except to explicitly warn against them.
2. **Cite sources.** Data without provenance will not be merged.
3. **Be honest about confidence.** `high` = official published value; `medium` =
   derived/adjacent; `low`/`community` = community-reported or inferred.
4. **Keep it transport-agnostic.** Tool/resource/prompt logic lives in
   `packages/core`; the `stdio` and `worker` packages are thin entry points.

## Dev setup

```bash
pnpm install
pnpm build            # build all packages
pnpm typecheck
pnpm test
pnpm start:stdio      # run the local MCP server over stdio
pnpm dev:worker       # run the Cloudflare Worker locally
```

See `docs/` for architecture and the data model.
