class File {
    name: string;
    content: string;

    constructor(name: string, content = '') {
        this.name = name;
        this.content = content;
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