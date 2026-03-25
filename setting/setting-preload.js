const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumaSettingsAPI', {
    openColorPicker: () => ipcRenderer.send('luma-open-color-picker'),
    onColorPicked: (callback) => ipcRenderer.on('luma-color-picked', (event, color) => callback(color))
});