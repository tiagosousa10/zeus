"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {
  serviceEnvironment,
} = require("../../../../packages/local-config/process-env.cjs");
const root = path.join(__dirname, "..", "..", "..", "..");
function resolveFfmpeg() {
  try {
    let p = require("ffmpeg-static");
    if (p && p.includes("app.asar"))
      p = p.replace("app.asar", "app.asar.unpacked");
    return p;
  } catch (e) {
    return null;
  }
}

function waitReady(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error("Um serviço local da Zeus não arrancou a tempo.")),
      30000,
    );
    const exit = () =>
      finish(
        new Error(
          "Não foi possível iniciar a Zeus. Confirma a migração dos dados antigos e tenta novamente.",
        ),
      );
    const message = (data) => {
      if (data?.ready) finish(null, data);
    };
    function finish(error, value) {
      clearTimeout(timeout);
      child.removeListener("exit", exit);
      child.removeListener("message", message);
      if (error) reject(error);
      else resolve(value);
    }
    child.on("exit", exit);
    child.on("message", message);
  });
}
async function availablePort(dataDir) {
  // Keep local invitation/recovery URLs valid across restarts of this profile.
  const portFile = path.join(dataDir, "api-port.json");
  let preferred = 0;
  if (fs.existsSync(portFile)) {
    preferred = JSON.parse(fs.readFileSync(portFile, "utf8")).port;
    if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65535)
      throw new Error("A configuração da porta local da Zeus é inválida.");
  }
  const server = require("node:net").createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(preferred, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  if (!preferred)
    fs.writeFileSync(portFile, JSON.stringify({ port }), { mode: 0o600 });
  return port;
}

const stopChild = (child) =>
  new Promise((resolve) => {
    if (!child?.pid) return resolve();
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    try {
      child.postMessage("stop");
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });

function createDesktopRuntime({ app, utilityProcess, onUnexpectedExit }) {
  let engine = null,
    apiProcess = null,
    stopping = false;
  return {
    async start() {
      // A packaged app uses its saved profile, never a .env from the Finder's working directory.
      require("../local-config.cjs").ensureLocalConfig({
        loadEnv: !app.isPackaged,
      });
      if (
        process.env.DATABASE_URL &&
        !fs.existsSync(
          process.env.ZEUS_DATABASE_PATH ||
            path.join(process.env.ZEUS_DATA_DIR, "zeus.sqlite"),
        )
      ) {
        throw new Error(
          "Os dados PostgreSQL ainda precisam de ser migrados. Na pasta do projecto executa npm run db:migrate; os dados originais serão preservados.",
        );
      }
      engine = utilityProcess.fork(
        path.join(__dirname, "..", "engine-process.js"),
        [],
        {
          env: {
            ...serviceEnvironment(["ZEUS_MOTOR_TOKEN"]),
            ZEUS_MOTOR_PORT: "0",
            ZEUS_MOTOR_FFMPEG: resolveFfmpeg() || "",
          },
          serviceName: "Zeus Motor",
        },
      );
      const motor = await waitReady(engine);
      const port = await availablePort(app.getPath("userData"));
      const frontendURL = `http://127.0.0.1:${port}`;
      apiProcess = utilityProcess.fork(
        path.join(root, "apps/api/dist/index.mjs"),
        [],
        {
          env: {
            ...serviceEnvironment([
              "ZEUS_DATA_DIR",
              "ZEUS_DATABASE_PATH",
              "BETTER_AUTH_SECRET",
              "ZEUS_ENCRYPTION_KEY",
              "ZEUS_MOTOR_TOKEN",
              "RESEND_API_KEY",
              "RESEND_FROM",
              "TURNSTILE_SITE_KEY",
              "TURNSTILE_SECRET_KEY",
            ]),
            PORT: String(port),
            ZEUS_WEB_ORIGIN: frontendURL,
            BETTER_AUTH_URL: frontendURL,
            ZEUS_WEB_DIST: path.join(root, "apps/web/dist"),
            ZEUS_MOTOR_URL: `http://127.0.0.1:${motor.port}`,
            ZEUS_FFMPEG_PATH: resolveFfmpeg() || "",
          },
          serviceName: "Zeus API",
        },
      );
      await waitReady(apiProcess);

      for (const child of [engine, apiProcess])
        child.on("exit", () => {
          if (!stopping) onUnexpectedExit();
        });
      return frontendURL;
    },
    setBattery(battery) {
      try {
        engine?.postMessage({ battery });
      } catch {}
    },
    async stop() {
      stopping = true;
      await Promise.all([stopChild(apiProcess), stopChild(engine)]);
    },
  };
}
module.exports = { createDesktopRuntime };
