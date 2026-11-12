const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('zeusApp', {
  isApp: true,
  engineUrl: 'http://127.0.0.1:11471',
  keepAwake: (on) => ipcRenderer.send('keep-awake', !!on),
  cacheSize: () => ipcRenderer.invoke('cache-size'),
  clearCache: () => ipcRenderer.invoke('cache-clear')
});
