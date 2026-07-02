// Launch the pet fully detached, so it keeps floating after you close the
// terminal — or quit VS Code — that started it.
//
// `npm start` runs Electron as a child of your shell, so it dies when the shell
// does (e.g. quitting VS Code kills its integrated terminal). Here we spawn it
// in its OWN session (detached) with no attached stdio, then let this launcher
// exit — the pet lives on until you quit it from its menu or `pkill Electron`.

const { spawn } = require('child_process');
const electron = require('electron'); // in plain Node this resolves to the electron binary path

const child = spawn(electron, ['.'], {
  cwd: __dirname,
  detached: true,   // new session (setsid) — no longer tied to this terminal
  stdio: 'ignore'   // don't hold the tty open
});
child.unref();      // let this launcher process exit; the pet keeps running

console.log(`🐾 Agent Pet launched detached (pid ${child.pid}). Safe to close this terminal / VS Code.`);
