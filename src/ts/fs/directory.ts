import File from "./file";

class Directory extends File {
    readonly kind = 'dir';
    files: Map<string, File>;

    constructor(name: string, parent: Directory | null = null) {
        super(name, '', parent);
        this.files = new Map();
    }

    get size(): number {
        return this.files.size;
    }

    addFile(file: File): void {
        file.parent = this;
        this.files.set(file.name, file);
        this.touch();
    }

    removeFile(name: string): void {
        const file = this.files.get(name);
        if (file) {
            file.parent = null;
            this.files.delete(name);
            this.touch();
        }
    }

    getFile(name: string): File | undefined {
        return this.files.get(name);
    }

    // Child names in alphabetical order.
    list(): string[] {
        return [...this.files.keys()].sort();
    }

    read(): string {
        return this.list().join('\n');
    }

    // True if `other` is this directory or one of its descendants.
    contains(other: File): boolean {
        for (let node: File | null = other; node; node = node.parent) {
            if (node === this) {
                return true;
            }
        }
        return false;
    }
}

export default Directory;
