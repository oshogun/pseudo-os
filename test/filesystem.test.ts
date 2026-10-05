import { describe, expect, it } from 'vitest';
import FileSystem, { FsError } from '../src/ts/fs/filesystem';

function fsWithTree() {
    const fs = new FileSystem();
    fs.createDirectory('/a/b', true);
    fs.writeFile('/a/b/file.txt', 'hello');
    return fs;
}

describe('FileSystem', () => {
    it('creates nested directories with parents', () => {
        const fs = fsWithTree();
        expect(fs.isDirectory('/a/b')).toBe(true);
        expect(fs.readFile('/a/b/file.txt')).toBe('hello');
    });

    it('reports missing parents', () => {
        const fs = new FileSystem();
        expect(() => fs.createDirectory('/x/y')).toThrow(FsError);
        expect(() => fs.writeFile('/x/y', '')).toThrow(/No such file/);
    });

    it('does not clobber an existing directory', () => {
        const fs = fsWithTree();
        expect(() => fs.createDirectory('/a')).toThrow(/File exists/);
        expect(() => fs.writeFile('/a', 'oops')).toThrow(/Is a directory/);
        expect(fs.readFile('/a/b/file.txt')).toBe('hello');
    });

    it('computes paths after moves', () => {
        const fs = fsWithTree();
        fs.move('/a/b', '/c');
        expect(fs.get('/c/file.txt').path).toBe('/c/file.txt');
        expect(fs.exists('/a/b')).toBe(false);
    });

    it('moves into a directory', () => {
        const fs = fsWithTree();
        fs.createDirectory('/dest');
        fs.move('/a/b/file.txt', '/dest');
        expect(fs.readFile('/dest/file.txt')).toBe('hello');
    });

    it('refuses to move a directory into itself', () => {
        const fs = fsWithTree();
        expect(() => fs.move('/a', '/a/b')).toThrow(/Invalid argument/);
    });

    it('copies recursively without sharing nodes', () => {
        const fs = fsWithTree();
        fs.copy('/a', '/copy', true);
        fs.writeFile('/copy/b/file.txt', 'changed');
        expect(fs.readFile('/a/b/file.txt')).toBe('hello');
    });

    it('requires recursive removal for non-empty directories', () => {
        const fs = fsWithTree();
        expect(() => fs.remove('/a')).toThrow(/not empty/);
        fs.remove('/a', true);
        expect(fs.exists('/a')).toBe(false);
    });

    it('leaves a removed current directory', () => {
        const fs = fsWithTree();
        fs.changeDirectory('/a/b');
        fs.remove('/a', true);
        expect(fs.cwd).toBe('/');
    });

    it('round-trips through serialization', () => {
        const fs = fsWithTree();
        fs.changeDirectory('/a');
        const copy = FileSystem.deserialize(JSON.parse(JSON.stringify(fs.serialize())));
        expect(copy.cwd).toBe('/a');
        expect(copy.readFile('b/file.txt')).toBe('hello');
    });
});
