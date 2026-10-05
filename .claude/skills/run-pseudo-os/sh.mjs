#!/usr/bin/env node
// Runs shell lines against the current src/ (no server, no build/ step):
// bundles src/ts/system.ts + src/ts/programs.ts with esbuild on the fly,
// creates a fresh shell with the bundled /bin programs, and executes each
// argument (or each stdin line) in order in that one shell.
//
//   node .claude/skills/run-pseudo-os/sh.mjs 'cd documents' 'ls -l' 'hello'
//   printf 'ls\nwc -l notes.txt\n' | node .claude/skills/run-pseudo-os/sh.mjs
//
// --put <local file> copies a local file into the home directory first
// (like dropping it on the page), e.g. a .wasm from test/fixtures/wasm/.
// Exits with the last line's exit code.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../../..');
const dir = mkdtempSync(join(tmpdir(), 'pseudo-os-sh-'));
const out = join(dir, 'shell.mjs');

await build({
    stdin: {
        contents: `export { createShell } from './src/ts/system'; export { programs } from './src/ts/programs';`,
        resolveDir: root,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.wasm': 'binary' },
    outfile: out,
    logLevel: 'error',
});
const { createShell, programs } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

const args = process.argv.slice(2);
const puts = [];
const lines = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--put') puts.push(args[++i]);
    else lines.push(args[i]);
}
if (lines.length === 0 && !process.stdin.isTTY) {
    lines.push(...readFileSync(0, 'utf8').split('\n').filter(l => l.trim()));
}

const shell = createShell(undefined, programs);
for (const file of puts) {
    shell.fs.writeFile(basename(file), new Uint8Array(readFileSync(file)));
}
let exitCode = 0;
for (const line of lines) {
    process.stdout.write(`${shell.prompt}${line}\n`);
    const result = shell.execute(line);
    process.stdout.write(result.output);
    exitCode = result.exitCode;
}
process.exit(exitCode);
