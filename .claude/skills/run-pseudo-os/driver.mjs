#!/usr/bin/env node
// Drives the pseudo-os browser terminal in headless Chromium over the Chrome
// DevTools Protocol. No npm dependencies: it needs Node >= 22 (global
// WebSocket) and a Chromium binary (Playwright's cached headless shell, or
// $CHROME).
//
// Reads one step per line from stdin and prints what the terminal printed:
//
//   node .claude/skills/run-pseudo-os/driver.mjs [--url URL] [--out DIR] [--profile DIR] <<'EOF'
//   run ls -l
//   screenshot
//   EOF
//
// Steps:
//   run <line>          type <line> into the prompt and press Enter
//   type <text>         type text into the prompt without submitting
//   press <key>         Enter, Tab, ArrowUp, ArrowDown, Escape, Ctrl+C, Ctrl+L
//   click <selector>    click an element (e.g. #reset; confirm() is auto-accepted)
//   drop <file>...      drop local files onto the page (copies into the cwd)
//   reload              reload the page (state comes back from IndexedDB)
//   screenshot [name]   save <out>/<name>.png (default: shot-N)
//   text                print the whole scrollback
//   input               print the current prompt input value
//   eval <js>           evaluate a JS expression in the page and print the result
//   wait <ms>           sleep
//   errors              print page exceptions / console errors seen so far
//   # ...               comment
//
// Exits 1 if the page threw or logged a console error, 2 on a driver failure.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
function option(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
}
const url = option('--url', 'http://localhost:3000');
const outDir = resolve(option('--out', join(tmpdir(), 'pseudo-os-shots')));
const keepProfile = option('--profile');

function findChrome() {
    if (process.env.CHROME) return process.env.CHROME;
    const cache = join(homedir(), '.cache', 'ms-playwright');
    const candidates = [];
    if (existsSync(cache)) {
        for (const dir of readdirSync(cache).sort().reverse()) {
            if (dir.startsWith('chromium_headless_shell-')) {
                candidates.push(join(cache, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
            } else if (dir.startsWith('chromium-')) {
                candidates.push(join(cache, dir, 'chrome-linux64', 'chrome'));
            }
        }
    }
    candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
    const found = candidates.find(existsSync);
    if (!found) {
        throw new Error('no Chromium found: run `npx -y playwright install chromium-headless-shell` or set CHROME=/path/to/chrome');
    }
    return found;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- launch --------------------------------------------------------------

const profile = keepProfile ? resolve(keepProfile) : mkdtempSync(join(tmpdir(), 'pseudo-os-profile-'));
mkdirSync(profile, { recursive: true });
mkdirSync(outDir, { recursive: true });

const chrome = spawn(findChrome(), [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--window-size=1100,700', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeLog = '';
const wsUrl = await new Promise((resolveWs, reject) => {
    const timer = setTimeout(() => reject(new Error('Chromium did not start:\n' + chromeLog)), 15000);
    chrome.stderr.on('data', data => {
        chromeLog += data;
        const m = chromeLog.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) {
            clearTimeout(timer);
            resolveWs(m[1]);
        }
    });
    chrome.on('exit', code => reject(new Error(`Chromium exited with ${code}:\n${chromeLog}`)));
});

// --- CDP plumbing --------------------------------------------------------

const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1;
const pending = new Map();
const listeners = [];
ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject: fail } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
        for (const l of listeners) l(msg);
    }
};
function send(method, params = {}, sessionId) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((ok, fail) => pending.set(id, { resolve: ok, reject: fail }));
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => send(method, params, sessionId);

const errors = [];
listeners.push(msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        errors.push('exception: ' + (d.exception?.description ?? d.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description).join(' '));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        // Network failures (e.g. Google Fonts offline) land here; they don't break the app.
        errors.push('log: ' + msg.params.entry.text + (msg.params.entry.url ? ` (${msg.params.entry.url})` : ''));
    } else if (msg.method === 'Page.javascriptDialogOpening') {
        console.log(`[dialog ${msg.params.type}] ${msg.params.message} -> accepted`);
        page('Page.handleJavaScriptDialog', { accept: true });
    }
});
await page('Page.enable');
await page('Runtime.enable');
await page('Log.enable');
await page('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false });

async function evaluate(expression) {
    const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
}

async function waitFor(expression, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        try {
            if (await evaluate(expression)) return;
        } catch { /* page still loading */ }
        await sleep(50);
    }
    throw new Error(`timed out waiting for: ${expression}`);
}

// Ready = the prompt is rendered and the motd has been printed. Don't wait
// on `load`: index.html pulls Google Fonts, which can hang without network.
const READY = `!!document.getElementById('prompt')?.textContent && !!document.getElementById('scrollback')?.textContent`;
const scrollbackText = () => evaluate(`document.getElementById('scrollback').innerText`);

async function open() {
    const { errorText } = await page('Page.navigate', { url });
    if (errorText) throw new Error(`cannot load ${url}: ${errorText} (is the server running?)`);
    await waitFor(READY);
}

// --- keys ----------------------------------------------------------------

const KEYS = {
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
};

async function press(spec) {
    let modifiers = 0;
    let name = spec;
    const m = spec.match(/^Ctrl\+(\w)$/i);
    let event;
    if (m) {
        modifiers = 2;
        const ch = m[1].toLowerCase();
        event = { key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) };
    } else {
        event = KEYS[name];
        if (!event) throw new Error(`unknown key ${spec} (known: ${Object.keys(KEYS).join(', ')}, Ctrl+<letter>)`);
    }
    await page('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...event });
    await page('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...event, text: undefined });
}

async function focusInput() {
    await evaluate(`document.getElementById('input').focus()`);
}

// --- steps ---------------------------------------------------------------

let shot = 0;
let printed = 0;

// Prints whatever the scrollback gained since the last step.
async function flush() {
    const text = await scrollbackText();
    if (text.length < printed) printed = 0; // cleared (Ctrl+L, clear, reload)
    const fresh = text.slice(printed);
    if (fresh) process.stdout.write(fresh.endsWith('\n') ? fresh : fresh + '\n');
    printed = text.length;
}

const steps = {
    async run(line) {
        await focusInput();
        await evaluate(`document.getElementById('input').value = ''`);
        if (line) await page('Input.insertText', { text: line });
        await press('Enter');
        await flush();
    },
    async type(text) {
        await focusInput();
        await page('Input.insertText', { text });
    },
    async press(key) {
        await focusInput();
        await press(key);
        await flush();
    },
    async click(selector) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await sleep(100);
        await flush();
    },
    async drop(files) {
        const payload = files.split(/\s+/).filter(Boolean).map(f => ({
            name: basename(f),
            data: readFileSync(f).toString('base64'),
        }));
        await evaluate(`(() => {
            const dt = new DataTransfer();
            for (const f of ${JSON.stringify(payload)}) {
                const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
                dt.items.add(new File([bytes], f.name));
            }
            document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        })()`);
        await sleep(200); // the drop handler awaits file.arrayBuffer()
        await flush();
    },
    async reload() {
        await sleep(300); // let the queued IndexedDB save land first
        printed = 0;
        await open();
        await flush();
    },
    async screenshot(name) {
        const file = join(outDir, `${name || `shot-${++shot}`}.png`);
        const { data } = await page('Page.captureScreenshot', { format: 'png' });
        writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(`[screenshot] ${file}`);
    },
    async text() {
        process.stdout.write(await scrollbackText() + '\n');
    },
    async input() {
        console.log(`[input] ${JSON.stringify(await evaluate(`document.getElementById('input').value`))}`);
    },
    async eval(js) {
        console.log(JSON.stringify(await evaluate(js), null, 2));
    },
    async wait(ms) {
        await sleep(Number(ms) || 0);
    },
    async errors() {
        console.log(errors.length ? errors.join('\n') : '[no errors]');
    },
};

let failed = false;
try {
    await open();
    await flush();
    const input = readFileSync(0, 'utf8');
    for (const raw of input.split('\n')) {
        const line = raw.replace(/\r$/, '');
        if (!line.trim() || line.trimStart().startsWith('#')) continue;
        const [, cmd, rest = ''] = line.match(/^\s*(\S+)\s?(.*)$/);
        if (!steps[cmd]) throw new Error(`unknown step: ${cmd}`);
        await steps[cmd](rest);
    }
} catch (error) {
    console.error(`[driver] ${error.message}`);
    failed = true;
} finally {
    const appErrors = errors.filter(e => !e.startsWith('log: '));
    if (errors.length) console.error('[page errors]\n' + errors.join('\n'));
    ws.close();
    chrome.kill();
    if (!keepProfile) rmSync(profile, { recursive: true, force: true });
    process.exit(failed ? 2 : appErrors.length ? 1 : 0);
}
