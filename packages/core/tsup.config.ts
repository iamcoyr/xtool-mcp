import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    data: "src/data/index.ts"
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // JSON data files are bundled into the output by esbuild's json loader,
  // so the published package is self-contained (works in Node and in Workers).
  loader: {
    ".json": "json"
  }
});
