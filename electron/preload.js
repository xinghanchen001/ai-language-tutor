const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    onClipboardText: (callback) => ipcRenderer.on('clipboard-text', (event, text) => callback(text)),
    onClipboardTextExplanation: (callback) => ipcRenderer.on('clipboard-text-explanation', (event, text) => callback(text)),
    hideWindow: () => ipcRenderer.send('hide-window'),
});
