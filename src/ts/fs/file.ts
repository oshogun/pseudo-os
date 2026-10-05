import type Directory from "./directory";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type FileContent = string | Uint8Array<ArrayBuffer>;

// File contents are stored either as text or as bytes, whichever form they
// were last written in, and converted (as UTF-8) on demand.
class File {
    readonly kind: 'file' | 'dir' = 'file';
    name: string;
    parent: Directory | null;
    modified: number;
    private data: FileContent;
    // UTF-8 encoding of text contents, kept until the next write.
    private encoded: Uint8Array<ArrayBuffer> | null = null;

    constructor(name: string, content: FileContent = '', parent: Directory | null = null) {
        this.name = name;
        this.data = content;
        this.parent = parent;
        this.modified = Date.now();
    }

    // Absolute path, computed from the parent chain so it stays correct after moves.
    get path(): string {
        if (!this.parent) {
            return '/';
        }
        const parentPath = this.parent.path;
        return parentPath === '/' ? `/${this.name}` : `${parentPath}/${this.name}`;
    }

    // The contents as text.
    get content(): string {
        return typeof this.data === 'string' ? this.data : decoder.decode(this.data);
    }

    // The contents as bytes.
    get bytes(): Uint8Array<ArrayBuffer> {
        if (typeof this.data !== 'string') {
            return this.data;
        }
        this.encoded ??= encoder.encode(this.data);
        return this.encoded;
    }

    // True if the contents were last written as bytes rather than text.
    get isBinary(): boolean {
        return typeof this.data !== 'string';
    }

    // Size in bytes.
    get size(): number {
        return this.bytes.length;
    }

    read(): string {
        return this.content;
    }

    write(content: FileContent): void {
        this.data = content;
        this.touch();
    }

    append(content: FileContent): void {
        if (typeof content === 'string' && typeof this.data === 'string') {
            this.data += content;
        } else {
            const extra = typeof content === 'string' ? encoder.encode(content) : content;
            const joined = new Uint8Array(this.bytes.length + extra.length);
            joined.set(this.bytes);
            joined.set(extra, this.bytes.length);
            this.data = joined;
        }
        this.touch();
    }

    touch(): void {
        this.encoded = null;
        this.modified = Date.now();
    }
}

export default File;
