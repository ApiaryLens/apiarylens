const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'apiaryLensFirstRun',
  Object.freeze({
    choose: (mode) => ipcRenderer.invoke('apiarylens:first-run-choose', mode),
    confirmConnect: () => ipcRenderer.invoke('apiarylens:first-run-connect-confirm'),
    discardPreview: () => ipcRenderer.invoke('apiarylens:first-run-connect-discard'),
  }),
);
