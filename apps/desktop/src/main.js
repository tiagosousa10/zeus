"use strict";
const electron = require("electron");
const { app, BrowserWindow, nativeTheme, nativeImage, dialog } = electron;
const path = require("node:path");
const {
  createWindow,
  focusWindow,
} = require("./controllers/window-controller.js");
const { createDesktopRuntime } = require("./services/desktop-runtime.js");
const { installControls } = require("./controllers/ipc-controller.js");

app.setName("Zeus");
nativeTheme.themeSource = "dark";
app.setPath(
  "userData",
  process.env.ZEUS_DATA_DIR || path.join(app.getPath("appData"), "Zeus"),
);
process.env.ZEUS_DATA_DIR = app.getPath("userData");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disk-cache-size", String(64 * 1024 * 1024));
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on("second-instance", focusWindow);
let quitting = false;
let disposeControls = () => {};
const runtime = createDesktopRuntime({
  app,
  utilityProcess: electron.utilityProcess,
  onUnexpectedExit() {
    dialog.showErrorBox(
      "Zeus",
      "Um serviço local terminou. Volta a abrir a aplicação.",
    );
    app.quit();
  },
});
if (primary)
  app.whenReady().then(async () => {
    try {
      const frontendURL = await runtime.start();
      disposeControls = installControls({
        ipcMain: electron.ipcMain,
        session: electron.session,
        powerSaveBlocker: electron.powerSaveBlocker,
        powerMonitor: electron.powerMonitor,
        onBattery: runtime.setBattery,
      });
      try {
        const icon = nativeImage.createFromPath(
          path.join(__dirname, "..", "build", "icon.png"),
        );
        if (!icon.isEmpty() && app.dock) app.dock.setIcon(icon);
      } catch {}
      createWindow(frontendURL);
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
          createWindow(frontendURL);
      });
    } catch (error) {
      dialog.showErrorBox("Zeus", error.message);
      app.quit();
    }
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  disposeControls();
  runtime.stop().finally(() => app.exit(0));
});
