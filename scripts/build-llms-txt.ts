/**
 * Write llms.txt and llms-full.txt to the repo root from the knowledge base.
 * Run: pnpm build:llms   (after `pnpm --filter @xtool-mcp/core build`)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { llmsTxt, llmsFullTxt } from "@xtool-mcp/core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

writeFileSync(join(root, "llms.txt"), llmsTxt() + "\n");
writeFileSync(join(root, "llms-full.txt"), llmsFullTxt() + "\n");

console.log("Wrote llms.txt and llms-full.txt");
