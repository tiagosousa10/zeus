const {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");
const { randomBytes } = require("node:crypto");
function ensureLocalConfig({ loadEnv = true } = {}) {
  const envFile = join(__dirname, "..", "..", "..", ".env");
  if (loadEnv && process.loadEnvFile && existsSync(envFile))
    process.loadEnvFile(envFile);
  const dir =
    process.env.ZEUS_DATA_DIR ||
    join(
      process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support")
        : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
      "Zeus",
    );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [env, name] of [
    ["BETTER_AUTH_SECRET", "auth-secret"],
    ["ZEUS_ENCRYPTION_KEY", "encryption-key"],
    ["ZEUS_MOTOR_TOKEN", "motor-token"],
  ]) {
    const file = join(dir, name);
    const existing = existsSync(file)
      ? readFileSync(file, "utf8").trim()
      : null;
    const value =
      process.env[env] || existing || randomBytes(32).toString("hex");
    if (existing && process.env[env] && existing !== value)
      throw Error(
        `A chave ${env} não corresponde à configuração guardada. Preserva as chaves antigas para aceder aos dados Zeus.`,
      );
    if (!existing) writeFileSync(file, value, { mode: 0o600, flag: "wx" });
    process.env[env] = value;
  }
  process.env.ZEUS_DATA_DIR = dir;
  return dir;
}
module.exports = { ensureLocalConfig };
