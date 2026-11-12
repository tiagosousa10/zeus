import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function main() {
  process.env.ZEUS_DEVELOPMENT = "1";
  require("../apps/desktop/src/local-config.cjs").ensureLocalConfig();
  const children: ChildProcess[] = [];
  function run(cmd: string, args: string[]) {
    const p = spawn(cmd, args, { stdio: "inherit" });
    children.push(p);
    p.on("exit", (code) => {
      if (code) console.error(`${cmd} terminou com código ${code}`);
    });
  }
  run(process.execPath, [
    "--env-file-if-exists=.env",
    "--import",
    "tsx",
    "apps/api/src/index.ts",
  ]);
  try {
    await fetch("http://127.0.0.1:11471/status", {
      signal: AbortSignal.timeout(1000),
    });
    console.log("Motor local já disponível.");
  } catch {
    run(process.execPath, ["apps/desktop/scripts/motor.cjs"]);
  }
  run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--config",
    "apps/web/vite.config.ts",
  ]);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      children.forEach((p) => p.kill(signal));
      process.exit(0);
    });
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
