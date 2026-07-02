const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // nudge the window by a delta (dragging)
  move: (dx, dy) => ipcRenderer.send('pet-move', dx, dy),
  // set an absolute window position (autonomous wander — can't desync/stick)
  moveTo: (x, y) => ipcRenderer.send('pet-move-to', x, y),
  // where he can roam: { displays:[...], win:{x,y,w,h} }
  getLayout: () => ipcRenderer.sendSync('pet-layout'),
  // main pushes the current mood (your activity + Claude) every ~0.5s
  onMood: (cb) => ipcRenderer.on('pet-mood', (_e, m) => cb(m)),
  // main pushes the Claude status light: 'blocked' (red) | 'working' (yellow) | 'done' (green) | 'none'
  onStatus: (cb) => ipcRenderer.on('pet-status', (_e, s) => cb(s)),
  // grow the window while the chooser menu is open (so the whole menu fits), then shrink back
  menu: (open) => ipcRenderer.send('pet-menu', open)
});
