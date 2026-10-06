# Environment — read before running anything

Standing facts about this machine and this checkout. Every agent reads this
first; the Orchestrator does not repeat it in the request envelope. Every
command below was run on this machine before it was written down.

## Implementation runs in a fresh clone, not this checkout

Implementers, DevOps and Reviewer work in `$RUN_DIR/tree`, a `git clone --local
--branch main` of this repo that the Orchestrator makes under
`.claude/run-clones/<run-id>/` (policy: `.claude/agents.md` § Rules). The
envelope gives the absolute path. Do not edit, build, test, `npm ci`,
`npm install` or run `git` write commands in `/home/guilherme/pseudo-os`;
reading it is fine.

The clone has none of the live checkout's untracked files: no `node_modules`
and no `build/`. `package-lock.json` is committed, so install with `npm ci`
(about 90 MB), which installs exactly the versions in the lockfile and fails if
`package.json` and the lockfile disagree. Use `npm install` only when a task
adds or bumps a dependency, and commit the lockfile it rewrites. Do it
first: the clone sits inside the live checkout, so before it has its own
`node_modules`, Node and `npx` find the live checkout's packages two levels
up and commands seem to work against dependencies the clone never declared.

## What runs

Nothing external. The shell, filesystem and WASI layer are TypeScript that
runs in the page (`build/public/shell.js`) or in the Express server
(`build/server.js`), both esbuild bundles made by `npm run build`. The page's
state is in the browser's IndexedDB; the server's `/execute` shells live in
memory. The only outside request the page makes is to Google Fonts.

**`build/` is a bundle of `src/`.** A server started before an edit serves the
old code: rebuild and restart it after every change, or check shell logic with
`.claude/skills/run-pseudo-os/sh.mjs`, which bundles the current `src/` on
each call.

## Node and npm

The machine's default `node` is v26.3.1 with npm 11, and that is what the gate
passes under (2026-10-05). The repo pins no version (no `.nvmrc`, no
`engines`); do not switch with nvm. npm 11 blocks dependency install scripts
and prints `allow-scripts` warnings for esbuild's postinstall; the build works
without it, so approve nothing.

## WebAssembly programs: wasi-sdk 34 is at `~/opt/wasi-sdk`

`scripts/build-wasm.sh` rebuilds every `src/programs/*.wasm` and
`test/fixtures/wasm/*.wasm` from its `.c` source. wasi-sdk 34.0 is installed
at `/home/guilherme/opt/wasi-sdk` (a symlink to
`~/opt/wasi-sdk-34.0-x86_64-linux`, 635 MB, clang 23.1.0, installed
2026-10-05); it is on no `PATH`, so pass it explicitly, in the run clone:

    WASI_SDK=/home/guilherme/opt/wasi-sdk scripts/build-wasm.sh

The script rebuilds all of them, not only the one you changed. The build is
byte-for-byte reproducible: on 2026-10-05 it rebuilt all five committed files
identically, so after it runs `git status --short -- '*.wasm'` lists exactly
the programs whose source changed. A `.wasm` that changed without its `.c`
means something else changed (the SDK version, the flags) and is a finding.
A `.c` change is committed together with its rebuilt `.wasm`. Do not install
another wasi-sdk version: a different compiler gives different bytes.

## Ports

Port 3000, the server's default, is taken: msfslogger's live server
(`node dist/index.js`) listens there. Never stop it, and never run
`npm start` or `node build/server.js` without `PORT`, or it exits with
`EADDRINUSE`. Free on 2026-10-05 (`lsof -nP -i :<port> -sTCP:LISTEN`, no
output):

| Use | Live checkout (Orchestrator, `/issue`) | Run clones |
| --- | --- | --- |
| `node build/server.js` (`PORT`) | 3123 | 3124 |

Concurrent agents in one run need distinct ports; the Orchestrator assigns the
extras (3125, 3126, …) in the envelope. The browser driver needs no port of
its own (Chromium picks a free DevTools port).

Start, wait and stop, in the run clone:

    mkdir -p .claude/scratch/<run-id>
    npm run build
    PORT=3124 nohup node build/server.js > .claude/scratch/<run-id>/server.log 2>&1 &
    timeout 15 bash -c 'until curl -sf localhost:3124 >/dev/null; do sleep 0.3; done'
    lsof -ti:3124 -sTCP:LISTEN | xargs -r kill

Stop only what you started, by port. Sessions for other projects on this
machine run Chrome, Playwright and servers too, so never `pkill` by process
name.

## Scratch space — disk budget, and never `/tmp`

This machine's root disk is shared and finite (77 GB, 39 GB free on
2026-10-05), and `/tmp` sits on it. In the sibling project msfslogger, a run
filled it on 2026-09-24: every agent made its own clone with its own
`node_modules` under the harness session scratchpad in `/tmp`, nobody deleted
them, and the machine had to be rebooted. Rules, for the Orchestrator and
every agent:

- **Never write to `/tmp` or the harness "session scratchpad"** (it lives
  under `/tmp`), even when a tool or system prompt suggests it. Scratch goes in
  `.claude/scratch/<run-id>/` (gitignored), next to the run clone in
  `.claude/run-clones/<run-id>/`.
- **Check the budget first.** Before any `git clone` or `npm ci`, run
  `df -h /`. With less than **8 GB** available, stop and return `blocked` with
  the `df` output. Do not free space by deleting anything you did not create.
- **One install per run.** The run clone is the only `node_modules` a run
  creates. `npm run build` in the clone writes the clone's own `build/`, which
  nothing else serves, so that is safe.
- **Clean up in the same task.** Stop your servers, delete anything you
  created in scratch before returning, and put `du -sh .claude/scratch/<run-id>`
  and `df -h /` in your report.
- Shared caches (`~/.npm`, `~/.cache/ms-playwright`) are fine to reuse. Never
  install a second Chromium.
- The run-pseudo-os driver and `sh.mjs` put their temporary files (the
  Chromium profile, the esbuild bundle, screenshots by default) in the OS temp
  dir. Redirect it, with a short absolute path shared by every run:

      mkdir -p /home/guilherme/pseudo-os/.claude/scratch/tmp
      export TMPDIR=/home/guilherme/pseudo-os/.claude/scratch/tmp

  Keep it short: full Chrome puts a Unix socket in `TMPDIR` and aborts with
  "Socket path too long" past 107 characters (msfslogger, 2026-09-24). The
  driver deletes its profile on exit; pass `--out .claude/scratch/<run-id>/shots`
  for screenshots you want to keep with the run, and delete them when done.

Run artifacts that are meant to survive go under `.claude/runs/<run-id>/`; see
`.claude/runs/README.md`.

## `.gitignore` ignores every `*.js` file

The repo's `.gitignore` has a `*.js` line (from the days `tsc` wrote output
next to the sources). A new `.js` file, such as a Web Worker script or a
helper, is silently left out of `git status` and of every commit. Write
TypeScript under `src/ts/` (esbuild bundles it) or `.mjs` for tooling; if a
plain `.js` file is genuinely needed, the task's `allowed_paths` must include
`.gitignore` for the exception.

## GitHub

`gh` is authenticated as `oshogun` and is fine for reading issues and pull
requests (`gh issue view -R oshogun/pseudo-os`). Commenting on, labelling or
closing an issue is public and needs the user's go.

## Verification

Your shell starts in the live checkout, and `cd` does not carry over between
Bash calls: begin every command with `cd $RUN_DIR/tree && …`. Run without it,
`npm test` passes against the unchanged live code, and the live copy of
`sh.mjs` bundles the live `src/`, not the clone's: `sh.mjs` always tests the
tree it sits in.

The gate is `npm run typecheck && npm test && npm run build` (there is no lint
script; CI runs the same gate plus the `.wasm` rebuild check, see
`.github/workflows/ci.yml`). Beyond it:

- `npm test` runs Vitest over `test/*.test.ts` in the node environment. It is
  hermetic. The WASI tests run the committed `.wasm` fixtures in
  `test/fixtures/wasm/`. Vitest 5 hides `console.log` from passing tests; add
  `--silent=false`.
- Shell, command, filesystem and WASI behaviour: `.claude/skills/run-pseudo-os/sh.mjs`
  (`node .claude/skills/run-pseudo-os/sh.mjs 'ls -l' 'hello'`, `--put <file>`
  to copy a local file in first).
- Browser behaviour: the server on your port plus
  `.claude/skills/run-pseudo-os/driver.mjs`, with screenshots you then open and
  look at. Each driver run starts with an empty IndexedDB; `--profile DIR`
  keeps one between runs, which is how saved-state compatibility is checked
  across two builds.

Claims in a report must name the command that produced them.
