import { build } from "esbuild";
await build({
  entryPoints: ["apps/api/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  outfile: "apps/api/dist/index.mjs",
});
