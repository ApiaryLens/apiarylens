const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'apiaryLensDesktop',
  Object.freeze({
    runtimeStatus: () => ipcRenderer.invoke('apiarylens:runtime-status'),
    bootstrapOwner: (input) => ipcRenderer.invoke('apiarylens:bootstrap-owner', input),
    provisionDeviceOwner: () => ipcRenderer.invoke('apiarylens:provision-device-owner'),
    createStandaloneBackup: () => ipcRenderer.invoke('apiarylens:create-standalone-backup'),
    restoreStandaloneBackup: () => ipcRenderer.invoke('apiarylens:restore-standalone-backup'),
    migrateStandaloneToConnected: () =>
      ipcRenderer.invoke('apiarylens:migrate-standalone-to-connected'),
  }),
);
