import Directory from "./directory";

class File {
    name: string;
    content: string;
    parent: Directory | null;

    constructor(name: string, content = '', parent: Directory | null) {
        this.name = name;
        this.content = content;
        this.parent = parent;
    }

    read(): string {
        return this.content;
    }

    write(content: string): void {
        this.content = content;
    }

    append(content: string): void {
        this.content += content;
    }
}

export default File;    