"use strict";
const { app, BrowserWindow, screen, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

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

function createWindow(frontendURL) {
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
      preload: path.join(__dirname, "..", "preload.js"),
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

  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === new URL(frontendURL).origin) return;
    } catch {}
    event.preventDefault();
  });
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) => {
      callback(
        permission === "fullscreen" &&
          contents?.getURL().startsWith(frontendURL + "/"),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin) => {
      return (
        permission === "fullscreen" && origin === new URL(frontendURL).origin
      );
    },
  );

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (useSaved && saved.max) win.maximize();
  win.on("close", () => saveWinState(win));
  win.loadURL(frontendURL);
}

function focusWindow() {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}
module.exports = { createWindow, focusWindow };
