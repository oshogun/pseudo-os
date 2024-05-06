import File from "./file";

class Directory extends File {
    files: { [name: string]: File };
    path: string;

    constructor(name: string, parent: Directory | null) {
        super(name, '', parent);
        this.files = {};
        this.path = parent ? (parent.path === '/' ? `${parent.path}${name}` : `${parent.path}/${name}`) : `${name}`;
    }


    addFile(file: File): void {
        this.files[file.name] = file;
    }

    removeFile(name: string): void {
        delete this.files[name];
    }

    getFile(name: string): File {
        return this.files[name];
    }

    read(): string {
        let output = '';
        for (let name in this.files) {
            output += name + '\n';
        }
        return output;
    }
}

export default Directory;