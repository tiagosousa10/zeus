"use strict";
// Own the native controls and their lifecycle; the renderer only sees preload's narrow bridge.
function installControls({
  ipcMain,
  session,
  powerSaveBlocker,
  powerMonitor,
  onBattery,
}) {
  let awakeId = null;
  const releaseAwake = () => {
    if (awakeId === null) return;
    try {
      powerSaveBlocker.stop(awakeId);
    } catch {}
    awakeId = null;
  };
  const keepAwake = (_event, on) => {
    if (on && awakeId === null)
      awakeId = powerSaveBlocker.start("prevent-display-sleep");
    else if (!on) releaseAwake();
  };
  ipcMain.on("keep-awake", keepAwake);
  ipcMain.handle("cache-size", () =>
    session.defaultSession.getCacheSize().catch(() => 0),
  );
  ipcMain.handle("cache-clear", () =>
    session.defaultSession
      .clearCache()
      .then(() => true)
      .catch(() => false),
  );
  const batteryChanged = () => onBattery(powerMonitor.isOnBatteryPower());
  powerMonitor.on("on-battery", batteryChanged);
  powerMonitor.on("on-ac", batteryChanged);
  const timer = setTimeout(batteryChanged, 2500);
  return () => {
    clearTimeout(timer);
    releaseAwake();
    ipcMain.removeListener("keep-awake", keepAwake);
    ipcMain.removeHandler("cache-size");
    ipcMain.removeHandler("cache-clear");
    powerMonitor.removeListener("on-battery", batteryChanged);
    powerMonitor.removeListener("on-ac", batteryChanged);
  };
}
module.exports = { installControls };
