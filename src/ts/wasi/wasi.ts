// A WASI (wasi_snapshot_preview1) implementation backed by the pseudo-os
// filesystem. This is the "kernel" side of running a WebAssembly program:
// the program calls these functions for files, arguments, the clock and so on.

import Directory from "../fs/directory";
import File from "../fs/file";
import FileSystem, { FsError, FsErrorCode } from "../fs/filesystem";
import * as Path from "../fs/path";

// Error numbers from <wasi/wasip1.h>.
export const Errno = {
    SUCCESS: 0,
    BADF: 8,
    EXIST: 20,
    INVAL: 28,
    IO: 29,
    ISDIR: 31,
    NOENT: 44,
    NOSYS: 52,
    NOTDIR: 54,
    NOTEMPTY: 55,
    NOTSUP: 58,
    PERM: 63,
    SPIPE: 70,
} as const;

const fsErrno: { [code in FsErrorCode]: number } = {
    ENOENT: Errno.NOENT,
    ENOTDIR: Errno.NOTDIR,
    EISDIR: Errno.ISDIR,
    EEXIST: Errno.EXIST,
    ENOTEMPTY: Errno.NOTEMPTY,
    EINVAL: Errno.INVAL,
};

const FILETYPE_CHARACTER_DEVICE = 2;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;

const OFLAGS_CREAT = 1 << 0;
const OFLAGS_DIRECTORY = 1 << 1;
const OFLAGS_EXCL = 1 << 2;
const OFLAGS_TRUNC = 1 << 3;
const FDFLAGS_APPEND = 1 << 0;

const WHENCE_SET = 0;
const WHENCE_CUR = 1;
const WHENCE_END = 2;

const CLOCKID_REALTIME = 0;

// Every right; pseudo-os has no permissions.
const ALL_RIGHTS = 0x1fffffffn;

// Thrown by proc_exit to unwind out of the program.
export class WasiExit extends Error {
    code: number;

    constructor(code: number) {
        super(`exit ${code}`);
        this.code = code;
    }
}

type Descriptor =
    | { kind: 'stdin' }
    | { kind: 'stdout' | 'stderr' }
    | { kind: 'file'; node: File; offset: number; append: boolean }
    | { kind: 'dir'; node: Directory; preopen?: string };

export interface WasiOptions {
    fs: FileSystem;
    args: string[];
    env: { [name: string]: string };
    stdin: Uint8Array;
    stdout: (bytes: Uint8Array) => void;
    stderr: (bytes: Uint8Array) => void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class Wasi {
    private fs: FileSystem;
    private args: Uint8Array[];
    private env: Uint8Array[];
    private stdin: Uint8Array;
    private stdinOffset = 0;
    private stdout: (bytes: Uint8Array) => void;
    private stderr: (bytes: Uint8Array) => void;
    private fds = new Map<number, Descriptor>();
    private memory: WebAssembly.Memory | null = null;

    constructor(options: WasiOptions) {
        this.fs = options.fs;
        this.args = options.args.map(arg => encoder.encode(arg + '\0'));
        this.env = Object.entries(options.env).map(([k, v]) => encoder.encode(`${k}=${v}\0`));
        this.stdin = options.stdin;
        this.stdout = options.stdout;
        this.stderr = options.stderr;

        this.fds.set(0, { kind: 'stdin' });
        this.fds.set(1, { kind: 'stdout' });
        this.fds.set(2, { kind: 'stderr' });

        // wasi-libc strips the leading '/' from every path and matches it against
        // the preopened directories' names, longest first, so it can't tell
        // "/notes.txt" from "notes.txt". Preopening each top-level directory under
        // its absolute name, plus the working directory as ".", sends absolute
        // paths to the right place and other relative paths to the working
        // directory. A relative path that starts with a top-level directory name
        // (e.g. "etc/x" typed in your home directory) is misrouted.
        let fd = 3;
        for (const name of this.fs.root.list()) {
            const node = this.fs.root.getFile(name);
            if (node instanceof Directory) {
                this.fds.set(fd++, { kind: 'dir', node, preopen: `/${name}` });
            }
        }
        this.fds.set(fd, { kind: 'dir', node: this.fs.currentDirectory, preopen: '.' });
    }

    // Runs a WASI command module to completion and returns its exit code.
    run(module: WebAssembly.Module): number {
        const instance = new WebAssembly.Instance(module, this.imports(module));
        const memory = instance.exports.memory;
        const start = instance.exports._start;
        if (!(memory instanceof WebAssembly.Memory) || typeof start !== 'function') {
            throw new Error('not a WASI command (missing memory or _start export)');
        }
        this.memory = memory;
        try {
            start();
            return 0;
        } catch (error) {
            if (error instanceof WasiExit) {
                return error.code;
            }
            throw error;
        }
    }

    // The import object for `module`. Functions it imports that we don't
    // implement return ENOSYS instead of failing to link.
    imports(module: WebAssembly.Module): WebAssembly.Imports {
        const implemented = this.functions();
        const wasi: { [name: string]: Function } = {};
        for (const entry of WebAssembly.Module.imports(module)) {
            if (entry.module === 'wasi_snapshot_preview1' && entry.kind === 'function') {
                wasi[entry.name] = implemented[entry.name] ?? (() => Errno.NOSYS);
            }
        }
        return { wasi_snapshot_preview1: wasi };
    }

    private view(): DataView {
        return new DataView(this.memory!.buffer);
    }

    private bytes(ptr: number, len: number): Uint8Array<ArrayBuffer> {
        return new Uint8Array(this.memory!.buffer as ArrayBuffer, ptr, len);
    }

    private string(ptr: number, len: number): string {
        return decoder.decode(this.bytes(ptr, len));
    }

    // Copies null-terminated strings into memory: pointers at `ptrs`, data at `buf`.
    private writeStrings(items: Uint8Array[], ptrs: number, buf: number): number {
        const view = this.view();
        for (const item of items) {
            view.setUint32(ptrs, buf, true);
            this.bytes(buf, item.length).set(item);
            ptrs += 4;
            buf += item.length;
        }
        return Errno.SUCCESS;
    }

    private writeSizes(items: Uint8Array[], countPtr: number, sizePtr: number): number {
        const view = this.view();
        view.setUint32(countPtr, items.length, true);
        view.setUint32(sizePtr, items.reduce((n, item) => n + item.length, 0), true);
        return Errno.SUCCESS;
    }

    // Reads an array of iovecs as (pointer, length) pairs.
    private iovecs(ptr: number, count: number): [number, number][] {
        const view = this.view();
        const result: [number, number][] = [];
        for (let i = 0; i < count; i++) {
            result.push([view.getUint32(ptr + i * 8, true), view.getUint32(ptr + i * 8 + 4, true)]);
        }
        return result;
    }

    // Resolves a path relative to a directory descriptor to an absolute path.
    private resolve(dirfd: number, ptr: number, len: number): string | number {
        const dir = this.fds.get(dirfd);
        if (!dir) {
            return Errno.BADF;
        }
        if (dir.kind !== 'dir') {
            return Errno.NOTDIR;
        }
        return Path.resolve(dir.node.path, this.string(ptr, len));
    }

    private allocate(descriptor: Descriptor): number {
        let fd = 0;
        while (this.fds.has(fd)) {
            fd++;
        }
        this.fds.set(fd, descriptor);
        return fd;
    }

    private writeFilestat(ptr: number, node: File | null, filetype: number): void {
        const view = this.view();
        this.bytes(ptr, 64).fill(0);
        view.setUint8(ptr + 16, filetype);
        view.setBigUint64(ptr + 24, 1n, true);
        if (node) {
            const time = BigInt(node.modified) * 1_000_000n;
            view.setBigUint64(ptr + 32, BigInt(node instanceof Directory ? 0 : node.size), true);
            view.setBigUint64(ptr + 40, time, true);
            view.setBigUint64(ptr + 48, time, true);
            view.setBigUint64(ptr + 56, time, true);
        }
    }

    // Wraps a system call so filesystem errors become WASI error numbers.
    private guard<A extends unknown[]>(fn: (...args: A) => number): (...args: A) => number {
        return (...args: A) => {
            try {
                return fn(...args);
            } catch (error) {
                if (error instanceof FsError) {
                    return fsErrno[error.code];
                }
                throw error;
            }
        };
    }

    private functions(): { [name: string]: Function } {
        const g = this.guard.bind(this);
        return {
            args_sizes_get: (countPtr: number, sizePtr: number) => this.writeSizes(this.args, countPtr, sizePtr),
            args_get: (ptrs: number, buf: number) => this.writeStrings(this.args, ptrs, buf),
            environ_sizes_get: (countPtr: number, sizePtr: number) => this.writeSizes(this.env, countPtr, sizePtr),
            environ_get: (ptrs: number, buf: number) => this.writeStrings(this.env, ptrs, buf),

            clock_res_get: (_id: number, resPtr: number) => {
                this.view().setBigUint64(resPtr, 1000n, true);
                return Errno.SUCCESS;
            },
            clock_time_get: (id: number, _precision: bigint, timePtr: number) => {
                const ns = id === CLOCKID_REALTIME
                    ? BigInt(Date.now()) * 1_000_000n
                    : BigInt(Math.round(performance.now() * 1_000_000));
                this.view().setBigUint64(timePtr, ns, true);
                return Errno.SUCCESS;
            },

            random_get: (ptr: number, len: number) => {
                for (let i = 0; i < len; i += 65536) {
                    crypto.getRandomValues(this.bytes(ptr + i, Math.min(65536, len - i)));
                }
                return Errno.SUCCESS;
            },

            proc_exit: (code: number) => {
                throw new WasiExit(code);
            },

            sched_yield: () => Errno.SUCCESS,

            fd_write: g((fd: number, iovs: number, count: number, nwrittenPtr: number) => {
                const desc = this.fds.get(fd);
                if (!desc) {
                    return Errno.BADF;
                }
                const chunks = this.iovecs(iovs, count).map(([ptr, len]) => this.bytes(ptr, len).slice());
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const data = new Uint8Array(total);
                let pos = 0;
                for (const chunk of chunks) {
                    data.set(chunk, pos);
                    pos += chunk.length;
                }
                if (desc.kind === 'stdout') {
                    this.stdout(data);
                } else if (desc.kind === 'stderr') {
                    this.stderr(data);
                } else if (desc.kind === 'file') {
                    const old = desc.node.bytes;
                    const start = desc.append ? old.length : desc.offset;
                    const next = new Uint8Array(Math.max(old.length, start + total));
                    next.set(old);
                    next.set(data, start);
                    desc.node.write(next);
                    desc.offset = start + total;
                } else {
                    return Errno.BADF;
                }
                this.view().setUint32(nwrittenPtr, total, true);
                return Errno.SUCCESS;
            }),

            fd_read: g((fd: number, iovs: number, count: number, nreadPtr: number) => {
                const desc = this.fds.get(fd);
                let source: Uint8Array;
                let offset: number;
                if (desc?.kind === 'stdin') {
                    source = this.stdin;
                    offset = this.stdinOffset;
                } else if (desc?.kind === 'file') {
                    source = desc.node.bytes;
                    offset = desc.offset;
                } else {
                    return desc?.kind === 'dir' ? Errno.ISDIR : Errno.BADF;
                }
                let read = 0;
                for (const [ptr, len] of this.iovecs(iovs, count)) {
                    const piece = source.subarray(offset + read, offset + read + len);
                    this.bytes(ptr, piece.length).set(piece);
                    read += piece.length;
                    if (piece.length < len) {
                        break;
                    }
                }
                if (desc.kind === 'stdin') {
                    this.stdinOffset += read;
                } else {
                    desc.offset += read;
                }
                this.view().setUint32(nreadPtr, read, true);
                return Errno.SUCCESS;
            }),

            fd_seek: (fd: number, offset: bigint, whence: number, newOffsetPtr: number) => {
                const desc = this.fds.get(fd);
                if (!desc) {
                    return Errno.BADF;
                }
                if (desc.kind !== 'file') {
                    return desc.kind === 'dir' ? Errno.BADF : Errno.SPIPE;
                }
                const base = whence === WHENCE_SET ? 0 : whence === WHENCE_CUR ? desc.offset : whence === WHENCE_END ? desc.node.size : -1;
                const next = base + Number(offset);
                if (base < 0 || next < 0) {
                    return Errno.INVAL;
                }
                desc.offset = next;
                this.view().setBigUint64(newOffsetPtr, BigInt(next), true);
                return Errno.SUCCESS;
            },

            fd_tell: (fd: number, offsetPtr: number) => {
                const desc = this.fds.get(fd);
                if (desc?.kind !== 'file') {
                    return desc ? Errno.SPIPE : Errno.BADF;
                }
                this.view().setBigUint64(offsetPtr, BigInt(desc.offset), true);
                return Errno.SUCCESS;
            },

            fd_close: (fd: number) => {
                if (!this.fds.has(fd)) {
                    return Errno.BADF;
                }
                this.fds.delete(fd);
                return Errno.SUCCESS;
            },

            fd_sync: () => Errno.SUCCESS,
            fd_datasync: () => Errno.SUCCESS,
            fd_fdstat_set_flags: () => Errno.SUCCESS,

            fd_fdstat_get: (fd: number, ptr: number) => {
                const desc = this.fds.get(fd);
                if (!desc) {
                    return Errno.BADF;
                }
                const view = this.view();
                const type = desc.kind === 'dir' ? FILETYPE_DIRECTORY : desc.kind === 'file' ? FILETYPE_REGULAR_FILE : FILETYPE_CHARACTER_DEVICE;
                view.setUint8(ptr, type);
                view.setUint16(ptr + 2, desc.kind === 'file' && desc.append ? FDFLAGS_APPEND : 0, true);
                view.setBigUint64(ptr + 8, ALL_RIGHTS, true);
                view.setBigUint64(ptr + 16, ALL_RIGHTS, true);
                return Errno.SUCCESS;
            },

            fd_filestat_get: (fd: number, ptr: number) => {
                const desc = this.fds.get(fd);
                if (!desc) {
                    return Errno.BADF;
                }
                if (desc.kind === 'file' || desc.kind === 'dir') {
                    this.writeFilestat(ptr, desc.node, desc.kind === 'dir' ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE);
                } else {
                    this.writeFilestat(ptr, null, FILETYPE_CHARACTER_DEVICE);
                }
                return Errno.SUCCESS;
            },

            fd_filestat_set_size: (fd: number, size: bigint) => {
                const desc = this.fds.get(fd);
                if (desc?.kind !== 'file') {
                    return desc ? Errno.INVAL : Errno.BADF;
                }
                const next = new Uint8Array(Number(size));
                next.set(desc.node.bytes.subarray(0, next.length));
                desc.node.write(next);
                return Errno.SUCCESS;
            },

            fd_prestat_get: (fd: number, ptr: number) => {
                const desc = this.fds.get(fd);
                if (desc?.kind !== 'dir' || desc.preopen === undefined) {
                    return Errno.BADF;
                }
                const view = this.view();
                view.setUint8(ptr, 0);
                view.setUint32(ptr + 4, encoder.encode(desc.preopen).length, true);
                return Errno.SUCCESS;
            },

            fd_prestat_dir_name: (fd: number, ptr: number, len: number) => {
                const desc = this.fds.get(fd);
                if (desc?.kind !== 'dir' || desc.preopen === undefined) {
                    return Errno.BADF;
                }
                this.bytes(ptr, len).set(encoder.encode(desc.preopen).subarray(0, len));
                return Errno.SUCCESS;
            },

            fd_readdir: (fd: number, buf: number, bufLen: number, cookie: bigint, usedPtr: number) => {
                const desc = this.fds.get(fd);
                if (desc?.kind !== 'dir') {
                    return desc ? Errno.NOTDIR : Errno.BADF;
                }
                const entries: [string, number][] = [['.', FILETYPE_DIRECTORY], ['..', FILETYPE_DIRECTORY]];
                for (const name of desc.node.list()) {
                    entries.push([name, desc.node.getFile(name) instanceof Directory ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE]);
                }
                // Serialize entries from `cookie` on, truncating the last one if the buffer runs out.
                const out = new Uint8Array(bufLen);
                const header = new DataView(new ArrayBuffer(24));
                let used = 0;
                for (let i = Number(cookie); i < entries.length && used < bufLen; i++) {
                    const name = encoder.encode(entries[i][0]);
                    header.setBigUint64(0, BigInt(i + 1), true);
                    header.setBigUint64(8, BigInt(i + 1), true);
                    header.setUint32(16, name.length, true);
                    header.setUint8(20, entries[i][1]);
                    const record = new Uint8Array(24 + name.length);
                    record.set(new Uint8Array(header.buffer));
                    record.set(name, 24);
                    const take = Math.min(record.length, bufLen - used);
                    out.set(record.subarray(0, take), used);
                    used += take;
                }
                this.bytes(buf, used).set(out.subarray(0, used));
                this.view().setUint32(usedPtr, used, true);
                return Errno.SUCCESS;
            },

            path_open: g((dirfd: number, _dirflags: number, pathPtr: number, pathLen: number, oflags: number,
                _rightsBase: bigint, _rightsInheriting: bigint, fdflags: number, fdPtr: number) => {
                const path = this.resolve(dirfd, pathPtr, pathLen);
                if (typeof path === 'number') {
                    return path;
                }
                let node = this.fs.find(path);
                if (node && (oflags & OFLAGS_CREAT) && (oflags & OFLAGS_EXCL)) {
                    return Errno.EXIST;
                }
                if (!node) {
                    if (!(oflags & OFLAGS_CREAT)) {
                        return Errno.NOENT;
                    }
                    this.fs.writeFile(path, new Uint8Array(0));
                    node = this.fs.get(path);
                }
                if (node instanceof Directory) {
                    if (oflags & OFLAGS_TRUNC) {
                        return Errno.ISDIR;
                    }
                    this.view().setUint32(fdPtr, this.allocate({ kind: 'dir', node }), true);
                    return Errno.SUCCESS;
                }
                if (oflags & OFLAGS_DIRECTORY) {
                    return Errno.NOTDIR;
                }
                if (oflags & OFLAGS_TRUNC) {
                    node.write(new Uint8Array(0));
                }
                const fd = this.allocate({ kind: 'file', node, offset: 0, append: (fdflags & FDFLAGS_APPEND) !== 0 });
                this.view().setUint32(fdPtr, fd, true);
                return Errno.SUCCESS;
            }),

            path_filestat_get: g((dirfd: number, _flags: number, pathPtr: number, pathLen: number, ptr: number) => {
                const path = this.resolve(dirfd, pathPtr, pathLen);
                if (typeof path === 'number') {
                    return path;
                }
                const node = this.fs.get(path);
                this.writeFilestat(ptr, node, node instanceof Directory ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE);
                return Errno.SUCCESS;
            }),

            path_filestat_set_times: () => Errno.SUCCESS,

            path_create_directory: g((dirfd: number, pathPtr: number, pathLen: number) => {
                const path = this.resolve(dirfd, pathPtr, pathLen);
                if (typeof path === 'number') {
                    return path;
                }
                this.fs.createDirectory(path);
                return Errno.SUCCESS;
            }),

            path_remove_directory: g((dirfd: number, pathPtr: number, pathLen: number) => {
                const path = this.resolve(dirfd, pathPtr, pathLen);
                if (typeof path === 'number') {
                    return path;
                }
                if (!this.fs.isDirectory(path)) {
                    return this.fs.exists(path) ? Errno.NOTDIR : Errno.NOENT;
                }
                this.fs.remove(path);
                return Errno.SUCCESS;
            }),

            path_unlink_file: g((dirfd: number, pathPtr: number, pathLen: number) => {
                const path = this.resolve(dirfd, pathPtr, pathLen);
                if (typeof path === 'number') {
                    return path;
                }
                if (this.fs.isDirectory(path)) {
                    return Errno.ISDIR;
                }
                this.fs.remove(path);
                return Errno.SUCCESS;
            }),

            path_rename: g((fromFd: number, fromPtr: number, fromLen: number, toFd: number, toPtr: number, toLen: number) => {
                const from = this.resolve(fromFd, fromPtr, fromLen);
                const to = this.resolve(toFd, toPtr, toLen);
                if (typeof from === 'number') {
                    return from;
                }
                if (typeof to === 'number') {
                    return to;
                }
                // rename() replaces the target; fs.move would move into a directory target instead.
                if (this.fs.isDirectory(to)) {
                    if (!this.fs.isDirectory(from)) {
                        return Errno.ISDIR;
                    }
                    if (this.fs.getDirectory(to).size > 0) {
                        return Errno.NOTEMPTY;
                    }
                    this.fs.remove(to);
                }
                this.fs.move(from, to);
                return Errno.SUCCESS;
            }),
        };
    }
}

export default Wasi;
