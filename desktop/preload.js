'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcs', {
  desktop: true,
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  retry: () => ipcRenderer.invoke('retry'),
  reset: () => ipcRenderer.invoke('reset'),
});
