import { build } from "esbuild";
await build({
  entryPoints: ["apps/api/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  packages: "external",
  outfile: "apps/api/dist/index.mjs",
});
