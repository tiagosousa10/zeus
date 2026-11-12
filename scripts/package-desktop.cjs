const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const arch = args.includes("--x64")
  ? "x64"
  : args.includes("--arm64")
    ? "arm64"
    : process.arch;
if (process.platform !== "darwin" || arch !== process.arch) {
  throw new Error(
    "Gera o DMG num Mac da arquitectura pretendida; o FFmpeg incluído tem de corresponder. O workflow GitHub prepara Apple Silicon e Intel em runners próprios.",
  );
}
if (process.env.ZEUS_RELEASE === "1") {
  for (const name of [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]) {
    if (!process.env[name])
      throw new Error(`Credencial de distribuição em falta: ${name}`);
  }
}
const nativeMedia = spawnSync(
  "/usr/bin/lipo",
  [require("ffmpeg-static"), "-verify_arch", arch === "x64" ? "x86_64" : arch],
  { stdio: "ignore" },
);
if (nativeMedia.status !== 0)
  throw new Error(
    "O FFmpeg instalado não corresponde à arquitectura do DMG. Executa npm ci neste Mac antes de empacotar.",
  );
const result = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    "--config",
    "electron-builder.cjs",
    "--mac",
    "dmg",
    `--${arch}`,
    "--publish",
    "never",
  ],
  { stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
