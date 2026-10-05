import { describe, expect, it } from 'vitest';
import { complete } from '../src/ts/shell/complete';
import { setup } from './helpers';

const at = (shell: ReturnType<typeof setup>['shell'], line: string) => complete(shell, line, line.length);

describe('complete', () => {
    it('completes a unique command name', () => {
        const { shell } = setup();
        expect(at(shell, 'his').line).toBe('history ');
    });

    it('lists ambiguous command names', () => {
        const { shell } = setup();
        const result = at(shell, 'h');
        expect(result.line).toBe('h');
        expect(result.options).toEqual(['head', 'help', 'history', 'hostname']);
    });

    it('completes commands after a pipe', () => {
        const { shell } = setup();
        expect(at(shell, 'ls | gr').line).toBe('ls | grep ');
    });

    it('completes paths, adding / for directories', () => {
        const { shell } = setup();
        expect(at(shell, 'cat no').line).toBe('cat notes.txt ');
        expect(at(shell, 'cd doc').line).toBe('cd documents/');
        expect(at(shell, 'ls /e').line).toBe('ls /etc/');
        expect(at(shell, 'cat /etc/mo').line).toBe('cat /etc/motd ');
    });

    it('extends to the common prefix', () => {
        const { shell } = setup();
        shell.execute('touch report-1 report-2');
        const result = at(shell, 'cat rep');
        expect(result.line).toBe('cat report-');
        expect(result.options).toEqual(['report-1', 'report-2']);
    });

    it('keeps text after the cursor', () => {
        const { shell } = setup();
        const result = complete(shell, 'cat no | wc', 6);
        expect(result.line).toBe('cat notes.txt  | wc');
        expect(result.cursor).toBe(14);
    });
});
