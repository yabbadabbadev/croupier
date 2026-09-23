import { defineConfig } from "tsup";

export default defineConfig({
  entry: { plugin: "src/plugin.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
});
