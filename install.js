#!/usr/bin/env node
/*
 * install.js — wire the desktop pet into Claude Code.
 *
 *   node install.js            install the hooks into ~/.claude/settings.json
 *   node install.js --remove   take them back out
 *
 * The hooks write the agent's state to a file the pet reads, so the pet can show
 * red (needs you) / yellow (working) / green (done). Installing globally means it
 * works in every project, not just this repo.
 *
 * Safe to re-run: it only ever touches its own hook entries and preserves the rest
 * of your settings. Point it at a different file with CLAUDE_PET_SETTINGS=... (used by tests).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const remove = process.argv.includes('--remove');
const SETTINGS = process.env.CLAUDE_PET_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const SET_STATE = path.join(__dirname, 'hooks', 'set-state.sh');

// event -> state word written to the pet's state file
const EVENTS = {
  SessionStart:     { matcher: '*',                state: 'idle'     },
  UserPromptSubmit: { matcher: '*',                state: 'thinking' },
  PreToolUse:       { matcher: '*',                state: 'working'  },
  PostToolUse:      { matcher: '*',                state: 'thinking' },
  Stop:             { matcher: '*',                state: 'done'     },
  PermissionRequest:{ matcher: '*',                state: 'blocked' },  // <- the reliable "needs you" signal (red)
  Notification:     { matcher: '*',                state: 'blocked' },  // secondary: catches idle "waiting for you" notifications
};

const isOurs = (group) =>
  Array.isArray(group.hooks) && group.hooks.some(h => typeof h.command === 'string' && h.command.includes(SET_STATE));

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return {};
    console.error(`\n✗ ${file} exists but isn't valid JSON — fix or remove it first.\n`);
    process.exit(1);
  }
}

function main() {
  const settings = load(SETTINGS);
  settings.hooks = settings.hooks || {};

  for (const [event, { matcher, state }] of Object.entries(EVENTS)) {
    // drop any of our previous entries so re-running never duplicates
    const kept = (settings.hooks[event] || []).filter(g => !isOurs(g));
    if (!remove) {
      kept.push({ matcher, hooks: [{ type: 'command', async: true, command: `"${SET_STATE}" ${state}` }] });
    }
    if (kept.length) settings.hooks[event] = kept; else delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  try { fs.chmodSync(SET_STATE, 0o755); } catch {}

  if (remove) {
    console.log(`\n✓ Removed the pet's hooks from ${SETTINGS}\n`);
  } else {
    console.log(`\n✓ Installed the pet's hooks into ${SETTINGS}`);
    console.log('  red = needs you · yellow = working · green = done\n');
    console.log('  Next:');
    console.log('    1) reload Claude Code hooks — open /hooks once, or restart Claude Code');
    console.log('    2) npm start   (launch the pet)\n');
  }
}

main();
