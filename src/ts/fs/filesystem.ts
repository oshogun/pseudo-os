import Directory from "./directory";
import File, { FileContent } from "./file";
import * as Path from "./path";

export type FsErrorCode = 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EEXIST' | 'ENOTEMPTY' | 'EINVAL';

const messages: { [code in FsErrorCode]: string } = {
    ENOENT: 'No such file or directory',
    ENOTDIR: 'Not a directory',
    EISDIR: 'Is a directory',
    EEXIST: 'File exists',
    ENOTEMPTY: 'Directory not empty',
    EINVAL: 'Invalid argument',
};

export class FsError extends Error {
    code: FsErrorCode;
    path: string;

    constructor(code: FsErrorCode, path: string, message?: string) {
        super(message ?? `${path}: ${messages[code]}`);
        this.code = code;
        this.path = path;
    }
}

// Plain-object form of the tree, used to persist a filesystem as JSON.
// Binary files carry `base64` instead of `content`.
export type SerializedNode =
    | { type: 'file'; name: string; content?: string; base64?: string; modified: number }
    | { type: 'dir'; name: string; modified: number; children: SerializedNode[] };

export interface SerializedFileSystem {
    root: SerializedNode;
    cwd: string;
}

// An in-memory tree of files and directories. Every method that takes a path
// accepts absolute paths or paths relative to the current directory.
class FileSystem {
    root: Directory;
    currentDirectory: Directory;

    constructor() {
        this.root = new Directory('/', null);
        this.currentDirectory = this.root;
    }

    get cwd(): string {
        return this.currentDirectory.path;
    }

    // Turns a possibly-relative path into a normalized absolute path.
    absolute(path: string): string {
        return Path.resolve(this.cwd, path);
    }

    // Returns the node at `path`, or undefined if it does not exist.
    find(path: string): File | undefined {
        let node: File = this.root;
        for (const part of Path.split(this.absolute(path))) {
            if (!(node instanceof Directory)) {
                return undefined;
            }
            const next = node.getFile(part);
            if (!next) {
                return undefined;
            }
            node = next;
        }
        return node;
    }

    exists(path: string): boolean {
        return this.find(path) !== undefined;
    }

    isDirectory(path: string): boolean {
        return this.find(path) instanceof Directory;
    }

    // Like find, but throws ENOENT when missing.
    get(path: string): File {
        const node = this.find(path);
        if (!node) {
            throw new FsError('ENOENT', path);
        }
        return node;
    }

    getDirectory(path: string): Directory {
        const node = this.get(path);
        if (!(node instanceof Directory)) {
            throw new FsError('ENOTDIR', path);
        }
        return node;
    }

    // The directory that would contain `path`, plus the final name component.
    private parentOf(path: string): [Directory, string] {
        const abs = this.absolute(path);
        if (abs === '/') {
            throw new FsError('EINVAL', path);
        }
        const parent = this.find(Path.dirname(abs));
        if (!parent) {
            throw new FsError('ENOENT', path);
        }
        if (!(parent instanceof Directory)) {
            throw new FsError('ENOTDIR', path);
        }
        return [parent, Path.basename(abs)];
    }

    list(path = '.'): string[] {
        return this.getDirectory(path).list();
    }

    readFile(path: string): string {
        const node = this.get(path);
        if (node instanceof Directory) {
            throw new FsError('EISDIR', path);
        }
        return node.read();
    }

    readBytes(path: string): Uint8Array<ArrayBuffer> {
        const node = this.get(path);
        if (node instanceof Directory) {
            throw new FsError('EISDIR', path);
        }
        return node.bytes;
    }

    // Creates the file if needed and replaces its content.
    writeFile(path: string, content: FileContent): void {
        const existing = this.find(path);
        if (existing instanceof Directory) {
            throw new FsError('EISDIR', path);
        }
        if (existing) {
            existing.write(content);
            return;
        }
        const [parent, name] = this.parentOf(path);
        parent.addFile(new File(name, content));
    }

    // Creates the file if needed and appends to it.
    appendFile(path: string, content: FileContent): void {
        const existing = this.find(path);
        if (existing instanceof Directory) {
            throw new FsError('EISDIR', path);
        }
        if (existing) {
            existing.append(content);
        } else {
            this.writeFile(path, content);
        }
    }

    // Creates an empty file, or updates the timestamp of an existing one.
    createFile(path: string, content = ''): void {
        const existing = this.find(path);
        if (existing) {
            existing.touch();
        } else {
            this.writeFile(path, content);
        }
    }

    createDirectory(path: string, parents = false): Directory {
        const existing = this.find(path);
        if (existing) {
            if (parents && existing instanceof Directory) {
                return existing;
            }
            throw new FsError('EEXIST', path);
        }
        if (parents) {
            let dir = this.root;
            for (const part of Path.split(this.absolute(path))) {
                const next = dir.getFile(part);
                if (next instanceof Directory) {
                    dir = next;
                } else if (next) {
                    throw new FsError('ENOTDIR', path);
                } else {
                    const created = new Directory(part);
                    dir.addFile(created);
                    dir = created;
                }
            }
            return dir;
        }
        const [parent, name] = this.parentOf(path);
        const dir = new Directory(name);
        parent.addFile(dir);
        return dir;
    }

    remove(path: string, recursive = false): void {
        const node = this.get(path);
        if (node === this.root) {
            throw new FsError('EINVAL', path);
        }
        if (node instanceof Directory && node.size > 0 && !recursive) {
            throw new FsError('ENOTEMPTY', path);
        }
        if (node instanceof Directory && node.contains(this.currentDirectory)) {
            this.currentDirectory = node.parent!;
        }
        node.parent!.removeFile(node.name);
    }

    // Moves or renames. If `to` is an existing directory, the node goes inside it.
    move(from: string, to: string): void {
        const node = this.get(from);
        if (node === this.root) {
            throw new FsError('EINVAL', from);
        }
        const [parent, name] = this.destination(to, node.name);
        if (node instanceof Directory && node.contains(parent)) {
            throw new FsError('EINVAL', to);
        }
        const target = parent.getFile(name);
        if (target === node) {
            return;
        }
        if (target instanceof Directory) {
            throw new FsError(node instanceof Directory && target.size > 0 ? 'ENOTEMPTY' : 'EISDIR', to);
        }
        if (target && node instanceof Directory) {
            throw new FsError('ENOTDIR', to);
        }
        node.parent!.removeFile(node.name);
        parent.removeFile(name);
        node.name = name;
        parent.addFile(node);
    }

    copy(from: string, to: string, recursive = false): void {
        const node = this.get(from);
        if (node instanceof Directory && !recursive) {
            throw new FsError('EISDIR', from);
        }
        const [parent, name] = this.destination(to, node.name);
        if (node instanceof Directory && node.contains(parent)) {
            throw new FsError('EINVAL', to);
        }
        const target = parent.getFile(name);
        if (target instanceof Directory) {
            throw new FsError('EISDIR', to);
        }
        if (target && node instanceof Directory) {
            throw new FsError('ENOTDIR', to);
        }
        parent.removeFile(name);
        parent.addFile(clone(node, name));
    }

    // Where a move/copy to `to` lands: inside `to` if it is a directory, else at `to` itself.
    private destination(to: string, name: string): [Directory, string] {
        const target = this.find(to);
        if (target instanceof Directory) {
            return [target, name];
        }
        return this.parentOf(to);
    }

    changeDirectory(path: string): void {
        this.currentDirectory = this.getDirectory(path);
    }

    serialize(): SerializedFileSystem {
        return { root: serializeNode(this.root), cwd: this.cwd };
    }

    static deserialize(data: SerializedFileSystem): FileSystem {
        const fs = new FileSystem();
        const root = deserializeNode(data.root);
        if (!(root instanceof Directory)) {
            throw new Error('serialized root is not a directory');
        }
        fs.root = root;
        fs.currentDirectory = fs.find(data.cwd) instanceof Directory ? fs.getDirectory(data.cwd) : root;
        return fs;
    }
}

function clone(node: File, name: string): File {
    if (node instanceof Directory) {
        const copy = new Directory(name);
        for (const child of node.files.values()) {
            copy.addFile(clone(child, child.name));
        }
        return copy;
    }
    return new File(name, node.isBinary ? node.bytes.slice() : node.content);
}

function serializeNode(node: File): SerializedNode {
    if (node instanceof Directory) {
        return {
            type: 'dir',
            name: node.name,
            modified: node.modified,
            children: [...node.files.values()].map(serializeNode),
        };
    }
    if (node.isBinary) {
        return { type: 'file', name: node.name, base64: toBase64(node.bytes), modified: node.modified };
    }
    return { type: 'file', name: node.name, content: node.content, modified: node.modified };
}

function deserializeNode(data: SerializedNode): File {
    let node: File;
    if (data.type === 'dir') {
        const dir = new Directory(data.name);
        for (const child of data.children) {
            dir.addFile(deserializeNode(child));
        }
        node = dir;
    } else {
        node = new File(data.name, data.base64 !== undefined ? fromBase64(data.base64) : data.content ?? '');
    }
    node.modified = data.modified;
    return node;
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export default FileSystem;
