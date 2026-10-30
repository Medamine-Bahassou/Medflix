const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetch: (url, form) => ipcRenderer.invoke('fetch', url, form),
  get: key => ipcRenderer.invoke('db:get', key),
  sources: epPath => ipcRenderer.invoke('sources', epPath),
  mirrors: url => ipcRenderer.invoke('mirrors', url),
  downloadLinks: epPath => ipcRenderer.invoke('download-links', epPath),
  download: (id, token, name, labels) => ipcRenderer.invoke('download', id, token, name, labels),
  downloadPages: (id, urls, folder, labels) => ipcRenderer.invoke('download-pages', id, urls, folder, labels),
  openDownloadPage: token => ipcRenderer.invoke('download-open', token),
  downloadCancel: id => ipcRenderer.send('download:cancel', id),
  downloadDelete: file => ipcRenderer.invoke('download:delete', file),
  onDownload: fn => ipcRenderer.on('download:progress', (_, p) => fn(p)),
  imgSrc: url => 'medimg://i/?u=' + encodeURIComponent(url), // disk-cached copy (main.js)
  fileSrc: file => 'file://' + file.split('/').map(encodeURIComponent).join('/'),
  stream: token => ipcRenderer.invoke('stream', token),
  player: (url, bounds, referrer) => ipcRenderer.send('player', url, bounds, referrer),
  playerVisible: v => ipcRenderer.send('player:visible', v),
  playerSnapshot: () => ipcRenderer.invoke('player:snapshot'),
  onPlayerBack: fn => ipcRenderer.on('player:back', fn),
  openExternal: url => ipcRenderer.send('open-external', url),
  titleBar: color => ipcRenderer.send('titlebar', color),
  set: (key, value) => ipcRenderer.invoke('db:set', key, value),
  feedback: fields => ipcRenderer.invoke('feedback', fields),
});
