const { app, BrowserWindow, ipcMain, screen, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

// hooks write Claude's state here; we use it to override when Claude is busy
const STATE_FILE = process.env.CLAUDE_PET_STATE || '/tmp/claude-pet-state';

// bounding box that spans every display (for free roaming across monitors)
function overallBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of screen.getAllDisplays()) {
    const b = d.workArea;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// which display should hold the window at (x,y)? the one under its center, else the nearest one.
function workAreaFor(x, y) {
  const [w, h] = win.getSize();
  const cx = x + w / 2, cy = y + h / 2;
  const displays = screen.getAllDisplays();
  let nearest = displays[0].workArea, best = Infinity;
  for (const d of displays) {
    const b = d.workArea;
    if (cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height) return b;
    const dx = cx - (b.x + b.width / 2), dy = cy - (b.y + b.height / 2);
    const dist = dx * dx + dy * dy;
    if (dist < best) { best = dist; nearest = b; }
  }
  return nearest;
}

// clamp to real screen space: allow any spot that OVERLAPS a display (so he can straddle the seam
// while crossing between monitors), keep him inside the overall desktop, but if he'd come to rest
// FULLY inside the dead gap between monitors, snap him onto the nearest display.
function clamp(x, y) {
  const [w, h] = win.getSize();
  x = Math.round(x); y = Math.round(y);
  const overlaps = screen.getAllDisplays().some(d => {
    const b = d.workArea;
    return x < b.x + b.width && x + w > b.x && y < b.y + b.height && y + h > b.y;
  });
  if (overlaps) {
    const wa = overallBounds();
    return [Math.max(wa.x, Math.min(x, wa.x + wa.width - w)),
            Math.max(wa.y, Math.min(y, wa.y + wa.height - h))];
  }
  const b = workAreaFor(x, y);
  return [Math.max(b.x, Math.min(x, b.x + b.width - w)),
          Math.max(b.y, Math.min(y, b.y + b.height - h))];
}

// ---- the hooks write Claude's lifecycle here; read the last event + how long ago ----
function readState() {
  try {
    const st = fs.statSync(STATE_FILE);
    return { s: fs.readFileSync(STATE_FILE, 'utf8').trim(), age: Date.now() - st.mtimeMs };
  } catch { return { s: '', age: Infinity }; }
}

// A Claude turn is "active" while the file says working/thinking — the Stop hook overwrites it
// with "done" when I finish, so this stays true for the whole turn (even long no-tool stretches).
// The generous cap is only a crash-guard so a killed session doesn't glow forever.
const BUSY_MS = 15 * 60 * 1000;   // treat working/thinking as active for up to 15 min
function isBusy(s, age) { return (s === 'working' || s === 'thinking') && age < BUSY_MS; }

// ---- status light: red = needs you · yellow = working · green = just finished ----
function computeStatus() {
  const { s, age } = readState();
  if (s === 'blocked' && age < 30 * 60 * 1000) return 'blocked';         // needs permission — hold red up to 30 min
  if (isBusy(s, age))                          return 'working';         // yellow the whole time I'm on a turn
  if (s === 'done'    && age < 5  * 60 * 1000) return 'done';            // finished — green for a few minutes
  return 'none';                                                          // no active session -> no light
}

// ---- mood/animation: Claude drives it while busy, otherwise YOUR activity does ----
function computeMood() {
  const { s, age } = readState();
  // While a turn is active or waiting on you, NEVER fall through to sleep — the light must stay visible.
  if (isBusy(s, age))                          return 'working';
  if (s === 'blocked' && age < 30 * 60 * 1000) return 'idle';           // calm body; the red light does the talking
  if (s === 'done'    && age < 2500)           return 'done';            // brief celebration, then it settles
  const idle = powerMonitor.getSystemIdleTime();     // seconds since last keyboard/mouse input
  if (idle < 3)   return 'working';                  // you're typing / moving the cursor
  if (idle < 450) return 'idle';                     // present but paused -> calm, awake, roaming
  return 'sleep';                                     // away ~7.5 min (and Claude idle too) -> he naps
}

function startMoodLoop() {
  setInterval(() => {
    if (!win) return;
    win.webContents.send('pet-mood', computeMood());
    win.webContents.send('pet-status', computeStatus());
  }, 500);
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 165,
    height: 200,
    transparent: true,   // see-through page = floating pet
    frame: false,        // no title bar / chrome
    resizable: true,     // programmatic only (frameless = no user handles); lets the menu grow the window
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,   // float over other apps
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false   // let the preload use require('fs') to read the state file
    }
  });

  // float above everything, on every Space, and over other apps' full-screen mode
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  startMoodLoop();
}

app.whenReady().then(createWindow);

// renderer moves the window by a delta (dragging)
ipcMain.on('pet-move', (_e, dx, dy) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(...clamp(x + dx, y + dy));
});

// renderer sets an absolute position (autonomous wander) — absolute so it can't desync/stick mid-cross
ipcMain.on('pet-move-to', (_e, x, y) => {
  if (win) win.setPosition(...clamp(x, y));
});

// grow the window while the chooser menu is open so the whole menu fits, keeping the pet centered;
// shrink back to the small pet-sized window when it closes
const MENU_W = 220, MENU_H = 380;
let savedBounds = null;
ipcMain.on('pet-menu', (_e, open) => {
  if (!win) return;
  if (open) {
    if (!savedBounds) savedBounds = win.getBounds();
    const b = savedBounds, wa = overallBounds();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    win.setBounds({
      x: Math.max(wa.x, Math.min(Math.round(cx - MENU_W / 2), wa.x + wa.width  - MENU_W)),
      y: Math.max(wa.y, Math.min(Math.round(cy - MENU_H / 2), wa.y + wa.height - MENU_H)),
      width: MENU_W, height: MENU_H
    });
  } else if (savedBounds) {
    win.setBounds(savedBounds);
    savedBounds = null;
  }
});

// renderer asks where it can roam (every display's work area + current window box)
ipcMain.on('pet-layout', (e) => {
  if (!win) { e.returnValue = null; return; }
  const displays = screen.getAllDisplays().map(d => d.workArea);
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  e.returnValue = { displays, win: { x, y, w, h } };
});

app.on('window-all-closed', () => app.quit());
