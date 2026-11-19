'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: 'win32', version: '1.2.0',
  minimize: () => ipcRenderer.invoke('desktop:window-control', 'minimize'),
  maximize: () => ipcRenderer.invoke('desktop:window-control', 'maximize'),
  close: () => ipcRenderer.invoke('desktop:window-control', 'close'),
  windowState: () => ipcRenderer.invoke('desktop:window-control', 'state'),
  pickAudio: kind => ipcRenderer.invoke('desktop:pick-audio', kind),
  localLibrary: () => ipcRenderer.invoke('desktop:local-library'),
  removeLocal: id => ipcRenderer.invoke('desktop:remove-local', id),
  localDuration: (id, seconds) => ipcRenderer.invoke('desktop:local-duration', {id, seconds}),
  pickCover: () => ipcRenderer.invoke('desktop:pick-cover'),
  exportPlaylist: playlist => ipcRenderer.invoke('desktop:export-playlist', playlist),
  preferences: update => ipcRenderer.invoke('desktop:preferences', update),
  onMediaAction: callback => {
    if(typeof callback!=='function')return()=>{};
    const listener=(_event,action)=>{if(['play','next','previous'].includes(action))callback(action);};
    ipcRenderer.on('desktop:media-action',listener);
    return()=>ipcRenderer.removeListener('desktop:media-action',listener);
  },
  onWindowState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback({ maximized: state.maximized === true });
    ipcRenderer.on('desktop:window-state', listener);
    return () => ipcRenderer.removeListener('desktop:window-state', listener);
  }
});
