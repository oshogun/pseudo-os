import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { complete } from '../src/ts/shell/complete';
import { createShell } from '../src/ts/system';

const program = (path: string) => new Uint8Array(readFileSync(join(__dirname, '..', path)));
const hello = program('src/programs/hello.wasm');

// A shell with the test programs installed in /bin.
function setup() {
    const shell = createShell(undefined, { hello });
    for (const name of ['wcat', 'sysinfo', 'wls', 'crash']) {
        shell.fs.writeFile(`/bin/${name}`, program(`test/fixtures/wasm/${name}.wasm`));
    }
    const run = (line: string) => shell.execute(line).output;
    return { shell, run };
}

describe('WebAssembly programs', () => {
    it('runs a C hello world from /bin', () => {
        const { shell } = setup();
        const result = shell.execute('hello');
        expect(result.output).toBe('Hello, world!\n');
        expect(result.exitCode).toBe(0);
    });

    it('pipes program output into builtins', () => {
        const { run } = setup();
        expect(run('hello | wc -c')).toBe('14\n');
        expect(run('hello > out.txt && cat out.txt')).toBe('Hello, world!\n');
    });

    it('reads files given as arguments, relative or absolute', () => {
        const { run } = setup();
        expect(run('wcat notes.txt')).toBe(run('cat notes.txt'));
        expect(run('wcat /etc/hostname')).toBe('pseudo-os\n');
        expect(run('cd documents && wcat ../notes.txt | head -n 1')).toBe('shopping list\n');
    });

    it('reads stdin', () => {
        const { run } = setup();
        expect(run('echo piped | wcat')).toBe('piped\n');
        expect(run('wcat < /etc/hostname')).toBe('pseudo-os\n');
    });

    it('reports errors from the C library on stderr', () => {
        const { shell } = setup();
        const result = shell.execute('wcat missing.txt');
        expect(result.output).toBe('wcat: missing.txt: No such file or directory\n');
        expect(result.chunks.every(c => c.error)).toBe(true);
        expect(result.exitCode).toBe(1);
    });

    it('passes arguments, environment, clock, randomness and exit code', () => {
        const { shell, run } = setup();
        const result = shell.execute('sysinfo 3 "two words"');
        expect(result.output).toBe([
            'argc=3', 'argv[0]=sysinfo', 'argv[1]=3', 'argv[2]=two words',
            'HOME=/home/user', 'time_ok=1', 'random_ok=1', 'cwd=/', '',
        ].join('\n'));
        expect(result.exitCode).toBe(3);
        expect(run('cat written.txt')).toBe('written by wasm\n');
        expect(run('echo $?')).toBe('0\n');
    });

    it('lists directories and renames and removes files', () => {
        const { run, shell } = setup();
        run('mkdir w && cd w && echo hello > a.txt && touch b.txt && mkdir sub');
        expect(run('wls')).toBe('f a.txt 6\nf b.txt 0\nd sub 0\n');
        expect(run('wls /home/user/w --shuffle')).toBe('f a.txt 6\nf b.txt 0\nd sub 0\n');
        expect(run('ls | cat')).toBe('made\nsub\n');
        expect(shell.fs.readFile('made/renamed.txt')).toBe('hello\n');
    });

    it('runs programs by path, and reports non-programs', () => {
        const { run, shell } = setup();
        run('cp /bin/hello ./greet');
        expect(run('./greet')).toBe('Hello, world!\n');
        const notProgram = shell.execute('./notes.txt');
        expect(notProgram.output).toBe('pseudo-sh: ./notes.txt: cannot execute: Exec format error\n');
        expect(notProgram.exitCode).toBe(126);
        expect(shell.execute('./nope').exitCode).toBe(127);
    });

    it('reports a crashing program', () => {
        const { shell } = setup();
        const result = shell.execute('crash');
        expect(result.output).toMatch(/^crash: crashed: /);
        expect(result.exitCode).toBe(134);
    });

    it('keeps binary files intact through save and restore', () => {
        const { shell } = setup();
        const restored = createShell(JSON.parse(JSON.stringify(shell.serialize())));
        expect(restored.fs.readBytes('/bin/wcat')).toEqual(shell.fs.readBytes('/bin/wcat'));
        expect(restored.execute('wcat /etc/hostname').output).toBe('pseudo-os\n');
    });

    it('shows real byte sizes', () => {
        const { run } = setup();
        expect(run('ls -l /bin/hello')).toMatch(new RegExp(` ${hello.length} .* /bin/hello\\n$`));
        expect(run('echo "héllo" > u.txt; wc -c u.txt')).toBe('7 u.txt\n');
    });

    it('finds programs with which and Tab completion', () => {
        const { run, shell } = setup();
        expect(run('which wcat')).toBe('/bin/wcat\n');
        expect(complete(shell, 'hel', 3).options).toEqual(['hello', 'help']);
    });
});
