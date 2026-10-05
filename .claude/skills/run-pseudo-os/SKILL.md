---
name: run-pseudo-os
description: Build, run, test and drive pseudo-os (the browser shell + in-memory filesystem + WASI runner). Use when asked to start pseudo-os, run shell commands in it, try a command or a .wasm program, check a change works in the real app, or take a screenshot of the browser terminal.
---

pseudo-os is a TypeScript shell that runs client-side in the browser, served
by a small Express server. Three handles, pick by what the change touches:

| Change touches | Use |
|---|---|
| `src/ts/commands/`, `shell/`, `fs/`, `wasi/`, `system.ts`, `programs.ts` (most PRs) | `sh.mjs` — runs lines against current `src/`, no build |
| `server.ts` / the HTTP API | `npm run build`, start server, `curl POST /execute` |
| `src/ts/client/`, `src/public/` (terminal UI, keys, drop, IndexedDB) | server + `driver.mjs` (headless Chromium, screenshots) |

All paths are relative to the repo root.

## Setup

```bash
npm install
```

Node 26 is what's installed here; the driver needs Node ≥ 22 (global
`WebSocket`). The browser driver needs a Chromium: it uses Playwright's cached
`~/.cache/ms-playwright/chromium_headless_shell-*` (present on this machine),
falling back to `chromium-*`, `/usr/bin/chromium`, or `$CHROME`. No
`chromium-cli`, no Playwright npm package needed.

**Ports and scratch.** Port 3000, the server's default, is msfslogger's live
server on this machine: always pass `PORT`. Use 3123 from the live checkout
and 3124 from a run clone (`.claude/ENVIRONMENT.md` § Ports). Keep temporary
files out of `/tmp`: `sh.mjs` and the driver use the OS temp dir, so export
`TMPDIR` first, in the same command as the work:

```bash
mkdir -p .claude/scratch/tmp && export TMPDIR=$PWD/.claude/scratch/tmp
```

## Run (agent path)

### Shell logic: `sh.mjs` (no server)

Bundles `src/ts/system.ts` + `src/ts/programs.ts` with esbuild on the fly
(~0.1s), so it always reflects your current source. Each argument is one line
in the same shell; exits with the last line's exit code.

```bash
node .claude/skills/run-pseudo-os/sh.mjs 'cd documents' 'ls -l' 'hello | wc -c'
printf 'ls\nwc -l notes.txt\n' | node .claude/skills/run-pseudo-os/sh.mjs
# --put copies a local file into ~ first (like dropping it on the page):
node .claude/skills/run-pseudo-os/sh.mjs --put test/fixtures/wasm/crash.wasm './crash.wasm; echo "exit=$?"'
```

### Server + curl

```bash
npm run build
PORT=3123 nohup node build/server.js > .claude/scratch/server-3123.log 2>&1 &
timeout 15 bash -c 'until curl -sf localhost:3123 >/dev/null; do sleep 0.3; done'
curl -s -X POST localhost:3123/execute -H 'Content-Type: application/json' \
     -d '{"command":"ls -l; hello; echo $?", "session":"agent"}' -D -
```

Exit code is in the `X-Exit-Code` header; add `-H 'Accept: application/json'`
for `{output, exitCode, cwd, prompt}`. Same `session` = same shell.

Stop it (don't `pkill -f`):

```bash
lsof -ti:3123 -sTCP:LISTEN | xargs -r kill
```

### Browser terminal: `driver.mjs`

With the server running (above), pipe steps to the driver. Each run uses a
fresh Chromium profile, so IndexedDB starts empty. It prints everything the
terminal prints.

```bash
node .claude/skills/run-pseudo-os/driver.mjs --url http://localhost:3123 <<'EOF'
run ls -l
run cat notes.txt | grep -n write
type ca
press Tab
input
press Ctrl+C
drop test/fixtures/wasm/wls.wasm
run ./wls.wasm
run mkdir -p projects/demo && echo "hi $USER" > projects/demo/hello.txt
screenshot flow
reload
run cat projects/demo/hello.txt
click #reset
run ls
screenshot after-reset
errors
EOF
```

Screenshots → `$TMPDIR/pseudo-os-shots/<name>.png`, or `--out DIR` (a run
puts them in `.claude/scratch/<run-id>/shots`).
Open them with Read to check. `--profile DIR` keeps the Chromium profile
(and IndexedDB state) between driver runs. Exit: 0 ok, 1 page threw or
logged `console.error`, 2 driver failure (bad step, timeout, server down).

| step | does |
|---|---|
| `run <line>` | type the line in the prompt, press Enter |
| `type <text>` | type without submitting |
| `press <key>` | `Enter Tab ArrowUp ArrowDown Escape Backspace Ctrl+<letter>` |
| `click <selector>` | click (`#reset`'s `confirm()` is auto-accepted) |
| `drop <file>...` | drop local files on the page → copied into the cwd |
| `reload` | reload; state comes back from IndexedDB |
| `screenshot [name]` | save PNG |
| `text` / `input` | print whole scrollback / current input value |
| `eval <js>` | evaluate in the page, print JSON result |
| `wait <ms>`, `errors`, `# comment` | |

## Run (human path)

```bash
PORT=3123 npm start   # builds, serves http://localhost:3123. Ctrl-C to stop.
                      # Without PORT it takes 3000 and fails with EADDRINUSE here.
```

## Test

```bash
npm test            # vitest: 7 files, 71 tests pass
npm run typecheck   # tsc --noEmit, clean
```

## Gotchas

- **The server runs `build/`, not `src/`.** `build/server.js` and
  `build/public/shell.js` are esbuild bundles: after editing source, rerun
  `npm run build` *and* restart the server, or curl/the driver test stale
  code. `sh.mjs` has no such step.
- **`.gitignore` contains `*.js`.** A helper named `foo.js` will silently not
  be committed; that's why these are `.mjs`.
- **The Reset button calls `confirm()`.** In a headless browser an unhandled
  dialog blocks the page; the driver auto-accepts and logs `[dialog confirm]`.
- **Don't wait for the `load` event.** `index.html` pulls Google Fonts; the
  driver waits for `#prompt` + motd instead. Font fetch failures are reported
  as `log:` lines and don't change the exit code.
- **Programs run synchronously on the page's main thread.** A looping `.wasm`
  freezes the page; the driver's next step will hang with it.
- **Rebuilding `.wasm` programs**: `WASI_SDK=$HOME/opt/wasi-sdk scripts/build-wasm.sh`
  (wasi-sdk 34, installed here). It rewrites all of them; the output is
  byte-identical for unchanged sources, so `git status` shows only real changes.

## Troubleshooting

- **`[driver] cannot load http://localhost:3999: net::ERR_CONNECTION_REFUSED`**:
  server not running on that port / wrong `--url` (default is `:3123`).
- **`no Chromium found`**: `npx -y playwright install chromium-headless-shell`
  (untested here — the browser was already cached) or set `CHROME=`.
