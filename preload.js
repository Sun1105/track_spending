const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  listFiles: (dirPath) => ipcRenderer.invoke('list-files', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  // 保持现有的事件监听支持（如果以后需要）
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded with electronAPI');
});
