const { existsSync } = require("node:fs");
const { join } = require("node:path");
const {
  ensureLocalConfig: resolveConfig,
} = require("../../../packages/local-config/index.cjs");
function ensureLocalConfig({ loadEnv = true } = {}) {
  const envFile = join(__dirname, "..", "..", "..", ".env");
  if (loadEnv && process.loadEnvFile && existsSync(envFile))
    process.loadEnvFile(envFile);
  return resolveConfig();
}
module.exports = { ensureLocalConfig };
