import { describe, expect, it } from 'vitest';
import { basename, dirname, resolve } from '../src/ts/fs/path';

describe('path', () => {
    it('resolves relative and absolute paths', () => {
        expect(resolve('/home/user', 'docs')).toBe('/home/user/docs');
        expect(resolve('/home/user', '../other/./x')).toBe('/home/other/x');
        expect(resolve('/home/user', '/etc//motd')).toBe('/etc/motd');
        expect(resolve('/', '../../..')).toBe('/');
    });

    it('splits names', () => {
        expect(basename('/a/b/c.txt')).toBe('c.txt');
        expect(basename('/')).toBe('/');
        expect(dirname('/a/b')).toBe('/a');
        expect(dirname('/a')).toBe('/');
        expect(dirname('a')).toBe('.');
    });
});
