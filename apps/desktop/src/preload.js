const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("zeusApp", {
  isApp: true,
  keepAwake: (on) => ipcRenderer.send("keep-awake", !!on),
  cacheSize: () => ipcRenderer.invoke("cache-size"),
  clearCache: () => ipcRenderer.invoke("cache-clear"),
});
