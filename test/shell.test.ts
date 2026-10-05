import { describe, expect, it } from 'vitest';
import { createShell } from '../src/ts/system';
import { setup } from './helpers';

describe('shell', () => {
    it('starts in the home directory', () => {
        const { run, shell } = setup();
        expect(run('pwd')).toBe('/home/user\n');
        expect(shell.prompt).toBe('user@pseudo-os:~$ ');
    });

    it('feeds pipe output to stdin, not to arguments', () => {
        const { run } = setup();
        run('echo "one two" > f');
        expect(run('cat f | wc -w')).toBe('2\n');
        expect(run('echo hello | cat')).toBe('hello\n');
    });

    it('only prints the last stage of a pipeline', () => {
        const { run } = setup();
        expect(run('echo a | cat | cat')).toBe('a\n');
    });

    it('treats > inside quotes as text', () => {
        const { run, shell } = setup();
        expect(run('echo "a > b"')).toBe('a > b\n');
        expect(shell.fs.exists('b')).toBe(false);
    });

    it('creates the file when appending to a missing one', () => {
        const { run } = setup();
        run('echo one >> new.txt');
        run('echo two >> new.txt');
        expect(run('cat new.txt')).toBe('one\ntwo\n');
    });

    it('redirects stdin and stderr', () => {
        const { run } = setup();
        run('echo hi > in');
        expect(run('wc -c < in')).toBe('3\n');
        expect(run('cat missing 2> err')).toBe('');
        expect(run('cat err')).toBe('cat: missing: No such file or directory\n');
    });

    it('runs && and || based on exit codes', () => {
        const { run } = setup();
        expect(run('true && echo yes || echo no')).toBe('yes\n');
        expect(run('false && echo yes || echo no')).toBe('no\n');
        expect(run('false; echo $?')).toBe('1\n');
    });

    it('expands variables except in single quotes', () => {
        const { run } = setup();
        run('export NAME=world');
        expect(run('echo "hello $NAME" \'$NAME\' ${NAME}!')).toBe('hello world $NAME world!\n');
        expect(run('echo ~')).toBe('/home/user\n');
    });

    it('expands globs, and keeps unmatched ones literal', () => {
        const { run } = setup();
        run('mkdir g && cd g && touch a.txt b.txt c.md');
        expect(run('echo *.txt')).toBe('a.txt b.txt\n');
        expect(run('echo "*.txt"')).toBe('*.txt\n');
        expect(run('echo *.zip')).toBe('*.zip\n');
        expect(run('echo ../g/?.md')).toBe('../g/c.md\n');
    });

    it('reports unknown commands with exit code 127', () => {
        const { shell } = setup();
        const result = shell.execute('nope');
        expect(result.output).toBe('nope: command not found\n');
        expect(result.exitCode).toBe(127);
    });

    it('reports syntax errors', () => {
        const { shell } = setup();
        const result = shell.execute('ls ||');
        expect(result.output).toMatch(/syntax error/);
        expect(result.exitCode).toBe(2);
    });

    it('records history without consecutive duplicates', () => {
        const { run, shell } = setup();
        run('pwd');
        run('pwd');
        run('ls');
        expect(shell.history).toEqual(['pwd', 'ls']);
    });

    it('restores saved state', () => {
        const { run, shell } = setup();
        run('mkdir saved && cd saved && echo data > f && export X=1');
        const restored = createShell(JSON.parse(JSON.stringify(shell.serialize())));
        expect(restored.history).toEqual(shell.history);
        expect(restored.execute('pwd; cat f; echo $X').output).toBe('/home/user/saved\ndata\n1\n');
    });
});
