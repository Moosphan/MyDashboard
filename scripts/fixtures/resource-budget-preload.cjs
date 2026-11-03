const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('syntheticPing', () => ipcRenderer.invoke('synthetic:ping'))
