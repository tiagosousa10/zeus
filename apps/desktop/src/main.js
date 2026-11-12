"use strict";
const {
  app,
  BrowserWindow,
  session,
  shell,
  utilityProcess,
  screen,
  ipcMain,
  powerSaveBlocker,
  powerMonitor,
  nativeImage,
  nativeTheme,
} = require("electron");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..", "..", "..");

app.setName("Zeus");
nativeTheme.themeSource = "dark";
app.setPath(
  "userData",
  process.env.ZEUS_DATA_DIR || path.join(app.getPath("appData"), "Zeus"),
);
process.env.ZEUS_DATA_DIR = app.getPath("userData");
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
let frontendURL = "http://127.0.0.1:4310/";
let apiProcess = null;
let quitting = false;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disk-cache-size", String(64 * 1024 * 1024));

const STATE_FILE = () =>
  path.join(app.getPath("userData"), "window-state.json");
function loadWinState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
  } catch (e) {
    return null;
  }
}
function saveWinState(win) {
  try {
    const st = {
      bounds: win.getNormalBounds(),
      max: win.isMaximized(),
      zoom: win.webContents.getZoomFactor(),
      uiScaleVersion: 2,
    };
    fs.writeFileSync(STATE_FILE(), JSON.stringify(st));
  } catch (e) {}
}
function boundsVisible(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      b.x < a.x + a.width - 80 &&
      b.x + b.width > a.x + 80 &&
      b.y < a.y + a.height - 80 &&
      b.y + b.height > a.y + 40
    );
  });
}

let awakeId = null;
ipcMain.on("keep-awake", (_e, on) => {
  if (on && awakeId === null)
    awakeId = powerSaveBlocker.start("prevent-display-sleep");
  else if (!on && awakeId !== null) {
    try {
      powerSaveBlocker.stop(awakeId);
    } catch (x) {}
    awakeId = null;
  }
});
ipcMain.handle("cache-size", () =>
  session.defaultSession.getCacheSize().catch(() => 0),
);
ipcMain.handle("cache-clear", () =>
  session.defaultSession
    .clearCache()
    .then(() => true)
    .catch(() => false),
);

let engine = null;

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

function createWindow() {
  const wa = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  const saved = loadWinState();
  const useSaved = saved && saved.bounds && boundsVisible(saved.bounds);
  const b0 = useSaved
    ? saved.bounds
    : { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
  const win = new BrowserWindow({
    x: b0.x,
    y: b0.y,
    width: b0.width,
    height: b0.height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0f19",
    title: "Zeus",
    // Let macOS reserve the title bar outside web content, at every zoom level.
    titleBarStyle: "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("did-finish-load", () => {
    // Standard desktop density; Cmd +/− remains available.
    win.webContents.setZoomFactor(
      useSaved && saved.uiScaleVersion === 2 && saved.zoom ? saved.zoom : 1,
    );
    // macOS owns the title bar; page headers remain ordinary interactive content.
    win.webContents.insertCSS(`
      [title="Controlos de Janela macOS"] { visibility: hidden; }
    `);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (useSaved && saved.max) win.maximize();
  win.on("close", () => saveWinState(win));
  win.loadURL(frontendURL);
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
async function availablePort() {
  // Keep local invitation/recovery URLs valid across restarts of this profile.
  const portFile = path.join(app.getPath("userData"), "api-port.json");
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

if (primary)
  app.whenReady().then(async () => {
    try {
      // A packaged app uses its saved profile, never a .env from the Finder's working directory.
      require("./local-config.cjs").ensureLocalConfig({
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
        path.join(__dirname, "engine-process.js"),
        [],
        {
          env: {
            ...process.env,
            MS_PORT: "0",
            MS_FFMPEG: resolveFfmpeg() || "",
          },
          serviceName: "Zeus Motor",
        },
      );
      const motor = await waitReady(engine);
      const port = await availablePort();
      frontendURL = `http://127.0.0.1:${port}`;
      apiProcess = utilityProcess.fork(
        path.join(root, "apps/api/dist/index.mjs"),
        [],
        {
          env: {
            ...process.env,
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
          if (!quitting) {
            require("electron").dialog.showErrorBox(
              "Zeus",
              "Um serviço local terminou. Volta a abrir a aplicação.",
            );
            app.quit();
          }
        });
    } catch (error) {
      require("electron").dialog.showErrorBox("Zeus", error.message);
      app.quit();
      return;
    }
    // Com bateria: sem upload, para poupar energia e calor
    const sendBattery = () => {
      try {
        if (engine)
          engine.postMessage({ battery: powerMonitor.isOnBatteryPower() });
      } catch (e) {}
    };
    powerMonitor.on("on-battery", sendBattery);
    powerMonitor.on("on-ac", sendBattery);
    setTimeout(sendBattery, 2500);

    try {
      const icon = nativeImage.createFromPath(
        path.join(__dirname, "..", "build", "icon.png"),
      );
      if (!icon.isEmpty() && app.dock) app.dock.setIcon(icon);
    } catch (e) {}

    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

app.on("window-all-closed", () => {
  app.quit();
});
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  if (awakeId !== null) powerSaveBlocker.stop(awakeId);
  const stop = (child) =>
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
  Promise.all([stop(apiProcess), stop(engine)]).finally(() => app.exit(0));
});
