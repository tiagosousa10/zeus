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
} = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("Zeus");
app.setPath("userData", path.join(app.getPath("appData"), "Zeus"));
let frontendURL = "http://127.0.0.1:4310/";
let apiProcess = null;
let apiOwned = false;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disk-cache-size", String(512 * 1024 * 1024));

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
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("did-finish-load", () => {
    // Ecrãs grandes: interface maior (Cmd +/− ajusta à mão)
    win.webContents.setZoomFactor(
      useSaved && saved.zoom
        ? saved.zoom
        : Math.min(1.4, Math.max(1, wa.width / 1440)),
    );
    // Os "semáforos" desenhados no HTML ficam escondidos (usamos os reais) e o cabeçalho arrasta a janela
    win.webContents.insertCSS(`
      [title="Controlos de Janela macOS"] { visibility: hidden; }
      header { -webkit-app-region: drag; }
      header button, header input, header select, header kbd, header a { -webkit-app-region: no-drag; }
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

app.whenReady().then(async () => {
  try {
    require("./scripts/local-config.cjs").ensureLocalConfig();
    // The API needs the saved local key to read member data on every launch.
    if (process.loadEnvFile && fs.existsSync(path.join(__dirname, ".env")))
      process.loadEnvFile(path.join(__dirname, ".env"));
    const response = await fetch("http://127.0.0.1:4310/api/health").catch(
      () => null,
    );
    if (response && response.ok) {
      const existingPage = await fetch("http://127.0.0.1:4310/").catch(
        () => null,
      );
      if (
        !existingPage ||
        !existingPage.headers.get("content-type")?.includes("text/html")
      )
        frontendURL = "http://127.0.0.1:5174/";
    }
    if (!response || !response.ok) {
      apiProcess = utilityProcess.fork(
        path.join(__dirname, "apps/api/dist/index.mjs"),
        [],
        {
          env: {
            ...process.env,
            PORT: "4310",
            ZEUS_WEB_ORIGIN: "http://127.0.0.1:4310",
            BETTER_AUTH_URL: "http://127.0.0.1:4310",
            ZEUS_WEB_DIST: path.join(__dirname, "apps/web/dist"),
            ZEUS_DATA_DIR: process.env.ZEUS_DATA_DIR,
          },
          serviceName: "Zeus API",
        },
      );
      apiOwned = true;
    }
    let ready = false;
    for (let i = 0; i < 80; i++) {
      const r = await fetch("http://127.0.0.1:4310/api/health").catch(
        () => null,
      );
      if (r && r.ok) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    if (!ready)
      throw new Error(
        "A API do Zeus não arrancou. Confirma que o PostgreSQL está ligado.",
      );
  } catch (e) {
    require("electron").dialog.showErrorBox("Zeus", e.message);
    app.quit();
    return;
  }
  const existingMotor = await fetch("http://127.0.0.1:11471/status", {
    headers: process.env.ZEUS_MOTOR_TOKEN
      ? { "X-Zeus-Motor-Token": process.env.ZEUS_MOTOR_TOKEN }
      : {},
  }).catch(() => null);
  if (!existingMotor || !existingMotor.ok)
    engine = utilityProcess.fork(
      path.join(__dirname, "engine-process.js"),
      [],
      {
        env: {
          ...process.env,
          MS_PORT: "11471",
          MS_FFMPEG: resolveFfmpeg() || "",
        },
        serviceName: "Zeus Motor",
      },
    );

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
      path.join(__dirname, "build", "icon.png"),
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
app.on("before-quit", () => {
  if (apiOwned && apiProcess) {
    try {
      apiProcess.kill();
    } catch {}
  }
  if (engine) {
    const e = engine;
    engine = null;
    try {
      e.postMessage("stop");
    } catch (x) {}
    setTimeout(() => {
      try {
        e.kill();
      } catch (x) {}
    }, 1500);
  }
});
