import type Directory from "./directory";

class File {
    readonly kind: 'file' | 'dir' = 'file';
    name: string;
    content: string;
    parent: Directory | null;
    modified: number;

    constructor(name: string, content = '', parent: Directory | null = null) {
        this.name = name;
        this.content = content;
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

    get size(): number {
        return this.content.length;
    }

    read(): string {
        return this.content;
    }

    write(content: string): void {
        this.content = content;
        this.touch();
    }

    append(content: string): void {
        this.content += content;
        this.touch();
    }

    touch(): void {
        this.modified = Date.now();
    }
}

export default File;
